"use client"

import React, {useState} from 'react'

export default function ChatOverlay(){
  const [open,setOpen] = useState(false)
  return (
    <div style={{position:'fixed',right:20,bottom:20,zIndex:80}}>
      {open && (
        <div style={{width:320,background:'var(--bg-secondary)',border:'1px solid var(--border)',padding:12,borderRadius:12,backdropFilter:'blur(8px)',boxShadow:'0 12px 40px rgba(0,0,0,0.6)',marginBottom:8}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontWeight:600}}>Cluster Assistant <span style={{background:'rgba(255,255,255,0.06)',padding:'4px 8px',borderRadius:8,fontSize:12}}>Limited</span></div>
            <button onClick={()=>setOpen(false)} style={{background:'transparent',border:'none',color:'var(--text-tertiary)'}}>Close</button>
          </div>
          <div style={{minHeight:80,padding:10,color:'var(--text-tertiary)'}}>Hi — ask me to plan your day, or try the demo prompts.</div>
          <div style={{display:'flex',gap:8}}>
            <input placeholder="Try: " disabled style={{flex:1,padding:8,borderRadius:8,background:'transparent',border:'1px solid rgba(255,255,255,0.04)'}} />
            <button onClick={()=>setOpen(false)} style={{padding:'8px 10px',borderRadius:8,background:'rgba(255,255,255,0.04)',border:'none'}}>Close</button>
          </div>
        </div>
      )}
      <button onClick={()=>setOpen(true)} style={{background:'var(--accent)',border:'none',color:'#071018',padding:'10px 14px',borderRadius:999}}>Chat</button>
    </div>
  )
}
