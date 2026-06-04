# Cluster — Landing, Auth & UI Premium Redesign

**Date:** 2026-05-08  
**Status:** Approved  
**Scope:** Visual redesign of home page, new `/signup` pricing + auth page, dashboard polish, supporting page polish.

**Auth note:** Cluster has no auth system today. The `/signup` page UI is fully built in this spec. A minimal auth backend (User model, password hashing, JWT session) is required to make the form functional and is included in scope — but kept as a thin layer: email + password only, no Google OAuth in v1 (the "Continue with Google" button is rendered but disabled with a "Coming soon" tooltip).

---

## 1. Design System

### Colors
- Base palette unchanged: `#151b1f` bg-primary, `#4fb8a8` teal accent
- New second accent: `#6366f1` indigo — used only on primary CTAs (Get Started, Subscribe, Send)
- Glassmorphism: `rgba(255,255,255,0.04)` fill, `rgba(255,255,255,0.08)` border, `backdrop-blur(12px)`
- Ambient glow blobs: soft radial gradients at 12% opacity in dark mode, 18% in light

### Theme Personalities
- **Dark mode**: minimal, focused. Glows and gradients at low opacity. Accents muted except on direct CTAs. Less decoration, more breathing room.
- **Light mode**: joyful, productive. Gradients more expressive, accent saturation higher, warmer surfaces (`#fafafa`), visible card shadows replace borders.

### Typography
- Font: Geist Sans (unchanged)
- Headings: `letter-spacing: -0.03em`, `font-weight: 700`
- Section heads: `font-weight: 600`
- Body: `font-weight: 400`
- Pricing numbers: `tabular-nums`

### Motion
- Entrance: `opacity 0→1` + `translateY(8px→0)`, 300ms ease-out, staggered 60ms per element
- Card hover: `scale(1.01)`, 150ms
- Auth gate trigger: backdrop blur-in + modal/page slide-up, 200ms
- Sidebar active: left accent bar (3px) replaces background fill

### Spacing
- Section padding: `py-24` on full-page routes (signup, home teaser)
- Cards: `p-6` minimum, `gap-4` grids

---

## 2. Home Page (`/`) — Teaser Redesign

### Route Structure Change
Move all app pages into a `(app)` route group in Next.js App Router. The `(app)` group gets the Sidebar layout. The root `/` sits outside the group — full viewport, no sidebar, no app chrome.

### Layout
- Full-screen centred layout with two soft radial blobs: teal top-left, indigo bottom-right
- Heading: `"Life runs smoother with Cluster"` at `36px`, `-0.03em` tracking, with an animated gradient shimmer on the word "Cluster"
- Three animated stat pills below heading (count-up on load): e.g. `"12 agents deployed"`, `"4,200 tasks automated"`, `"2.1x faster planning"`
- Two equal-weight primary actions:
  - **Chat input** — agent selector dropdown + textarea + Send button (existing logic preserved)
  - **"Create Agent" button** — same visual prominence as the chat input
- Suggestion chips below both actions with hover glow in the selected agent's accent colour
- Agent selector card: glassmorphism with glow ring around selected agent's colour dot

### Auth Gate
Both "Send message" and "Create Agent" actions:
1. Store pending action in `sessionStorage`
2. `router.push('/signup')`

If the user is already authenticated, skip the gate entirely and proceed normally.

### Personalised Banner on `/signup`
When arriving via auth gate, a slim top strip reads:  
*"Sign up to send your message to [AgentName]"* or *"Sign up to create your first agent"*

---

## 3. `/signup` Page — Pricing + Auth

No sidebar. Full-page premium layout. Two vertical sections.

### Top Half — Pricing Cards
Three cards in a horizontal row, glassmorphism, equal height. Centred heading above: `"Simple, transparent pricing"`.

**Free — $0**
- 2 agents
- 2 team members
- Core workflows

**Pro — $17/mo** *(visually elevated: indigo glow ring, "Most Popular" badge)*
- Unlimited agents
- Up to 10 team members
- All workflows + automations
- Integrations (Google, Slack, Notion)

**Max — Contact Sales** *(matte dark premium card, no price shown)*
- Everything in Pro
- Unlimited team members
- Priority support + SLA
- Custom integrations
- CTA: "Talk to us" button

> Token limits are enforced per plan internally but never displayed to users.

### Bottom Half — Auth Form
Clean card below pricing:
- Email + password fields
- Toggle: Sign Up / Log In
- "Continue with Google" button (rendered, disabled, "Coming soon" tooltip — Google auth is v2)
- On submit: POST to new `/api/auth/register` or `/api/auth/login` → receive JWT → store in `httpOnly` cookie → redirect to `/dashboard`

**Minimal backend auth (in scope):**
- `User` model in Prisma: `id`, `email`, `passwordHash`, `plan` (free/pro/max), `createdAt`
- `POST /api/auth/register` — bcrypt hash, create user, return JWT
- `POST /api/auth/login` — verify password, return JWT
- `GET /api/auth/me` — verify JWT, return user (used by frontend to check auth state)

---

## 4. Dashboard (`/dashboard`) — Polish Pass

Functional structure unchanged. Visual layer only.

- **Stat cards**: glassmorphism, coloured icon per stat, count-up animation on load
- **Agent cards**: role-coloured left border → left inward glow (`box-shadow`)
- **"Today Focus" block**: elevated to command-center prominence at top of page
- **Section headers**: thin coloured left accent bar replaces plain text
- **Empty states**: illustrated placeholder content (no bare blank areas)
- **Dark mode**: subtle dot-grid background pattern at 4% opacity on main content area
- **Light mode**: card shadows replace borders, warmer surface tones

---

## 5. Supporting Pages — Polish Pass

### Calendar (`/calendar`)
- Section headers: accent bar treatment
- Today's date: indigo glow ring
- Event cards: glassmorphism, category colour left border
- Empty day cells: faint `+` hint on hover

### Workflows (`/workflows`)
- Card hover: animated gradient border sweep (teal → indigo)
- Empty state: placeholder sample automation chain card
- Automation step connectors: animated CSS `stroke-dashoffset` dash flow

### Group Chats (`/groupchats`)
- Agent avatars: colour rings matching role
- Empty state: illustrated "Start your first group chat" prompt

### Agent Chat (`/agents/[id]`)
- User messages: right-aligned, indigo tint
- Agent messages: left-aligned, subtle card background
- Agent name + role in slim header bar above chat

### Global — Sidebar
- Active route: 3px left accent bar replaces background fill highlight
- All modals: `backdrop-blur` + `scale-in` entrance animation

---

## 6. Token Limits (Internal — Not Displayed)

| Plan | Monthly Token Cap |
|------|------------------|
| Free | 500,000 |
| Pro | 5,000,000 |
| Max | Custom / unlimited |

Enforce at the backend agent service layer. Return a clear error state in the UI when limit is reached (not a raw API error — a friendly in-chat message pointing to upgrade).

---

## 7. Files Expected to Change

| File | Change |
|------|--------|
| `src/app/layout.tsx` | Remove Sidebar; move app pages to `(app)` group layout |
| `src/app/(app)/layout.tsx` | New — Sidebar layout for app pages |
| `src/app/page.tsx` | Full teaser redesign, auth gate, no sidebar |
| `src/app/signup/page.tsx` | New — pricing + auth page |
| `src/app/(app)/dashboard/page.tsx` | Polish pass |
| `src/app/(app)/calendar/page.tsx` | Polish pass |
| `src/app/(app)/workflows/page.tsx` | Polish pass |
| `src/app/(app)/groupchats/page.tsx` | Polish pass |
| `src/app/(app)/agents/[id]/page.tsx` | Polish pass |
| `src/components/Sidebar.tsx` | Active state → left accent bar |
| `src/app/globals.css` | New design tokens, animation keyframes, glassmorphism utilities |
| `tailwind.config.ts` | Add indigo accent, glassmorphism utilities |
| `prisma/schema.prisma` | Add `User` model with `plan` field |
| `backend/src/routes/auth.ts` | New — register, login, me endpoints |
| `backend/src/index.ts` | Mount `/api/auth` router |
