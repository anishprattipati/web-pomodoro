import React, { useEffect, useRef, useState } from 'react'

// Default durations (minutes)
const DEFAULT_FOCUS_MIN = 25
const DEFAULT_SHORT_MIN = 5
const DEFAULT_LONG_MIN = 15
const CYCLES_BEFORE_LONG = 4

// Simple WebAudio alarm - short calm tone
function createAlarmPlayer() {
  return {
    unlock() {
      try {
        if (!createAlarmPlayer.ctx) createAlarmPlayer.ctx = new (window.AudioContext || window.webkitAudioContext)()
        return createAlarmPlayer.ctx
      } catch (e) {
        return null
      }
    },
    play() {
      try {
        const audioCtx = createAlarmPlayer.ctx || (createAlarmPlayer.ctx = new (window.AudioContext || window.webkitAudioContext)())
        const o = audioCtx.createOscillator()
        const g = audioCtx.createGain()
        o.type = 'sine'
        o.frequency.value = 620
        o.connect(g)
        g.connect(audioCtx.destination)
        const now = audioCtx.currentTime
        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(0.2, now + 0.02)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1)
        o.start(now)
        o.stop(now + 1.1)
      } catch (e) {
        // ignore
      }
    },
  }
}

const alarm = createAlarmPlayer()

export default function App() {
  // theme: 'dark' | 'light'
  const [theme, setTheme] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('pomodoro-theme') || 'dark') : 'dark')
  // background choice: none | nature | city | mountains | gradient
  const [bgChoice, setBgChoice] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('pomodoro-bg') || 'none') : 'none')

  // Apply theme & background to document element
  useEffect(()=>{
    try{
      if(typeof document !== 'undefined'){
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('pomodoro-theme', theme)
        // map bgChoice to image URL or gradient
        let img = 'none'
        if (bgChoice === 'nature') img = `linear-gradient(rgba(6,12,15,0.45), rgba(6,12,15,0.45)), url("https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&s=1")`
        else if (bgChoice === 'city') img = `linear-gradient(rgba(2,6,12,0.55), rgba(2,6,12,0.55)), url("https://images.unsplash.com/photo-1508057198894-247b23fe5ade?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&s=1")`
        else if (bgChoice === 'mountains') img = `linear-gradient(rgba(6,10,12,0.35), rgba(6,10,12,0.35)), url("https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&s=1")`
        else if (bgChoice === 'gradient') img = `linear-gradient(135deg, rgba(35, 118, 186, 0.18), rgba(255,140,66,0.16))`
        else img = 'none'
        document.documentElement.style.setProperty('--bg-image', img)
        localStorage.setItem('pomodoro-bg', bgChoice)
      }
    }catch(e){}
  },[theme,bgChoice])
  // session: 'focus' | 'short' | 'long'
  const [session, setSession] = useState('focus')
  const [completedFocus, setCompletedFocus] = useState(0)
  const [running, setRunning] = useState(false)
  const [muted, setMuted] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)

  // custom durations (minutes)
  const [focusMin, setFocusMin] = useState(DEFAULT_FOCUS_MIN)
  const [shortMin, setShortMin] = useState(DEFAULT_SHORT_MIN)
  const [longMin, setLongMin] = useState(DEFAULT_LONG_MIN)

  // remaining seconds in current session
  const [remaining, setRemaining] = useState(focusMin * 60)

  // drag/drop audio URL for background loop
  const [bgAudioUrl, setBgAudioUrl] = useState(null)
  const bgAudioRef = useRef(null)

  // optional YouTube background (embed id)
  const [ytUrl, setYtUrl] = useState('')
  const [ytId, setYtId] = useState(null)

  // timestamp in ms when current session should end (when running)
  const endTsRef = useRef(null)
  const tickRef = useRef(null)
  const transitioningRef = useRef(false)
  const originalTitleRef = useRef(typeof document !== 'undefined' ? document.title : '')
  const titleFlashRef = useRef(null)
  const [endedBanner, setEndedBanner] = useState(false)
  const [notifyAllowed, setNotifyAllowed] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')

  // Initialize remaining whenever session or durations change
  useEffect(() => {
    if (session === 'focus') setRemaining(focusMin * 60)
    else if (session === 'short') setRemaining(shortMin * 60)
    else setRemaining(longMin * 60)
    transitioningRef.current = false
  }, [session, focusMin, shortMin, longMin])

  // Unlock audio on first user interaction (to satisfy autoplay policies)
  useEffect(() => {
    function handler() {
      try { alarm.unlock() } catch (e) {}
      if (bgAudioRef.current) {
        // attempt to resume background audio if user previously dropped a file
        try { bgAudioRef.current.play().catch(()=>{}) } catch {}
      }
      // request notification permission on first user gesture
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission().then(p => setNotifyAllowed(p))
        } else if (typeof Notification !== 'undefined') {
          setNotifyAllowed(Notification.permission)
        }
      } catch (e) {}
      // stop any flashing when user interacts
      stopTitleFlash()
      window.removeEventListener('pointerdown', handler)
      window.removeEventListener('keydown', handler)
    }
    window.addEventListener('pointerdown', handler)
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('pointerdown', handler)
      window.removeEventListener('keydown', handler)
    }
  }, [])

  // Start or resume: set end timestamp
  function startOrResume() {
    if (!running) {
      setHasStarted(true)
      endTsRef.current = Date.now() + remaining * 1000
      setRunning(true)
    }
  }

  // stop title flashing and visual banner
  function stopTitleFlash() {
    try {
      if (titleFlashRef.current) {
        clearInterval(titleFlashRef.current)
        titleFlashRef.current = null
      }
      if (typeof document !== 'undefined') document.title = originalTitleRef.current
    } catch (e) {}
    setEndedBanner(false)
  }

  // Pause: compute remaining and clear end timestamp
  function pause() {
    if (running) {
      const rem = Math.max(0, Math.round((endTsRef.current - Date.now()) / 1000))
      setRemaining(rem)
      endTsRef.current = null
      setRunning(false)
    }
  }

  function toggleRunning() {
    if (running) pause(); else startOrResume()
  }

  // Skip to next session
  function skipSession() {
    pause()
    stopTitleFlash()
    setTimeout(() => {
      setCompletedFocus((c) => {
        if (session === 'focus') {
          const next = c + 1
          const nextIsLong = next % CYCLES_BEFORE_LONG === 0
          setSession(nextIsLong ? 'long' : 'short')
          return next
        } else {
          setSession('focus')
          return c
        }
      })
    }, 10)
  }

  // Core ticking loop - timestamp-based accuracy
  useEffect(() => {
    function tick() {
      if (running && endTsRef.current) {
        const rem = Math.max(0, Math.round((endTsRef.current - Date.now()) / 1000))
        setRemaining(rem)
        if (rem <= 0 && !transitioningRef.current) {
          transitioningRef.current = true
          handleSessionEnd()
        }
      }
      tickRef.current = window.setTimeout(tick, 250)
    }
    tickRef.current = window.setTimeout(tick, 250)
    return () => {
      if (tickRef.current) window.clearTimeout(tickRef.current)
    }
  }, [running])

  function handleSessionEnd() {
    // Play alarm once per end
    if (!muted) {
      // if user provided background audio, we don't want to double-play it as alarm
      if (!bgAudioUrl) alarm.play()
      else {
        // if background audio is present and not muted, optionally briefly raise gain - keep simple: do nothing
      }
    }

    // Visual indicator and notifications
    setEndedBanner(true)
    // Title flashing
    if (!titleFlashRef.current) {
      let show = false
      const label = session === 'focus' ? 'Focus session complete' : 'Break finished'
      titleFlashRef.current = setInterval(() => {
        try { document.title = show ? `⏰ ${label}` : originalTitleRef.current } catch (e) {}
        show = !show
      }, 1000)
      // stop after 12s
      setTimeout(() => stopTitleFlash(), 12000)
    }

    // Browser notification
    try {
      if (typeof Notification !== 'undefined' && notifyAllowed === 'granted') {
        // show a single notification
        new Notification('Pomodoro', { body: session === 'focus' ? 'Focus session complete' : 'Break finished' })
      }
    } catch (e) {}

    // Deterministic transition: update completedFocus and session in a single update
    setTimeout(() => {
      setCompletedFocus((c) => {
        if (session === 'focus') {
          const next = c + 1
          const nextIsLong = next % CYCLES_BEFORE_LONG === 0
          setSession(nextIsLong ? 'long' : 'short')
          return next
        } else {
          setSession('focus')
          return c
        }
      })

      // prepare next session to start automatically
      setTimeout(() => {
        // set remaining based on new session (effect will handle if not running)
        let nextDur = focusMin
        if (session === 'focus') nextDur = ( (completedFocus + 1) % CYCLES_BEFORE_LONG === 0 ) ? longMin : shortMin
        else nextDur = focusMin
        endTsRef.current = Date.now() + nextDur * 60 * 1000
        setRunning(true)
      }, 20)
    }, 50)
  }

  // Drag and drop handlers for mp3/background audio
  function onDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
    if (f && f.type.startsWith('audio/')) {
      const url = URL.createObjectURL(f)
      setBgAudioUrl(url)
      // set up audio element
      try {
        if (bgAudioRef.current) {
          bgAudioRef.current.src = url
          bgAudioRef.current.loop = true
          bgAudioRef.current.play().catch(()=>{})
        }
      } catch (e) {}
    }
  }

  function onDragOver(e) { e.preventDefault(); }

  // Allow clearing uploaded background audio
  function clearBgAudio() {
    if (bgAudioRef.current) {
      bgAudioRef.current.pause()
      bgAudioRef.current.src = ''
    }
    if (bgAudioUrl) URL.revokeObjectURL(bgAudioUrl)
    setBgAudioUrl(null)
  }

  // Parse YouTube ID from URL
  function parseYtId(url) {
    try {
      const u = new URL(url)
      if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
      if (u.hostname === 'youtu.be') return u.pathname.slice(1)
    } catch (e) {}
    return null
  }

  function loadYt() {
    const id = parseYtId(ytUrl)
    setYtId(id)
  }

  // Compute friendly labels
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0')
  const seconds = String(remaining % 60).padStart(2, '0')

  const roundsCompletedInCycle = completedFocus % CYCLES_BEFORE_LONG
  const currentCycle = roundsCompletedInCycle + 1
  const sessionsUntilLong = CYCLES_BEFORE_LONG - roundsCompletedInCycle

  // Choose color per session (darker accents for visibility on dark background)
  const bgColor = 'var(--page-bg)'
  const accent = session === 'focus' ? 'var(--accent-focus)' : session === 'short' ? 'var(--accent-short)' : 'var(--accent-long)'

  // Build background style based on selection
  const bgStyle = {}
  if (bgChoice === 'nature') bgStyle.backgroundImage = `linear-gradient(rgba(6,12,15,0.45), rgba(6,12,15,0.45)), url("https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&s=1")`
  else if (bgChoice === 'city') bgStyle.backgroundImage = `linear-gradient(rgba(20,20,40,0.5), rgba(20,20,40,0.5)), url("https://images.unsplash.com/photo-1449824913935-59a10b8d2000?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&s=1")`
  else if (bgChoice === 'mountains') bgStyle.backgroundImage = `linear-gradient(rgba(6,10,12,0.35), rgba(6,10,12,0.35)), url("https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&s=1")`
  else if (bgChoice === 'gradient') bgStyle.backgroundImage = `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
  else bgStyle.backgroundImage = 'none'

  return (
    <>
      <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',...bgStyle,backgroundSize:'cover',backgroundPosition:'center',backgroundRepeat:'no-repeat',backgroundAttachment:'fixed',zIndex:-1}} id="bg-layer"></div>
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:bgChoice==='none'?'var(--page-bg)':'transparent',padding:24}} onClick={()=>{ if(endedBanner) stopTitleFlash() }}>
      <div style={{width:480,maxWidth:'100%',textAlign:'center',background:'var(--card-bg)',borderRadius:12,padding:20,boxShadow:'0 8px 30px rgba(0,0,0,0.6)'}}>
        {endedBanner ? (
          <div className="ended-banner">Session ended — click anywhere to dismiss or press Start to continue</div>
        ) : null}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <div style={{color:accent,fontWeight:700,letterSpacing:0.6}}>
            {session === 'focus' ? 'Focus' : session === 'short' ? 'Short Break' : 'Long Break'}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{fontSize:12,color:'var(--muted)'}}>Cycle {currentCycle} of {CYCLES_BEFORE_LONG}</div>
            <button onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} style={{padding:'6px 8px',borderRadius:8,border:'1px solid var(--input-border)',background:'transparent',color:'var(--text)'}} title="Toggle theme">{theme==='dark'?'🌙':'☀️'}</button>
          </div>
        </div>

        <div style={{fontSize:72,fontVariantNumeric:'tabular-nums',margin:'12px 0'}}>{minutes}:{seconds}</div>

        <div style={{display:'flex',gap:12,justifyContent:'center',alignItems:'center',marginBottom:12}}>
          <button onClick={toggleRunning} style={{padding:'10px 18px',borderRadius:8,border:'none',background:accent,color:'#071017',fontWeight:700}}>
            {running ? 'Pause' : (hasStarted ? 'Continue' : 'Start')}
          </button>

          <button onClick={() => { setMuted((m)=>!m) }} aria-pressed={muted} style={{padding:'10px 12px',borderRadius:8,border:'1px solid var(--input-border)',background:'transparent',color:'var(--text)'}} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔔'}
          </button>

          {session !== 'focus' ? (
            <button onClick={skipSession} style={{padding:'10px 12px',borderRadius:8,border:'1px solid var(--input-border)',background:'transparent',color:'var(--text)'}}>
              Skip
            </button>
          ) : null}
        </div>

        <div style={{display:'flex',gap:12,justifyContent:'center',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:13,color:'var(--muted)'}}>Focus sessions until long break: {sessionsUntilLong}</div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:8,alignItems:'center'}}>
          <label style={{fontSize:12,color:'#666'}}>Focus (min)
            <input type="number" min={1} max={180} value={focusMin} onChange={(e)=>{const v=Math.max(1,Math.min(180,Number(e.target.value)||1)); setFocusMin(v); if(!running && session==='focus') setRemaining(v*60)}} style={{width:'100%',padding:6,marginTop:6}} />
          </label>
          <label style={{fontSize:12,color:'#666'}}>Short (min)
            <input type="number" min={1} max={60} value={shortMin} onChange={(e)=>{const v=Math.max(1,Math.min(60,Number(e.target.value)||1)); setShortMin(v); if(!running && session==='short') setRemaining(v*60)}} style={{width:'100%',padding:6,marginTop:6}} />
          </label>
          <label style={{fontSize:12,color:'#666'}}>Long (min)
            <input type="number" min={1} max={60} value={longMin} onChange={(e)=>{const v=Math.max(1,Math.min(60,Number(e.target.value)||1)); setLongMin(v); if(!running && session==='long') setRemaining(v*60)}} style={{width:'100%',padding:6,marginTop:6}} />
          </label>
        </div>

        <div style={{marginTop:12,textAlign:'left'}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Appearance</div>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
            <label style={{fontSize:13,color:'var(--muted)',minWidth:90}}>Background</label>
            <select value={bgChoice} onChange={(e)=>setBgChoice(e.target.value)} style={{padding:8,background:'var(--input-bg)',border:'1px solid var(--input-border)',color:'var(--text)'}}>
              <option value="none">None</option>
              <option value="nature">Nature (soft)</option>
              <option value="city">City (night)</option>
              <option value="mountains">Mountains</option>
              <option value="gradient">Subtle gradient</option>
            </select>
            <button onClick={()=>{ setBgChoice('none') }} style={{padding:'8px 10px',marginLeft:6}}>Clear</button>
          </div>
        </div>

        <div style={{marginTop:12,textAlign:'left'}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Background Audio (drag & drop an MP3)</div>
          <div onDrop={onDrop} onDragOver={onDragOver} style={{border:'1px dashed var(--input-border)',borderRadius:8,padding:12,minHeight:56,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <div style={{color:'var(--muted)'}}>Drop an audio file here to play as background (will loop)</div>
            <div style={{display:'flex',gap:8}}>
              {bgAudioUrl ? <button onClick={clearBgAudio} style={{padding:'6px 10px'}}>Clear</button> : null}
            </div>
          </div>
          {bgAudioUrl ? (
            <audio ref={bgAudioRef} src={bgAudioUrl} controls loop style={{width:'100%',marginTop:8}} />
          ) : (
            <div style={{fontSize:12,color:'var(--muted)',marginTop:8}}>No background audio loaded.</div>
          )}
        </div>

        <div style={{marginTop:12,textAlign:'left'}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>YouTube background (optional)</div>
          <div style={{display:'flex',gap:8}}>
            <input placeholder="https://youtube.com/watch?v=..." value={ytUrl} onChange={(e)=>setYtUrl(e.target.value)} style={{flex:1,padding:8,background:'var(--input-bg)',border:'1px solid var(--input-border)',color:'var(--text)'}} />
            <button onClick={loadYt} style={{padding:'8px 12px',background:'transparent',border:'1px solid var(--input-border)',color:'var(--text)'}}>Load</button>
          </div>
          {ytId ? (
            <div style={{marginTop:8}}>
              <div style={{fontSize:12,color:'#666',marginBottom:6}}>You must press play in the player due to browser autoplay rules.</div>
              <div style={{position:'relative',paddingTop:'56%'}}>
                <iframe title="yt-bg" src={`https://www.youtube.com/embed/${ytId}`} style={{position:'absolute',left:0,top:0,width:'100%',height:'100%'}} allow="autoplay; encrypted-media" />
              </div>
            </div>
          ) : null}
        </div>

        <div style={{height:8,background:'#071018',borderRadius:6,overflow:'hidden',marginTop:18}}>
          <div style={{height:'100%',width:`${Math.min(100, Math.round(((CYCLES_BEFORE_LONG - sessionsUntilLong) / CYCLES_BEFORE_LONG) * 100))}%`,background:accent}} />
        </div>

        <div style={{marginTop:12,fontSize:12,color:'var(--muted)'}}>Minimal Pomodoro — timestamp-driven for accuracy. Drag an MP3 to play background loop.</div>

      </div>
      </div>
    </>
  )
}
