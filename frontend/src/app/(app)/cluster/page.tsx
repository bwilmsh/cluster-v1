"use client"

import React from 'react'
import Hero from '@/components/cluster/Hero'
import Pricing from '@/components/cluster/Pricing'
import DashboardPreview from '@/components/cluster/DashboardPreview'
import ChatOverlay from '@/components/cluster/ChatOverlay'
import AuthModal from '@/components/cluster/AuthModal'

export default function ClusterLanding(){
  return (
    <div style={{padding:'24px',maxWidth:1200,margin:'0 auto'}}>
      <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:8}}>
        <div style={{fontWeight:700,fontSize:20}}>Cluster</div>
        <nav style={{display:'flex',gap:12,alignItems:'center'}}>
          <a href="#features" style={{color:'var(--text-tertiary)'}}>Features</a>
          <a href="#pricing" style={{color:'var(--text-tertiary)'}}>Pricing</a>
          <AuthModal />
        </nav>
      </header>

      <main>
        <Hero />
        <section id="features">
          <h2>Core features</h2>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:16}}>
            <div style={{background:'rgba(255,255,255,0.02)',padding:16,borderRadius:12}}>AI assistant for daily planning<br/><small>Coming soon</small></div>
            <div style={{background:'rgba(255,255,255,0.02)',padding:16,borderRadius:12}}>Smart scheduling & time blocking<br/><small>Coming soon</small></div>
            <div style={{background:'rgba(255,255,255,0.02)',padding:16,borderRadius:12}}>Workflow builder with automations<br/><small>Coming soon</small></div>
            <div style={{background:'rgba(255,255,255,0.02)',padding:16,borderRadius:12}}>Goal tracking & analytics<br/><small>Coming soon</small></div>
          </div>
        </section>

        <DashboardPreview />
        <Pricing />

        <section style={{padding:'32px 0',textAlign:'center'}}>
          <h2>Get early access</h2>
          <p>Join the waitlist for the Cluster AI Productivity OS.</p>
          <button style={{padding:'12px 20px',borderRadius:10,background:'linear-gradient(90deg,#6ee7b7,#7c5cff)',border:'none'}}>Join waitlist</button>
        </section>
      </main>

      <ChatOverlay />
    </div>
  )
}
