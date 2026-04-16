"""Graph memory plugin — NetworkX-based knowledge graph memory provider.

Implements the MemoryProvider ABC with:
  - Entity and relationship tracking via NetworkX (falls back to dict-graph)
  - Temporal decay weighting for old memories
  - Semantic search via EmbeddingCache (sentence-transformers optional)
  - Memory analytics for the system prompt
  - A 'graph_memory' tool exposed to the model

Configuration (config.yaml):
  memory:
    provider: graph
    graph:
      backend: networkx          # or dict (forced fallback)
      half_life_days: 30         # 0 to disable temporal decay
      min_weight: 0.1            # floor for decayed memories
      embedding_model: sentence-transformers/all-MiniLM-L6-v2
      top_k_prefetch: 5          # max results per prefetch query
      auto_extract_entities: true  # extract entities from every turn
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider
from hermes_constants import get_hermes_home
from .graph_store import GraphStore
from .embeddings import EmbeddingCache
from .decay_calculator import TemporalDecay
from .analytics import MemoryAnalytics

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ENTITY_PATTERN = re.compile(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b')

# Maximum number of entities auto-extracted per turn (caps processing cost).
_MAX_AUTO_EXTRACTED_ENTITIES = 10


def _extract_entities_simple(text: str) -> List[str]:
    """Heuristic: extract capitalised multi-word phrases as candidate entities.

    This is intentionally lightweight — no NLP deps.  False positives are
    acceptable; the graph simply learns harmless nodes.
    """
    return list(dict.fromkeys(_ENTITY_PATTERN.findall(text)))[:_MAX_AUTO_EXTRACTED_ENTITIES]


def _load_plugin_config(hermes_home: Optional[str] = None) -> Dict[str, Any]:
    """Read memory.graph config block from config.yaml in *hermes_home*."""
    try:
        from hermes_cli.config import load_config
        cfg = load_config()
        return cfg.get("memory", {}).get("graph", {})
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Tool schema
# ---------------------------------------------------------------------------

GRAPH_MEMORY_SCHEMA: Dict[str, Any] = {
    "name": "graph_memory",
    "description": (
        "Interact with the graph-based memory store.\n\n"
        "ACTIONS:\n"
        "• add_entity      — Store a named entity (person, project, concept).\n"
        "• add_relationship — Connect two entities with a named relation.\n"
        "• add_event       — Record a timestamped event with linked entities.\n"
        "• get_entity      — Retrieve details about a specific entity.\n"
        "• get_neighbors   — Explore what's connected to an entity.\n"
        "• search          — Keyword/semantic search across the graph.\n"
        "• get_analytics   — Summary stats (entity count, top entities, etc.).\n\n"
        "Use this alongside the built-in 'memory' tool: use 'memory' for raw "
        "notes, 'graph_memory' for structured entity/relationship knowledge."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "add_entity",
                    "add_relationship",
                    "add_event",
                    "get_entity",
                    "get_neighbors",
                    "search",
                    "get_analytics",
                ],
                "description": "The graph operation to perform.",
            },
            "label": {
                "type": "string",
                "description": "Entity label for add_entity / get_entity / get_neighbors.",
            },
            "entity_type": {
                "type": "string",
                "description": "Entity type (e.g. 'person', 'project', 'concept').",
            },
            "source": {
                "type": "string",
                "description": "Source entity label for add_relationship.",
            },
            "target": {
                "type": "string",
                "description": "Target entity label for add_relationship.",
            },
            "relation": {
                "type": "string",
                "description": "Relation name for add_relationship (e.g. 'works-on', 'knows').",
            },
            "strength": {
                "type": "number",
                "description": "Relationship strength 0.0–1.0 (default 0.5).",
            },
            "content": {
                "type": "string",
                "description": "Event content for add_event.",
            },
            "entities": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Entity labels to link to an event (add_event).",
            },
            "query": {
                "type": "string",
                "description": "Search query for 'search' action.",
            },
            "depth": {
                "type": "integer",
                "description": "BFS depth for get_neighbors (default 1).",
            },
            "metadata": {
                "type": "object",
                "description": "Optional key-value metadata to attach.",
            },
        },
        "required": ["action"],
    },
}


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------


class GraphMemoryProvider(MemoryProvider):
    """Graph-based memory provider using NetworkX knowledge graph.

    Integrates with the MemoryManager as a standard external provider.
    Falls back gracefully if networkx is not installed.
    """

    def __init__(self) -> None:
        self._cfg: Dict[str, Any] = {}
        self._graph: Optional[GraphStore] = None
        self._cache: Optional[EmbeddingCache] = None
        self._decay: Optional[TemporalDecay] = None
        self._analytics: Optional[MemoryAnalytics] = None
        self._lock = threading.Lock()
        self._hermes_home: Optional[str] = None
        self._initialized = False
        self._agent_context = "primary"

    @property
    def name(self) -> str:
        return "graph"

    def is_available(self) -> bool:
        """Available as long as this module can be imported.

        NetworkX is strongly recommended but the plugin falls back to a
        pure-Python dict graph, so it's always technically available.
        """
        return True

    def get_config_schema(self) -> List[Dict[str, Any]]:
        return [
            {
                "key": "half_life_days",
                "description": "Temporal decay half-life in days (0 to disable)",
                "required": False,
                "default": 30,
            },
            {
                "key": "min_weight",
                "description": "Minimum decay weight for old memories (0.0–1.0)",
                "required": False,
                "default": 0.1,
            },
            {
                "key": "auto_extract_entities",
                "description": "Automatically extract entities from every conversation turn",
                "required": False,
                "default": True,
            },
            {
                "key": "embedding_model",
                "description": "sentence-transformers model for semantic search (leave blank to use keyword search)",
                "required": False,
                "default": EmbeddingCache.DEFAULT_MODEL,
            },
            {
                "key": "top_k_prefetch",
                "description": "Number of results to surface per prefetch query",
                "required": False,
                "default": 5,
            },
        ]

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def initialize(self, session_id: str, **kwargs) -> None:
        self._hermes_home = kwargs.get("hermes_home", str(get_hermes_home()))
        self._agent_context = kwargs.get("agent_context", "primary")
        self._cfg = _load_plugin_config(self._hermes_home)

        home = Path(self._hermes_home)
        graph_dir = home / "graph_memory"
        graph_dir.mkdir(parents=True, exist_ok=True)

        # Graph store
        store_path = graph_dir / "graph.json"
        self._graph = GraphStore(store_path=store_path)
        self._graph.load()

        # Embedding cache
        cache_path = graph_dir / "embedding_cache.json"
        model_name = self._cfg.get("embedding_model", EmbeddingCache.DEFAULT_MODEL)
        self._cache = EmbeddingCache(cache_path=cache_path, model_name=model_name)

        # Decay calculator
        half_life = float(self._cfg.get("half_life_days", 30))
        min_weight = float(self._cfg.get("min_weight", 0.1))
        self._decay = TemporalDecay(half_life_days=half_life, min_weight=min_weight)

        # Analytics
        self._analytics = MemoryAnalytics(self._graph, self._decay)

        self._initialized = True
        logger.info(
            "GraphMemoryProvider: initialized (backend=%s, embedding=%s, decay=%s)",
            self._graph.backend,
            self._cache.backend,
            self._decay.describe(),
        )

    def shutdown(self) -> None:
        if self._graph is not None:
            self._graph.save()
            logger.debug("GraphMemoryProvider: graph saved.")

    # ------------------------------------------------------------------
    # System prompt
    # ------------------------------------------------------------------

    def system_prompt_block(self) -> str:
        if not self._initialized or self._graph is None:
            return ""
        stats = self._graph.stats()
        if stats["entity_count"] == 0 and stats["relationship_count"] == 0:
            return ""
        brief = self._analytics.brief_summary() if self._analytics else ""
        return (
            "# Graph Memory\n"
            f"Active ({brief}). Use the `graph_memory` tool to query or update the "
            "knowledge graph — entities, relationships, and events from past sessions."
        )

    # ------------------------------------------------------------------
    # Prefetch / recall
    # ------------------------------------------------------------------

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        if not self._initialized or not query.strip():
            return ""

        top_k = int(self._cfg.get("top_k_prefetch", 5))
        results = self._search_graph(query, top_k=top_k)
        if not results:
            return ""

        lines = ["## Graph Memory Recall"]
        for item in results:
            label = item.get("label", item.get("id", "?"))
            item_type = item.get("type", "")
            score = item.get("_score", 0)
            decay_str = ""
            if self._decay and self._decay.enabled:
                w = self._decay.weight(item.get("updated_at", item.get("created_at", "")))
                decay_str = f" [decay={w:.2f}]"
            lines.append(f"- **{label}** ({item_type}){decay_str} — score={score:.2f}")

            # Add one layer of relationships for entities
            if item_type != "event" and self._graph:
                for nbr in self._graph.get_neighbors(item.get("label", ""), depth=1)[:3]:
                    nbr_label = nbr.get("label", nbr.get("id", ""))
                    rel = nbr.get("via_relation", "")
                    strength = nbr.get("via_strength", 0.0)
                    lines.append(f"  → {rel} **{nbr_label}** (strength={strength:.2f})")

        return "\n".join(lines)

    def _search_graph(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Combined keyword + optional semantic search."""
        if self._graph is None:
            return []

        # Keyword search on the graph
        kw_results = self._graph.keyword_search(query, top_k=top_k * 2)

        if self._cache and self._cache.backend == "sentence-transformers":
            # Semantic re-ranking
            labels = [r.get("label", "") for r in kw_results if r.get("label")]
            if labels:
                ranked = self._cache.search(query, labels, top_k=top_k)
                label_to_result = {r.get("label", ""): r for r in kw_results}
                reranked = []
                for score, label in ranked:
                    if label in label_to_result:
                        item = dict(label_to_result[label])
                        item["_score"] = score
                        reranked.append(item)
                return reranked[:top_k]

        # Apply decay to keyword scores
        if self._decay:
            for item in kw_results:
                ts = item.get("updated_at", item.get("created_at", ""))
                item["_score"] = self._decay.score_with_decay(item.get("_score", 0.5), ts)

        kw_results.sort(key=lambda x: x.get("_score", 0), reverse=True)
        return kw_results[:top_k]

    # ------------------------------------------------------------------
    # Turn sync — auto-extract entities
    # ------------------------------------------------------------------

    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None:
        if not self._initialized or self._agent_context != "primary":
            return
        if not self._cfg.get("auto_extract_entities", True):
            return

        combined = f"{user_content}\n{assistant_content}"
        entities = _extract_entities_simple(combined)
        if not entities or self._graph is None:
            return

        # Add entities to graph (lightweight, in-place)
        with self._lock:
            for e in entities:
                self._graph.add_entity(e, entity_type="concept")

    # ------------------------------------------------------------------
    # on_memory_write hook — mirror builtin memory writes to graph
    # ------------------------------------------------------------------

    def on_memory_write(self, action: str, target: str, content: str) -> None:
        if not self._initialized or self._graph is None:
            return
        if action not in ("add", "replace"):
            return
        entities = _extract_entities_simple(content)
        with self._lock:
            self._graph.add_event(
                content=content,
                entities=entities,
                metadata={"source": "builtin_memory", "target": target, "action": action},
            )

    # ------------------------------------------------------------------
    # on_session_end — persist graph
    # ------------------------------------------------------------------

    def on_session_end(self, messages: List[Dict[str, Any]]) -> None:
        if self._graph is not None:
            self._graph.save()

    # ------------------------------------------------------------------
    # Tool schemas and handlers
    # ------------------------------------------------------------------

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return [GRAPH_MEMORY_SCHEMA]

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str:
        if tool_name != "graph_memory":
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
        if not self._initialized or self._graph is None:
            return json.dumps({"error": "Graph memory provider is not initialized."})

        action = args.get("action", "")
        try:
            return self._dispatch(action, args)
        except Exception as exc:
            logger.exception("graph_memory tool error (action=%s): %s", action, exc)
            return json.dumps({"error": str(exc)})

    def _dispatch(self, action: str, args: Dict[str, Any]) -> str:
        assert self._graph is not None

        if action == "add_entity":
            label = args.get("label", "")
            if not label:
                return json.dumps({"error": "label is required for add_entity"})
            entity_type = args.get("entity_type", "concept")
            meta = args.get("metadata") or {}
            node_id = self._graph.add_entity(label, entity_type=entity_type, metadata=meta)
            self._graph.save()
            return json.dumps({"success": True, "id": node_id})

        if action == "add_relationship":
            source = args.get("source", "")
            target = args.get("target", "")
            relation = args.get("relation", "related-to")
            if not source or not target:
                return json.dumps({"error": "source and target are required"})
            strength = float(args.get("strength", 0.5))
            meta = args.get("metadata") or {}
            self._graph.add_relationship(source, target, relation=relation,
                                         strength=strength, metadata=meta)
            self._graph.save()
            return json.dumps({"success": True, "source": source, "target": target,
                               "relation": relation})

        if action == "add_event":
            content = args.get("content", "")
            if not content:
                return json.dumps({"error": "content is required for add_event"})
            entities = args.get("entities") or []
            meta = args.get("metadata") or {}
            event_id = self._graph.add_event(content, entities=entities, metadata=meta)
            self._graph.save()
            return json.dumps({"success": True, "event_id": event_id})

        if action == "get_entity":
            label = args.get("label", "")
            if not label:
                return json.dumps({"error": "label is required for get_entity"})
            data = self._graph.get_entity(label)
            if data is None:
                return json.dumps({"found": False})
            return json.dumps({"found": True, "entity": data})

        if action == "get_neighbors":
            label = args.get("label", "")
            if not label:
                return json.dumps({"error": "label is required for get_neighbors"})
            depth = int(args.get("depth", 1))
            neighbors = self._graph.get_neighbors(label, depth=depth)
            return json.dumps({"neighbors": neighbors})

        if action == "search":
            query = args.get("query", "")
            if not query:
                return json.dumps({"error": "query is required for search"})
            top_k = int(args.get("top_k", 5))
            results = self._search_graph(query, top_k=top_k)
            return json.dumps({"results": results})

        if action == "get_analytics":
            if self._analytics is None:
                return json.dumps({"error": "analytics not available"})
            stats = self._analytics.get_stats()
            return json.dumps(stats)

        return json.dumps({"error": f"Unknown action: {action}"})


# ---------------------------------------------------------------------------
# Plugin registration
# ---------------------------------------------------------------------------


def register(ctx) -> None:
    """Called by the plugin loader to register the provider."""
    ctx.register_memory_provider(GraphMemoryProvider())
