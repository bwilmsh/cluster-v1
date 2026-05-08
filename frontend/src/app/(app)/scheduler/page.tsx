'use client'
import React from 'react'
import dynamic from 'next/dynamic'

const SchedulerBoard = dynamic(() => import('../../components/Scheduler/Board'), { ssr: false })

export default function Page() {
  return (
    <div className="p-4">
      <SchedulerBoard />
    </div>
  )
}
