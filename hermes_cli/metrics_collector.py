"""
Metrics collector for the real-time monitoring dashboard.

Collects process-level system metrics (CPU, memory) and computes
token cost estimates from pricing data.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Optional

# ---------------------------------------------------------------------------
# System metrics (psutil optional)
# ---------------------------------------------------------------------------

try:
    import psutil as _psutil
    _PSUTIL_AVAILABLE = True
except ImportError:  # pragma: no cover
    _psutil = None  # type: ignore[assignment]
    _PSUTIL_AVAILABLE = False


@dataclass
class SystemMetrics:
    """Snapshot of process and system resource consumption."""

    timestamp: str
    memory_rss_mb: float = 0.0
    memory_vms_mb: float = 0.0
    cpu_percent: float = 0.0
    open_files: int = 0
    thread_count: int = 0
    process_uptime_s: float = 0.0

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "memory_rss_mb": round(self.memory_rss_mb, 1),
            "memory_vms_mb": round(self.memory_vms_mb, 1),
            "cpu_percent": round(self.cpu_percent, 1),
            "open_files": self.open_files,
            "thread_count": self.thread_count,
            "process_uptime_s": round(self.process_uptime_s, 1),
        }


# Track when this module was loaded (approximates process start for uptime).
_MODULE_LOAD_TIME = time.monotonic()


def collect_process_metrics() -> SystemMetrics:
    """Sample the current process metrics.  Falls back gracefully when psutil
    is not installed."""
    now_iso = datetime.now(timezone.utc).isoformat()
    uptime = time.monotonic() - _MODULE_LOAD_TIME

    if not _PSUTIL_AVAILABLE:
        return SystemMetrics(timestamp=now_iso, process_uptime_s=uptime)

    try:
        proc = _psutil.Process(os.getpid())
        mem_info = proc.memory_info()
        cpu = proc.cpu_percent(interval=None)  # non-blocking
        try:
            n_open = proc.num_fds()  # POSIX only
        except (AttributeError, _psutil.AccessDenied):
            n_open = 0
        return SystemMetrics(
            timestamp=now_iso,
            memory_rss_mb=mem_info.rss / 1_048_576,
            memory_vms_mb=mem_info.vms / 1_048_576,
            cpu_percent=cpu,
            open_files=n_open,
            thread_count=proc.num_threads(),
            process_uptime_s=uptime,
        )
    except Exception:  # pragma: no cover
        return SystemMetrics(timestamp=now_iso, process_uptime_s=uptime)


# ---------------------------------------------------------------------------
# Token cost estimation
# ---------------------------------------------------------------------------

def compute_token_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    """Return estimated USD cost for the given model + token counts.

    Uses the existing agent/usage_pricing infrastructure when available and
    falls back to a conservative estimate (~$3/$15 per million) so the
    monitoring dashboard always shows *something* useful.
    """
    try:
        from agent.usage_pricing import estimate_usage_cost, CanonicalUsage, BillingRoute
        usage = CanonicalUsage(input_tokens=tokens_in, output_tokens=tokens_out)
        route = BillingRoute(provider="", model=model, base_url="")
        result = estimate_usage_cost(usage, route)
        if result and result.amount_usd is not None:
            return float(result.amount_usd)
    except Exception:
        pass

    # Fallback — generic mid-tier pricing
    cost_in = tokens_in * 3.0 / 1_000_000
    cost_out = tokens_out * 15.0 / 1_000_000
    return cost_in + cost_out


# ---------------------------------------------------------------------------
# Tool execution analytics
# ---------------------------------------------------------------------------

@dataclass
class ToolStats:
    """Accumulated statistics for a named tool."""

    tool_name: str
    call_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    total_duration_ms: float = 0.0

    @property
    def avg_duration_ms(self) -> float:
        if self.call_count == 0:
            return 0.0
        return self.total_duration_ms / self.call_count

    def to_dict(self) -> dict:
        return {
            "tool_name": self.tool_name,
            "call_count": self.call_count,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "avg_duration_ms": round(self.avg_duration_ms, 1),
        }


class MetricsCollector:
    """Collects and aggregates tool execution metrics across all sessions."""

    def __init__(self) -> None:
        self._tool_stats: Dict[str, ToolStats] = {}
        self._system_metrics_cache: Optional[SystemMetrics] = None
        self._cache_ts: float = 0.0
        self._cache_ttl: float = 2.0  # seconds

    # ------------------------------------------------------------------
    # System metrics (cached to avoid hammering the OS)
    # ------------------------------------------------------------------

    def get_system_metrics(self) -> SystemMetrics:
        now = time.monotonic()
        if self._system_metrics_cache is None or (now - self._cache_ts) > self._cache_ttl:
            self._system_metrics_cache = collect_process_metrics()
            self._cache_ts = now
        return self._system_metrics_cache

    # ------------------------------------------------------------------
    # Tool execution tracking
    # ------------------------------------------------------------------

    def track_tool_execution(
        self,
        tool_name: str,
        duration_ms: float,
        success: bool,
    ) -> None:
        if tool_name not in self._tool_stats:
            self._tool_stats[tool_name] = ToolStats(tool_name=tool_name)
        stats = self._tool_stats[tool_name]
        stats.call_count += 1
        stats.total_duration_ms += duration_ms
        if success:
            stats.success_count += 1
        else:
            stats.failure_count += 1

    def get_tool_stats(self) -> Dict[str, ToolStats]:
        return dict(self._tool_stats)

    def get_tool_stats_list(self) -> list:
        return [s.to_dict() for s in sorted(
            self._tool_stats.values(),
            key=lambda s: s.call_count,
            reverse=True,
        )]

    # ------------------------------------------------------------------
    # Cost estimation (delegates to module-level helper)
    # ------------------------------------------------------------------

    @staticmethod
    def compute_token_cost(model: str, tokens_in: int, tokens_out: int) -> float:
        return compute_token_cost(model, tokens_in, tokens_out)


# Module-level shared collector.
_default_collector: Optional[MetricsCollector] = None


def get_default_collector() -> MetricsCollector:
    """Return (and lazily create) the module-level shared MetricsCollector."""
    global _default_collector
    if _default_collector is None:
        _default_collector = MetricsCollector()
    return _default_collector
