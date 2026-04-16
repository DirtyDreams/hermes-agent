"""GraphStore — core knowledge graph storage for the graph memory plugin.

Uses NetworkX (DiGraph) as the primary backend. Falls back to a lightweight
dict-based implementation when NetworkX is not installed, so the plugin
degrades gracefully without breaking the rest of the agent.

Node types:
  - entity: a person, project, concept, or any named thing
  - event: a discrete timestamped occurrence

Edge types:
  - relation: a directed named relationship between two entities (e.g. "works-on")
  - mention:  entity appeared in an event

All nodes carry:
  created_at, updated_at (ISO-8601 str), type, label
All edges carry:
  relation (str), strength (0.0–1.0), created_at (ISO-8601 str)
"""

from __future__ import annotations

import json
import logging
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Backend detection
# ---------------------------------------------------------------------------

try:
    import networkx as nx  # type: ignore
    _NX_AVAILABLE = True
except ImportError:  # pragma: no cover
    _NX_AVAILABLE = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# GraphStore
# ---------------------------------------------------------------------------


class GraphStore:
    """Knowledge graph backed by NetworkX or a plain dict fallback.

    All public methods are safe to call regardless of which backend is active.
    """

    # ------------------------------------------------------------------
    # Construction / persistence
    # ------------------------------------------------------------------

    def __init__(self, store_path: Optional[Path] = None) -> None:
        self._store_path = store_path
        self._graph: Any = None  # nx.DiGraph or _DictGraph
        self._backend: str = "unknown"
        self._init_graph()

    def _init_graph(self) -> None:
        if _NX_AVAILABLE:
            self._graph = nx.DiGraph()
            self._backend = "networkx"
        else:
            self._graph = _DictGraph()
            self._backend = "dict"

    @property
    def backend(self) -> str:
        return self._backend

    def load(self) -> bool:
        """Load graph from disk.  Returns True on success."""
        if self._store_path is None or not self._store_path.exists():
            return False
        try:
            raw = json.loads(self._store_path.read_text(encoding="utf-8"))
            self._deserialize(raw)
            return True
        except Exception as exc:
            logger.warning("GraphStore: failed to load from %s: %s", self._store_path, exc)
            return False

    def save(self) -> bool:
        """Persist graph to disk.  Returns True on success."""
        if self._store_path is None:
            return False
        try:
            self._store_path.parent.mkdir(parents=True, exist_ok=True)
            raw = self._serialize()
            self._store_path.write_text(json.dumps(raw, ensure_ascii=False, indent=2),
                                        encoding="utf-8")
            return True
        except Exception as exc:
            logger.warning("GraphStore: failed to save to %s: %s", self._store_path, exc)
            return False

    # ------------------------------------------------------------------
    # Entity management
    # ------------------------------------------------------------------

    def add_entity(
        self,
        label: str,
        entity_type: str = "concept",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Add or update an entity node.  Returns the node ID (normalised label)."""
        node_id = _normalise(label)
        now = _now_iso()
        if self._graph.has_node(node_id):
            # Update timestamp and merge metadata
            self._graph.nodes[node_id]["updated_at"] = now
            if metadata:
                self._graph.nodes[node_id].setdefault("metadata", {}).update(metadata)
        else:
            attrs = {
                "label": label,
                "type": entity_type,
                "created_at": now,
                "updated_at": now,
                "access_count": 0,
                "metadata": metadata or {},
            }
            self._graph.add_node(node_id, **attrs)
        return node_id

    def get_entity(self, label: str) -> Optional[Dict[str, Any]]:
        """Return node data dict or None."""
        node_id = _normalise(label)
        if not self._graph.has_node(node_id):
            return None
        data = dict(self._graph.nodes[node_id])
        data["id"] = node_id
        # Increment access counter
        self._graph.nodes[node_id]["access_count"] = data.get("access_count", 0) + 1
        return data

    def get_all_entities(self) -> List[Dict[str, Any]]:
        """Return all entity nodes."""
        results = []
        for node_id, attrs in self._graph.nodes(data=True):
            if attrs.get("type") != "event":
                entry = dict(attrs)
                entry["id"] = node_id
                results.append(entry)
        return results

    def entity_count(self) -> int:
        return sum(
            1 for _, attrs in self._graph.nodes(data=True) if attrs.get("type") != "event"
        )

    # ------------------------------------------------------------------
    # Relationship management
    # ------------------------------------------------------------------

    def add_relationship(
        self,
        source_label: str,
        target_label: str,
        relation: str,
        strength: float = 0.5,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Create or update a directed relationship between two entities.

        Both entities are auto-created if they don't exist.
        """
        src = self.add_entity(source_label)
        tgt = self.add_entity(target_label)
        now = _now_iso()
        strength = max(0.0, min(1.0, float(strength)))

        if self._graph.has_edge(src, tgt):
            edge = self._graph[src][tgt]
            # Keep the stronger signal; update timestamp
            edge["strength"] = max(edge.get("strength", 0.0), strength)
            edge["updated_at"] = now
            if metadata:
                edge.setdefault("metadata", {}).update(metadata)
        else:
            self._graph.add_edge(
                src, tgt,
                relation=relation,
                strength=strength,
                created_at=now,
                updated_at=now,
                metadata=metadata or {},
            )
        return True

    def get_relationships(
        self,
        source_label: Optional[str] = None,
        relation: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Return edges, optionally filtered by source node or relation type."""
        results = []
        for src, tgt, data in self._graph.edges(data=True):
            if source_label and _normalise(source_label) != src:
                continue
            if relation and data.get("relation") != relation:
                continue
            entry = dict(data)
            entry["source"] = src
            entry["target"] = tgt
            results.append(entry)
        return results

    def relationship_count(self) -> int:
        return self._graph.number_of_edges()

    def get_neighbors(self, label: str, depth: int = 1) -> List[Dict[str, Any]]:
        """BFS over the graph to collect neighbours within *depth* hops."""
        node_id = _normalise(label)
        if not self._graph.has_node(node_id):
            return []

        visited: set = {node_id}
        frontier = {node_id}
        results: List[Dict[str, Any]] = []

        for _ in range(depth):
            next_frontier: set = set()
            for n in frontier:
                for nbr in self._graph.successors(n):
                    if nbr not in visited:
                        visited.add(nbr)
                        next_frontier.add(nbr)
                        attrs = dict(self._graph.nodes[nbr])
                        attrs["id"] = nbr
                        edge_data = self._graph[n][nbr]
                        attrs["via_relation"] = edge_data.get("relation", "")
                        attrs["via_strength"] = edge_data.get("strength", 0.5)
                        results.append(attrs)
            frontier = next_frontier

        return results

    # ------------------------------------------------------------------
    # Event management
    # ------------------------------------------------------------------

    def add_event(
        self,
        content: str,
        entities: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Add a timestamped event and link it to the given entity labels."""
        now = _now_iso()
        event_id = f"event:{int(time.time() * 1000)}"
        self._graph.add_node(
            event_id,
            type="event",
            label=content[:120],  # truncate for readability
            content=content,
            created_at=now,
            updated_at=now,
            access_count=0,
            metadata=metadata or {},
        )
        for label in (entities or []):
            entity_id = self.add_entity(label)
            self._graph.add_edge(
                entity_id, event_id,
                relation="mentioned_in",
                strength=1.0,
                created_at=now,
                updated_at=now,
                metadata={},
            )
        return event_id

    def get_events(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return the most recent events (by created_at)."""
        events = [
            {**dict(attrs), "id": nid}
            for nid, attrs in self._graph.nodes(data=True)
            if attrs.get("type") == "event"
        ]
        events.sort(key=lambda e: e.get("created_at", ""), reverse=True)
        return events[:limit]

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def keyword_search(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Simple case-insensitive substring search over node labels/content."""
        query_lower = query.lower()
        scored: List[Tuple[float, Dict[str, Any]]] = []

        for node_id, attrs in self._graph.nodes(data=True):
            label = attrs.get("label", "").lower()
            content = attrs.get("content", "").lower()
            metadata_str = json.dumps(attrs.get("metadata", {})).lower()

            score = 0.0
            if query_lower in label:
                score += 1.0
            if query_lower in content:
                score += 0.5
            if query_lower in metadata_str:
                score += 0.2
            # Boost by access count (popular entities rank higher)
            score += math.log1p(attrs.get("access_count", 0)) * 0.1

            if score > 0:
                entry = dict(attrs)
                entry["id"] = node_id
                entry["_score"] = score
                scored.append((score, entry))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item for _, item in scored[:top_k]]

    # ------------------------------------------------------------------
    # Serialisation (for disk persistence)
    # ------------------------------------------------------------------

    def _serialize(self) -> Dict[str, Any]:
        nodes = []
        for node_id, attrs in self._graph.nodes(data=True):
            nodes.append({"id": node_id, "attrs": attrs})

        edges = []
        for src, tgt, data in self._graph.edges(data=True):
            edges.append({"src": src, "tgt": tgt, "data": data})

        return {
            "version": 1,
            "backend": self._backend,
            "nodes": nodes,
            "edges": edges,
        }

    def _deserialize(self, raw: Dict[str, Any]) -> None:
        self._init_graph()
        for node in raw.get("nodes", []):
            self._graph.add_node(node["id"], **node["attrs"])
        for edge in raw.get("edges", []):
            self._graph.add_edge(edge["src"], edge["tgt"], **edge["data"])

    # ------------------------------------------------------------------
    # Convenience stats
    # ------------------------------------------------------------------

    def stats(self) -> Dict[str, Any]:
        return {
            "backend": self._backend,
            "entity_count": self.entity_count(),
            "relationship_count": self.relationship_count(),
            "event_count": len(self.get_events(limit=10_000)),
        }


# ---------------------------------------------------------------------------
# Fallback dict-based graph (no networkx)
# ---------------------------------------------------------------------------


class _DictGraph:
    """Minimal directed graph implemented with plain dicts.

    Mirrors the subset of nx.DiGraph API used by GraphStore.
    """

    def __init__(self) -> None:
        self._nodes: Dict[str, Dict[str, Any]] = {}
        # edges[src][tgt] = data dict
        self._edges: Dict[str, Dict[str, Dict[str, Any]]] = {}

    # nx.DiGraph interface subset

    @property
    def nodes(self) -> "_NodeView":
        return _NodeView(self._nodes)

    def add_node(self, node_id: str, **attrs: Any) -> None:
        if node_id not in self._nodes:
            self._nodes[node_id] = {}
        self._nodes[node_id].update(attrs)

    def has_node(self, node_id: str) -> bool:
        return node_id in self._nodes

    def add_edge(self, src: str, tgt: str, **attrs: Any) -> None:
        self._edges.setdefault(src, {})[tgt] = attrs

    def has_edge(self, src: str, tgt: str) -> bool:
        return tgt in self._edges.get(src, {})

    def successors(self, node_id: str):
        return iter(self._edges.get(node_id, {}).keys())

    def edges(self, data: bool = False):
        for src, targets in self._edges.items():
            for tgt, attrs in targets.items():
                if data:
                    yield src, tgt, attrs
                else:
                    yield src, tgt

    def number_of_edges(self) -> int:
        return sum(len(targets) for targets in self._edges.values())

    def __getitem__(self, src: str) -> Dict[str, Any]:
        return self._edges.get(src, {})


class _NodeView:
    """Proxy returned by _DictGraph.nodes for data=True iteration."""

    def __init__(self, nodes: Dict[str, Dict[str, Any]]) -> None:
        self._nodes = nodes

    def __getitem__(self, node_id: str) -> Dict[str, Any]:
        return self._nodes[node_id]

    def __call__(self, data: bool = False):
        if data:
            return self._nodes.items()
        return self._nodes.keys()

    def __iter__(self):
        return iter(self._nodes)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalise(label: str) -> str:
    """Normalise an entity label to a stable node ID."""
    return label.strip().lower().replace(" ", "_")
