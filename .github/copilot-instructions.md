# Workspace Instructions for AI Agents

This repository is a React + TypeScript + Vite frontend paired with an Express backend that proxies commands to the Hermes CLI.

## What to know first

- `README.md` and `CLAUDE.md` contain the authoritative project overview.
- Frontend: `src/` is a React SPA using Vite, Tailwind CSS, Radix UI tabs, and local component state.
- Backend: `server/index.ts` is an Express 5 API server that spawns the Hermes CLI and exposes REST endpoints.
- Build and dev scripts are defined in `package.json`.

## Key commands

Use these commands from the repository root:

- `npm run dev` — run frontend and backend concurrently
- `npm run dev:web` — start only the Vite frontend
- `npm run dev:server` — start only the Express backend
- `npm run build` — compile TypeScript and build the production frontend
- `npm run lint` — run ESLint on the project
- `npm run preview` — preview the production build
- `npm run start:server` — run the backend without watch mode

## Important architecture notes

- The backend does not embed Hermes code; it shells out to the `hermes` CLI.
- `server/index.ts` uses `spawn()` and a custom timeout wrapper to run Hermes commands safely.
- Configuration files are loaded from `HERMES_HOME` if set, or from `~/.hermes` by default.
- The frontend interacts with the backend over `/api/*` endpoints.
- UI components in `src/components/ui/` are small wrappers around native elements and use `cn()` for classnames.

## How to help

- When editing UI or behavior, preserve the existing `src/components/ui/*` conventions.
- Prefer minimal, incremental changes unless the task explicitly calls for a full redesign.
- Keep the backend API surface stable unless the task explicitly requires new endpoints.
- When adding features, update or add comments near business logic, not only in UI markup.
- Use `CLAUDE.md` and `README.md` as the primary reference for project intent and structure.

## Areas to avoid changing casually

- Do not remove or replace the Hermes CLI integration approach unless the task specifically asks for an alternative.
- Avoid changing the repository package manager or project type; this workspace uses npm and Vite.
- Do not change TypeScript/ESLint config unless the task is about linting or TS setup.

## Example prompts

- "Update `src/App.tsx` to match the latest green dashboard screenshot while preserving the Hermes backend integration."
- "Fix the TypeScript error in `server/index.ts` and ensure `npm run build` passes."
- "Add a new `/api/system/health` endpoint returning `ok: true` and a service name."
- "Improve the `Select` and `Textarea` components in `src/components/ui/` to better support theming."

## Suggested next customization

- Create an agent instruction set for frontend UI changes: `/create-agent frontend-ui`.
- Create a hook for backend API work: `/create-hook server-api`.
- Create a prompt template for Hermes CLI troubleshooting: `/create-prompt hermes-debug`.
