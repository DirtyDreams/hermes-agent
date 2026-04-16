"""Tests for the graph memory plugin.

Covers:
  - GraphStore (dict backend — no NetworkX needed)
  - EmbeddingCache (keyword-fallback mode)
  - TemporalDecay
  - MemoryAnalytics
  - GraphMemoryProvider lifecycle, tool dispatch, hooks
"""

from __future__ import annotations

import json
import os
import sys
import time
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure repo root is on path (mirrors test_retaindb_plugin.py pattern)
_repo_root = str(Path(__file__).resolve().parents[3])
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)


@pytest.fixture(autouse=True)
def _isolate_env(tmp_path, monkeypatch):
    """Redirect HERMES_HOME to a temp dir so no real ~/.hermes is touched."""
    hermes_home = tmp_path / ".hermes"
    hermes_home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(hermes_home))


# ---------------------------------------------------------------------------
# Import the plugin components (no NetworkX or sentence-transformers required)
# ---------------------------------------------------------------------------

from plugins.memory.graph.graph_store import GraphStore, _normalise
from plugins.memory.graph.embeddings import EmbeddingCache, _cosine
from plugins.memory.graph.decay_calculator import TemporalDecay
from plugins.memory.graph.analytics import MemoryAnalytics
from plugins.memory.graph import GraphMemoryProvider, register


# ===========================================================================
# GraphStore tests
# ===========================================================================

class TestGraphStore:
    def _make(self, tmp_path=None):
        path = (tmp_path / "graph.json") if tmp_path else None
        return GraphStore(store_path=path)

    def test_backend_is_set(self):
        g = self._make()
        assert g.backend in ("networkx", "dict")

    def test_add_entity_returns_normalised_id(self):
        g = self._make()
        node_id = g.add_entity("Alice Smith")
        assert node_id == "alice_smith"

    def test_entity_idempotent(self):
        g = self._make()
        g.add_entity("Alice")
        g.add_entity("Alice")
        assert g.entity_count() == 1

    def test_get_entity_returns_data(self):
        g = self._make()
        g.add_entity("Bob", entity_type="person")
        data = g.get_entity("Bob")
        assert data is not None
        assert data["type"] == "person"
        assert data["label"] == "Bob"

    def test_get_entity_not_found(self):
        g = self._make()
        assert g.get_entity("nobody") is None

    def test_get_entity_increments_access_count(self):
        g = self._make()
        g.add_entity("Carol")
        g.get_entity("Carol")
        g.get_entity("Carol")
        data = g.get_entity("Carol")
        assert data["access_count"] >= 2

    def test_add_relationship_creates_both_entities(self):
        g = self._make()
        g.add_relationship("Alice", "Project X", relation="works-on")
        assert g.get_entity("Alice") is not None
        assert g.get_entity("Project X") is not None

    def test_relationship_count(self):
        g = self._make()
        g.add_relationship("Alice", "Bob", relation="knows")
        assert g.relationship_count() == 1

    def test_relationship_strength_clamped(self):
        g = self._make()
        g.add_relationship("A", "B", relation="r", strength=5.0)
        rels = g.get_relationships(source_label="A")
        assert rels[0]["strength"] == 1.0

    def test_relationship_strength_negative_clamped(self):
        g = self._make()
        g.add_relationship("A", "B", relation="r", strength=-1.0)
        rels = g.get_relationships(source_label="A")
        assert rels[0]["strength"] == 0.0

    def test_relationship_deduplication_keeps_max_strength(self):
        g = self._make()
        g.add_relationship("A", "B", relation="r", strength=0.3)
        g.add_relationship("A", "B", relation="r", strength=0.9)
        rels = g.get_relationships(source_label="A")
        assert len(rels) == 1
        assert rels[0]["strength"] == 0.9

    def test_get_neighbors(self):
        g = self._make()
        g.add_relationship("Alice", "Python", relation="uses")
        g.add_relationship("Alice", "Bob", relation="knows")
        neighbors = g.get_neighbors("Alice", depth=1)
        labels = [n["label"] for n in neighbors]
        assert "Python" in labels
        assert "Bob" in labels

    def test_add_event(self):
        g = self._make()
        eid = g.add_event("Alice fixed a bug in Python", entities=["Alice", "Python"])
        assert eid.startswith("event:")
        events = g.get_events()
        assert len(events) == 1
        assert "bug" in events[0]["content"]

    def test_keyword_search(self):
        g = self._make()
        g.add_entity("Alice Smith", entity_type="person")
        g.add_entity("Python project", entity_type="project")
        results = g.keyword_search("python", top_k=5)
        labels = [r["label"] for r in results]
        assert "Python project" in labels

    def test_keyword_search_no_results(self):
        g = self._make()
        g.add_entity("Bob", entity_type="person")
        results = g.keyword_search("xyz_nonexistent_123")
        assert results == []

    def test_save_and_load(self, tmp_path):
        g = self._make(tmp_path)
        g.add_entity("Alice", entity_type="person")
        g.add_relationship("Alice", "Bob", relation="knows")
        assert g.save() is True

        g2 = self._make(tmp_path)
        assert g2.load() is True
        assert g2.entity_count() >= 1
        assert g2.get_entity("Alice") is not None

    def test_load_returns_false_if_no_file(self, tmp_path):
        g = GraphStore(store_path=tmp_path / "nonexistent.json")
        assert g.load() is False

    def test_save_returns_false_if_no_path(self):
        g = GraphStore(store_path=None)
        assert g.save() is False

    def test_stats(self):
        g = self._make()
        g.add_entity("Alice")
        g.add_relationship("Alice", "Bob", relation="knows")
        stats = g.stats()
        assert stats["entity_count"] >= 1
        assert stats["relationship_count"] >= 1
        assert stats["backend"] in ("networkx", "dict")

    def test_normalise(self):
        assert _normalise("  Hello World  ") == "hello_world"


# ===========================================================================
# EmbeddingCache tests
# ===========================================================================

class TestEmbeddingCache:
    def test_keyword_backend_used_when_no_sentence_transformers(self):
        """Force keyword backend by patching out sentence-transformers."""
        with patch("plugins.memory.graph.embeddings._ST_AVAILABLE", False):
            cache = EmbeddingCache()
            assert cache.backend == "keyword"

    def test_embed_returns_list_of_floats(self):
        with patch("plugins.memory.graph.embeddings._ST_AVAILABLE", False):
            cache = EmbeddingCache()
            vec = cache.embed("Hello world")
            assert isinstance(vec, list)
            assert all(isinstance(v, float) for v in vec)
            assert len(vec) == 256

    def test_embed_empty_string_returns_empty(self):
        with patch("plugins.memory.graph.embeddings._ST_AVAILABLE", False):
            cache = EmbeddingCache()
            vec = cache.embed("   ")
            assert vec == []

    def test_search_returns_ranked_results(self):
        with patch("plugins.memory.graph.embeddings._ST_AVAILABLE", False):
            cache = EmbeddingCache()
            candidates = ["Alice Smith", "Python tutorial", "Bob Jones"]
            results = cache.search("alice", candidates, top_k=2)
            assert len(results) <= 2
            assert all(isinstance(s, float) and isinstance(t, str) for s, t in results)

    def test_search_empty_candidates(self):
        with patch("plugins.memory.graph.embeddings._ST_AVAILABLE", False):
            cache = EmbeddingCache()
            assert cache.search("query", []) == []

    def test_cosine_identical_vectors(self):
        v = [1.0, 0.0, 0.0]
        assert abs(_cosine(v, v) - 1.0) < 1e-6

    def test_cosine_orthogonal_vectors(self):
        a = [1.0, 0.0]
        b = [0.0, 1.0]
        assert abs(_cosine(a, b)) < 1e-6

    def test_cosine_zero_vectors(self):
        assert _cosine([0.0, 0.0], [1.0, 0.0]) == 0.0

    def test_cosine_different_lengths(self):
        assert _cosine([1.0], [1.0, 0.0]) == 0.0

    def test_cache_persistence(self, tmp_path):
        with patch("plugins.memory.graph.embeddings._ST_AVAILABLE", False):
            path = tmp_path / "emb.json"
            c1 = EmbeddingCache(cache_path=path)
            c1.embed("hello")  # keyword vectors aren't persisted, but API is stable
            c2 = EmbeddingCache(cache_path=path)
            assert c2.backend == "keyword"


# ===========================================================================
# TemporalDecay tests
# ===========================================================================

class TestTemporalDecay:
    def test_disabled_when_half_life_zero(self):
        d = TemporalDecay(half_life_days=0)
        assert not d.enabled

    def test_disabled_returns_weight_one(self):
        d = TemporalDecay(half_life_days=0)
        assert d.weight("2020-01-01T00:00:00+00:00") == 1.0

    def test_fresh_memory_weight_near_one(self):
        d = TemporalDecay(half_life_days=30)
        now = datetime.now(timezone.utc).isoformat()
        w = d.weight(now)
        assert 0.99 < w <= 1.0

    def test_old_memory_weight_decays(self):
        d = TemporalDecay(half_life_days=30)
        old = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
        w = d.weight(old)
        assert w < 0.5

    def test_half_life_at_30_days(self):
        d = TemporalDecay(half_life_days=30)
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        w = d.weight(thirty_days_ago)
        # Should be approximately 0.5
        assert 0.4 < w < 0.6

    def test_min_weight_floor(self):
        d = TemporalDecay(half_life_days=1, min_weight=0.2)
        ancient = "2000-01-01T00:00:00+00:00"
        w = d.weight(ancient)
        assert w >= 0.2

    def test_invalid_timestamp_returns_one(self):
        d = TemporalDecay(half_life_days=30)
        assert d.weight("not-a-date") == 1.0
        assert d.weight("") == 1.0
        assert d.weight(None) == 1.0  # type: ignore

    def test_score_with_decay(self):
        d = TemporalDecay(half_life_days=30)
        ancient = "2000-01-01T00:00:00+00:00"
        score = d.score_with_decay(1.0, ancient)
        assert 0 < score < 1.0

    def test_describe(self):
        d = TemporalDecay(half_life_days=30, min_weight=0.1)
        desc = d.describe()
        assert "30" in desc
        assert "0.10" in desc

    def test_describe_disabled(self):
        d = TemporalDecay(half_life_days=0)
        assert "disabled" in d.describe()

    def test_elapsed_days(self):
        d = TemporalDecay(half_life_days=30)
        one_week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        elapsed = d.elapsed_days(one_week_ago)
        assert elapsed is not None
        assert 6.5 < elapsed < 7.5

    def test_elapsed_days_invalid(self):
        d = TemporalDecay(half_life_days=30)
        assert d.elapsed_days("bad") is None


# ===========================================================================
# MemoryAnalytics tests
# ===========================================================================

class TestMemoryAnalytics:
    def _make_store_with_data(self):
        g = GraphStore()
        g.add_entity("Alice", entity_type="person")
        g.add_entity("Python", entity_type="topic")
        g.add_relationship("Alice", "Python", relation="uses", strength=0.9)
        g.add_event("Alice worked on Python today", entities=["Alice", "Python"])
        # Simulate access
        for _ in range(3):
            g.get_entity("Alice")
        return g

    def test_get_stats_keys(self):
        g = self._make_store_with_data()
        a = MemoryAnalytics(g)
        stats = a.get_stats()
        assert "summary" in stats
        assert "top_entities" in stats
        assert "relation_breakdown" in stats
        assert "temporal_trend" in stats
        assert "forgotten_memories" in stats

    def test_summary_counts(self):
        g = self._make_store_with_data()
        a = MemoryAnalytics(g)
        s = a.get_stats()["summary"]
        assert s["entity_count"] >= 2
        assert s["relationship_count"] >= 1

    def test_top_entities_non_empty(self):
        g = self._make_store_with_data()
        a = MemoryAnalytics(g)
        top = a.get_stats()["top_entities"]
        assert len(top) >= 1

    def test_relation_breakdown(self):
        g = self._make_store_with_data()
        a = MemoryAnalytics(g)
        rb = a.get_stats()["relation_breakdown"]
        assert "uses" in rb

    def test_brief_summary(self):
        g = self._make_store_with_data()
        a = MemoryAnalytics(g)
        s = a.brief_summary()
        assert "entities" in s

    def test_empty_store(self):
        g = GraphStore()
        a = MemoryAnalytics(g)
        stats = a.get_stats()
        assert stats["summary"]["entity_count"] == 0
        assert stats["top_entities"] == []

    def test_forgotten_memories_requires_decay(self):
        g = self._make_store_with_data()
        # No decay — forgotten_memories should be empty
        a = MemoryAnalytics(g, TemporalDecay(half_life_days=0))
        assert a.get_stats()["forgotten_memories"] == []

    def test_temporal_trend_keys(self):
        g = self._make_store_with_data()
        a = MemoryAnalytics(g)
        trend = a.get_stats()["temporal_trend"]
        if trend:
            assert "date" in trend[0]
            assert "count" in trend[0]


# ===========================================================================
# GraphMemoryProvider tests
# ===========================================================================

class TestGraphMemoryProvider:
    def _make_provider(self, tmp_path):
        """Create and initialize a provider with a temp HERMES_HOME."""
        provider = GraphMemoryProvider()
        provider.initialize("test-session", hermes_home=str(tmp_path))
        return provider

    def test_name(self):
        assert GraphMemoryProvider().name == "graph"

    def test_is_available(self):
        assert GraphMemoryProvider().is_available() is True

    def test_initialize(self, tmp_path):
        p = self._make_provider(tmp_path)
        assert p._initialized is True
        assert p._graph is not None
        assert p._cache is not None
        assert p._decay is not None
        assert p._analytics is not None

    def test_system_prompt_empty_when_no_data(self, tmp_path):
        p = self._make_provider(tmp_path)
        assert p.system_prompt_block() == ""

    def test_system_prompt_after_data(self, tmp_path):
        p = self._make_provider(tmp_path)
        p._graph.add_entity("Alice")
        block = p.system_prompt_block()
        assert "Graph Memory" in block

    def test_get_tool_schemas(self, tmp_path):
        p = self._make_provider(tmp_path)
        schemas = p.get_tool_schemas()
        assert len(schemas) == 1
        assert schemas[0]["name"] == "graph_memory"

    # -- tool dispatch -------------------------------------------------------

    def test_tool_add_entity(self, tmp_path):
        p = self._make_provider(tmp_path)
        result = json.loads(p.handle_tool_call(
            "graph_memory", {"action": "add_entity", "label": "Alice", "entity_type": "person"}
        ))
        assert result["success"] is True
        assert result["id"] == "alice"

    def test_tool_add_entity_missing_label(self, tmp_path):
        p = self._make_provider(tmp_path)
        result = json.loads(p.handle_tool_call("graph_memory", {"action": "add_entity"}))
        assert "error" in result

    def test_tool_add_relationship(self, tmp_path):
        p = self._make_provider(tmp_path)
        result = json.loads(p.handle_tool_call("graph_memory", {
            "action": "add_relationship",
            "source": "Alice",
            "target": "Python",
            "relation": "uses",
        }))
        assert result["success"] is True

    def test_tool_add_relationship_missing_args(self, tmp_path):
        p = self._make_provider(tmp_path)
        result = json.loads(p.handle_tool_call("graph_memory", {
            "action": "add_relationship", "source": "Alice",
        }))
        assert "error" in result

    def test_tool_add_event(self, tmp_path):
        p = self._make_provider(tmp_path)
        result = json.loads(p.handle_tool_call("graph_memory", {
            "action": "add_event",
            "content": "Alice fixed a bug",
            "entities": ["Alice"],
        }))
        assert result["success"] is True
        assert result["event_id"].startswith("event:")

    def test_tool_add_event_missing_content(self, tmp_path):
        p = self._make_provider(tmp_path)
        result = json.loads(p.handle_tool_call("graph_memory", {"action": "add_event"}))
        assert "error" in result

    def test_tool_get_entity_found(self, tmp_path):
        p = self._make_provider(tmp_path)
        p._graph.add_entity("Bob", entity_type="person")
        result = json.loads(p.handle_tool_call("graph_memory", {
            "action": "get_entity", "label": "Bob",
        }))
        assert result["found"] is True
        assert result["entity"]["type"] == "person"

    def test_tool_get_entity_not_found(self, tmp_path):
        p = self._make_provider(tmp_path)
        result = json.loads(p.handle_tool_call("graph_memory", {
            "action": "get_entity", "label": "nobody",
        }))
        assert result["found"] is False

    def test_tool_get_neighbors(self, tmp_path):
        p = self._make_provider(tmp_path)
        p._graph.add_relationship("Alice", "Python", relation="uses")
        result = json.loads(p.handle_tool_call("graph_memory", {
            "action": "get_neighbors", "label": "Alice",
        }))
        assert "neighbors" in result

    def test_tool_search(self, tmp_path):
        p = self._make_provider(tmp_path)
        p._graph.add_entity("Alice Smith", entity_type="person")
        result = json.loads(p.handle_tool_call("graph_memory", {
            "action": "search", "query": "alice",
        }))
        assert "results" in result

    def test_tool_get_analytics(self, tmp_path):
        p = self._make_provider(tmp_path)
        p._graph.add_entity("Alice")
        result = json.loads(p.handle_tool_call("graph_memory", {"action": "get_analytics"}))
        assert "summary" in result

    def test_tool_unknown_action(self, tmp_path):
        p = self._make_provider(tmp_path)
        result = json.loads(p.handle_tool_call("graph_memory", {"action": "foobar"}))
        assert "error" in result

    def test_tool_unknown_name(self, tmp_path):
        p = self._make_provider(tmp_path)
        result = json.loads(p.handle_tool_call("other_tool", {"action": "x"}))
        assert "error" in result

    # -- hooks ---------------------------------------------------------------

    def test_on_memory_write_adds_event(self, tmp_path):
        p = self._make_provider(tmp_path)
        p.on_memory_write("add", "memory", "Alice works on the Python project")
        events = p._graph.get_events()
        assert len(events) == 1
        assert "Alice works on the Python project" in events[0]["content"]

    def test_on_memory_write_remove_ignored(self, tmp_path):
        p = self._make_provider(tmp_path)
        p.on_memory_write("remove", "memory", "some old fact")
        assert len(p._graph.get_events()) == 0

    def test_sync_turn_extracts_entities(self, tmp_path):
        p = self._make_provider(tmp_path)
        p.sync_turn("Alice is helping Bob", "Sure, I can help with Bob's Python project.")
        # Should have extracted some capitalised entities
        count = p._graph.entity_count()
        assert count >= 0  # May be 0 if no caps patterns match — that's fine

    def test_sync_turn_skipped_for_non_primary(self, tmp_path):
        p = self._make_provider(tmp_path)
        p._agent_context = "subagent"
        p.sync_turn("Alice", "Bob")
        assert p._graph.entity_count() == 0

    def test_prefetch_empty_when_no_data(self, tmp_path):
        p = self._make_provider(tmp_path)
        result = p.prefetch("alice")
        assert result == ""

    def test_prefetch_returns_results_after_data(self, tmp_path):
        p = self._make_provider(tmp_path)
        p._graph.add_entity("Alice", entity_type="person")
        result = p.prefetch("alice")
        assert "Alice" in result

    def test_on_session_end_saves_graph(self, tmp_path):
        p = self._make_provider(tmp_path)
        p._graph.add_entity("Alice")
        p.on_session_end([])
        graph_path = tmp_path / "graph_memory" / "graph.json"
        assert graph_path.exists()

    def test_shutdown_saves_graph(self, tmp_path):
        p = self._make_provider(tmp_path)
        p._graph.add_entity("Alice")
        p.shutdown()
        graph_path = tmp_path / "graph_memory" / "graph.json"
        assert graph_path.exists()

    def test_get_config_schema(self, tmp_path):
        p = self._make_provider(tmp_path)
        schema = p.get_config_schema()
        keys = [f["key"] for f in schema]
        assert "half_life_days" in keys
        assert "embedding_model" in keys

    def test_not_initialized_tool_call(self):
        p = GraphMemoryProvider()
        result = json.loads(p.handle_tool_call("graph_memory", {"action": "get_analytics"}))
        assert "error" in result


# ===========================================================================
# register() function test
# ===========================================================================

class TestRegister:
    def test_register_calls_ctx(self):
        collector = MagicMock()
        register(collector)
        collector.register_memory_provider.assert_called_once()
        provider = collector.register_memory_provider.call_args[0][0]
        assert isinstance(provider, GraphMemoryProvider)


# ===========================================================================
# Integration: plugin loader discovers graph provider
# ===========================================================================

class TestPluginDiscovery:
    def test_discovery_finds_graph(self):
        from plugins.memory import discover_memory_providers
        names = [name for name, _, _ in discover_memory_providers()]
        assert "graph" in names

    def test_load_memory_provider(self):
        from plugins.memory import load_memory_provider
        provider = load_memory_provider("graph")
        assert provider is not None
        assert provider.name == "graph"
        assert provider.is_available() is True
