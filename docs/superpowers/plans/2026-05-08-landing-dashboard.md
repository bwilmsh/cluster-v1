# Cluster Landing, Auth & UI Premium Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Cluster UI with a premium teaser home page, /signup pricing + auth page, minimal JWT auth layer, and glassmorphism polish across the dashboard and supporting pages.

**Architecture:** A Next.js `(app)` route group wraps all pages that need the Sidebar; the root `/` and `/signup` live outside it for a full-viewport, sidebar-free experience. A thin JWT auth layer (register/login/me) is added to the Express backend by extending the existing `User` model with `passwordHash` and `plan`. The frontend stores the JWT in localStorage and checks auth state to skip the gate for logged-in users. All visual changes use CSS variables and utility classes layered on top of the existing system.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, Geist Sans, Express 5, Prisma v6, PostgreSQL, jsonwebtoken, bcryptjs

---

## File Map

**New files:**
- `frontend/src/app/(app)/layout.tsx` — Sidebar wrapper for all app routes
- `frontend/src/app/signup/page.tsx` — Pricing + auth page (no sidebar)
- `frontend/src/components/ui/GlassCard.tsx` — Reusable glassmorphism card
- `frontend/src/lib/auth.ts` — Frontend token helpers
- `backend/src/routes/auth.ts` — register / login / me endpoints
- `backend/src/routes/auth.test.ts` — Auth route tests

**Modified files:**
- `frontend/src/app/layout.tsx` — Remove Sidebar (moves to (app) layout)
- `frontend/src/app/page.tsx` — Full teaser redesign + auth gate
- `frontend/src/app/globals.css` — Design tokens v2, keyframes, utility classes
- `tailwind.config.ts` — Add indigo accent
- `prisma/schema.prisma` — Add `passwordHash`, `plan`, `Plan` enum to existing User
- `backend/src/index.ts` — Mount /api/auth router
- `backend/package.json` — Add jsonwebtoken + bcryptjs
- `frontend/src/components/Sidebar.tsx` — Active state → 3px left accent bar
- `frontend/src/app/(app)/dashboard/page.tsx` — Glassmorphism + section polish
- `frontend/src/app/(app)/agents/[id]/page.tsx` — Chat bubble + header polish
- `frontend/src/app/(app)/workflows/page.tsx` — Hover border + empty state
- `frontend/src/app/(app)/groupchats/page.tsx` — Avatar rings + empty state
- `frontend/src/app/(app)/calendar/page.tsx` — Today ring + section header

**Moved (content unchanged, just relocated into route group):**
`src/app/{dashboard,calendar,groupchats,agents,workflows,scheduler,credentials,settings,integrations,cluster,admin}/`
→ `src/app/(app)/{same}/`

---

## Task 1: Design tokens, keyframes, and glassmorphism utilities

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add CSS variables and utility classes**

Open `frontend/src/app/globals.css`. After the closing brace of the existing `:root.dark-mode` block, add:

```css
/* ── Design system v2 ────────────────────────────────── */
:root, :root.dark-mode {
  --accent-indigo: #6366f1;
  --accent-indigo-hover: #4f52d4;
  --glass-bg: rgba(255, 255, 255, 0.04);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-blur: 12px;
  --glow-teal: rgba(79, 184, 168, 0.12);
  --glow-indigo: rgba(99, 102, 241, 0.12);
  --dot-grid: rgba(255, 255, 255, 0.04);
}

:root.light-mode {
  --accent-indigo: #4f46e5;
  --accent-indigo-hover: #3730a3;
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-border: rgba(0, 0, 0, 0.08);
  --glass-blur: 12px;
  --glow-teal: rgba(44, 159, 141, 0.18);
  --glow-indigo: rgba(79, 70, 229, 0.18);
  --dot-grid: rgba(0, 0, 0, 0.04);
}

/* ── Keyframes ───────────────────────────────────────── */
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}

/* ── Utility classes ─────────────────────────────────── */
.glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
}

.animate-fade-slide-up {
  animation: fadeSlideUp 300ms ease-out both;
}

.shimmer-text {
  background: linear-gradient(
    90deg,
    var(--text-primary) 0%,
    var(--accent) 40%,
    var(--accent-indigo) 60%,
    var(--text-primary) 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 3s linear infinite;
}

.dot-grid-bg {
  background-image: radial-gradient(var(--dot-grid) 1px, transparent 1px);
  background-size: 24px 24px;
}

.section-accent-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.section-accent-bar::before {
  content: '';
  display: block;
  width: 3px;
  height: 1.1em;
  border-radius: 2px;
  background: var(--accent);
  flex-shrink: 0;
}

.workflow-card {
  transition: box-shadow 200ms, border-color 200ms;
}
.workflow-card:hover {
  border-color: rgba(79, 184, 168, 0.4) !important;
  box-shadow: 0 0 0 1px rgba(79, 184, 168, 0.2), 0 4px 20px rgba(79, 184, 168, 0.08);
}
```

- [ ] **Step 2: Start dev server and verify no CSS errors**

```bash
cd C:/Users/Benji/cluster && npm run dev
```

Open http://localhost:3000. Check browser console — no CSS parse errors expected.

- [ ] **Step 3: Commit**

```bash
git -C C:/Users/Benji/cluster add frontend/src/app/globals.css
git -C C:/Users/Benji/cluster commit -m "feat: design system v2 — tokens, keyframes, glass/shimmer/grid utilities"
```

---

## Task 2: Tailwind config — indigo accent

**Files:**
- Modify: `frontend/tailwind.config.ts`

- [ ] **Step 1: Replace tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0a0a0a',
          raised: '#111111',
          border: '#2a2a2a',
          hover: '#222222',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#4f52d4',
          teal: '#4fb8a8',
          'teal-hover': '#3c9a8c',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      letterSpacing: {
        tighter: '-0.03em',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Users/Benji/cluster/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git -C C:/Users/Benji/cluster add frontend/tailwind.config.ts
git -C C:/Users/Benji/cluster commit -m "feat: add indigo accent and tighter letter-spacing to tailwind"
```

---

## Task 3: Route group restructure — (app) layout

**Files:**
- Create: `frontend/src/app/(app)/layout.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Move: all page directories into `(app)/`

- [ ] **Step 1: Create the (app) layout with Sidebar**

Create `frontend/src/app/(app)/layout.tsx`:

```tsx
import { Sidebar } from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Strip Sidebar from root layout**

Replace `frontend/src/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { ThemeProvider } from '@/lib/themeContext'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cluster',
  description: 'AI agents for your business',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark-mode`}>
      <body
        className="h-screen overflow-hidden antialiased"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-geist-sans)',
        }}
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Move app page directories into (app) group**

Run from `frontend/src/app/`:

```bash
cd "C:/Users/Benji/cluster/frontend/src/app"
mkdir -p "(app)"
for dir in dashboard calendar groupchats agents workflows scheduler credentials settings integrations cluster admin; do
  [ -d "$dir" ] && mv "$dir" "(app)/$dir" && echo "moved $dir"
done
```

Expected output: each directory name listed as moved.

- [ ] **Step 4: Verify routes still work**

Open:
- http://localhost:3000/dashboard — loads dashboard with Sidebar ✓
- http://localhost:3000/calendar — loads calendar with Sidebar ✓
- http://localhost:3000 — home page, no Sidebar ✓

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/Benji/cluster add frontend/src/app/
git -C C:/Users/Benji/cluster commit -m "refactor: (app) route group — sidebar only on app pages, / and /signup are sidebar-free"
```

---

## Task 4: Prisma — add auth fields to User model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add passwordHash, plan, and Plan enum to existing User model**

The `User` model already exists. Add the two new fields inside it and add the enum below it. In `prisma/schema.prisma`, find the `model User {` block and add `passwordHash` and `plan` after the existing `email` field:

```prisma
model User {
  id              String           @id @default(cuid())
  email           String           @unique
  name            String           @default("")
  passwordHash    String?                              // nullable — existing users have none
  plan            Plan             @default(FREE)      // add this line
  createdAt       DateTime         @default(now())
  // ... existing relations unchanged ...
}

enum Plan {
  FREE
  PRO
  MAX
}
```

> Only add `passwordHash String?` and `plan Plan @default(FREE)` to the existing model. Do not remove or reorder any existing fields or relations.

- [ ] **Step 2: Run migration**

```bash
cd C:/Users/Benji/cluster && npx prisma migrate dev --name add-user-auth-fields
```

Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 3: Confirm backend compiles with new types**

```bash
cd C:/Users/Benji/cluster/backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git -C C:/Users/Benji/cluster add prisma/schema.prisma prisma/migrations/
git -C C:/Users/Benji/cluster commit -m "feat: add passwordHash and plan to User model"
```

---

## Task 5: Auth backend — register, login, me

**Files:**
- Create: `backend/src/routes/auth.ts`
- Create: `backend/src/routes/auth.test.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd C:/Users/Benji/cluster/backend
npm install jsonwebtoken bcryptjs
npm install --save-dev @types/jsonwebtoken @types/bcryptjs
```

- [ ] **Step 2: Write failing tests**

Create `backend/src/routes/auth.test.ts`:

```ts
import request from 'supertest'
import { app } from '../index'
import { prisma } from '../db'

const TEST_EMAIL = 'authtest@cluster.ai'

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } })
  await prisma.$disconnect()
})

describe('POST /api/auth/register', () => {
  it('creates a user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.email).toBe(TEST_EMAIL)
    expect(res.body.user.plan).toBe('FREE')
  })

  it('rejects duplicate email with 409', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    expect(res.status).toBe(409)
  })

  it('rejects missing fields with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  it('returns token for valid credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
  })

  it('rejects wrong password with 401', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrongpassword' })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  it('returns user for valid token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe(TEST_EMAIL)
  })

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd C:/Users/Benji/cluster/backend && npm test -- --testPathPattern=auth
```

Expected: FAIL — `Cannot find module './auth'` or similar.

- [ ] **Step 4: Create auth router**

Create `backend/src/routes/auth.ts`:

```ts
import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db'

export const authRouter = Router()

const JWT_SECRET = process.env.JWT_SECRET ?? 'cluster-dev-secret'

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' })
}

export function verifyToken(token: string): { sub: string } {
  return jwt.verify(token, JWT_SECRET) as { sub: string }
}

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' })
    return
  }
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }
  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, name: email.split('@')[0], passwordHash },
    select: { id: true, email: true, plan: true, createdAt: true },
  })
  const token = signToken(user.id)
  res.status(201).json({ token, user })
})

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' })
    return
  }
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  const token = signToken(user.id)
  res.json({
    token,
    user: { id: user.id, email: user.email, plan: user.plan, createdAt: user.createdAt },
  })
})

authRouter.get('/me', async (req: Request, res: Response) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token' })
    return
  }
  try {
    const payload = verifyToken(header.slice(7))
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, plan: true, createdAt: true },
    })
    if (!user) { res.status(401).json({ error: 'User not found' }); return }
    res.json(user)
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})
```

- [ ] **Step 5: Mount router in index.ts**

In `backend/src/index.ts`, add the import after existing route imports:

```ts
import { authRouter } from './routes/auth'
```

And add the mount after existing `app.use` calls:

```ts
app.use('/api/auth', authRouter)
```

- [ ] **Step 6: Add JWT_SECRET to .env.example**

Add to `cluster/.env.example`:
```
JWT_SECRET=change-me-in-production
```

Add to your local `cluster/.env`:
```
JWT_SECRET=cluster-dev-secret
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
cd C:/Users/Benji/cluster/backend && npm test -- --testPathPattern=auth
```

Expected: 6 tests PASS.

- [ ] **Step 8: Commit**

```bash
git -C C:/Users/Benji/cluster add backend/src/routes/auth.ts backend/src/routes/auth.test.ts backend/src/index.ts backend/package.json backend/package-lock.json .env.example
git -C C:/Users/Benji/cluster commit -m "feat: JWT auth endpoints — register, login, me (6 tests passing)"
```

---

## Task 6: Frontend auth helpers

**Files:**
- Create: `frontend/src/lib/auth.ts`

- [ ] **Step 1: Create auth.ts**

Create `frontend/src/lib/auth.ts`:

```ts
const TOKEN_KEY = 'cluster_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export async function checkAuth(): Promise<boolean> {
  const token = getToken()
  if (!token) return false
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git -C C:/Users/Benji/cluster add frontend/src/lib/auth.ts
git -C C:/Users/Benji/cluster commit -m "feat: frontend auth token helpers (get/set/clear/check)"
```

---

## Task 7: Home page teaser redesign

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Replace page.tsx with the full teaser**

Replace the entire contents of `frontend/src/app/page.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api, Agent } from '@/lib/api'
import { checkAuth } from '@/lib/auth'

const AGENT_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899',
  '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
]

const CHIPS = [
  'Plan my day around appointments',
  'Remind me what needs paying this week',
  'Set up a healthy evening routine',
  'Help me rebalance my schedule',
]

const STATS = [
  { value: 12, suffix: '', label: 'agents deployed' },
  { value: 4200, suffix: '+', label: 'tasks automated' },
  { value: 2.1, suffix: 'x', label: 'faster planning' },
]

function getColor(index: number) {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

function CountUp({ target, suffix }: { target: number; suffix: string }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const isDecimal = target % 1 !== 0
    const steps = 40
    const duration = 1200
    let step = 0
    const timer = setInterval(() => {
      step++
      const eased = 1 - Math.pow(1 - step / steps, 3)
      setDisplay(isDecimal ? Math.round(target * eased * 10) / 10 : Math.round(target * eased))
      if (step >= steps) clearInterval(timer)
    }, duration / steps)
    return () => clearInterval(timer)
  }, [target])
  return <>{display}{suffix}</>
}

export default function HomePage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [message, setMessage] = useState('')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [isAuthed, setIsAuthed] = useState(false)
  const [statsVisible, setStatsVisible] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    checkAuth().then(setIsAuthed)
    api.agents.list()
      .then((list) => {
        const data = Array.isArray(list) ? list : []
        setAgents(data)
        if (data.length > 0) setSelectedAgent(data[0])
      })
      .catch(() => {})
    setTimeout(() => setStatsVisible(true), 400)
  }, [])

  useEffect(() => {
    if (!selectedAgent) return
    router.prefetch(`/agents/${selectedAgent.id}`)
  }, [selectedAgent, router])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setMessage(val)
    const cursor = e.target.selectionStart ?? val.length
    const m = val.slice(0, cursor).match(/@(\w*)$/)
    setMentionQuery(m ? m[1] : null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { setMentionQuery(null); return }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const gate = (pendingKey: string, pendingValue: string): boolean => {
    if (isAuthed) return true
    sessionStorage.setItem(pendingKey, pendingValue)
    router.push('/signup')
    return false
  }

  const handleSend = () => {
    const trimmed = message.trim()
    if (!trimmed || !selectedAgent || isTransitioning) return
    if (!gate('pending_message', trimmed)) return
    sessionStorage.setItem(`agent-init-${selectedAgent.id}`, trimmed)
    setIsTransitioning(true)
    setTimeout(() => router.push(`/agents/${selectedAgent.id}`), 140)
  }

  const handleCreateAgent = () => {
    if (!gate('pending_action', 'create_agent')) return
    router.push('/agents/new')
  }

  const handleMentionSelect = (agent: Agent) => {
    const ta = textareaRef.current
    const cursor = ta?.selectionStart ?? message.length
    const before = message.slice(0, cursor)
    const m = before.match(/@(\w*)$/)
    if (m) {
      setMessage(
        before.slice(0, before.length - m[0].length) + `@${agent.name} ` + message.slice(cursor)
      )
    }
    setMentionQuery(null)
    setSelectedAgent(agent)
    ta?.focus()
  }

  const agentIndex = selectedAgent ? agents.findIndex((a) => a.id === selectedAgent.id) : -1
  const selectedColor = agentIndex >= 0 ? getColor(agentIndex) : '#6366f1'
  const mentionAgents = mentionQuery !== null
    ? agents.filter((a) => a.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : []

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        position: 'relative',
        overflow: 'hidden',
        opacity: isTransitioning ? 0.7 : 1,
        transition: 'opacity 160ms ease',
      }}
    >
      {/* Ambient blobs */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-5%',
        width: '40vw', height: '40vw', borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, var(--glow-teal), transparent 70%)',
      }} />
      <div style={{
        position: 'absolute', bottom: '-10%', right: '-5%',
        width: '35vw', height: '35vw', borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, var(--glow-indigo), transparent 70%)',
      }} />

      {/* Heading */}
      <div className="animate-fade-slide-up" style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
          Life runs smoother with{' '}
          <span className="shimmer-text">Cluster</span>
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-tertiary)', margin: 0 }}>
          Capture anything on your mind and let Cluster turn it into a clear plan.
        </p>
      </div>

      {/* Stat pills */}
      {statsVisible && (
        <div
          className="animate-fade-slide-up"
          style={{ display: 'flex', gap: '12px', marginBottom: '36px', flexWrap: 'wrap', justifyContent: 'center', animationDelay: '100ms' }}
        >
          {STATS.map((stat) => (
            <div key={stat.label} className="glass" style={{ padding: '6px 16px', borderRadius: '100px', fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                <CountUp target={stat.value} suffix={stat.suffix} />
              </span>
              {stat.label}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="animate-fade-slide-up" style={{ width: '100%', maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '12px', animationDelay: '200ms' }}>
        {/* Chat card */}
        <div
          className="glass"
          style={{ borderRadius: '16px', padding: '12px 16px', boxShadow: `0 0 0 1px var(--glass-border), 0 0 24px ${selectedColor}22` }}
        >
          {/* Agent selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selectedColor, boxShadow: `0 0 6px ${selectedColor}`, display: 'inline-block' }} />
                {selectedAgent?.name ?? 'Select agent'} ▾
              </button>
              {dropdownOpen && (
                <div className="glass" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, minWidth: '180px', borderRadius: '12px', padding: '6px', marginTop: '4px' }}>
                  {agents.map((a, i) => (
                    <button key={a.id} onClick={() => { setSelectedAgent(a); setDropdownOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', borderRadius: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getColor(i), flexShrink: 0 }} />
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Textarea + mention dropdown */}
          <div style={{ position: 'relative' }}>
            {mentionAgents.length > 0 && (
              <div className="glass" style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 50, minWidth: '180px', borderRadius: '12px', padding: '6px', marginBottom: '4px' }}>
                {mentionAgents.map((a, i) => (
                  <button key={a.id} onClick={() => handleMentionSelect(a)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', borderRadius: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getColor(i), flexShrink: 0 }} />
                    @{a.name}
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask your agents anything..."
              rows={2}
              style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: 'var(--text-primary)', fontSize: '15px', lineHeight: '1.5', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              onClick={handleSend}
              disabled={!message.trim() || !selectedAgent}
              style={{ padding: '8px 18px', borderRadius: '10px', background: message.trim() && selectedAgent ? 'var(--accent-indigo)' : 'var(--bg-tertiary)', color: message.trim() && selectedAgent ? '#fff' : 'var(--text-tertiary)', border: 'none', cursor: message.trim() && selectedAgent ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 500, transition: 'background 150ms' }}
            >
              Send →
            </button>
          </div>
        </div>

        {/* Create Agent */}
        <button
          onClick={handleCreateAgent}
          className="glass"
          style={{ width: '100%', padding: '14px', borderRadius: '16px', border: '1px dashed var(--glass-border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'border-color 150ms, color 150ms' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--glass-border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
          Create an Agent
        </button>

        {/* Chips */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => setMessage(chip)}
              style={{ padding: '6px 14px', borderRadius: '100px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-tertiary)', fontSize: '12px', cursor: 'pointer', transition: 'color 150ms, border-color 150ms' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = selectedColor; (e.currentTarget as HTMLButtonElement).style.borderColor = selectedColor + '66' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--glass-border)' }}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify home page**

Open http://localhost:3000:
- No Sidebar visible ✓
- "Cluster" heading shimmers ✓
- Stat pills count up after ~400ms ✓
- Agent selector shows real agents from API ✓
- "Create an Agent" dashed button visible ✓
- Clicking Send (unauthenticated) → redirects to /signup ✓
- Clicking Create an Agent (unauthenticated) → redirects to /signup ✓

- [ ] **Step 3: Commit**

```bash
git -C C:/Users/Benji/cluster add frontend/src/app/page.tsx
git -C C:/Users/Benji/cluster commit -m "feat: home page premium teaser — shimmer heading, stat pills, auth gate"
```

---

## Task 8: /signup page — pricing cards + auth form

**Files:**
- Create: `frontend/src/app/signup/page.tsx`

- [ ] **Step 1: Create signup/page.tsx**

Create `frontend/src/app/signup/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { setToken } from '@/lib/auth'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '',
    highlight: false,
    matte: false,
    features: ['2 agents', '2 team members', 'Core workflows'],
    cta: 'Get started free',
    ctaStyle: 'outline' as const,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$17',
    period: '/mo',
    highlight: true,
    matte: false,
    badge: 'Most Popular',
    features: ['Unlimited agents', 'Up to 10 team members', 'All workflows + automations', 'Google, Slack & Notion integrations'],
    cta: 'Start with Pro',
    ctaStyle: 'solid' as const,
  },
  {
    id: 'max',
    name: 'Max',
    price: 'Custom',
    period: '',
    highlight: false,
    matte: true,
    features: ['Everything in Pro', 'Unlimited team members', 'Priority support + SLA', 'Custom integrations'],
    cta: 'Talk to us',
    ctaStyle: 'matte' as const,
  },
]

export default function SignupPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState('')

  useEffect(() => {
    const msg = sessionStorage.getItem('pending_message')
    const action = sessionStorage.getItem('pending_action')
    if (msg) setBanner('Sign up to send your message to your agent')
    else if (action === 'create_agent') setBanner('Sign up to create your first agent')
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const endpoint = mode === 'signup' ? '/api/auth/register' : '/api/auth/login'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
      setToken(data.token)
      sessionStorage.removeItem('pending_message')
      sessionStorage.removeItem('pending_action')
      router.push('/dashboard')
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px 80px', position: 'relative', overflow: 'hidden' }}>
      {/* Blobs */}
      <div style={{ position: 'fixed', top: '-15%', left: '-10%', width: '50vw', height: '50vw', borderRadius: '50%', pointerEvents: 'none', background: 'radial-gradient(circle, var(--glow-teal), transparent 70%)' }} />
      <div style={{ position: 'fixed', bottom: '-15%', right: '-10%', width: '45vw', height: '45vw', borderRadius: '50%', pointerEvents: 'none', background: 'radial-gradient(circle, var(--glow-indigo), transparent 70%)' }} />

      {/* Nav */}
      <div style={{ width: '100%', maxWidth: '1100px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 0' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.03em' }}>
          Cluster
        </button>
        <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError('') }} style={{ background: 'none', border: '1px solid var(--glass-border)', padding: '8px 16px', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px' }}>
          {mode === 'signup' ? 'Log in' : 'Sign up'}
        </button>
      </div>

      {/* Banner */}
      {banner && (
        <div className="glass animate-fade-slide-up" style={{ padding: '10px 20px', borderRadius: '100px', marginBottom: '32px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          {banner}
        </div>
      )}

      {/* Heading */}
      <div className="animate-fade-slide-up" style={{ textAlign: 'center', marginBottom: '52px', animationDelay: '60ms' }}>
        <h1 style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
          Simple, transparent pricing
        </h1>
        <p style={{ fontSize: '15px', color: 'var(--text-tertiary)', margin: 0 }}>Start free. Upgrade when you're ready.</p>
      </div>

      {/* Pricing cards */}
      <div
        className="animate-fade-slide-up"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', width: '100%', maxWidth: '960px', marginBottom: '64px', animationDelay: '120ms' }}
      >
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="glass"
            style={{ borderRadius: '20px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', ...(plan.highlight && { boxShadow: '0 0 0 1px rgba(99,102,241,0.5), 0 0 32px rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.3)' }), ...(plan.matte && { background: 'rgba(255,255,255,0.02)' }) }}
          >
            {plan.badge && (
              <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--accent-indigo)', color: '#fff', fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '100px', whiteSpace: 'nowrap' }}>
                {plan.badge}
              </div>
            )}
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>{plan.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: plan.id === 'max' ? '28px' : '42px', fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{plan.price}</span>
                {plan.period && <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{plan.period}</span>}
              </div>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {plan.features.map((f) => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--accent)', flexShrink: 0 }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => plan.id === 'max' ? window.open('mailto:hello@cluster.ai', '_blank') : document.getElementById('auth-form')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ marginTop: 'auto', padding: '12px', borderRadius: '12px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', transition: 'opacity 150ms', ...(plan.ctaStyle === 'solid' && { background: 'var(--accent-indigo)', color: '#fff', border: 'none' }), ...(plan.ctaStyle === 'outline' && { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }), ...(plan.ctaStyle === 'matte' && { background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }) }}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Auth form */}
      <div id="auth-form" className="glass animate-fade-slide-up" style={{ width: '100%', maxWidth: '400px', borderRadius: '20px', padding: '36px', animationDelay: '200ms' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 24px', textAlign: 'center' }}>
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={{ padding: '12px 14px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={{ padding: '12px 14px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }} />
          {error && <p style={{ color: 'var(--error)', fontSize: '13px', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ padding: '13px', borderRadius: '12px', background: 'var(--accent-indigo)', color: '#fff', border: 'none', fontWeight: 600, fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: '4px' }}>
            {loading ? 'Loading...' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
          <button type="button" disabled title="Coming soon" style={{ padding: '13px', borderRadius: '12px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-tertiary)', fontSize: '14px', cursor: 'not-allowed', opacity: 0.5 }}>
            Continue with Google · Coming soon
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '20px', marginBottom: 0 }}>
          {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
          <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '13px' }}>
            {mode === 'signup' ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify /signup page**

Open http://localhost:3000/signup:
- Three pricing cards visible, no sidebar ✓
- Pro card has indigo glow and "Most Popular" badge ✓
- Max shows "Custom" price and "Talk to us" CTA ✓
- Auth form below with email + password fields ✓
- Google button disabled with "Coming soon" text ✓
- Submitting valid email/password creates account and redirects to /dashboard ✓
- Banner appears if arriving from auth gate ✓

- [ ] **Step 3: Commit**

```bash
git -C C:/Users/Benji/cluster add frontend/src/app/signup/
git -C C:/Users/Benji/cluster commit -m "feat: /signup page with pricing cards and auth form"
```

---

## Task 9: GlassCard reusable component

**Files:**
- Create: `frontend/src/components/ui/GlassCard.tsx`

- [ ] **Step 1: Create GlassCard**

Create `frontend/src/components/ui/GlassCard.tsx`:

```tsx
import { CSSProperties, ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  style?: CSSProperties
  className?: string
  glowColor?: string
  onClick?: () => void
}

export function GlassCard({ children, style, className, glowColor, onClick }: GlassCardProps) {
  return (
    <div
      className={`glass${className ? ` ${className}` : ''}`}
      onClick={onClick}
      style={{
        borderRadius: '16px',
        padding: '20px',
        ...(glowColor && { boxShadow: `0 0 0 1px ${glowColor}33, 0 0 20px ${glowColor}11` }),
        ...style,
      }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git -C C:/Users/Benji/cluster add frontend/src/components/ui/GlassCard.tsx
git -C C:/Users/Benji/cluster commit -m "feat: GlassCard reusable component"
```

---

## Task 10: Sidebar — active state to left accent bar

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Read the current active nav item style**

Open `frontend/src/components/Sidebar.tsx` and find the inline style object applied to each nav link when it is active. It will contain something like:

```tsx
background: isActive ? 'var(--bg-hover)' : 'transparent',
```

- [ ] **Step 2: Replace the active background with a left border**

Change the style object for each nav item from a background fill to a left accent bar. Replace the relevant style properties with:

```tsx
background: 'transparent',
borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
paddingLeft: '9px',   // 12px - 3px border to keep alignment
color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
fontWeight: isActive ? 500 : 400,
transition: 'color 150ms, border-color 150ms',
```

Apply to every nav item that previously used a background fill for its active state.

- [ ] **Step 3: Verify in browser**

Navigate to /dashboard. The Dashboard nav item should show a 3px teal left border, no background highlight. Navigate to /calendar — Calendar item gets the bar, Dashboard loses it.

- [ ] **Step 4: Commit**

```bash
git -C C:/Users/Benji/cluster add frontend/src/components/Sidebar.tsx
git -C C:/Users/Benji/cluster commit -m "feat: sidebar active state — 3px teal accent bar replaces background fill"
```

---

## Task 11: Dashboard — glassmorphism stat cards, section headers, dot grid

**Files:**
- Modify: `frontend/src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Add glass class and staggered animation to stat cards**

Find the stat cards render block (the 4-card row showing counts of agents, automations, etc.). Wrap/replace each card's outer `div` with:

```tsx
<div
  key={stat.label}
  className="glass animate-fade-slide-up"
  style={{
    borderRadius: '16px',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    animationDelay: `${index * 60}ms`,
  }}
>
  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
    {stat.label}
  </div>
  <div style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.02em' }}>
    {stat.value}
  </div>
</div>
```

- [ ] **Step 2: Add section-accent-bar to section headings**

Find each collapsible section heading (Today Focus, Upcoming Events, Automation Pulse, Documents Inbox). Add `className="section-accent-bar"` to each `<h2>` or heading element.

- [ ] **Step 3: Wrap main content area with dot-grid-bg**

Find the outermost scrollable content `div` in the dashboard and add the class:

```tsx
className="dot-grid-bg"
```

- [ ] **Step 4: Add empty state for agent grid**

Find where agents are rendered. After the existing map, add the empty state when `agents.length === 0`:

```tsx
{agents.length === 0 && (
  <div
    className="glass"
    style={{ borderRadius: '16px', padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '14px' }}
  >
    <div style={{ fontSize: '32px', marginBottom: '12px' }}>✦</div>
    <div style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--text-secondary)' }}>No agents yet</div>
    <div>Hire your first agent to get started</div>
  </div>
)}
```

- [ ] **Step 5: Verify dashboard**

Open http://localhost:3000/dashboard:
- Stat cards have glass style and stagger in on load ✓
- Section headings have 3px teal left bar ✓
- Dot grid visible at low opacity in dark mode background ✓
- Empty agent state shows when no agents exist ✓

- [ ] **Step 6: Commit**

```bash
git -C C:/Users/Benji/cluster add "frontend/src/app/(app)/dashboard/page.tsx"
git -C C:/Users/Benji/cluster commit -m "feat: dashboard — glass stat cards, section accent bars, dot-grid bg, empty state"
```

---

## Task 12: Agent chat page polish

**Files:**
- Modify: `frontend/src/app/(app)/agents/[id]/page.tsx`

- [ ] **Step 1: Add agent name + role header bar**

Find the top of the chat area layout. Just before the message list, insert a slim header bar. You will need access to the `agent` object (already loaded by the page). Find where `agent` is used and insert:

```tsx
{agent && (
  <div
    className="glass"
    style={{ padding: '12px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}
  >
    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: agentColor, boxShadow: `0 0 6px ${agentColor}` }} />
    <span style={{ fontWeight: 600, fontSize: '14px' }}>{agent.name}</span>
    {agent.role && <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>· {agent.role}</span>}
  </div>
)}
```

Where `agentColor` is the colour assigned to this agent (use the same `AGENT_COLORS` array and index lookup pattern that already exists in the page, or import `getColor` if factored out).

- [ ] **Step 2: Style message bubbles directionally**

Find where individual messages are rendered. Apply the following style based on `message.role`:

```tsx
// For role === 'user':
<div style={{
  alignSelf: 'flex-end',
  maxWidth: '72%',
  background: 'rgba(99, 102, 241, 0.12)',
  border: '1px solid rgba(99, 102, 241, 0.2)',
  borderRadius: '16px 16px 4px 16px',
  padding: '10px 14px',
  fontSize: '14px',
  lineHeight: 1.6,
}}>

// For role === 'assistant':
<div style={{
  alignSelf: 'flex-start',
  maxWidth: '72%',
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  borderRadius: '16px 16px 16px 4px',
  padding: '10px 14px',
  fontSize: '14px',
  lineHeight: 1.6,
}}>
```

The message list container should already use `display: flex; flex-direction: column; gap: 12px`.

- [ ] **Step 3: Commit**

```bash
git -C C:/Users/Benji/cluster add "frontend/src/app/(app)/agents/"
git -C C:/Users/Benji/cluster commit -m "feat: agent chat — header bar and directional glass message bubbles"
```

---

## Task 13: Workflows page polish

**Files:**
- Modify: `frontend/src/app/(app)/workflows/page.tsx`

- [ ] **Step 1: Add glass + workflow-card class to each card**

Find where workflow cards are rendered. Add `className="glass workflow-card"` to each card's outer element. The `.workflow-card` hover animation is already defined in globals.css from Task 1.

- [ ] **Step 2: Add empty state**

Where `workflows.length === 0`, add:

```tsx
{workflows.length === 0 && (
  <div className="glass" style={{ borderRadius: '16px', padding: '48px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '14px' }}>
    <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚡</div>
    <div style={{ fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>No workflows yet</div>
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '16px' }}>
      {['Summarise email → Slack', 'New lead → CRM + notify', 'Weekly report → email'].map(label => (
        <span key={label} style={{ padding: '6px 14px', borderRadius: '100px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', fontSize: '12px', color: 'var(--text-secondary)' }}>
          {label}
        </span>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git -C C:/Users/Benji/cluster add "frontend/src/app/(app)/workflows/"
git -C C:/Users/Benji/cluster commit -m "feat: workflows — glass hover border and illustrated empty state"
```

---

## Task 14: Group chats and calendar polish

**Files:**
- Modify: `frontend/src/app/(app)/groupchats/page.tsx`
- Modify: `frontend/src/app/(app)/calendar/page.tsx`

- [ ] **Step 1: Group chats — empty state**

Where `groupChats.length === 0`:

```tsx
{groupChats.length === 0 && (
  <div className="glass" style={{ borderRadius: '16px', padding: '48px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '14px' }}>
    <div style={{ fontSize: '28px', marginBottom: '12px' }}>💬</div>
    <div style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--text-secondary)' }}>No group chats yet</div>
    <div>Start a group chat to have multiple agents collaborate on a task</div>
  </div>
)}
```

- [ ] **Step 2: Group chats — agent avatar colour rings**

Find where agent colour dots or avatars render inside each group chat card. Apply the ring style:

```tsx
<span style={{
  display: 'inline-block',
  width: '22px', height: '22px', borderRadius: '50%',
  background: agentColor,
  boxShadow: `0 0 0 2px var(--bg-primary), 0 0 0 3.5px ${agentColor}`,
  marginRight: '-6px',
  flexShrink: 0,
}} />
```

Stack them with `display: flex; align-items: center` on the container.

- [ ] **Step 3: Calendar — today cell indigo ring**

In `calendar/page.tsx`, find where the today cell or today's date is highlighted. Replace or augment the style with:

```tsx
// On the element marking today:
style={{
  boxShadow: '0 0 0 2px var(--accent-indigo)',
  borderRadius: '50%',
  color: '#fff',
  background: 'var(--accent-indigo)',
}}
```

- [ ] **Step 4: Calendar — section-accent-bar on heading**

Add `className="section-accent-bar"` to the calendar page's main `<h1>` or `<h2>` heading.

- [ ] **Step 5: Commit**

```bash
git -C C:/Users/Benji/cluster add "frontend/src/app/(app)/groupchats/" "frontend/src/app/(app)/calendar/"
git -C C:/Users/Benji/cluster commit -m "feat: group chats empty state + avatar rings, calendar today glow + accent bar"
```

---

## Spec Coverage

| Requirement | Task |
|---|---|
| Indigo accent + glass tokens + keyframes | 1, 2 |
| Dark = minimal / light = joyful via CSS vars | 1 |
| Route group — / and /signup sidebar-free | 3 |
| Home page shimmer heading + stat pills + auth gate | 7 |
| Home page Create Agent button | 7 |
| /signup three pricing cards with Pro highlight | 8 |
| /signup auth form, Google disabled | 8 |
| /signup personalised banner | 8 |
| User model passwordHash + plan | 4 |
| Auth backend register/login/me | 5 |
| Frontend token helpers | 6 |
| Sidebar left accent bar | 10 |
| Dashboard glass stat cards + stagger | 11 |
| Dashboard section accent bars | 11 |
| Dashboard dot-grid bg | 11 |
| Dashboard empty states | 11 |
| Agent chat header + directional bubbles | 12 |
| Workflows hover border + empty state | 13 |
| Group chats empty state + avatar rings | 14 |
| Calendar today ring + section header | 14 |
| Token limits internal (not displayed) | Backend enforcement deferred — implement when billing is wired |
