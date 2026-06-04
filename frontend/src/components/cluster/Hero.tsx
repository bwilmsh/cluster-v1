"use client"

import React from 'react'

export default function Hero() {
  return (
    <section style={{display:'flex',gap:24,alignItems:'center',padding:'48px 0'}}>
      <div style={{flex:1}}>
        <h1 style={{fontSize:36,fontWeight:700,margin:0}}>Future of work — one intelligent OS for planning and execution</h1>
        <p style={{color:'var(--text-tertiary)',marginTop:12}}>AI-driven tasks, workflows, calendar planning and daily execution — unified, fast, and beautiful.</p>
        <div style={{display:'flex',gap:8,marginTop:18}}>
          <input placeholder="Work email" style={{flex:1,padding:12,borderRadius:10,background:'var(--bg-secondary)',border:'1px solid var(--border)'}} />
          <button style={{padding:'12px 16px',borderRadius:10,background:'var(--accent)',border:'none'}}>Join waitlist</button>
        </div>
      </div>

      <div style={{width:460}}>
        <div style={{padding:16,borderRadius:14,background:'var(--bg-secondary)',border:'1px solid var(--border)',backdropFilter:'blur(8px)'}}>
          <div style={{fontWeight:600,marginBottom:12}}>AI Command • Today</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{padding:18,borderRadius:12,background:'rgba(255,255,255,0.04)'}}>Daily Focus<br/><small>Coming soon</small></div>
            <div style={{padding:18,borderRadius:12,background:'rgba(255,255,255,0.04)'}}>Smart Calendar<br/><small>Coming soon</small></div>
            <div style={{padding:18,borderRadius:12,background:'rgba(255,255,255,0.04)'}}>Workflow Builder<br/><small>Coming soon</small></div>
            <div style={{padding:18,borderRadius:12,background:'rgba(255,255,255,0.04)'}}>Analytics<br/><small>Coming soon</small></div>
          </div>
        </div>
      </div>
    </section>
  )
}
