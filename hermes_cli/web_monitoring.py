"""
WebSocket Real-time Monitoring Server for Hermes Agent.

Provides:
  - GET  /                         — built-in HTML dashboard
  - GET  /api/sessions             — JSON list of active sessions
  - GET  /api/metrics              — current system metrics + tool stats
  - GET  /api/ws                   — WebSocket feed for live events

Events emitted over WebSocket (all are JSON objects):
  {"type": "session.registered",  "session": {...}}
  {"type": "session.unregistered","session_id": "..."}
  {"type": "session.status",      "session_id": "...", "status": "..."}
  {"type": "token.delta",         "session_id": "...", "delta": "...",
   "tokens_in": N, "tokens_out": N, "cost_usd": F}
  {"type": "tool.started",        "session_id": "...", "call": {...}}
  {"type": "tool.completed",      "session_id": "...", "call": {...}}
  {"type": "metrics.snapshot",    "system": {...}, "tools": [...],
   "sessions": [...], "timestamp": "..."}
  {"type": "ping"}

Usage::

    from hermes_cli.web_monitoring import MonitoringServer
    server = MonitoringServer(host="127.0.0.1", port=7799)
    await server.start()          # starts aiohttp app in background
    ...
    await server.stop()

Or from the CLI::

    hermes monitor                # starts on 127.0.0.1:7799
    hermes monitor --port 8080    # custom port
    hermes monitor --host 0.0.0.0 --port 8080

Requires aiohttp (already present in the 'messaging' optional dependency
group). The server gracefully fails to import when aiohttp is absent so that
the monitoring feature is purely opt-in and never breaks non-web usage.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

logger = logging.getLogger(__name__)

try:
    from aiohttp import web as _aiohttp_web
    import aiohttp
    _AIOHTTP_AVAILABLE = True
except ImportError:  # pragma: no cover
    _aiohttp_web = None  # type: ignore[assignment]
    aiohttp = None  # type: ignore[assignment]
    _AIOHTTP_AVAILABLE = False

from hermes_cli.session_tracker import SessionTracker, get_default_tracker
from hermes_cli.metrics_collector import MetricsCollector, get_default_collector


# ---------------------------------------------------------------------------
# Built-in HTML dashboard (served at /)
# ---------------------------------------------------------------------------

_DASHBOARD_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hermes Agent — Live Monitor</title>
<style>
  :root {
    --bg: #0f0f13;
    --surface: #1a1a22;
    --border: #2a2a3a;
    --accent: #c9a227;
    --green: #3ecf8e;
    --red: #f87171;
    --blue: #60a5fa;
    --text: #e2e8f0;
    --muted: #94a3b8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; }
  header { background: var(--surface); border-bottom: 1px solid var(--border);
           padding: 12px 24px; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 18px; color: var(--accent); font-weight: 600; }
  #ws-badge { font-size: 11px; padding: 2px 8px; border-radius: 9999px; background: var(--red); color: #fff; }
  #ws-badge.connected { background: var(--green); }
  main { display: grid; grid-template-columns: 340px 1fr; gap: 0; height: calc(100vh - 49px); }
  aside { background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; padding: 16px; }
  section { overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 10px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
  .session-card { margin-bottom: 8px; cursor: pointer; transition: border-color .15s; }
  .session-card:hover { border-color: var(--accent); }
  .session-card.active-session { border-left: 3px solid var(--accent); }
  .badge { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
  .badge-thinking { background: #1d4ed8; color: #bfdbfe; }
  .badge-tool-calling { background: #92400e; color: #fde68a; }
  .badge-idle { background: #374151; color: #9ca3af; }
  .badge-done { background: #065f46; color: #a7f3d0; }
  .badge-error { background: #7f1d1d; color: #fca5a5; }
  .metric-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .metric-val { font-weight: 600; color: var(--accent); }
  #token-stream { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 12px;
                  background: #0a0a0f; border: 1px solid var(--border); border-radius: 6px;
                  padding: 12px; height: 200px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }
  .token-content { color: #a3e635; }
  .token-tool { color: #f59e0b; }
  .token-reasoning { color: #818cf8; }
  #tool-list { display: flex; flex-direction: column; gap: 6px; }
  .tool-item { display: flex; justify-content: space-between; align-items: center;
               background: #0f0f13; border-radius: 5px; padding: 8px 10px; }
  .tool-running { border-left: 3px solid var(--accent); }
  .tool-completed { border-left: 3px solid var(--green); }
  .tool-failed { border-left: 3px solid var(--red); }
  .tool-name { font-family: monospace; font-size: 12px; color: var(--blue); }
  .tool-dur { font-size: 11px; color: var(--muted); }
  .sys-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .sys-item { text-align: center; }
  .sys-val { font-size: 22px; font-weight: 700; color: var(--accent); }
  .sys-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  #no-sessions { color: var(--muted); font-size: 13px; text-align: center; padding: 20px 0; }
</style>
</head>
<body>
<header>
  <h1>⚡ Hermes Monitor</h1>
  <span id="ws-badge">Disconnected</span>
  <span style="margin-left:auto;color:var(--muted);font-size:12px" id="server-time"></span>
</header>
<main>
  <aside>
    <h2>Active Sessions</h2>
    <div id="sessions-list"><div id="no-sessions">No active sessions</div></div>
  </aside>
  <section>
    <div class="card">
      <h2>System Metrics</h2>
      <div class="sys-grid" id="sys-metrics">
        <div class="sys-item"><div class="sys-val" id="m-mem">—</div><div class="sys-label">Memory MB</div></div>
        <div class="sys-item"><div class="sys-val" id="m-cpu">—</div><div class="sys-label">CPU %</div></div>
        <div class="sys-item"><div class="sys-val" id="m-threads">—</div><div class="sys-label">Threads</div></div>
        <div class="sys-item"><div class="sys-val" id="m-uptime">—</div><div class="sys-label">Uptime s</div></div>
      </div>
    </div>

    <div class="card" id="session-detail" style="display:none">
      <h2 id="detail-title">Session Detail</h2>
      <div id="detail-metrics" style="margin-bottom:12px"></div>
      <h2 style="margin-top:8px">Token Stream</h2>
      <div id="token-stream"></div>
      <h2 style="margin-top:12px">Tool Calls</h2>
      <div id="tool-list"></div>
    </div>

    <div class="card">
      <h2>Tool Analytics</h2>
      <div id="tool-analytics"><span style="color:var(--muted)">No data yet</span></div>
    </div>
  </section>
</main>
<script>
const WS_URL = `ws://${location.host}/api/ws`;
let ws, activeSession = null, sessions = {}, tokenBuffer = '';
const $ = id => document.getElementById(id);

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => { $('ws-badge').textContent='Connected'; $('ws-badge').className='connected'; };
  ws.onclose = () => { $('ws-badge').textContent='Disconnected'; $('ws-badge').className=''; setTimeout(connect, 3000); };
  ws.onmessage = e => { try { handleEvent(JSON.parse(e.data)); } catch(_){} };
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'ping': break;
    case 'session.registered':
      sessions[ev.session.session_id] = ev.session;
      renderSessions(); break;
    case 'session.unregistered':
      delete sessions[ev.session_id];
      if (activeSession === ev.session_id) { activeSession=null; $('session-detail').style.display='none'; }
      renderSessions(); break;
    case 'session.status':
      if (sessions[ev.session_id]) sessions[ev.session_id].current_status = ev.status;
      renderSessions();
      if (activeSession===ev.session_id) renderDetail(); break;
    case 'token.delta':
      if (sessions[ev.session_id]) {
        sessions[ev.session_id].tokens_in = ev.tokens_in;
        sessions[ev.session_id].tokens_out = ev.tokens_out;
        sessions[ev.session_id].estimated_cost_usd = ev.cost_usd;
      }
      if (activeSession===ev.session_id) appendToken(ev);
      break;
    case 'tool.started':
      if (sessions[ev.session_id]) {
        const calls = sessions[ev.session_id].active_tool_calls = sessions[ev.session_id].active_tool_calls||[];
        calls.push(ev.call);
      }
      if (activeSession===ev.session_id) renderTools(); break;
    case 'tool.completed':
      if (sessions[ev.session_id]) {
        const s = sessions[ev.session_id];
        s.active_tool_calls = (s.active_tool_calls||[]).filter(c=>c.call_id!==ev.call.call_id);
        s.recent_tool_calls = s.recent_tool_calls||[];
        s.recent_tool_calls.unshift(ev.call);
        if (s.recent_tool_calls.length>10) s.recent_tool_calls.length=10;
      }
      if (activeSession===ev.session_id) renderTools(); break;
    case 'metrics.snapshot':
      renderSystem(ev.system);
      renderToolAnalytics(ev.tools);
      ev.sessions.forEach(s => { sessions[s.session_id]=s; });
      renderSessions();
      if (activeSession) renderDetail(); break;
  }
  $('server-time').textContent = new Date().toLocaleTimeString();
}

function badgeClass(status) {
  const m = {thinking:'badge-thinking','tool-calling':'badge-tool-calling',idle:'badge-idle',done:'badge-done',error:'badge-error'};
  return 'badge ' + (m[status]||'badge-idle');
}

function renderSessions() {
  const el = $('sessions-list'), ids=Object.keys(sessions);
  if (!ids.length) { el.innerHTML='<div id="no-sessions">No active sessions</div>'; return; }
  el.innerHTML = ids.map(id=>{
    const s=sessions[id];
    return `<div class="card session-card${activeSession===id?' active-session':''}" onclick="selectSession('${id}')">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:var(--muted)">${s.platform}</span>
        <span class="${badgeClass(s.current_status)}">${s.current_status}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">${s.session_id.slice(0,16)}…</div>
      <div style="font-size:11px;margin-top:6px">
        <span style="color:var(--accent)">${(s.tokens_in||0)+(s.tokens_out||0)} tokens</span>
        · <span>$${(s.estimated_cost_usd||0).toFixed(5)}</span>
        · <span style="color:var(--muted)">${Math.round(s.duration_seconds||0)}s</span>
      </div>
    </div>`;
  }).join('');
}

function selectSession(id) {
  activeSession=id;
  $('session-detail').style.display='block';
  $('token-stream').textContent='';
  renderDetail(); renderSessions();
}

function renderDetail() {
  const s=sessions[activeSession]; if (!s) return;
  $('detail-title').textContent=`Session: ${s.session_id.slice(0,20)}… (${s.model||'unknown'})`;
  $('detail-metrics').innerHTML=`
    <div class="metric-row"><span>Tokens in/out</span><span class="metric-val">${s.tokens_in||0} / ${s.tokens_out||0}</span></div>
    <div class="metric-row"><span>Estimated cost</span><span class="metric-val">$${(s.estimated_cost_usd||0).toFixed(5)}</span></div>
    <div class="metric-row"><span>API calls</span><span class="metric-val">${s.api_calls||0}</span></div>
    <div class="metric-row"><span>Duration</span><span class="metric-val">${Math.round(s.duration_seconds||0)}s</span></div>`;
  renderTools();
}

function appendToken(ev) {
  const el=$('token-stream');
  const span=document.createElement('span');
  span.className='token-'+(ev.token_type||'content');
  span.textContent=ev.delta;
  el.appendChild(span);
  el.scrollTop=el.scrollHeight;
}

function renderTools() {
  const s=sessions[activeSession]; if (!s) return;
  const el=$('tool-list');
  const all=[...(s.active_tool_calls||[]), ...(s.recent_tool_calls||[])].slice(0,15);
  if (!all.length) { el.innerHTML='<span style="color:var(--muted)">No tool calls yet</span>'; return; }
  el.innerHTML=all.map(tc=>`
    <div class="tool-item tool-${tc.status}">
      <span class="tool-name">${tc.tool_name}</span>
      <span class="tool-dur">${tc.status} ${tc.duration_ms!=null?Math.round(tc.duration_ms)+'ms':''}</span>
    </div>`).join('');
}

function renderSystem(m) {
  if (!m) return;
  $('m-mem').textContent=m.memory_rss_mb||'—';
  $('m-cpu').textContent=m.cpu_percent!=null?m.cpu_percent+'%':'—';
  $('m-threads').textContent=m.thread_count||'—';
  $('m-uptime').textContent=Math.round(m.process_uptime_s||0);
}

function renderToolAnalytics(tools) {
  const el=$('tool-analytics'); if (!tools||!tools.length) return;
  el.innerHTML=`<table style="width:100%;border-collapse:collapse">
    <tr style="color:var(--muted);font-size:11px"><th>Tool</th><th>Calls</th><th>Avg ms</th><th>Failures</th></tr>
    ${tools.map(t=>`<tr style="border-top:1px solid var(--border)">
      <td style="padding:4px;font-family:monospace;font-size:12px;color:var(--blue)">${t.tool_name}</td>
      <td style="padding:4px;text-align:right">${t.call_count}</td>
      <td style="padding:4px;text-align:right">${t.avg_duration_ms}</td>
      <td style="padding:4px;text-align:right;color:${t.failure_count>0?'var(--red)':'inherit'}">${t.failure_count}</td>
    </tr>`).join('')}
  </table>`;
}

// Initial data load
fetch('/api/sessions').then(r=>r.json()).then(data=>{
  data.forEach(s=>{ sessions[s.session_id]=s; });
  renderSessions();
}).catch(()=>{});

fetch('/api/metrics').then(r=>r.json()).then(data=>{
  renderSystem(data.system);
  renderToolAnalytics(data.tools);
}).catch(()=>{});

connect();
</script>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Monitoring Server
# ---------------------------------------------------------------------------


class MonitoringServer:
    """
    Aiohttp-based WebSocket + REST monitoring server.

    Lifecycle::

        server = MonitoringServer()
        await server.start()   # binds port and starts background tasks
        ...                    # emit events during agent execution
        await server.stop()
    """

    DEFAULT_HOST = "127.0.0.1"
    DEFAULT_PORT = 7799
    PING_INTERVAL = 20  # seconds between WebSocket keep-alive pings
    METRICS_INTERVAL = 5  # seconds between periodic metrics broadcasts
    MAX_RESULT_PREVIEW_LENGTH = 200  # characters of tool result to send as preview

    def __init__(
        self,
        host: str = DEFAULT_HOST,
        port: int = DEFAULT_PORT,
        tracker: Optional[SessionTracker] = None,
        collector: Optional[MetricsCollector] = None,
    ) -> None:
        if not _AIOHTTP_AVAILABLE:
            raise RuntimeError(
                "aiohttp is required for the monitoring server. "
                "Install it with:  pip install aiohttp"
            )
        self.host = host
        self.port = port
        self.tracker: SessionTracker = tracker or get_default_tracker()
        self.collector: MetricsCollector = collector or get_default_collector()

        self._ws_clients: Set[Any] = set()
        self._ws_lock = asyncio.Lock()

        self._app: Optional[Any] = None
        self._runner: Optional[Any] = None
        self._site: Optional[Any] = None
        self._ping_task: Optional[asyncio.Task] = None
        self._metrics_task: Optional[asyncio.Task] = None
        self._running = False

    # ------------------------------------------------------------------
    # Start / Stop
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the aiohttp server and background tasks."""
        if self._running:
            return
        app = _aiohttp_web.Application()
        app.router.add_get("/", self._handle_dashboard)
        app.router.add_get("/api/sessions", self._handle_sessions)
        app.router.add_get("/api/metrics", self._handle_metrics)
        app.router.add_get("/api/ws", self._handle_ws)
        self._app = app

        self._runner = _aiohttp_web.AppRunner(app, access_log=None)
        await self._runner.setup()
        self._site = _aiohttp_web.TCPSite(self._runner, self.host, self.port)
        await self._site.start()
        self._running = True
        logger.info("Monitoring server started at http://%s:%d", self.host, self.port)

        self._ping_task = asyncio.ensure_future(self._ping_loop())
        self._metrics_task = asyncio.ensure_future(self._metrics_broadcast_loop())

    async def stop(self) -> None:
        """Stop server and cancel background tasks."""
        if not self._running:
            return
        self._running = False
        for task in (self._ping_task, self._metrics_task):
            if task and not task.done():
                task.cancel()
        if self._runner:
            await self._runner.cleanup()
        logger.info("Monitoring server stopped.")

    # ------------------------------------------------------------------
    # REST handlers
    # ------------------------------------------------------------------

    async def _handle_dashboard(self, request: Any) -> Any:
        return _aiohttp_web.Response(
            text=_DASHBOARD_HTML,
            content_type="text/html",
        )

    async def _handle_sessions(self, request: Any) -> Any:
        return _aiohttp_web.json_response(self.tracker.to_list())

    async def _handle_metrics(self, request: Any) -> Any:
        sys_metrics = self.collector.get_system_metrics()
        return _aiohttp_web.json_response(
            {
                "system": sys_metrics.to_dict(),
                "tools": self.collector.get_tool_stats_list(),
                "sessions": self.tracker.to_list(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

    # ------------------------------------------------------------------
    # WebSocket handler
    # ------------------------------------------------------------------

    async def _handle_ws(self, request: Any) -> Any:
        ws = _aiohttp_web.WebSocketResponse(heartbeat=30)
        await ws.prepare(request)
        async with self._ws_lock:
            self._ws_clients.add(ws)
        logger.debug("WebSocket client connected (%d total)", len(self._ws_clients))
        try:
            # Send current state immediately on connect
            await self._send_json(ws, {
                "type": "metrics.snapshot",
                "system": self.collector.get_system_metrics().to_dict(),
                "tools": self.collector.get_tool_stats_list(),
                "sessions": self.tracker.to_list(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.PING:
                    await ws.pong()
                elif msg.type in (
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSED,
                    aiohttp.WSMsgType.ERROR,
                ):
                    break
        finally:
            async with self._ws_lock:
                self._ws_clients.discard(ws)
        return ws

    # ------------------------------------------------------------------
    # Broadcast helpers
    # ------------------------------------------------------------------

    async def _send_json(self, ws: Any, data: dict) -> None:
        try:
            await ws.send_json(data)
        except Exception:
            pass

    async def _broadcast(self, event: dict) -> None:
        """Send an event to all connected WebSocket clients."""
        if not self._ws_clients:
            return
        async with self._ws_lock:
            clients = list(self._ws_clients)
        payload = json.dumps(event)
        dead: list = []
        for ws in clients:
            try:
                await ws.send_str(payload)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._ws_lock:
                for ws in dead:
                    self._ws_clients.discard(ws)

    # ------------------------------------------------------------------
    # Background loops
    # ------------------------------------------------------------------

    async def _ping_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.PING_INTERVAL)
            await self._broadcast({"type": "ping"})

    async def _metrics_broadcast_loop(self) -> None:
        while self._running:
            await asyncio.sleep(self.METRICS_INTERVAL)
            try:
                sys_m = self.collector.get_system_metrics()
                await self._broadcast({
                    "type": "metrics.snapshot",
                    "system": sys_m.to_dict(),
                    "tools": self.collector.get_tool_stats_list(),
                    "sessions": self.tracker.to_list(),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:  # pragma: no cover
                pass

    # ------------------------------------------------------------------
    # Event emitters (called from agent callbacks)
    # ------------------------------------------------------------------

    def register_session(
        self,
        session_id: str,
        platform: str = "unknown",
        model: str = "",
        user_id: Optional[str] = None,
    ) -> None:
        """Register a new session and broadcast the event."""
        metrics = self.tracker.register(
            session_id, platform=platform, model=model, user_id=user_id
        )
        asyncio.ensure_future(
            self._broadcast({"type": "session.registered", "session": metrics.to_dict()})
        )

    def unregister_session(self, session_id: str) -> None:
        """Remove a session and broadcast the event."""
        self.tracker.unregister(session_id)
        asyncio.ensure_future(
            self._broadcast(
                {"type": "session.unregistered", "session_id": session_id}
            )
        )

    def emit_status(self, session_id: str, status: str) -> None:
        """Update session status and broadcast."""
        metrics = self.tracker.get(session_id)
        if metrics:
            metrics.set_status(status)
        asyncio.ensure_future(
            self._broadcast(
                {"type": "session.status", "session_id": session_id, "status": status}
            )
        )

    def emit_token(
        self,
        session_id: str,
        delta: str,
        token_type: str = "content",
        tokens_in: int = 0,
        tokens_out: int = 0,
        cost_usd: float = 0.0,
    ) -> None:
        """Emit a token delta event and update session token counters."""
        metrics = self.tracker.get(session_id)
        if metrics:
            metrics.update_tokens(tokens_in, tokens_out, cost_usd)
        asyncio.ensure_future(
            self._broadcast(
                {
                    "type": "token.delta",
                    "session_id": session_id,
                    "delta": delta,
                    "token_type": token_type,
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                    "cost_usd": cost_usd,
                }
            )
        )

    def emit_tool_call(
        self,
        session_id: str,
        call_id: str,
        tool_name: str,
        args: dict,
        status: str = "running",
        duration_ms: Optional[float] = None,
        result_preview: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        """Emit a tool call event (started or completed)."""
        metrics = self.tracker.get(session_id)
        if status == "running" and metrics:
            tc = metrics.record_tool_start(call_id, tool_name, args)
            asyncio.ensure_future(
                self._broadcast(
                    {"type": "tool.started", "session_id": session_id, "call": tc.to_dict()}
                )
            )
        elif status in ("completed", "failed") and metrics:
            tc = metrics.record_tool_complete(
                call_id, result_preview=result_preview, error=error
            )
            if tc:
                # Track in metrics collector
                self.collector.track_tool_execution(
                    tool_name,
                    duration_ms=tc.duration_ms or 0.0,
                    success=(status == "completed"),
                )
                asyncio.ensure_future(
                    self._broadcast(
                        {
                            "type": "tool.completed",
                            "session_id": session_id,
                            "call": tc.to_dict(),
                        }
                    )
                )

    def emit_metrics(self, session_id: str, metrics_dict: Dict[str, Any]) -> None:
        """Emit arbitrary metrics update for a session."""
        sess = self.tracker.get(session_id)
        if sess and "tokens_in" in metrics_dict:
            sess.update_tokens(
                metrics_dict.get("tokens_in", 0),
                metrics_dict.get("tokens_out", 0),
                metrics_dict.get("cost_usd", 0.0),
            )
        asyncio.ensure_future(
            self._broadcast(
                {
                    "type": "metrics.update",
                    "session_id": session_id,
                    **metrics_dict,
                }
            )
        )

    def broadcast_status(self, session_id: str, status: str) -> None:
        """Alias for emit_status for API compatibility."""
        self.emit_status(session_id, status)

    # ------------------------------------------------------------------
    # URL
    # ------------------------------------------------------------------

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_default_server: Optional[MonitoringServer] = None


def get_default_server() -> Optional[MonitoringServer]:
    """Return the active monitoring server, or None if not started."""
    return _default_server


def set_default_server(server: Optional[MonitoringServer]) -> None:
    global _default_server
    _default_server = server


# ---------------------------------------------------------------------------
# Agent callback integration helpers
# ---------------------------------------------------------------------------

def make_monitoring_callbacks(
    session_id: str,
    server: Optional[MonitoringServer] = None,
) -> dict:
    """Return a dict of AIAgent callbacks wired up to a MonitoringServer.

    Usage::

        cbs = make_monitoring_callbacks(session_id, server)
        agent = AIAgent(
            session_id=session_id,
            tool_start_callback=cbs["tool_start"],
            tool_complete_callback=cbs["tool_complete"],
            status_callback=cbs["status"],
        )
    """
    if server is None:
        server = get_default_server()
    if server is None:
        return {}

    def tool_start(call_id: str, tool_name: str, args: dict) -> None:
        server.emit_tool_call(session_id, call_id, tool_name, args, status="running")

    def tool_complete(call_id: str, tool_name: str, args: dict, result: str) -> None:
        max_len = MonitoringServer.MAX_RESULT_PREVIEW_LENGTH
        preview = (result[:max_len] + "…") if result and len(result) > max_len else result
        error_str: Optional[str] = None
        try:
            parsed = json.loads(result) if result else {}
            if isinstance(parsed, dict) and parsed.get("error"):
                error_str = str(parsed["error"])
        except Exception:
            pass
        status = "failed" if error_str else "completed"
        server.emit_tool_call(
            session_id,
            call_id,
            tool_name,
            args,
            status=status,
            result_preview=preview,
            error=error_str,
        )

    def status(event_type: str, message: str) -> None:
        if event_type == "lifecycle":
            server.emit_status(session_id, "thinking")

    return {
        "tool_start": tool_start,
        "tool_complete": tool_complete,
        "status": status,
    }


# ---------------------------------------------------------------------------
# CLI runner (used by `hermes monitor`)
# ---------------------------------------------------------------------------

async def _run_server(host: str, port: int) -> None:
    server = MonitoringServer(host=host, port=port)
    set_default_server(server)
    await server.start()
    print(f"✅ Hermes Monitor running at {server.url}")
    print(f"   Open in browser: {server.url}")
    print("   Press Ctrl-C to stop.\n")
    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        await server.stop()
        set_default_server(None)


def run_monitoring_server(host: str = MonitoringServer.DEFAULT_HOST,
                          port: int = MonitoringServer.DEFAULT_PORT) -> None:
    """Blocking entry point for `hermes monitor`."""
    if not _AIOHTTP_AVAILABLE:
        print(
            "❌ aiohttp is required for the monitoring server.\n"
            "   Install it with:  pip install aiohttp\n"
            "   Or:              pip install 'hermes-agent[monitoring]'"
        )
        return
    try:
        asyncio.run(_run_server(host, port))
    except KeyboardInterrupt:
        pass
