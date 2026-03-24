# Cluster V2

AI agent platform — Phase 1.

## Prerequisites
- Node.js 20+
- Python 3.11+
- PostgreSQL running locally (create a database named `cluster`)

## Setup

1. Copy and fill env vars:
   ```bash
   cp .env.example .env
   cp agent/.env.example agent/.env
   # Edit .env: set DATABASE_URL and ANTHROPIC_API_KEY
   ```

2. Install all dependencies:
   ```bash
   npm run install:all
   ```

3. Set up the database (run from project root after filling DATABASE_URL):
   ```bash
   npx prisma migrate dev --name init
   npx prisma db seed
   ```

4. Run all services:
   ```bash
   npm run dev
   ```

Services run at:
- Frontend: http://localhost:3000
- Backend:  http://localhost:3001
- Agent:    http://localhost:8000 (Python FastAPI)

## Services

| Service  | Tech              | Port |
|----------|-------------------|------|
| Frontend | Next.js 14        | 3000 |
| Backend  | Node.js + Express | 3001 |
| Agent    | Python + FastAPI  | 8000 |

## API

- `GET  /api/health` — Health check
- `GET  /api/agents` — List agents
- `POST /api/agents` — Create agent
- `POST /api/agents/generate-questions` — Generate setup questions (via Claude)
- `POST /api/agents/:id/chat` — Chat with agent (SSE)
- `GET  /api/groupchats` — List group chats
- `POST /api/groupchats` — Create group chat
- `POST /api/groupchats/:id/message` — Send message to group (SSE)
