# Cluster — Today View

**Date:** 2026-05-09
**Status:** Approved
**Scope:** New `/today` route with a tasks panel and a calendar-events panel. Sidebar gets a new "Today" item placed first. No schema changes, no backend changes.

---

## 1. Goals

A daily landing surface with two purposes:

1. **Tasks** — capture and complete unfinished work without leaving the page.
2. **Events** — see today's calendar at a glance, plus a condensed view of the rest of the week.

Visual language matches the Monday.com-aligned conventions established in the redesigned Scheduler week view: dense rows, intentional teal accents, clear typographic hierarchy, tabular numerals.

---

## 2. Data Model

No schema changes. Both tasks and events live in the existing `Event` Prisma model:

- A **task** is an `Event` row where `itemType = "task"`. Status is one of `todo | in-progress | done`.
- An **event** is an `Event` row where `itemType !== "task"` (typically `"event"` or `"appointment"`).

The Today view loads via a single `GET /api/scheduler/events` call and partitions results client-side.

### Filters

| List | Filter |
|---|---|
| Tasks panel | `itemType === "task"` AND `status !== "done"` |
| Today's events | `itemType !== "task"` AND `start_time` falls within today (local time) |
| Rest of week | `itemType !== "task"` AND `start_time` is between `tomorrow 00:00` and `Sunday 23:59` of the current week (Mon-start) |

### Sorting

- **Tasks:** `created_at` descending (newest on top).
- **Today's events:** `start_time` ascending.
- **Rest of week:** grouped by weekday in chronological order; within a day, `start_time` ascending.

---

## 3. Routing & Sidebar

### New route

`frontend/src/app/(app)/today/page.tsx` — a thin server component that dynamic-imports the client `TodayView` (mirrors the pattern in `(app)/scheduler/page.tsx`).

### Sidebar

`Sidebar.tsx` `NAV_ITEMS` gets a new entry inserted as the **first** item:

```ts
{ href: '/today', label: 'Today', Icon: SunIcon }
```

A new `SunIcon` SVG component is added alongside the other inline icons in the same file. Style: 16x16 viewBox, 1.25 stroke weight, `currentColor`, matches the existing icon set's weight and rounding.

The post-landing redirect target in `app/page.tsx` is **not** changed. Today is reachable via the sidebar but not auto-loaded.

---

## 4. Layout

### Page header

Above the two-column grid:

- Weekday + date in muted tertiary text (e.g. `"Saturday, May 9"`), `text-[13px]`, `tabular-nums`.
- Heading "Today" in large bold (`text-2xl font-bold`).
- A 3px teal left bar on the date block, matching today's row treatment in the Scheduler.

### Grid

- `md:grid-cols-2` two columns, `gap-4`. Stacks vertically below `md`.
- Each column is a panel: `var(--bg-secondary)` background, `1px solid var(--border)`, `rounded-lg`, internal padding.
- Each panel has a small-caps section heading at top: `text-[11px] font-semibold uppercase tracking-wider` in `var(--text-tertiary)`.

### Tasks panel (left)

```
TASKS
[ + Add a task..............................  ⋯ ]

☐ Ship Today view
☐ Review PR #142
⊡ Migrate scheduler
☐ Send invoices
☐ Plan Q3 roadmap
```

- Quick-add input row: full-width text input with an inline `⋯` "More options" icon button on the right.
- Below: scrollable list of task rows, each ~36–40px tall, with a checkbox glyph + title + (optional) muted secondary line for tags or status pill.
- Empty state: centered muted text `"All clear. Add a task above to get started."`

### Events panel (right)

```
TODAY'S EVENTS
09:00  Standup
11:00  Client review
14:00  Lunch w/Alex

──── Rest of week ────
Mon  10:00  1:1
Tue  15:00  Demo
Thu  09:00  Review
```

- Today subsection at top. Each row: time (tabular-nums, `var(--text-secondary)`) + title.
- A thin divider with the label `Rest of week`.
- Rest-of-week subsection: condensed rows with weekday short name + time + title. No internal grouping headers per day — keep it flat and scannable.
- Empty state for today: `"No events today."` Empty state for rest-of-week: section is hidden entirely if empty.

---

## 5. Components

All under `frontend/src/components/Today/`.

### `TodayView.tsx` (client)

Top-level container. Owns:
- `events` state populated from `/api/scheduler/events`.
- `editing` state for hosting the existing `EventModal` when needed.
- Derived lists computed inline from `events`: `tasks`, `todaysEvents`, `restOfWeekEvents`.

Renders the page header and the two-column grid with `TaskList` and `EventList`.

Handlers:
- `createTaskQuick(title)` — POST a task with `{ title, itemType: 'task', status: 'todo', start_time: <now ISO> }`. Optimistic prepend; rollback on failure.
- `createTaskWithModal()` — opens `EventModal` pre-seeded with `{ itemType: 'task', status: 'todo', start_time: <now ISO> }`.
- `toggleTaskDone(id)` — PUT `{ status: 'done' }`. Optimistic remove from list; rollback on failure.
- `editEvent(id)` / `editTask(id)` — both delegate to the existing `EventModal` flow.

### `TaskList.tsx` (client)

Props:
```ts
{
  tasks: Event[]
  onCreate: (title: string) => void
  onOpenFullModal: () => void
  onToggleDone: (id: string) => void
  onEdit: (id: string) => void
}
```

- Inline-add row with controlled input. Enter submits non-empty trimmed title and clears input.
- `⋯` button beside input calls `onOpenFullModal`.
- Renders a vertical list of task rows. Clicking the title fires `onEdit`. Clicking the checkbox fires `onToggleDone`.
- Distinct checkbox glyphs for `todo` (☐) vs `in-progress` (⊡).

### `EventList.tsx` (client)

Props:
```ts
{
  todaysEvents: Event[]
  restOfWeekEvents: Event[]
  onEdit: (id: string) => void
}
```

- Renders today subsection and (conditionally) rest-of-week subsection with a divider between them.
- Each row clickable to fire `onEdit`.

### `index.ts`

Re-exports `TodayView` so the page file can do `dynamic(() => import('@/components/Today').then(m => m.TodayView), { ssr: false })`.

---

## 6. Visual Style

Reuses existing design tokens (`--accent`, `--bg-secondary`, `--text-primary/secondary/tertiary`, `--border`, `--bg-hover`).

- **Panels:** `bg: var(--bg-secondary)`, `border: 1px solid var(--border)`, `rounded-lg`, `p-4`.
- **Section captions:** `text-[11px] font-semibold uppercase tracking-wider`, color `var(--text-tertiary)`, `mb-3`.
- **Times:** `tabular-nums`, color `var(--text-secondary)`, fixed-width column so titles align.
- **Inline-add input:** transparent background, bottom border `1px solid var(--border)`, focus ring uses `var(--accent)` at low alpha.
- **Task checkbox:** outlined square glyph; on toggle to `done` it fills with `var(--accent)` briefly before the row optimistically removes.
- **Hover:** rows tint to `var(--bg-hover)`.
- **Today header bar:** 3px wide accent block to the left of the date label, matching the Scheduler today-row treatment.

No avatars, status pills, or coloured chips in v1. Density wins.

---

## 7. Error Handling

- Fetch failure on initial load: panel-level inline message `"Couldn't load — retry"` with a retry button. No global toast.
- Quick-add failure: revert optimistic insert, surface a small error toast (reuse whatever toast utility the Scheduler uses; if none, plain `alert()` is acceptable for parity with existing code).
- Toggle-done failure: revert removal, surface error toast.
- The existing `EventModal` already handles save failure for the "More options" path — no new logic needed there.

---

## 8. Accessibility

- The quick-add input has an associated `<label class="sr-only">` reading `"Add a task"`.
- Each task row's checkbox is a `<button role="checkbox" aria-checked>` for screen readers.
- Section headings (`TASKS`, `TODAY'S EVENTS`, `Rest of week`) use `<h2>`/`<h3>` semantically with visually-uppercased styling via CSS.
- Date in the page header uses a `<time dateTime>` element with the ISO date.

---

## 9. Out of Scope

Deferred to future iterations:

- Google Calendar synchronization into the events panel (the existing `googleCalendar.ts` integration is not surfaced here).
- Drag-and-drop reordering of tasks.
- "X completed today" tally or revealing recently-completed tasks.
- Priority filtering, tag chips, or status pills on task rows.
- Inline editing of task titles.
- Keyboard shortcuts (e.g. `n` to focus quick-add).
- Rest-of-week section showing per-day group headers (kept flat for v1).

---

## 10. File Changes Summary

**New files**
- `frontend/src/app/(app)/today/page.tsx`
- `frontend/src/components/Today/TodayView.tsx`
- `frontend/src/components/Today/TaskList.tsx`
- `frontend/src/components/Today/EventList.tsx`
- `frontend/src/components/Today/index.ts`

**Modified files**
- `frontend/src/components/Sidebar.tsx` — add `Today` nav item as first entry; add inline `SunIcon` component.

No changes to backend, prisma schema, agent service, or root `app/page.tsx`.
