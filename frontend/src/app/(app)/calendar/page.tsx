export const dynamic = 'force-dynamic'

import { WeekView } from '@/components/Calendar'

export default function CalendarPage({ showDeleteAllEvents = true }: { showDeleteAllEvents?: boolean }) {
  return (
    <div className="h-full">
      <WeekView showDeleteAllEvents={showDeleteAllEvents} />
    </div>
  )
}
