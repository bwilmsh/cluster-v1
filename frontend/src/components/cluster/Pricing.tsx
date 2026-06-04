"use client"

import React from 'react'

function Tier({title,price,children}:{title:string;price:string;children:React.ReactNode}){
  return (
    <div style={{background:'rgba(255,255,255,0.02)',padding:18,borderRadius:12,textAlign:'center'}}>
      <h3 style={{margin:0}}>{title}</h3>
      <p style={{fontWeight:700,fontSize:18,margin:'8px 0'}}>{price}</p>
      <div style={{color:'var(--text-tertiary)'}}>{children}</div>
      <button style={{marginTop:12,padding:'8px 12px',borderRadius:10,background:'var(--accent)',border:'none'}}>Choose</button>
    </div>
  )
}

export default function Pricing(){
  return (
    <section id="pricing" style={{padding:'40px 0'}}>
      <h2>Pricing</h2>
      <p style={{color:'var(--text-tertiary)'}}>Simple pricing for individuals and teams. Early access discounts available.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginTop:18}}>
        <Tier title="Starter" price="Free">
          <ul style={{listStyle:'none',padding:0,margin:0}}>
            <li>Basic task management</li>
            <li>AI suggestions (limited)</li>
          </ul>
        </Tier>
        <Tier title="Pro" price="$12/mo">
          <ul style={{listStyle:'none',padding:0,margin:0}}>
            <li>Full AI day planner</li>
            <li>Smart scheduling</li>
          </ul>
        </Tier>
        <Tier title="Team" price="Contact us">
          <ul style={{listStyle:'none',padding:0,margin:0}}>
            <li>Team collaboration</li>
            <li>Shared workflows</li>
          </ul>
        </Tier>
      </div>
    </section>
  )
}
