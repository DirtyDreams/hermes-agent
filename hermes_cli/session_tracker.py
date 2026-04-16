"""
Session tracker for the real-time monitoring dashboard.

Tracks active agent sessions, their metrics, and tool execution state.
All state is in-memory and ephemeral — sessions are removed when the
agent finishes or the monitor server shuts down.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


@dataclass
class ToolCall:
    """Represents a single tool invocation within a session."""

    call_id: str
    tool_name: str
    args: dict
    status: str = "pending"          # pending | running | completed | failed
    start_time: float = field(default_factory=time.monotonic)
    end_time: Optional[float] = None
    result_preview: Optional[str] = None
    error: Optional[str] = None

    @property
    def duration_ms(self) -> Optional[float]:
        if self.end_time is not None:
            return (self.end_time - self.start_time) * 1000
        return None

    def to_dict(self) -> dict:
        return {
            "call_id": self.call_id,
            "tool_name": self.tool_name,
            "args": self.args,
            "status": self.status,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": self.duration_ms,
            "result_preview": self.result_preview,
            "error": self.error,
        }


@dataclass
class SessionMetrics:
    """Metrics and state for one active agent session."""

    session_id: str
    platform: str = "unknown"
    model: str = ""
    user_id: Optional[str] = None

    # Timestamps
    start_time: float = field(default_factory=time.monotonic)
    start_wall_time: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    last_activity: float = field(default_factory=time.monotonic)

    # Token counters
    tokens_in: int = 0
    tokens_out: int = 0
    api_calls: int = 0
    estimated_cost_usd: float = 0.0

    # Current status
    current_status: str = "idle"     # idle | thinking | tool-calling | done | error

    # Tool call history (most recent N)
    tool_calls: List[ToolCall] = field(default_factory=list)
    _active_tool_calls: Dict[str, ToolCall] = field(default_factory=dict)

    # Performance
    last_api_latency_ms: float = 0.0
    total_api_latency_ms: float = 0.0

    # Internal lock for thread-safe updates from callbacks
    _lock: threading.Lock = field(default_factory=threading.Lock)

    # Maximum tool call history to retain per session
    MAX_TOOL_HISTORY: int = 50

    @property
    def duration_seconds(self) -> float:
        return time.monotonic() - self.start_time

    @property
    def active_tool_count(self) -> int:
        return sum(
            1 for tc in self._active_tool_calls.values() if tc.status == "running"
        )

    def update_tokens(self, tokens_in: int, tokens_out: int, cost_usd: float = 0.0) -> None:
        with self._lock:
            self.tokens_in += tokens_in
            self.tokens_out += tokens_out
            self.api_calls += 1
            self.estimated_cost_usd += cost_usd
            self.last_activity = time.monotonic()

    def set_status(self, status: str) -> None:
        with self._lock:
            self.current_status = status
            self.last_activity = time.monotonic()

    def record_tool_start(self, call_id: str, tool_name: str, args: dict) -> ToolCall:
        tc = ToolCall(call_id=call_id, tool_name=tool_name, args=args, status="running")
        with self._lock:
            self._active_tool_calls[call_id] = tc
            self.current_status = "tool-calling"
            self.last_activity = time.monotonic()
        return tc

    def record_tool_complete(
        self,
        call_id: str,
        result_preview: Optional[str] = None,
        error: Optional[str] = None,
    ) -> Optional[ToolCall]:
        with self._lock:
            tc = self._active_tool_calls.pop(call_id, None)
            if tc is None:
                return None
            tc.end_time = time.monotonic()
            tc.status = "failed" if error else "completed"
            tc.result_preview = result_preview
            tc.error = error
            self.tool_calls.append(tc)
            # Trim history
            if len(self.tool_calls) > self.MAX_TOOL_HISTORY:
                self.tool_calls = self.tool_calls[-self.MAX_TOOL_HISTORY :]
            # Only revert status if no other tools are still running
            if not self._active_tool_calls:
                self.current_status = "thinking"
            self.last_activity = time.monotonic()
        return tc

    def to_dict(self) -> dict:
        with self._lock:
            active = [tc.to_dict() for tc in self._active_tool_calls.values()]
            recent = [tc.to_dict() for tc in self.tool_calls[-10:]]
        return {
            "session_id": self.session_id,
            "platform": self.platform,
            "model": self.model,
            "user_id": self.user_id,
            "start_wall_time": self.start_wall_time.isoformat(),
            "duration_seconds": round(self.duration_seconds, 1),
            "tokens_in": self.tokens_in,
            "tokens_out": self.tokens_out,
            "api_calls": self.api_calls,
            "estimated_cost_usd": round(self.estimated_cost_usd, 6),
            "current_status": self.current_status,
            "active_tool_calls": active,
            "recent_tool_calls": recent,
            "last_api_latency_ms": round(self.last_api_latency_ms, 1),
        }


# ---------------------------------------------------------------------------
# Session Tracker (singleton-friendly)
# ---------------------------------------------------------------------------


class SessionTracker:
    """Thread-safe registry of active monitoring sessions."""

    def __init__(self) -> None:
        self._sessions: Dict[str, SessionMetrics] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    def register(
        self,
        session_id: str,
        platform: str = "unknown",
        model: str = "",
        user_id: Optional[str] = None,
    ) -> SessionMetrics:
        """Register a new session and return its metrics object."""
        metrics = SessionMetrics(
            session_id=session_id,
            platform=platform,
            model=model,
            user_id=user_id,
        )
        with self._lock:
            self._sessions[session_id] = metrics
        return metrics

    def unregister(self, session_id: str) -> Optional[SessionMetrics]:
        """Remove a session from the tracker and return it."""
        with self._lock:
            return self._sessions.pop(session_id, None)

    def get(self, session_id: str) -> Optional[SessionMetrics]:
        with self._lock:
            return self._sessions.get(session_id)

    def get_or_create(
        self,
        session_id: str,
        platform: str = "unknown",
        model: str = "",
        user_id: Optional[str] = None,
    ) -> SessionMetrics:
        with self._lock:
            if session_id in self._sessions:
                return self._sessions[session_id]
        return self.register(session_id, platform=platform, model=model, user_id=user_id)

    # ------------------------------------------------------------------
    # Bulk queries
    # ------------------------------------------------------------------

    def all_sessions(self) -> List[SessionMetrics]:
        with self._lock:
            return list(self._sessions.values())

    def session_count(self) -> int:
        with self._lock:
            return len(self._sessions)

    def active_sessions(self) -> List[SessionMetrics]:
        """Sessions that are not idle/done."""
        with self._lock:
            return [
                s for s in self._sessions.values()
                if s.current_status not in ("idle", "done", "error")
            ]

    def to_list(self) -> list:
        """Serialise all sessions to a JSON-friendly list."""
        with self._lock:
            sessions = list(self._sessions.values())
        return [s.to_dict() for s in sessions]


# Module-level default tracker shared by the monitoring server and agent hooks.
_default_tracker: Optional[SessionTracker] = None


def get_default_tracker() -> SessionTracker:
    """Return (and lazily create) the module-level shared SessionTracker."""
    global _default_tracker
    if _default_tracker is None:
        _default_tracker = SessionTracker()
    return _default_tracker
