// Minimal interactive bits and smooth entrance animations
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.card, .feature, .widget, .ai-panel').forEach((el,i)=>{
    el.style.opacity=0;el.style.transform='translateY(8px)';
    setTimeout(()=>{el.style.transition='opacity 420ms ease, transform 420ms ease';el.style.opacity=1;el.style.transform='translateY(0)';},100+ i*80)
  })
})

// Calendar event type mapping and chat bar
document.addEventListener('DOMContentLoaded',()=>{
  // Map data-type attributes to style classes (keeps markup flexible)
  document.querySelectorAll('.calendar .event').forEach(el=>{
    const t = el.getAttribute('data-type') || '';
    // support a 'large' token in the data-type
    if(t.includes('large')) el.classList.add('large');
    // add color classes via attribute prefixes
    if(t.includes('cluster')) el.classList.add('type-cluster');
    if(t.includes('google')) el.classList.add('type-google');
    if(t.includes('goals')) el.classList.add('type-goals');
    if(t.includes('meeting')) el.classList.add('type-meeting');
  })

  // Chat bar interactions
  const chatBar = document.querySelector('.calendar-chatbar')
  if(chatBar){
    const input = chatBar.querySelector('input')
    const send = chatBar.querySelector('button')
    function sendQuery(){
      const q = input.value.trim();
      if(!q) return;
      send.disabled = true; send.textContent = 'Thinking...'
      // placeholder simulated AI response
      setTimeout(()=>{
        alert('AI reply (demo): "I can move events, schedule a goal, or suggest a plan."')
        send.disabled = false; send.textContent = 'Ask AI'
      },900)
    }
    send.addEventListener('click',sendQuery)
    input.addEventListener('keydown',e=>{ if(e.key === 'Enter') sendQuery() })
  }
})

// Chat overlay interactions (limited demo)
document.addEventListener('DOMContentLoaded',()=>{
  const chatOpen = document.getElementById('chat-open')
  const chatOverlay = document.getElementById('chat-overlay')
  const chatClose = document.getElementById('chat-close')

  if(chatOpen && chatOverlay){
    chatOpen.addEventListener('click',()=>{chatOverlay.querySelector('.chat-card').style.display='block'; chatOverlay.setAttribute('aria-hidden','false')})
  }
  if(chatClose){
    chatClose.addEventListener('click',()=>{chatOverlay.querySelector('.chat-card').style.display='none'; chatOverlay.setAttribute('aria-hidden','true')})
  }

  // Auth modal
  const authModal = document.getElementById('auth-modal')
  const signupLink = document.getElementById('signup-link')
  const loginLink = document.getElementById('login-link')
  const authClose = document.getElementById('auth-close')
  const authForm = document.getElementById('auth-form')
  const authTitle = document.getElementById('auth-title')
  const authSwitch = document.getElementById('auth-switch')

  function openAuth(mode){
    authModal.setAttribute('aria-hidden','false')
    authTitle.textContent = mode === 'signup' ? 'Sign up' : 'Login'
    authSwitch.textContent = mode === 'signup' ? 'Have an account? Login' : "Don't have an account? Sign up"
    authForm.querySelector('input[name=password]').style.display = 'block'
  }

  if(signupLink) signupLink.addEventListener('click',(e)=>{e.preventDefault(); openAuth('signup')})
  if(loginLink) loginLink.addEventListener('click',(e)=>{e.preventDefault(); openAuth('login')})
  if(authClose) authClose.addEventListener('click',()=>authModal.setAttribute('aria-hidden','true'))
  if(authSwitch) authSwitch.addEventListener('click',()=>{
    const mode = authTitle.textContent.toLowerCase().includes('sign') ? 'login' : 'signup'
    openAuth(mode)
  })

  if(authForm) authForm.addEventListener('submit',(e)=>{
    e.preventDefault();
    // Placeholder: normally call auth API
    alert('Thanks — this is a demo. Account creation is coming soon.')
    authModal.setAttribute('aria-hidden','true')
  })
})
