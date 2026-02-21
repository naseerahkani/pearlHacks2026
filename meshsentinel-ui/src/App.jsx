import { useState, useEffect, useRef, useCallback } from 'react'
import Header from './components/Header.jsx'
import EventFeed from './components/EventFeed.jsx'
import NetworkGraph from './components/NetworkGraph.jsx'
import PanicButton from './components/PanicButton.jsx'
import Sidebar from './components/Sidebar.jsx'
import PeerManager from './components/PeerManager.jsx'
import Toast from './components/Toast.jsx'

const POLL_INTERVAL = 2000

function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'feed',  label: '📋 Live Alerts'   },
    { id: 'graph', label: '🕸️ Network Graph' },
  ]
  return (
    <div style={styles.tabBar}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{ ...styles.tab, ...(active === t.id ? styles.tabActive : {}) }}
        >
          {t.label}
          {active === t.id && <div style={styles.tabUnderline} />}
        </button>
      ))}
    </div>
  )
}

function App() {
  const [tab, setTab]         = useState('feed')
  const [events, setEvents]   = useState([])
  const [peers, setPeers]     = useState({
    active_connections: 0,
    known_peers: [],
    discovered_peers: [],
    manual_peers: [],
    device_id: '',
    my_ips: [],
  })
  const [toasts, setToasts]           = useState([])
  const [showPeerMgr, setShowPeerMgr] = useState(false)
  const deviceIdRef  = useRef(null)
  const prevEventIds = useRef(new Set())

  useEffect(() => {
    fetch('/api/device')
      .then(r => r.json())
      .then(d => { if (d && d.device_id) deviceIdRef.current = d.device_id })
      .catch(() => {
        deviceIdRef.current = 'DEVICE-' + Math.random().toString(36).slice(2, 10).toUpperCase()
      })
  }, [])

  const addToast = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  const pollEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events')
      if (!res.ok) return
      const data = await res.json()
      if (!Array.isArray(data)) return   // guard: reject if backend returns error object
      setEvents(data)
      const newIds = new Set(data.map(e => e.event_id))
      data.forEach(e => {
        if (!prevEventIds.current.has(e.event_id)) {
          addToast(`🚨 New ${e.type || 'UNKNOWN'} alert — Trust: ${e.trust || 'LOW'}`, 'alert')
        }
      })
      prevEventIds.current = newIds
    } catch { /* backend not reachable yet */ }
  }, [addToast])

  const pollPeers = useCallback(async () => {
    try {
      const res = await fetch('/api/peers')
      if (!res.ok) return
      const data = await res.json()
      if (!data || typeof data !== 'object' || Array.isArray(data)) return
      setPeers(prev => ({ ...prev, ...data }))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    pollEvents()
    pollPeers()
    const t1 = setInterval(pollEvents, POLL_INTERVAL)
    const t2 = setInterval(pollPeers,  POLL_INTERVAL)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [pollEvents, pollPeers])

  const handleBroadcast = async (type, isAuthorized = false, description = '', location = '') => {
    const deviceId = deviceIdRef.current || 'DEVICE-UNKNOWN'
    const payload  = {
      event_id:           crypto.randomUUID(),
      type,
      device_id:          deviceId,
      timestamp:          Math.floor(Date.now() / 1000),
      is_authorized_node: isAuthorized,
      description:        description || '',
      location:           location    || '',
    }
    try {
      const res = await fetch('/api/broadcast', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (res.ok) {
        addToast(`✅ ${type} alert broadcast to mesh`, 'success')
        setTab('graph')
        pollEvents()
      } else {
        addToast('❌ Broadcast failed — is the backend running?', 'error')
      }
    } catch {
      addToast('❌ Cannot reach backend on port 5000', 'error')
    }
  }

  return (
    <div style={styles.root}>
      <Header
        deviceId={peers.device_id || ''}
        connectedPeers={peers.active_connections || 0}
        eventCount={events.length}
        onOpenPeerMgr={() => setShowPeerMgr(true)}
      />

      <div style={styles.body}>
        <main style={styles.main}>
          <TabBar active={tab} onChange={setTab} />
          <div style={styles.tabContent}>
            <div style={{ ...styles.panel, display: tab === 'feed'  ? 'flex' : 'none' }}>
              <EventFeed events={events} onRefresh={pollEvents} />
            </div>
            <div style={{ ...styles.panel, display: tab === 'graph' ? 'flex' : 'none' }}>
              <NetworkGraph />
            </div>
          </div>
        </main>
        <aside style={styles.sidebar}>
          <Sidebar />
        </aside>
      </div>

      <PanicButton onBroadcast={handleBroadcast} />

      {showPeerMgr && (
        <PeerManager
          peers={peers}
          onClose={() => setShowPeerMgr(false)}
          onAddPeer={async (ip) => {
            await fetch('/api/peers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ip }),
            })
            pollPeers()
            addToast(`Added peer: ${ip}`, 'success')
          }}
          onRemovePeer={async (ip) => {
            await fetch(`/api/peers/${ip}`, { method: 'DELETE' })
            pollPeers()
            addToast(`Removed peer: ${ip}`, 'info')
          }}
        />
      )}

      <div style={styles.toastContainer}>
        {toasts.map(t => <Toast key={t.id} msg={t.msg} type={t.type} />)}
      </div>
    </div>
  )
}

const styles = {
  root: {
    display: 'flex', flexDirection: 'column',
    height: '100vh', background: 'var(--bg-primary)', overflow: 'hidden',
  },
  body:    { display: 'flex', flex: 1, overflow: 'hidden' },
  main:    { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tabBar: {
    display: 'flex', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)', flexShrink: 0, paddingLeft: '12px',
  },
  tab: {
    position: 'relative', padding: '12px 20px',
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)',
    transition: 'color 0.15s ease', letterSpacing: '-0.01em',
  },
  tabActive:    { color: 'var(--text-primary)' },
  tabUnderline: {
    position: 'absolute', bottom: '-1px', left: '12px', right: '12px',
    height: '2px', background: 'var(--accent-blue)', borderRadius: '1px',
  },
  tabContent: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  panel:      { flex: 1, overflow: 'hidden', flexDirection: 'column' },
  sidebar: {
    width: '280px', borderLeft: '1px solid var(--border)',
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  toastContainer: {
    position: 'fixed', top: '16px', right: '16px',
    display: 'flex', flexDirection: 'column', gap: '8px',
    zIndex: 9999, pointerEvents: 'none',
  },
}

export default App