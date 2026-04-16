"""TemporalDecay — time-aware memory weighting for the graph memory plugin.

Implements exponential decay: a memory created long ago receives a lower
relevance weight than a recent one.  The decay follows:

    weight(t) = exp(−ln(2) × elapsed_days / half_life_days)

At t=0 (just created) the weight is 1.0.
At t=half_life_days the weight is 0.5.
At t=2*half_life_days the weight is 0.25, etc.

The weight is clamped to [min_weight, 1.0] so that old memories are never
completely ignored — they still contribute, just with lower priority.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional


class TemporalDecay:
    """Compute exponential decay weights for timestamped memories.

    Args:
        half_life_days: Days until a memory's weight halves.  Set to 0 or
            None to disable decay (all weights are 1.0).
        min_weight: Floor value so old memories are never fully discarded.
    """

    def __init__(
        self,
        half_life_days: float = 30.0,
        min_weight: float = 0.1,
    ) -> None:
        self._half_life_days = float(half_life_days) if half_life_days else 0.0
        self._min_weight = max(0.0, min(1.0, float(min_weight)))
        self._enabled = self._half_life_days > 0.0

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def half_life_days(self) -> float:
        return self._half_life_days

    # ------------------------------------------------------------------
    # Core calculation
    # ------------------------------------------------------------------

    def weight(self, created_at: str) -> float:
        """Return the decay weight for a memory created at *created_at*.

        *created_at* must be an ISO-8601 string (as stored by GraphStore).
        Returns 1.0 when decay is disabled or the timestamp is unparseable.
        """
        if not self._enabled:
            return 1.0

        elapsed = self._elapsed_days(created_at)
        if elapsed is None:
            return 1.0

        raw = math.exp(-math.log(2) * elapsed / self._half_life_days)
        return max(self._min_weight, raw)

    def elapsed_days(self, created_at: str) -> Optional[float]:
        """Return elapsed days since *created_at*, or None on parse error."""
        return self._elapsed_days(created_at)

    def score_with_decay(self, base_score: float, created_at: str) -> float:
        """Multiply *base_score* by the decay weight for *created_at*."""
        return base_score * self.weight(created_at)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _elapsed_days(self, created_at: str) -> Optional[float]:
        try:
            dt = datetime.fromisoformat(created_at)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            delta = now - dt
            return max(0.0, delta.total_seconds() / 86_400)
        except (ValueError, TypeError):
            return None

    def describe(self) -> str:
        """Return a short human-readable description of the decay settings."""
        if not self._enabled:
            return "temporal decay disabled"
        return (
            f"exponential decay · half-life {self._half_life_days:.0f} days "
            f"· min weight {self._min_weight:.2f}"
        )
