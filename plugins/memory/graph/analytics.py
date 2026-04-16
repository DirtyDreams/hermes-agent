"""MemoryAnalytics — statistics and insights for the graph memory plugin.

Aggregates data from a GraphStore to provide:
  - Entity frequency (most accessed / most connected)
  - Relationship type breakdown
  - Temporal trends (memories added per day)
  - Storage metrics
  - Forgotten memories (high historical importance, not accessed recently)
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .graph_store import GraphStore
from .decay_calculator import TemporalDecay

# Number of days included in the temporal trend chart.
_TEMPORAL_TREND_DAYS = 30


class MemoryAnalytics:
    """Compute analytics over a GraphStore instance."""

    def __init__(self, store: GraphStore, decay: Optional[TemporalDecay] = None) -> None:
        self._store = store
        # Pass half_life_days=0 to create a disabled decay calculator
        self._decay = decay or TemporalDecay(half_life_days=0)

    # ------------------------------------------------------------------
    # Full stats dict (used by system_prompt_block and tool calls)
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict[str, Any]:
        """Return a comprehensive statistics dict."""
        entities = self._store.get_all_entities()
        relationships = self._store.get_relationships()
        events = self._store.get_events(limit=10_000)

        return {
            "summary": self._summary_stats(entities, relationships, events),
            "top_entities": self._top_entities(entities, n=10),
            "relation_breakdown": self._relation_breakdown(relationships),
            "temporal_trend": self._temporal_trend(events),
            "forgotten_memories": self._forgotten_memories(entities),
        }

    # ------------------------------------------------------------------
    # Individual stat methods
    # ------------------------------------------------------------------

    def _summary_stats(
        self,
        entities: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]],
        events: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        return {
            "entity_count": len(entities),
            "relationship_count": len(relationships),
            "event_count": len(events),
            "backend": self._store.backend,
        }

    def _top_entities(self, entities: List[Dict[str, Any]], n: int = 10) -> List[Dict[str, Any]]:
        """Return the *n* most-accessed or most-connected entities."""
        scored = []
        for e in entities:
            score = e.get("access_count", 0)
            # Add decay weight so that recently active entities rank higher
            if self._decay.enabled:
                score *= self._decay.weight(e.get("updated_at", e.get("created_at", "")))
            scored.append({
                "id": e.get("id", ""),
                "label": e.get("label", e.get("id", "")),
                "type": e.get("type", "concept"),
                "access_count": e.get("access_count", 0),
                "score": round(score, 4),
            })
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:n]

    def _relation_breakdown(self, relationships: List[Dict[str, Any]]) -> Dict[str, int]:
        counts: Counter = Counter()
        for rel in relationships:
            counts[rel.get("relation", "unknown")] += 1
        return dict(counts.most_common())

    def _temporal_trend(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Aggregate event counts per calendar day (last 30 days)."""
        day_counts: Counter = Counter()
        for e in events:
            ts = e.get("created_at", "")
            try:
                day = ts[:10]  # "YYYY-MM-DD"
                day_counts[day] += 1
            except (IndexError, TypeError):
                pass

        trend = [{"date": day, "count": cnt}
                 for day, cnt in sorted(day_counts.items(), reverse=True)[:_TEMPORAL_TREND_DAYS]]
        return trend

    def _forgotten_memories(self, entities: List[Dict[str, Any]], n: int = 5) -> List[Dict[str, Any]]:
        """Return entities that were historically active but haven't been accessed recently."""
        if not self._decay.enabled:
            return []

        candidates = []
        for e in entities:
            access_count = e.get("access_count", 0)
            if access_count < 2:
                continue
            created_at = e.get("created_at", "")
            decay_w = self._decay.weight(created_at)
            # "Forgotten" = high historical access but low decay weight (old)
            if access_count > 0 and decay_w < 0.5:
                candidates.append({
                    "id": e.get("id", ""),
                    "label": e.get("label", e.get("id", "")),
                    "access_count": access_count,
                    "decay_weight": round(decay_w, 4),
                })

        candidates.sort(key=lambda x: x["access_count"] / max(x["decay_weight"], 0.01), reverse=True)
        return candidates[:n]

    # ------------------------------------------------------------------
    # Human-readable summary for system prompt
    # ------------------------------------------------------------------

    def brief_summary(self) -> str:
        """One-line summary suitable for the system prompt."""
        s = self._store.stats()
        parts = [f"{s['entity_count']} entities", f"{s['relationship_count']} relationships"]
        if s.get("event_count", 0):
            parts.append(f"{s['event_count']} events")
        return ", ".join(parts)
