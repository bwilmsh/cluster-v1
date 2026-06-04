"use client"

import React, {useState} from 'react'

export default function AuthModal(){
  const [open,setOpen] = useState(false)
  const [mode,setMode] = useState<'signup'|'login'>('signup')

  return (
    <>
      <div style={{display:'flex',gap:8}}>
        <button onClick={()=>{setMode('login'); setOpen(true)}} style={{background:'transparent',border:'none',color:'var(--text-tertiary)'}}>Login</button>
        <button onClick={()=>{setMode('signup'); setOpen(true)}} style={{background:'var(--accent)',border:'none',color:'#071018',padding:'8px 12px',borderRadius:10}}>Sign up</button>
      </div>
      {open && (
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(2,6,10,0.6)',zIndex:90}}>
          <div style={{width:420,background:'var(--bg-secondary)',padding:20,borderRadius:12,border:'1px solid var(--border)',backdropFilter:'blur(6px)'}}>
            <button onClick={()=>setOpen(false)} style={{position:'absolute',right:20,top:20,background:'transparent',border:'none',color:'var(--text-tertiary)',fontSize:20}}>×</button>
            <h3>{mode === 'signup' ? 'Sign up' : 'Login'}</h3>
            <form onSubmit={(e)=>{e.preventDefault(); alert('Demo — auth coming soon'); setOpen(false)}}>
              <input name="email" type="email" placeholder="Email" required style={{width:'100%',padding:10,margin:'8px 0',borderRadius:8,background:'transparent',border:'1px solid rgba(255,255,255,0.04)'}} />
              <input name="password" type="password" placeholder="Password" required style={{width:'100%',padding:10,margin:'8px 0',borderRadius:8,background:'transparent',border:'1px solid rgba(255,255,255,0.04)'}} />
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <button type="submit" style={{padding:10,borderRadius:8,background:'var(--accent)',border:'none'}}>Continue</button>
                <button type="button" onClick={()=>setMode(mode==='signup'?'login':'signup')} style={{background:'transparent',border:'none',color:'var(--text-tertiary)'}}>{mode==='signup'?'Have an account? Login':'Don\'t have an account? Sign up'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
