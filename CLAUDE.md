# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (Node + Python)
npm run install:all

# Start all services (Docker + backend + agent + frontend)
npm run dev

# Database
npx prisma migrate dev --name <migration-name>   # run from project root
npx prisma db seed
npx prisma studio                                 # visual DB browser

# Backend tests
cd backend && npm test
cd backend && npm test -- --testPathPattern=agents  # single file

# Electron
npm run electron:dev      # dev mode (requires services already running)
npm run electron:dist:win # build Windows installer
```

Services run at:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Agent (Python): http://localhost:8000

## Architecture

Four services, each in its own directory:

| Directory  | Tech                          | Role                          |
|------------|-------------------------------|-------------------------------|
| `frontend/`| Next.js 14 App Router + TS    | UI                            |
| `backend/` | Express 5 + TS + Prisma v6    | REST API + DB                 |
| `agent/`   | Python FastAPI + Anthropic SDK | AI reasoning + tools          |
| `electron/`| Electron v33 + TS             | Desktop app wrapper           |

The database schema lives at `prisma/schema.prisma` (shared by backend). The root `.env` is loaded by the backend via `dotenv.config({ path: '../.env' })`; the agent has its own `agent/.env`.

### Request Flow

Frontend → Backend REST (`/api/*`) → Agent Python service for AI operations. All chat endpoints stream via SSE. The backend calls `PYTHON_SERVICE_URL` (default `http://localhost:8000`) for agent responses.

### Agent Service (`agent/`)

- `main.py` — FastAPI app; `MODEL = "claude-sonnet-4-20250514"`; max 10-message session history
- `prompts.py` — System prompt builders (`build_system_prompt`, `build_group_system_prompt`, `build_cluster_system_prompt`)
- `tools.py` — Tool registry and execution

A **manager router** (`_manager_route` in `main.py`) classifies each message before routing to a specialized worker: `booking` (Cal.com scheduling), `customer` (memory/profile lookups), or `general` (everything else).

### Group Chat Waterfall

`@AgentName` mentions in group chats trigger sequential agent responses. The ordering and handoff logic lives in `backend/src/routes/groupchats.ts` (`detectHandoff()`). Each agent is called in turn; the Python service receives a group-specific system prompt instructing it to respond briefly or reply `PASS`.

### Cluster AI Widget Sentinel

The Cluster AI can create dashboard widgets by emitting `[WIDGET]{...json...}[/WIDGET]` in its response. The frontend parses this sentinel and renders the widget.

### Electron Desktop App (`electron/`)

- `src/main.ts` — Spawns backend, agent, and frontend as child processes in production. In dev mode (`!app.isPackaged`) loads `http://localhost:3000`.
- `src/preload.ts` — Exposes `window.electronAPI` to the renderer via context bridge. Handles: `computerUse`, `settings` (Anthropic API key stored in `userData/settings.json`), `app` (auto-updater), desktop notifications, file dialogs.
- `src/computer-use.ts` — Anthropic SDK + robotjs for AI-driven desktop automation; permission-gated.

### Backend Routes

All routes mount under `/api/`. Key ones:
- `agents` — CRUD + chat (SSE)
- `groupchats` — Multi-agent conversations (SSE)
- `cluster` — Cluster AI operations (SSE)
- `goals` — Agent goal execution
- `automations` / `workflows` — Workflow engine; templates seeded on startup via `automations/seeder.ts`
- `oauth` / `oauth-config` — OAuth provider flows; tokens encrypted with AES-256-GCM (`lib/crypto.ts`)
- `browse` — Playwright-based web automation
- `appointments` — Cal.com integration
- `activepieces` — Activepieces no-code automation bridge

### Key Environment Variables

```
ANTHROPIC_API_KEY
TAVILY_API_KEY
DATABASE_URL=postgresql://postgres:password@localhost:5432/cluster
PYTHON_SERVICE_URL=http://localhost:8000
CAL_API_KEY / CAL_EVENT_TYPE_ID  # Cal.com appointments
```
