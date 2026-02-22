import { useEffect, useRef, useState, useCallback } from 'react'

const POLL_MS = 1500

const TYPE_META = {
  FIRE:     { color: '#f97316', bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.5)',  icon: '🔥', label: 'Fire'     },
  MEDICAL:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.5)',  icon: '🚑', label: 'Medical'  },
  SECURITY: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.5)',  icon: '🚨', label: 'Security' },
  MIXED:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.5)',  icon: '⚠️', label: 'Mixed'    },
  UNKNOWN:  { color: '#6b7280', bg: 'rgba(107,114,128,0.15)', border: 'rgba(107,114,128,0.5)', icon: '📡', label: 'Alert'    },
}

const TRUST_COLOR  = { HIGH: '#10b981', MEDIUM: '#f59e0b', LOW: '#ef4444' }
const TRUST_GLOW   = { HIGH: 'rgba(16,185,129,0.3)', MEDIUM: 'rgba(245,158,11,0.2)', LOW: 'rgba(239,68,68,0.15)' }

const SELF_R  = 36
const NODE_R  = 30
const MULTI_R = 34   // node that has sent multiple alert types

// ── Derive per-device alert info from edges + events ──────────────────────
function buildDeviceAlertMap(nodes, edges, events) {
  // device_id → { types: Set, eventIds: [], trust: highest }
  const map = {}
  nodes.forEach(n => {
    map[n.id] = { types: new Set(), eventIds: [], trust: 'LOW', descriptions: [], locations: [] }
  })
  edges.forEach(e => {
    const meta = events[e.event_id]
    if (!meta) return
    const deviceId = e.from
    if (!map[deviceId]) return
    map[deviceId].types.add(meta.type || 'UNKNOWN')
    if (!map[deviceId].eventIds.includes(e.event_id)) {
      map[deviceId].eventIds.push(e.event_id)
    }
    // Track highest trust
    const order = { HIGH: 3, MEDIUM: 2, LOW: 1 }
    if ((order[meta.trust] || 0) > (order[map[deviceId].trust] || 0)) {
      map[deviceId].trust = meta.trust
    }
  })
  return map
}

// ── Layout: self center, peers in a ring with jitter ──────────────────────
// We don't have real GPS coords so we use a stable deterministic layout:
// each peer gets a position based on its index + a consistent hash offset
// to give the impression of spatial spread rather than a perfect circle.
function computeLayout(nodes, width, height) {
  const cx = width  / 2
  const cy = height / 2
  const selfNode   = nodes.find(n => n.is_self)
  const peerNodes  = nodes.filter(n => !n.is_self)
  const positions  = {}

  if (selfNode) positions[selfNode.id] = { x: cx, y: cy }

  const baseR = Math.min(width, height) * 0.30

  peerNodes.forEach((n, i) => {
    // Stable hash from device id string for jitter
    let hash = 0
    for (let c = 0; c < n.id.length; c++) hash = (hash * 31 + n.id.charCodeAt(c)) & 0xffff
    const jitterR = baseR + ((hash % 60) - 30)          // ±30px radius jitter
    const jitterA = ((hash >> 4) % 30) * (Math.PI / 180) // ±15° angle jitter
    const angle   = (2 * Math.PI * i) / peerNodes.length - Math.PI / 2 + jitterA
    positions[n.id] = {
      x: cx + jitterR * Math.cos(angle),
      y: cy + jitterR * Math.sin(angle),
    }
  })

  return positions
}

// ── Packet animation ───────────────────────────────────────────────────────
class PacketAnim {
  constructor(from, to, color) {
    this.from = from; this.to = to; this.color = color
    this.progress = 0; this.speed = 0.016 + Math.random() * 0.01
    this.done = false
  }
  update() {
    this.progress += this.speed
    if (this.progress >= 1) { this.progress = 1; this.done = true }
  }
  pos() {
    const t = this.progress
    return { x: this.from.x + (this.to.x - this.from.x) * t,
             y: this.from.y + (this.to.y - this.from.y) * t }
  }
}

// ── HTML Tooltip component ─────────────────────────────────────────────────
function NodeTooltip({ node, deviceAlerts, events, allNodes, x, y, canvasW }) {
  if (!node) return null
  const alerts   = deviceAlerts[node.id] || { types: new Set(), eventIds: [], trust: 'LOW' }
  const typeList = [...alerts.types]
  const primary  = TYPE_META[typeList[0]] || TYPE_META.UNKNOWN
  const trust    = alerts.trust || 'LOW'

  // Clamp so tooltip doesn't go off screen
  const style = {
    position: 'fixed',
    left:  Math.min(x + 14, canvasW - 280),
    top:   Math.max(y - 10, 8),
    zIndex: 9999,
    pointerEvents: 'none',
    width: '260px',
  }

  const nodeEvents = alerts.eventIds.map(id => events[id]).filter(Boolean)

  return (
    <div style={style}>
      <div style={{
        background: 'rgba(10,16,30,0.97)',
        border: `1px solid ${primary.border}`,
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)`,
      }}>
        {/* Header */}
        <div style={{
          background: primary.bg,
          borderBottom: `1px solid ${primary.border}`,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ fontSize: '20px' }}>{primary.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
              {node.is_self ? 'This Device (You)' : `Device · ${node.label}`}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '2px', fontFamily: 'monospace' }}>
              {node.ip || 'IP unknown'}
            </div>
          </div>
          {/* Trust badge */}
          <div style={{
            padding: '3px 8px', borderRadius: '20px', fontSize: '9px', fontWeight: 700,
            background: TRUST_GLOW[trust], color: TRUST_COLOR[trust],
            border: `1px solid ${TRUST_COLOR[trust]}40`,
            fontFamily: 'monospace', letterSpacing: '0.06em',
          }}>
            {trust}
          </div>
        </div>

        {/* Alert type pills */}
        {typeList.length > 0 && (
          <div style={{ padding: '8px 14px', display: 'flex', gap: '6px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {typeList.map(t => {
              const m = TYPE_META[t] || TYPE_META.UNKNOWN
              return (
                <span key={t} style={{
                  background: m.bg, border: `1px solid ${m.border}`,
                  color: m.color, fontSize: '10px', fontWeight: 700,
                  padding: '2px 8px', borderRadius: '20px', fontFamily: 'monospace',
                }}>
                  {m.icon} {t}
                </span>
              )
            })}
          </div>
        )}

        {/* Per-event mini cards */}
        {nodeEvents.length > 0 ? (
          <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: '2px' }}>
              ALERTS FROM THIS DEVICE
            </div>
            {nodeEvents.map((ev, i) => {
              const m = TYPE_META[ev.type] || TYPE_META.UNKNOWN
              return (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid rgba(255,255,255,0.07)`,
                  borderLeft: `3px solid ${m.color}`,
                  borderRadius: '6px', padding: '7px 10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: ev.description ? '4px' : 0 }}>
                    <span style={{ fontSize: '12px' }}>{m.icon}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: m.color }}>{ev.type}</span>
                    <span style={{ fontSize: '9px', color: TRUST_COLOR[ev.trust], fontFamily: 'monospace', marginLeft: 'auto' }}>
                      {ev.trust}
                    </span>
                  </div>
                  {ev.description && (
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', lineHeight: 1.4 }}>
                      "{ev.description}"
                    </div>
                  )}
                  {ev.location && (
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>
                      📍 {ev.location}
                    </div>
                  )}
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', marginTop: '4px' }}>
                    {ev.devices_reached} devices · {ev.cross_checks} checks
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: '10px 14px', fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
            {node.is_self ? 'No alerts sent yet from this device' : 'Relay node — no originating alerts'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function NetworkGraph() {
  const canvasRef = useRef(null)
  const stateRef  = useRef({
    nodes: [], edges: [], events: {}, selfId: '',
    positions: {}, animations: [], lastEdgeKeys: new Set(),
    deviceAlerts: {}, width: 0, height: 0,
  })
  const rafRef = useRef(null)

  const [stats, setStats]         = useState({ nodes: 0, edges: 0, events: 0 })
  const [selectedEvent, setSelectedEvent] = useState('ALL')
  const [eventList, setEventList] = useState([])
  const [tooltip, setTooltip]     = useState(null)   // { node, x, y }

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchGraph = useCallback(async () => {
    try {
      const url  = selectedEvent !== 'ALL' ? `/api/hops?event_id=${selectedEvent}` : '/api/hops'
      const res  = await fetch(url)
      const data = await res.json()
      const s    = stateRef.current

      // Fetch full event details for tooltip cards
      let fullEvents = {}
      try {
        const evRes  = await fetch('/api/events')
        const evData = await evRes.json()
        if (Array.isArray(evData)) {
          evData.forEach(e => { fullEvents[e.event_id] = e })
        }
      } catch { /* ignore */ }

      // Detect new edges → spawn packet animations
      const newEdgeKeys = new Set(data.edges.map(e => `${e.from}|${e.to}|${e.event_id}`))
      data.edges.forEach(edge => {
        const key = `${edge.from}|${edge.to}|${edge.event_id}`
        if (!s.lastEdgeKeys.has(key)) {
          const fp = s.positions[edge.from]
          const tp = s.positions[edge.to]
          if (fp && tp) {
            const color = TYPE_META[data.events[edge.event_id]?.type]?.color || '#3b82f6'
            s.animations.push(new PacketAnim(fp, tp, color))
          }
        }
      })
      s.lastEdgeKeys = newEdgeKeys

      // Deduplicate nodes — PEER@ip nodes that also appear as DEVICE-xxx should be collapsed
      // Keep only DEVICE-xxx nodes; drop PEER@ip if a real device node has the same IP
      const realIps = new Set(data.nodes.filter(n => n.id.startsWith('DEVICE-')).map(n => n.ip).filter(Boolean))
      const dedupedNodes = data.nodes.filter(n => {
        if (n.id.startsWith('PEER@')) {
          return !realIps.has(n.ip)   // drop PEER@ if we have a real DEVICE node for same IP
        }
        return true
      })

      if (dedupedNodes.length !== s.nodes.length) {
        s.positions = computeLayout(dedupedNodes, s.width, s.height)
      }

      s.nodes        = dedupedNodes
      s.edges        = data.edges
      s.events       = { ...data.events, ...fullEvents }   // merge hop meta with full detail
      s.selfId       = data.self_id
      s.deviceAlerts = buildDeviceAlertMap(dedupedNodes, data.edges, s.events)
      s.animations   = s.animations.filter(a => !a.done).slice(-40)

      setStats({ nodes: dedupedNodes.length, edges: data.edges.length, events: Object.keys(data.events).length })
      setEventList(Object.entries(data.events).map(([id, meta]) => ({ id, ...meta })))
    } catch { /* backend not ready */ }
  }, [selectedEvent])

  useEffect(() => {
    fetchGraph()
    const t = setInterval(fetchGraph, POLL_MS)
    return () => clearInterval(t)
  }, [fetchGraph])

  // ── Canvas render loop ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')

    const resize = () => {
      const rect    = canvas.parentElement.getBoundingClientRect()
      canvas.width  = rect.width
      canvas.height = rect.height
      const s = stateRef.current
      s.width  = rect.width
      s.height = rect.height
      if (s.nodes.length) s.positions = computeLayout(s.nodes, s.width, s.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)

    const draw = () => {
      const s = stateRef.current
      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // ── Grid dots background ──
      ctx.fillStyle = 'rgba(255,255,255,0.025)'
      for (let gx = 20; gx < W; gx += 40) {
        for (let gy = 20; gy < H; gy += 40) {
          ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill()
        }
      }

      if (s.nodes.length === 0) {
        ctx.fillStyle  = 'rgba(100,130,180,0.4)'
        ctx.font       = '14px monospace'
        ctx.textAlign  = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('Waiting for mesh peers…', W / 2, H / 2 - 10)
        ctx.font       = '11px monospace'
        ctx.fillStyle  = 'rgba(100,130,180,0.2)'
        ctx.fillText('Nodes appear as devices join', W / 2, H / 2 + 14)
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const pos = s.positions

      // ── Edges ──
      s.edges.forEach(edge => {
        const fp = pos[edge.from]; const tp = pos[edge.to]
        if (!fp || !tp) return
        const meta  = s.events[edge.event_id] || {}
        const color = TYPE_META[meta.type]?.color || '#3b82f6'
        const trust = meta.trust || 'LOW'
        const alpha = trust === 'HIGH' ? 0.65 : trust === 'MEDIUM' ? 0.45 : 0.25

        ctx.beginPath(); ctx.moveTo(fp.x, fp.y); ctx.lineTo(tp.x, tp.y)
        ctx.strokeStyle = color
        ctx.globalAlpha = alpha
        ctx.lineWidth   = trust === 'HIGH' ? 2.5 : trust === 'MEDIUM' ? 1.8 : 1.2
        ctx.setLineDash(trust === 'LOW' ? [5, 5] : [])
        ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1

        // Arrowhead
        const ang = Math.atan2(tp.y - fp.y, tp.x - fp.x)
        const r2  = (pos[edge.to] ? (s.nodes.find(n => n.id === edge.to)?.is_self ? SELF_R : NODE_R) : NODE_R) + 5
        const ax  = tp.x - r2 * Math.cos(ang), ay = tp.y - r2 * Math.sin(ang)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(ax - 9 * Math.cos(ang - 0.4), ay - 9 * Math.sin(ang - 0.4))
        ctx.lineTo(ax - 9 * Math.cos(ang + 0.4), ay - 9 * Math.sin(ang + 0.4))
        ctx.closePath()
        ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.fill(); ctx.globalAlpha = 1

        // Hop label on edge midpoint
        const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2
        ctx.fillStyle    = 'rgba(120,150,200,0.6)'
        ctx.font         = '9px monospace'
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`hop ${edge.hop}`, mx, my - 7)
      })

      // ── Packet animations ──
      s.animations.forEach(anim => {
        anim.update()
        const p   = anim.pos()
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10)
        grd.addColorStop(0, anim.color); grd.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
        ctx.fillStyle = grd; ctx.globalAlpha = 0.8 - anim.progress * 0.4
        ctx.fill(); ctx.globalAlpha = 1
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'; ctx.fill()
      })

      // ── Nodes ──
      s.nodes.forEach(node => {
        const p = pos[node.id]; if (!p) return
        const isSelf   = node.is_self
        const r        = isSelf ? SELF_R : NODE_R
        const dalerts  = s.deviceAlerts[node.id] || { types: new Set(), trust: 'LOW' }
        const types    = [...dalerts.types]
        const primary  = TYPE_META[types[0]] || TYPE_META.UNKNOWN
        const trust    = dalerts.trust || 'LOW'
        const hasAlerts = types.length > 0

        // Outer glow ring (colored by alert type or blue for self)
        const glowColor = isSelf ? 'rgba(59,130,246,0.2)' : hasAlerts ? TRUST_GLOW[trust] : 'rgba(30,45,71,0.3)'
        const grd = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 2.2)
        grd.addColorStop(0, glowColor); grd.addColorStop(1, 'transparent')
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2)
        ctx.fillStyle = grd; ctx.fill()

        // Node fill
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = hasAlerts && !isSelf ? primary.bg : isSelf ? 'rgba(30,60,120,0.6)' : 'rgba(20,30,50,0.8)'
        ctx.fill()

        // Node border — color coded by trust/type
        ctx.strokeStyle = isSelf ? '#3b82f6' : hasAlerts ? primary.color : '#2a3f60'
        ctx.lineWidth   = isSelf ? 2.5 : hasAlerts ? 2 : 1.5
        ctx.stroke()

        // Trust ring (outer ring showing trust level)
        if (hasAlerts && !isSelf) {
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = TRUST_COLOR[trust]
          ctx.lineWidth   = 1.5
          ctx.globalAlpha = 0.5
          ctx.stroke(); ctx.globalAlpha = 1
        }

        // Emoji icon centered in node
        ctx.font         = `${isSelf ? 18 : 16}px sans-serif`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(isSelf ? '📡' : hasAlerts ? primary.icon : '◈', p.x, p.y - 2)

        // Multi-type indicator — small stacked dots if >1 type
        if (types.length > 1) {
          types.slice(1, 3).forEach((t, ti) => {
            const m = TYPE_META[t] || TYPE_META.UNKNOWN
            ctx.beginPath(); ctx.arc(p.x + r - 5 + ti * 10, p.y - r + 5, 5, 0, Math.PI * 2)
            ctx.fillStyle = m.color; ctx.fill()
            ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke()
          })
        }

        // Label below node
        ctx.fillStyle    = isSelf ? '#93c5fd' : hasAlerts ? primary.color : '#4a6080'
        ctx.font         = `${isSelf ? '700' : '600'} 11px monospace`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(isSelf ? 'YOU' : node.label, p.x, p.y + r + 15)

        // Alert summary line below label
        if (hasAlerts) {
          const summary = types.join(' + ')
          ctx.fillStyle    = 'rgba(180,200,230,0.5)'
          ctx.font         = '9px monospace'
          ctx.fillText(summary, p.x, p.y + r + 27)
        }

        // IP in small text
        if (node.ip && isSelf) {
          ctx.fillStyle = 'rgba(100,140,200,0.4)'
          ctx.font      = '9px monospace'
          ctx.fillText(node.ip, p.x, p.y + r + 38)
        }
      })

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect() }
  }, [])

  // ── Mouse hover ─────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect   = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const s  = stateRef.current
    let found = null
    for (const node of s.nodes) {
      const p = s.positions[node.id]; if (!p) continue
      const r = node.is_self ? SELF_R + 8 : NODE_R + 8
      if (Math.hypot(mx - p.x, my - p.y) <= r) { found = node; break }
    }
    if (found) {
      setTooltip({ node: found, x: e.clientX, y: e.clientY })
    } else {
      setTooltip(null)
    }
  }, [])

  const canvasParentRef = useRef(null)

  return (
    <div style={styles.root}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.title}>Mesh Network</span>
          <span style={styles.liveTag}>● LIVE</span>
        </div>
        <div style={styles.stats}>
          {[
            { n: stats.nodes,  l: 'devices'      },
            { n: stats.edges,  l: 'relay edges'  },
            { n: stats.events, l: 'active alerts' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {i > 0 && <div style={styles.statDivider}/>}
              <div style={styles.stat}>
                <span style={styles.statN}>{s.n}</span>
                <span style={styles.statL}>{s.l}</span>
              </div>
            </div>
          ))}
        </div>
        {eventList.length > 0 && (
          <select value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} style={styles.select}>
            <option value="ALL">All Events</option>
            {eventList.map(ev => (
              <option key={ev.id} value={ev.id}>
                {TYPE_META[ev.type]?.icon || '⚠️'} {ev.type} — {ev.trust} trust
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Canvas area */}
      <div
        ref={canvasParentRef}
        style={styles.canvasWrapper}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <canvas ref={canvasRef} style={styles.canvas} />

        {/* Legend */}
        <div style={styles.legend}>
          <div style={styles.legendTitle}>NODES</div>
          {[
            { icon: '📡', color: '#3b82f6', label: 'This device (YOU)' },
            { icon: '🔥', color: '#f97316', label: 'Fire alert origin'  },
            { icon: '🚑', color: '#3b82f6', label: 'Medical alert'      },
            { icon: '🚨', color: '#8b5cf6', label: 'Security alert'     },
            { icon: '◈',  color: '#4a6080', label: 'Relay only (no alert)' },
          ].map(l => (
            <div key={l.label} style={styles.legendRow}>
              <span style={{ fontSize: '12px', width: '16px', textAlign: 'center' }}>{l.icon}</span>
              <span style={{ fontSize: '10px', color: l.color }}>{l.label}</span>
            </div>
          ))}
          <div style={{ ...styles.legendTitle, marginTop: '10px' }}>TRUST RINGS</div>
          {[
            { color: '#10b981', label: 'HIGH — solid glow'    },
            { color: '#f59e0b', label: 'MEDIUM — amber ring'  },
            { color: '#ef4444', label: 'LOW — red ring'       },
          ].map(l => (
            <div key={l.label} style={styles.legendRow}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', border: `2px solid ${l.color}`, flexShrink: 0 }}/>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{l.label}</span>
            </div>
          ))}
          <div style={{ ...styles.legendTitle, marginTop: '10px' }}>EDGES</div>
          {[
            { color: '#10b981', dash: false, label: 'HIGH trust'    },
            { color: '#f59e0b', dash: true,  label: 'MEDIUM trust'  },
            { color: '#ef4444', dash: true,  label: 'LOW trust'     },
          ].map(l => (
            <div key={l.label} style={styles.legendRow}>
              <svg width="24" height="10" style={{ flexShrink: 0 }}>
                <line x1="0" y1="5" x2="24" y2="5"
                  stroke={l.color} strokeWidth="2"
                  strokeDasharray={l.dash ? '4 3' : 'none'}/>
              </svg>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{l.label}</span>
            </div>
          ))}
        </div>

        {/* Hover hint */}
        <div style={styles.hoverHint}>
          <span style={{ fontSize: '11px', color: 'rgba(120,150,200,0.5)' }}>
            Hover a node to see device info & alert details
          </span>
        </div>

        {/* Packet legend */}
        <div style={styles.packetHint}>
          <div style={styles.packetDot}/>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>● animated dots = live relay</span>
        </div>
      </div>

      {/* Rich tooltip */}
      {tooltip && (
        <NodeTooltip
          node={tooltip.node}
          deviceAlerts={stateRef.current.deviceAlerts}
          events={stateRef.current.events}
          allNodes={stateRef.current.nodes}
          x={tooltip.x}
          y={tooltip.y}
          canvasW={typeof window !== 'undefined' ? window.innerWidth : 1200}
        />
      )}
    </div>
  )
}

const styles = {
  root:         { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-primary)' },
  toolbar:      { display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0, flexWrap: 'wrap' },
  toolbarLeft:  { display: 'flex', alignItems: 'center', gap: '10px', marginRight: 'auto' },
  title:        { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  liveTag:      { fontSize: '10px', fontWeight: 700, color: '#10b981', letterSpacing: '0.08em' },
  stats:        { display: 'flex', alignItems: 'center', gap: '0px' },
  stat:         { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' },
  statN:        { fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace', lineHeight: 1 },
  statL:        { fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.06em' },
  statDivider:  { width: '1px', height: '24px', background: 'var(--border)', margin: '0 12px' },
  select:       { padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font)', cursor: 'pointer', outline: 'none' },
  canvasWrapper:{ flex: 1, position: 'relative', overflow: 'hidden' },
  canvas:       { display: 'block', width: '100%', height: '100%' },
  legend:       { position: 'absolute', top: '16px', left: '16px', background: 'rgba(8,14,26,0.92)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '5px', backdropFilter: 'blur(10px)' },
  legendTitle:  { fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: '3px' },
  legendRow:    { display: 'flex', alignItems: 'center', gap: '8px' },
  hoverHint:    { position: 'absolute', top: '16px', right: '16px', background: 'rgba(8,14,26,0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '6px 12px', backdropFilter: 'blur(8px)' },
  packetHint:   { position: 'absolute', bottom: '16px', left: '16px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(8,14,26,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '6px 12px', backdropFilter: 'blur(8px)' },
  packetDot:    { width: '8px', height: '8px', borderRadius: '50%', background: '#fff', boxShadow: '0 0 8px #3b82f6' },
}