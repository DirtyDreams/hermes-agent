# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web application that provides a UI interface for the **Hermes CLI** tool. The frontend is a React + TypeScript app built with Vite, and the backend is an Express server that proxies commands to the Hermes CLI.

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Radix UI
- **Backend**: Express 5 proxy server that spawns Hermes CLI child processes
- **Dev runner**: `concurrently` runs both frontend (port 5173) and backend (port 8787) together

## Commands

```bash
npm run dev          # Run both frontend and backend concurrently
npm run dev:web      # Frontend only (Vite dev server, port 5173)
npm run dev:server   # Backend only (Express API, port 8787)
npm run build        # TypeScript compile + Vite production build
npm run lint         # ESLint linting
npm run preview      # Preview production build
npm run start:server # Run backend without watch mode
```

## Architecture

### Frontend (`src/`)
- **React SPA** with client-side routing via React state (Tabs: `chat` | `config`)
- **State management**: Local React state via `useState` — no external state library
- **UI components**: Hand-rolled components in `src/components/ui/` using Radix UI primitives (`@radix-ui/react-tabs`)
- **Styling**: Tailwind CSS with custom theme (dark slate palette, cyan accents, glassmorphism effects)
- **Utility**: `src/lib/utils.ts` exports `cn()` for className merging

### Backend (`server/index.ts`)
- **Express 5** REST API on port 8787
- **Key endpoints**:
  - `GET /api/health` — Health check
  - `GET /api/system/status` — Check Hermes CLI installation and version
  - `GET /api/sessions/list` — List Hermes chat sessions
  - `GET /api/config/read` — Read Hermes config files (`~/.hermes/config.yaml`, `~/.hermes/.env`)
  - `POST /api/config/write` — Write Hermes config files
  - `POST /api/chat/send` — Send a chat message to Hermes CLI
- **Process management**: Uses `child_process.spawn` with proper cleanup (timeouts, stream handling)
- **Vite proxy**: Development server proxies `/api/*` requests to `http://localhost:8787`

### Hermes CLI Integration
The backend builds command arguments via `buildHermesArgs()` and spawns `hermes chat --quiet -q "<message>"` with various flags. The `parseHermesSessions()` function parses the tabular output from `hermes sessions list`.

## Component Patterns

UI components follow a consistent pattern:
- Accept `className` and spread remaining props onto underlying element
- Use `cn()` utility for conditional class merging
- Variant/size patterns using object maps (e.g., `Button`, `Card`)

```tsx
export function Component({ className, ...props }: ComponentProps) {
  return (
    <div className={cn('base-classes', className)} {...props} />
  )
}
```
