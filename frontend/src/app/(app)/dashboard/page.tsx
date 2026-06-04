export const dynamic = 'force-dynamic'

import CalendarPage from '../calendar/page'
import HomeLeftPanel from '@/components/Dashboard/HomeLeftPanel'

export default function DashboardPage() {
  return (
    <div className="h-full overflow-hidden p-3" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex h-full gap-3.5">
        <aside
          className="shrink-0 overflow-hidden rounded-xl p-3"
          style={{
            width: 300,
            border: '0.5px solid var(--border)',
            background: 'var(--surface-elevated)',
          }}
        >
          <HomeLeftPanel />
        </aside>

        <section
          className="min-w-0 flex-1 overflow-hidden rounded-xl"
          style={{
            border: '0.5px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <CalendarPage showDeleteAllEvents={false} />
        </section>
      </div>
    </div>
  )
}
