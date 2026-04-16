"""
Tests for the real-time monitoring dashboard backend.

Covers:
  - SessionTracker — session lifecycle, tool call tracking, serialisation
  - MetricsCollector — system metrics, tool stats, cost estimation
  - MonitoringServer — REST endpoints, WebSocket broadcasting, event emitters
  - make_monitoring_callbacks — agent callback integration helpers
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime, timezone
from typing import Dict, List
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# session_tracker tests
# ---------------------------------------------------------------------------

from hermes_cli.session_tracker import (
    SessionMetrics,
    SessionTracker,
    ToolCall,
    get_default_tracker,
)


class TestToolCall:
    def test_pending_has_no_duration(self):
        tc = ToolCall(call_id="x", tool_name="web_search", args={})
        assert tc.duration_ms is None

    def test_completed_has_duration(self):
        tc = ToolCall(call_id="x", tool_name="web_search", args={}, start_time=0.0)
        tc.end_time = 0.5
        assert tc.duration_ms == pytest.approx(500.0)

    def test_to_dict_keys(self):
        tc = ToolCall(call_id="abc", tool_name="terminal", args={"cmd": "ls"})
        d = tc.to_dict()
        assert d["call_id"] == "abc"
        assert d["tool_name"] == "terminal"
        assert d["status"] == "pending"


class TestSessionMetrics:
    def test_initial_state(self):
        sm = SessionMetrics(session_id="s1", platform="test")
        assert sm.session_id == "s1"
        assert sm.current_status == "idle"
        assert sm.tokens_in == 0
        assert sm.active_tool_count == 0

    def test_update_tokens(self):
        sm = SessionMetrics(session_id="s1")
        sm.update_tokens(100, 200, 0.001)
        assert sm.tokens_in == 100
        assert sm.tokens_out == 200
        assert sm.api_calls == 1
        assert sm.estimated_cost_usd == pytest.approx(0.001)

    def test_set_status(self):
        sm = SessionMetrics(session_id="s1")
        sm.set_status("thinking")
        assert sm.current_status == "thinking"

    def test_record_tool_start(self):
        sm = SessionMetrics(session_id="s1")
        tc = sm.record_tool_start("tc1", "terminal", {"cmd": "ls"})
        assert tc.status == "running"
        assert sm.current_status == "tool-calling"
        assert sm.active_tool_count == 1

    def test_record_tool_complete_success(self):
        sm = SessionMetrics(session_id="s1")
        sm.record_tool_start("tc1", "terminal", {})
        result_tc = sm.record_tool_complete("tc1", result_preview="output")
        assert result_tc is not None
        assert result_tc.status == "completed"
        assert result_tc.result_preview == "output"
        assert sm.active_tool_count == 0
        assert len(sm.tool_calls) == 1

    def test_record_tool_complete_failure(self):
        sm = SessionMetrics(session_id="s1")
        sm.record_tool_start("tc1", "terminal", {})
        result_tc = sm.record_tool_complete("tc1", error="boom")
        assert result_tc.status == "failed"
        assert result_tc.error == "boom"

    def test_record_tool_complete_unknown_id(self):
        sm = SessionMetrics(session_id="s1")
        result_tc = sm.record_tool_complete("nonexistent")
        assert result_tc is None

    def test_tool_history_trimmed(self):
        sm = SessionMetrics(session_id="s1")
        sm.MAX_TOOL_HISTORY = 3
        for i in range(5):
            sm.record_tool_start(f"tc{i}", "t", {})
            sm.record_tool_complete(f"tc{i}")
        assert len(sm.tool_calls) == 3

    def test_to_dict(self):
        sm = SessionMetrics(session_id="s1", platform="cli", model="claude-3")
        d = sm.to_dict()
        assert d["session_id"] == "s1"
        assert d["platform"] == "cli"
        assert d["model"] == "claude-3"
        assert "duration_seconds" in d
        assert "active_tool_calls" in d
        assert "recent_tool_calls" in d

    def test_duration_seconds_positive(self):
        sm = SessionMetrics(session_id="s1")
        time.sleep(0.01)
        assert sm.duration_seconds >= 0


class TestSessionTracker:
    def test_register_returns_metrics(self):
        tracker = SessionTracker()
        sm = tracker.register("s1", platform="telegram")
        assert sm.session_id == "s1"
        assert sm.platform == "telegram"

    def test_get_existing(self):
        tracker = SessionTracker()
        tracker.register("s1")
        sm = tracker.get("s1")
        assert sm is not None
        assert sm.session_id == "s1"

    def test_get_missing_returns_none(self):
        tracker = SessionTracker()
        assert tracker.get("nope") is None

    def test_unregister(self):
        tracker = SessionTracker()
        tracker.register("s1")
        removed = tracker.unregister("s1")
        assert removed is not None
        assert tracker.get("s1") is None

    def test_unregister_missing_returns_none(self):
        tracker = SessionTracker()
        assert tracker.unregister("ghost") is None

    def test_session_count(self):
        tracker = SessionTracker()
        assert tracker.session_count() == 0
        tracker.register("a")
        tracker.register("b")
        assert tracker.session_count() == 2

    def test_all_sessions(self):
        tracker = SessionTracker()
        tracker.register("a")
        tracker.register("b")
        ids = {s.session_id for s in tracker.all_sessions()}
        assert ids == {"a", "b"}

    def test_active_sessions_excludes_idle(self):
        tracker = SessionTracker()
        sm1 = tracker.register("a")
        sm2 = tracker.register("b")
        sm2.set_status("thinking")
        active = tracker.active_sessions()
        active_ids = {s.session_id for s in active}
        assert "a" not in active_ids   # idle
        assert "b" in active_ids

    def test_get_or_create_new(self):
        tracker = SessionTracker()
        sm = tracker.get_or_create("s1", platform="discord")
        assert sm.session_id == "s1"
        assert sm.platform == "discord"

    def test_get_or_create_existing(self):
        tracker = SessionTracker()
        tracker.register("s1", platform="discord")
        sm = tracker.get_or_create("s1", platform="slack")
        # Should return the existing one, not replace it
        assert sm.platform == "discord"

    def test_to_list(self):
        tracker = SessionTracker()
        tracker.register("s1")
        result = tracker.to_list()
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["session_id"] == "s1"

    def test_get_default_tracker_singleton(self):
        t1 = get_default_tracker()
        t2 = get_default_tracker()
        assert t1 is t2


# ---------------------------------------------------------------------------
# metrics_collector tests
# ---------------------------------------------------------------------------

from hermes_cli.metrics_collector import (
    MetricsCollector,
    SystemMetrics,
    collect_process_metrics,
    compute_token_cost,
    get_default_collector,
)


class TestSystemMetrics:
    def test_to_dict_has_expected_keys(self):
        m = SystemMetrics(timestamp="2026-01-01T00:00:00+00:00")
        d = m.to_dict()
        for key in ("timestamp", "memory_rss_mb", "cpu_percent", "thread_count"):
            assert key in d

    def test_collect_process_metrics_returns_something(self):
        m = collect_process_metrics()
        assert isinstance(m, SystemMetrics)
        assert m.process_uptime_s >= 0


class TestComputeTokenCost:
    def test_zero_tokens_is_zero(self):
        cost = compute_token_cost("gpt-4o", 0, 0)
        assert cost == 0.0

    def test_nonzero_tokens_positive_cost(self):
        cost = compute_token_cost("gpt-4o", 1000, 1000)
        assert cost > 0

    def test_fallback_when_pricing_unavailable(self):
        # Force the usage_pricing import to fail — verifies fallback uses
        # 3.0 $/M input tokens + 15.0 $/M output tokens.
        with patch.dict("sys.modules", {"agent.usage_pricing": None}):
            cost = compute_token_cost("unknown-model", 1_000_000, 1_000_000)
        expected = 1_000_000 * 3.0 / 1_000_000 + 1_000_000 * 15.0 / 1_000_000
        assert cost == pytest.approx(expected)


class TestMetricsCollector:
    def test_track_tool_execution_counts(self):
        col = MetricsCollector()
        col.track_tool_execution("terminal", 100.0, True)
        col.track_tool_execution("terminal", 200.0, False)
        stats = col.get_tool_stats()
        assert "terminal" in stats
        s = stats["terminal"]
        assert s.call_count == 2
        assert s.success_count == 1
        assert s.failure_count == 1
        assert s.avg_duration_ms == pytest.approx(150.0)

    def test_get_tool_stats_list(self):
        col = MetricsCollector()
        col.track_tool_execution("t1", 10.0, True)
        col.track_tool_execution("t2", 20.0, True)
        lst = col.get_tool_stats_list()
        assert len(lst) == 2
        assert all("tool_name" in item for item in lst)

    def test_get_system_metrics_cached(self):
        col = MetricsCollector()
        m1 = col.get_system_metrics()
        m2 = col.get_system_metrics()
        # Should return same cached object within TTL
        assert m1 is m2

    def test_get_default_collector_singleton(self):
        c1 = get_default_collector()
        c2 = get_default_collector()
        assert c1 is c2

    def test_static_compute_token_cost(self):
        cost = MetricsCollector.compute_token_cost("gpt-4o", 500, 500)
        assert cost >= 0


# ---------------------------------------------------------------------------
# web_monitoring tests
# ---------------------------------------------------------------------------

from hermes_cli.web_monitoring import (
    MonitoringServer,
    make_monitoring_callbacks,
    get_default_server,
    set_default_server,
)


class TestMonitoringServerInit:
    def test_init_default_host_port(self):
        server = MonitoringServer()
        assert server.host == "127.0.0.1"
        assert server.port == 7799

    def test_init_custom_host_port(self):
        server = MonitoringServer(host="0.0.0.0", port=9000)
        assert server.host == "0.0.0.0"
        assert server.port == 9000

    def test_url_property(self):
        server = MonitoringServer(host="127.0.0.1", port=7799)
        assert server.url == "http://127.0.0.1:7799"

    def test_raises_without_aiohttp(self):
        with patch("hermes_cli.web_monitoring._AIOHTTP_AVAILABLE", False):
            with pytest.raises(RuntimeError, match="aiohttp"):
                MonitoringServer()


@pytest.mark.asyncio
class TestMonitoringServerLifecycle:
    async def test_start_stop(self):
        server = MonitoringServer(port=17901)
        await server.start()
        assert server._running is True
        await server.stop()
        assert server._running is False

    async def test_double_start_is_safe(self):
        server = MonitoringServer(port=17902)
        await server.start()
        await server.start()  # second start is a no-op
        assert server._running
        await server.stop()

    async def test_stop_before_start_is_safe(self):
        server = MonitoringServer(port=17903)
        await server.stop()  # no-op

    async def test_rest_sessions_endpoint(self):
        import aiohttp as _aio
        server = MonitoringServer(port=17904)
        await server.start()
        try:
            server.register_session("s1", platform="test", model="gpt-4o")
            # Give register time to update tracker
            await asyncio.sleep(0.05)
            async with _aio.ClientSession() as sess:
                async with sess.get(f"{server.url}/api/sessions") as resp:
                    assert resp.status == 200
                    data = await resp.json()
            assert isinstance(data, list)
            assert any(s["session_id"] == "s1" for s in data)
        finally:
            await server.stop()

    async def test_rest_metrics_endpoint(self):
        import aiohttp as _aio
        server = MonitoringServer(port=17905)
        await server.start()
        try:
            async with _aio.ClientSession() as sess:
                async with sess.get(f"{server.url}/api/metrics") as resp:
                    assert resp.status == 200
                    data = await resp.json()
            assert "system" in data
            assert "tools" in data
            assert "sessions" in data
        finally:
            await server.stop()

    async def test_dashboard_returns_html(self):
        import aiohttp as _aio
        server = MonitoringServer(port=17906)
        await server.start()
        try:
            async with _aio.ClientSession() as sess:
                async with sess.get(f"{server.url}/") as resp:
                    assert resp.status == 200
                    assert "text/html" in resp.content_type
                    text = await resp.text()
            assert "Hermes Monitor" in text
        finally:
            await server.stop()

    async def test_websocket_receives_initial_snapshot(self):
        import aiohttp as _aio
        server = MonitoringServer(port=17907)
        await server.start()
        try:
            async with _aio.ClientSession() as sess:
                async with sess.ws_connect(f"ws://127.0.0.1:17907/api/ws") as ws:
                    msg = await asyncio.wait_for(ws.receive(), timeout=5.0)
                    data = json.loads(msg.data)
                    assert data["type"] == "metrics.snapshot"
                    assert "system" in data
        finally:
            await server.stop()


@pytest.mark.asyncio
class TestMonitoringServerEvents:
    async def test_register_unregister_session(self):
        server = MonitoringServer(port=17910)
        await server.start()
        try:
            server.register_session("s1", platform="telegram", model="claude-3")
            await asyncio.sleep(0.05)
            assert server.tracker.get("s1") is not None
            server.unregister_session("s1")
            await asyncio.sleep(0.05)
            assert server.tracker.get("s1") is None
        finally:
            await server.stop()

    async def test_emit_status_updates_session(self):
        server = MonitoringServer(port=17911)
        await server.start()
        try:
            server.register_session("s2")
            await asyncio.sleep(0.05)
            server.emit_status("s2", "thinking")
            await asyncio.sleep(0.05)
            sm = server.tracker.get("s2")
            assert sm.current_status == "thinking"
        finally:
            await server.stop()

    async def test_emit_tool_call_running(self):
        server = MonitoringServer(port=17912)
        await server.start()
        try:
            server.register_session("s3")
            await asyncio.sleep(0.05)
            server.emit_tool_call("s3", "tc1", "web_search", {"query": "ai"}, status="running")
            await asyncio.sleep(0.05)
            sm = server.tracker.get("s3")
            assert sm.active_tool_count == 1
        finally:
            await server.stop()

    async def test_emit_tool_call_completed(self):
        server = MonitoringServer(port=17913)
        await server.start()
        try:
            server.register_session("s4")
            await asyncio.sleep(0.05)
            server.emit_tool_call("s4", "tc1", "web_search", {}, status="running")
            await asyncio.sleep(0.05)
            server.emit_tool_call("s4", "tc1", "web_search", {}, status="completed",
                                  result_preview="results")
            await asyncio.sleep(0.05)
            sm = server.tracker.get("s4")
            assert sm.active_tool_count == 0
            assert len(sm.tool_calls) == 1
        finally:
            await server.stop()

    async def test_emit_token(self):
        server = MonitoringServer(port=17914)
        await server.start()
        try:
            server.register_session("s5")
            await asyncio.sleep(0.05)
            server.emit_token("s5", "Hello", "content", tokens_in=5, tokens_out=1, cost_usd=0.0001)
            await asyncio.sleep(0.05)
            sm = server.tracker.get("s5")
            assert sm.tokens_in == 5
        finally:
            await server.stop()

    async def test_broadcast_status_alias(self):
        server = MonitoringServer(port=17915)
        await server.start()
        try:
            server.register_session("s6")
            await asyncio.sleep(0.05)
            server.broadcast_status("s6", "done")
            await asyncio.sleep(0.05)
            sm = server.tracker.get("s6")
            assert sm.current_status == "done"
        finally:
            await server.stop()


class TestMakeMonitoringCallbacks:
    def test_returns_empty_when_no_server(self):
        set_default_server(None)
        cbs = make_monitoring_callbacks("s1", server=None)
        assert cbs == {}

    def test_returns_callbacks_with_server(self):
        tracker = SessionTracker()
        collector = MetricsCollector()
        server = MagicMock(spec=MonitoringServer)
        server.tracker = tracker
        server.collector = collector
        tracker.register("s1")

        cbs = make_monitoring_callbacks("s1", server=server)
        assert "tool_start" in cbs
        assert "tool_complete" in cbs
        assert "status" in cbs

    def test_tool_start_callback_calls_emit(self):
        server = MagicMock()
        tracker = SessionTracker()
        tracker.register("s1")
        server.tracker = tracker

        cbs = make_monitoring_callbacks("s1", server=server)
        cbs["tool_start"]("tc1", "terminal", {"cmd": "ls"})
        server.emit_tool_call.assert_called_once()
        call_kwargs = server.emit_tool_call.call_args
        assert call_kwargs[0][3] == {"cmd": "ls"}  # args positional param

    def test_tool_complete_callback_success(self):
        server = MagicMock()
        cbs = make_monitoring_callbacks("s1", server=server)
        cbs["tool_complete"]("tc1", "terminal", {}, json.dumps({"result": "ok"}))
        server.emit_tool_call.assert_called_once()
        _, kwargs = server.emit_tool_call.call_args
        assert kwargs.get("status") == "completed"

    def test_tool_complete_callback_error(self):
        server = MagicMock()
        cbs = make_monitoring_callbacks("s1", server=server)
        result = json.dumps({"error": "something went wrong"})
        cbs["tool_complete"]("tc1", "terminal", {}, result)
        server.emit_tool_call.assert_called_once()

    def test_status_callback_lifecycle(self):
        server = MagicMock()
        cbs = make_monitoring_callbacks("s1", server=server)
        cbs["status"]("lifecycle", "agent started")
        server.emit_status.assert_called_once_with("s1", "thinking")

    def test_status_callback_other_events_ignored(self):
        server = MagicMock()
        cbs = make_monitoring_callbacks("s1", server=server)
        cbs["status"]("other", "message")
        server.emit_status.assert_not_called()


class TestDefaultServerSingleton:
    def test_set_and_get(self):
        server = MagicMock(spec=MonitoringServer)
        set_default_server(server)
        assert get_default_server() is server
        set_default_server(None)
        assert get_default_server() is None
