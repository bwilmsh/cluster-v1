# Cluster V2

AI agent platform — Phase 1.

## Prerequisites
- Node.js 20+
- Python 3.11+
- PostgreSQL running locally

## Setup

1. Copy and fill env vars:
   ```bash
   cp .env.example .env
   cp agent/.env.example agent/.env
   ```

2. Install all dependencies:
   ```bash
   npm run install:all
   ```

3. Set up the database:
   ```bash
   cd backend
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
- Agent:    http://localhost:8000
