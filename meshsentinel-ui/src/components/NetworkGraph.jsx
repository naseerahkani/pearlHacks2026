import { useEffect, useRef, useState, useCallback } from 'react'

const POLL_MS   = 1500
const NODE_R    = 28
const SELF_R    = 34

const TYPE_COLOR = { FIRE: '#f97316', MEDICAL: '#3b82f6', SECURITY: '#8b5cf6', UNKNOWN: '#6b7280' }
const TRUST_COLOR = { HIGH: '#10b981', MEDIUM: '#f59e0b', LOW: '#ef4444' }

// ── Stable layout: arrange nodes in a circle, self in center ──
function computeLayout(nodes, width, height) {
  const cx = width  / 2
  const cy = height / 2
  const selfNode  = nodes.find(n => n.is_self)
  const otherNodes = nodes.filter(n => !n.is_self)
  const radius = Math.min(width, height) * 0.32

  const positions = {}

  if (selfNode) {
    positions[selfNode.id] = { x: cx, y: cy }
  }

  otherNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / otherNodes.length - Math.PI / 2
    positions[n.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    }
  })

  return positions
}

// ── Animated packet dot traveling along an edge ──
class PacketAnimation {
  constructor(fromPos, toPos, color, eventType) {
    this.from     = fromPos
    this.to       = toPos
    this.progress = 0
    this.speed    = 0.018 + Math.random() * 0.01
    this.color    = color
    this.done     = false
    this.id       = Math.random()
  }
  update() {
    this.progress += this.speed
    if (this.progress >= 1) { this.progress = 1; this.done = true }
  }
  currentPos() {
    const t = this.progress
    return {
      x: this.from.x + (this.to.x - this.from.x) * t,
      y: this.from.y + (this.to.y - this.from.y) * t,
    }
  }
}

export default function NetworkGraph() {
  const canvasRef   = useRef(null)
  const stateRef    = useRef({
    nodes: [], edges: [], events: {}, selfId: '',
    positions: {}, animations: [], lastEdgeKeys: new Set(),
    width: 0, height: 0,
  })
  const rafRef      = useRef(null)
  const [stats, setStats]       = useState({ nodes: 0, edges: 0, events: 0 })
  const [selectedEvent, setSelectedEvent] = useState('ALL')
  const [eventList, setEventList] = useState([])
  const [tooltip, setTooltip]   = useState(null)

  // ── Fetch graph data ──
  const fetchGraph = useCallback(async () => {
    try {
      const url = selectedEvent !== 'ALL'
        ? `/api/hops?event_id=${selectedEvent}`
        : '/api/hops'
      const res  = await fetch(url)
      const data = await res.json()
      const s    = stateRef.current

      // Detect new edges → spawn animations
      const newEdgeKeys = new Set(data.edges.map(e => `${e.from}|${e.to}|${e.event_id}`))
      data.edges.forEach(edge => {
        const key = `${edge.from}|${edge.to}|${edge.event_id}`
        if (!s.lastEdgeKeys.has(key)) {
          const fromPos = s.positions[edge.from]
          const toPos   = s.positions[edge.to]
          if (fromPos && toPos) {
            const evtMeta  = data.events[edge.event_id] || {}
            const color    = TYPE_COLOR[evtMeta.type] || '#3b82f6'
            s.animations.push(new PacketAnimation(fromPos, toPos, color))
          }
        }
      })
      s.lastEdgeKeys = newEdgeKeys

      // Recompute layout if node count changed
      if (data.nodes.length !== s.nodes.length) {
        s.positions = computeLayout(data.nodes, s.width, s.height)
        // Re-trigger any pending animations with new positions
      }

      s.nodes    = data.nodes
      s.edges    = data.edges
      s.events   = data.events
      s.selfId   = data.self_id

      // Remove done animations, cap at 30
      s.animations = s.animations.filter(a => !a.done).slice(-30)

      setStats({ nodes: data.nodes.length, edges: data.edges.length, events: Object.keys(data.events).length })
      setEventList(Object.entries(data.events).map(([id, meta]) => ({ id, ...meta })))
    } catch { /* backend not ready */ }
  }, [selectedEvent])

  useEffect(() => {
    const t = setInterval(fetchGraph, POLL_MS)
    fetchGraph()
    return () => clearInterval(t)
  }, [fetchGraph])

  // ── Canvas render loop ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width  = rect.width
      canvas.height = rect.height
      const s = stateRef.current
      s.width  = rect.width
      s.height = rect.height
      if (s.nodes.length) {
        s.positions = computeLayout(s.nodes, s.width, s.height)
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement)

    const draw = () => {
      const s   = stateRef.current
      const W   = canvas.width
      const H   = canvas.height
      ctx.clearRect(0, 0, W, H)

      if (s.nodes.length === 0) {
        // Empty state
        ctx.fillStyle = 'rgba(74,95,122,0.4)'
        ctx.font      = '14px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('Waiting for peers…', W / 2, H / 2 - 10)
        ctx.font      = '12px Inter, sans-serif'
        ctx.fillStyle = 'rgba(74,95,122,0.25)'
        ctx.fillText('Nodes appear as devices join the mesh', W / 2, H / 2 + 14)
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      const positions = s.positions

      // ── Draw edges ──
      s.edges.forEach(edge => {
        const fp = positions[edge.from]
        const tp = positions[edge.to]
        if (!fp || !tp) return

        const evtMeta = s.events[edge.event_id] || {}
        const color   = TYPE_COLOR[evtMeta.type] || '#3b82f6'
        const trust   = evtMeta.trust || 'LOW'
        const alpha   = trust === 'HIGH' ? 0.7 : trust === 'MEDIUM' ? 0.5 : 0.3

        ctx.beginPath()
        ctx.moveTo(fp.x, fp.y)
        ctx.lineTo(tp.x, tp.y)
        ctx.strokeStyle = color
        ctx.globalAlpha = alpha
        ctx.lineWidth   = trust === 'HIGH' ? 2.5 : trust === 'MEDIUM' ? 1.8 : 1.2
        ctx.setLineDash(trust === 'LOW' ? [4, 4] : [])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1

        // Arrowhead
        const angle = Math.atan2(tp.y - fp.y, tp.x - fp.x)
        const ar    = NODE_R + 6
        const ax    = tp.x - ar * Math.cos(angle)
        const ay    = tp.y - ar * Math.sin(angle)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(ax - 10 * Math.cos(angle - 0.4), ay - 10 * Math.sin(angle - 0.4))
        ctx.lineTo(ax - 10 * Math.cos(angle + 0.4), ay - 10 * Math.sin(angle + 0.4))
        ctx.closePath()
        ctx.fillStyle   = color
        ctx.globalAlpha = alpha
        ctx.fill()
        ctx.globalAlpha = 1

        // Hop label
        const mx   = (fp.x + tp.x) / 2
        const my   = (fp.y + tp.y) / 2
        ctx.fillStyle = 'rgba(123,147,188,0.8)'
        ctx.font      = '10px JetBrains Mono, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(`hop ${edge.hop}`, mx, my - 6)
      })

      // ── Draw packet animations ──
      s.animations.forEach(anim => {
        anim.update()
        const pos = anim.currentPos()
        const grd = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 8)
        grd.addColorStop(0, anim.color)
        grd.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.globalAlpha = 1 - anim.progress * 0.3
        ctx.fill()
        ctx.globalAlpha = 1
        // Core dot
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
      })

      // ── Draw nodes ──
      s.nodes.forEach(node => {
        const pos = positions[node.id]
        if (!pos) return

        const isSelf = node.is_self
        const r      = isSelf ? SELF_R : NODE_R

        // Glow ring
        const glowColor = isSelf ? '#3b82f6' : '#1e2d47'
        const grd = ctx.createRadialGradient(pos.x, pos.y, r * 0.6, pos.x, pos.y, r * 1.5)
        grd.addColorStop(0, isSelf ? 'rgba(59,130,246,0.15)' : 'rgba(30,45,71,0.2)')
        grd.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, r * 1.5, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.fill()

        // Node circle
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
        ctx.fillStyle   = isSelf ? '#0f1a2e' : '#131929'
        ctx.fill()
        ctx.strokeStyle = isSelf ? '#3b82f6' : '#2a3f60'
        ctx.lineWidth   = isSelf ? 2.5 : 1.5
        ctx.stroke()

        // Icon
        ctx.fillStyle = isSelf ? '#3b82f6' : '#7b93bc'
        ctx.font      = `${isSelf ? 18 : 15}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(isSelf ? '⬡' : '◈', pos.x, pos.y - 2)

        // Label
        ctx.fillStyle    = isSelf ? '#e8f0fe' : '#7b93bc'
        ctx.font         = `${isSelf ? 600 : 500} 11px Inter, sans-serif`
        ctx.textBaseline = 'alphabetic'
        ctx.fillText(node.label, pos.x, pos.y + r + 16)

        // "YOU" badge for self
        if (isSelf) {
          ctx.fillStyle   = '#3b82f6'
          ctx.font        = '700 9px Inter, sans-serif'
          ctx.fillText('YOU', pos.x, pos.y + r + 28)
        }

        // IP below label
        if (node.ip) {
          ctx.fillStyle = 'rgba(74,95,122,0.6)'
          ctx.font      = '9px JetBrains Mono, monospace'
          ctx.fillText(node.ip, pos.x, pos.y + r + (isSelf ? 40 : 28))
        }
      })

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  // ── Canvas hover → tooltip ──
  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx   = e.clientX - rect.left
    const my   = e.clientY - rect.top
    const s    = stateRef.current

    let found = null
    for (const node of s.nodes) {
      const pos = s.positions[node.id]
      if (!pos) continue
      const r = node.is_self ? SELF_R : NODE_R
      const d = Math.hypot(mx - pos.x, my - pos.y)
      if (d <= r + 4) { found = { node, pos }; break }
    }
    if (found) {
      setTooltip({ node: found.node, x: e.clientX, y: e.clientY })
    } else {
      setTooltip(null)
    }
  }

  return (
    <div style={styles.root}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.title}>Mesh Network Graph</span>
          <span style={styles.liveTag}>● LIVE</span>
        </div>
        <div style={styles.stats}>
          <div style={styles.stat}><span style={styles.statN}>{stats.nodes}</span><span style={styles.statL}>nodes</span></div>
          <div style={styles.statDivider}/>
          <div style={styles.stat}><span style={styles.statN}>{stats.edges}</span><span style={styles.statL}>relay edges</span></div>
          <div style={styles.statDivider}/>
          <div style={styles.stat}><span style={styles.statN}>{stats.events}</span><span style={styles.statL}>events</span></div>
        </div>
        {eventList.length > 0 && (
          <select
            value={selectedEvent}
            onChange={e => setSelectedEvent(e.target.value)}
            style={styles.select}
          >
            <option value="ALL">All Events</option>
            {eventList.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.type} — {ev.trust} — {ev.confirmed_by_count} confirmations
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Canvas */}
      <div style={styles.canvasWrapper} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>
        <canvas ref={canvasRef} style={styles.canvas} />

        {/* Legend */}
        <div style={styles.legend}>
          <div style={styles.legendTitle}>RELAY EDGES</div>
          {[
            { color: '#10b981', dash: false, label: 'HIGH trust (solid)' },
            { color: '#f59e0b', dash: true,  label: 'MEDIUM trust' },
            { color: '#ef4444', dash: true,  label: 'LOW trust (dashed)' },
          ].map(l => (
            <div key={l.label} style={styles.legendRow}>
              <svg width="28" height="10" style={{ flexShrink: 0 }}>
                <line x1="0" y1="5" x2="28" y2="5"
                  stroke={l.color} strokeWidth="2"
                  strokeDasharray={l.dash ? '4 3' : 'none'}/>
              </svg>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{l.label}</span>
            </div>
          ))}
          <div style={{ ...styles.legendTitle, marginTop: '10px' }}>PACKET TYPES</div>
          {[
            { color: '#f97316', label: 'FIRE' },
            { color: '#3b82f6', label: 'MEDICAL' },
            { color: '#8b5cf6', label: 'SECURITY' },
          ].map(l => (
            <div key={l.label} style={styles.legendRow}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: l.color, flexShrink: 0 }}/>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{l.label}</span>
            </div>
          ))}
        </div>

        {/* Packet animation legend */}
        <div style={styles.packetHint}>
          <div style={styles.packetDot}/>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Animated dots = live packet relay</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          ...styles.tooltip,
          left: tooltip.x + 12,
          top:  tooltip.y - 10,
        }}>
          <div style={styles.tooltipId}>{tooltip.node.id}</div>
          {tooltip.node.ip && <div style={styles.tooltipIp}>{tooltip.node.ip}</div>}
          {tooltip.node.is_self && <div style={styles.tooltipSelf}>This machine</div>}
        </div>
      )}
    </div>
  )
}

const styles = {
  root: {
    display: 'flex', flexDirection: 'column',
    height: '100%', overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: '16px',
    padding: '12px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)', flexShrink: 0,
  },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: '10px', marginRight: 'auto' },
  title: { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  liveTag: {
    fontSize: '10px', fontWeight: 700, color: '#10b981',
    letterSpacing: '0.08em', animation: 'pulse-green 2s infinite',
  },
  stats: { display: 'flex', alignItems: 'center', gap: '12px' },
  stat:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' },
  statN: { fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--mono)', lineHeight: 1 },
  statL: { fontSize: '9px',  color: 'var(--text-muted)', letterSpacing: '0.06em' },
  statDivider: { width: '1px', height: '24px', background: 'var(--border)' },
  select: {
    padding: '6px 10px', background: 'var(--bg-card)',
    border: '1px solid var(--border-bright)', borderRadius: '8px',
    color: 'var(--text-secondary)', fontSize: '12px',
    fontFamily: 'var(--font)', cursor: 'pointer', outline: 'none',
  },
  canvasWrapper: {
    flex: 1, position: 'relative', overflow: 'hidden',
  },
  canvas: { display: 'block', width: '100%', height: '100%' },
  legend: {
    position: 'absolute', top: '16px', left: '16px',
    background: 'rgba(15,21,37,0.88)',
    border: '1px solid var(--border)', borderRadius: '10px',
    padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: '5px',
    backdropFilter: 'blur(8px)',
  },
  legendTitle: {
    fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)',
    letterSpacing: '0.1em', marginBottom: '3px',
  },
  legendRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  packetHint: {
    position: 'absolute', bottom: '16px', left: '16px',
    display: 'flex', alignItems: 'center', gap: '8px',
    background: 'rgba(15,21,37,0.8)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '6px 12px',
    backdropFilter: 'blur(8px)',
  },
  packetDot: {
    width: '8px', height: '8px', borderRadius: '50%',
    background: '#fff', boxShadow: '0 0 6px #3b82f6',
  },
  tooltip: {
    position: 'fixed', zIndex: 9999,
    background: 'var(--bg-card)', border: '1px solid var(--border-bright)',
    borderRadius: '8px', padding: '8px 12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    pointerEvents: 'none',
  },
  tooltipId:   { fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--accent-blue)', fontWeight: 600 },
  tooltipIp:   { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' },
  tooltipSelf: { fontSize: '10px', color: 'var(--trust-high)', marginTop: '4px', fontWeight: 700 },
}
