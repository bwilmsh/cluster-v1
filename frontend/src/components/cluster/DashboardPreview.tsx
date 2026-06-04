"use client"

import React from 'react'

export default function DashboardPreview(){
  return (
    <section style={{padding:'40px 0'}}>
      <h2>Dashboard</h2>
      <div style={{display:'flex',gap:16}}>
        <aside style={{width:220,background:'rgba(255,255,255,0.02)',padding:16,borderRadius:12}}>
          <div style={{fontWeight:700}}>Cluster</div>
          <ul style={{listStyle:'none',padding:0,marginTop:12,color:'var(--text-tertiary)'}}>
            <li>Home</li>
            <li>Workflows</li>
            <li>Calendar</li>
            <li>Goals</li>
            <li>Analytics</li>
          </ul>
        </aside>
        <div style={{flex:1}}>
          <div style={{background:'rgba(255,255,255,0.04)',padding:16,borderRadius:12,marginBottom:12}}>AI Command Center<br/><small>Coming soon</small></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
            <div style={{background:'rgba(255,255,255,0.04)',padding:12,borderRadius:10}}>Daily Goals<br/><small>Coming soon</small></div>
            <div style={{background:'rgba(255,255,255,0.04)',padding:12,borderRadius:10}}>Activity Timeline<br/><small>Coming soon</small></div>
            <div style={{background:'rgba(255,255,255,0.04)',padding:12,borderRadius:10}}>Notifications<br/><small>Coming soon</small></div>
          </div>
        </div>
      </div>
    </section>
  )
}
