# Hermes WebUI — Full Feature Design

**Date:** 2026-04-15
**Status:** Approved

---

## 1. Overview

This design covers a major expansion of the existing Hermes WebUI into a full-featured agent workspace combining WebUI capabilities (nesquena/hermes-webui) with an Agent Dashboard for monitoring and controlling Hermes Agent capabilities.

**Guiding decisions:**
- Layout: Hybrid — collapsible icon sidebar + overlay panels
- Style: Keep existing dark slate + emerald theme
- Streaming: Real-time per-token streaming
- Tool calls: Side panel indicator (Tool Activity panel)
- Sessions: Full lifecycle (create/name/archive/search/export)
- File browser: Full (tree + preview + edit + git detection)
- Dashboard: Full (skills + MCP + presets + batch + health)

---

## 2. Architecture

### 2.1 Implementation Tracks

Two tracks run in parallel, sharing a common component library:

**Track A — Chat Infrastructure**
Real-time token streaming via SSE, Tool Activity side panel, message regeneration/cancellation, branching edits.

**Track B — Agent Dashboard**
Read-only API-driven panels: skills browser, MCP tools, system health, provider presets, batch job status.

**Track C — Sessions + File Browser** (after Track A complete)
Session management and workspace file browser build on Track A's chat foundation.

### 2.2 Frontend Shared Layer

- **Layout context** — collapsible sidebar state, active panel, overlay open/close state
- **HermesAPI client** — typed fetch wrapper for all `/api/*` calls including SSE endpoints
- **Component library** — existing UI primitives in `src/components/ui/` extended with new components

### 2.3 Backend Changes

New endpoints to add:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/stream` | SSE stream of tokens, tool calls, tool results, done/error events |
| GET | `/api/chat/tool-events` | SSE stream of tool call lifecycle events |
| GET | `/api/skills/list` | List installed Hermes skills |
| GET | `/api/mcp/tools` | List connected MCP servers and their tools |
| GET | `/api/providers/list` | List available providers/models from Hermes config |
| GET | `/api/system/health` | Enhanced: memory usage, Hermes uptime, active model |
| GET | `/api/jobs/list` | List scheduled/active batch jobs |
| POST | `/api/jobs/cancel/:id` | Cancel a running or scheduled job |
| GET | `/api/workspace/tree` | Directory tree of Hermes working directory |
| GET | `/api/workspace/read?path=` | Read file content |
| PUT | `/api/workspace/write` | Create or overwrite file |
| DELETE | `/api/workspace/delete?path=` | Delete file or directory |
| POST | `/api/workspace/mkdir` | Create directory |
| GET | `/api/workspace/git` | Git branch name and dirty file count |
| POST | `/api/sessions/create` | Create new Hermes session |
| PATCH | `/api/sessions/:id` | Rename, update color/tag, archive/unarchive |
| DELETE | `/api/sessions/:id` | Delete session |
| GET | `/api/sessions/:id/export` | Export transcript as Markdown or JSON |
| GET | `/api/sessions/search?q=` | Search session titles and content |

Existing endpoints preserved: `/api/health`, `/api/system/status`, `/api/sessions/list`, `/api/config/read`, `/api/config/write`, `/api/chat/send`.

---

## 3. Track A — Core Chat Enhancement

### 3.1 Backend: Streaming Endpoint

`POST /api/chat/stream` accepts the same payload as `/api/chat/send`. It spawns the `hermes chat` child process and emits SSE events as tokens are generated:

- `token` — a single token or chunk of the assistant's response
- `tool_call` — a tool invocation with name and parameters
- `tool_result` — the result of a tool call
- `done` — response complete
- `error` — error occurred (timeout, crash, etc.)

No buffering — tokens stream immediately as emitted. Process killed after `timeoutMs` with an `error` event.

### 3.2 Frontend: Streaming Message Component

Message state machine: `idle | streaming | complete | error`

- Token rendering: each token appends to content via `useRef` on the pre element — no per-token re-renders
- Typing indicator: animated dots shown while waiting for first token
- Tool calls: extracted from `tool_call` SSE events, passed up to Tool Activity panel
- Regenerate: re-sends user message, replaces assistant's incomplete message in-place
- Cancel: aborts in-flight request, marks message as `error` with "Cancelled"

### 3.3 Tool Activity Side Panel

- Trigger: opens as right-side overlay when first tool call fires in a turn
- Tool card: tool name, collapsible params, status badge (`running | done | error`)
- Result preview: collapsible accordion showing truncated result
- Auto-close: collapses when all tool calls in a turn are complete
- Collapsed state: pulsing indicator on right edge while tools are running

### 3.4 Message Editing

Click any user or assistant message to "branch" — creates a copy in the composer that can be edited and re-sent. Re-sending from a branched message creates a new turn without destroying subsequent history.

---

## 4. Track C — Session Management

### 4.1 Backend Endpoints

All session endpoints listed in Section 2.3.

### 4.2 Session Picker (Sidebar)

The current simple dropdown is replaced with a proper session list panel:

- Session list panel: collapsible section showing all sessions grouped by date (Today, Yesterday, Earlier, Archived)
- Per-session hover actions: icon buttons for rename, duplicate, archive, delete
- New session button: "+" at top, creates and immediately switches
- Session color/tag: optional color dot and short tag label

### 4.3 Session Search

Search bar at top of session list queries Hermes session index. Results show matching sessions with highlighted content snippets. Filters: All | Archived | By tag/color.

### 4.4 Export

Per-session export button downloads `.md` or `.json`:

- Markdown: metadata header (session ID, date, model) + role-labeled message blocks
- JSON: full structured data for re-import

---

## 5. Track C — Workspace File Browser

### 5.1 Backend Endpoints

All workspace endpoints listed in Section 2.3.

### 5.2 File Browser Panel

Triggered by "Files" icon button in chat header. Right-side overlay panel:

- Header: directory breadcrumb (clickable segments), git branch + dirty indicator
- Directory tree: collapsible, lazy-loaded on expand, distinct folder/file icons
- Context menu (right-click or long-press): New File, New Folder, Rename, Delete
- Search: filter files by name within current tree

### 5.3 File Preview

- Click file: preview panel slides in
- Text/code: syntax-highlighted (Prism or highlight.js)
- Markdown: rendered preview
- Images: displayed inline
- Edit mode: "Edit" button → textarea → "Save" calls PUT `/api/workspace/write`
- Large files: truncated at 500 lines with "Load more" or "Download"

### 5.4 Git Detection

Calls `GET /api/workspace/git` on panel open and file change. Shows branch name badge + orange dot if uncommitted changes exist. Read-only — no git operations.

---

## 6. Track B — Agent Dashboard

### 6.1 Backend Endpoints

All dashboard endpoints listed in Section 2.3.

### 6.2 Skills Browser Panel

Triggered by "Skills" tab in the dashboard overlay:

- Skill card: name, description, trigger phrase, source (built-in / user / marketplace)
- Search/filter: text search across name + description, filter by source tag
- Skill detail: click card to expand — full description, instructions, example prompts
- Enable/disable: toggle to add/remove skill from active configuration

### 6.3 MCP Tools Panel

- Server list: each connected MCP server as a collapsible section
- Per-server tools: nested list of tool names + descriptions
- Tool invocation: click tool to see schema — read-only
- Status badge: `connected | error | connecting` per server

### 6.4 Provider / Model Presets

- Preset cards: visually distinct cards per configured provider/model combo
- Quick activate: click to immediately apply (updates settings)
- Preset editor: "Edit" modal to modify provider, model, toolsets, custom flags
- "+ Add Preset" card at the end
- Current app's 3 hardcoded presets (local, openrouter, codex) become visual preset cards

### 6.5 System Health & Batch Jobs

**System health:** memory usage bar, Hermes uptime, active model name, version, config path — one compact status card.

**Batch jobs:** list of scheduled/running jobs with job ID, trigger type, status (`scheduled | running | done | failed`), next run time. Cancel button per job.

---

## 7. Layout Structure

### 7.1 Collapsible Sidebar

- Expanded: icon + label per section (Chat, Sessions, Dashboard)
- Collapsed: icon-only mode, expands on hover or click
- State persisted to localStorage

### 7.2 Main Area

Chat is always the primary view — center stage. Dashboard and file browser open as overlay panels from the right edge.

### 7.3 Overlay Panels

- Tool Activity: right-edge overlay, width ~320px, semi-transparent backdrop
- File Browser: right-edge overlay, width ~400px
- Dashboard: right-edge overlay, full height, width ~600px
- All overlays: close on Escape or click outside

---

## 8. Implementation Order

1. **Track A** (streaming chat infrastructure) — foundational
2. **Track B** (agent dashboard) — independent of Track A
3. **Track C** (sessions + file browser) — builds on Track A's chat foundation

Track A and Track B run in parallel. Track C begins after Track A is complete.
