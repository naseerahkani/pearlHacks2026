import { useState, useEffect } from 'react'

const TYPE_META = {
  FIRE:     { icon: '🔥', color: '#f97316', label: 'Fire',          bg: 'rgba(249,115,22,0.1)'  },
  MEDICAL:  { icon: '🚑', color: '#3b82f6', label: 'Medical',       bg: 'rgba(59,130,246,0.1)'  },
  SECURITY: { icon: '🚨', color: '#8b5cf6', label: 'Security',      bg: 'rgba(139,92,246,0.1)'  },
  UNKNOWN:  { icon: '⚠️', color: '#6b7280', label: 'Alert',         bg: 'rgba(107,114,128,0.1)' },
}

const TRUST_META = {
  HIGH:   { color: 'var(--trust-high)',   bg: 'var(--trust-high-bg)',   border: 'var(--trust-high-border)'   },
  MEDIUM: { color: 'var(--trust-medium)', bg: 'var(--trust-medium-bg)', border: 'var(--trust-medium-border)' },
  LOW:    { color: 'var(--trust-low)',     bg: 'var(--trust-low-bg)',    border: 'var(--trust-low-border)'    },
}

const TTL_MS = 10 * 60 * 1000 // 10 minutes

function useElapsed(firstSeen) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const update = () => setElapsed(Date.now() - firstSeen * 1000)
    update()
    const t = setInterval(update, 5000)
    return () => clearInterval(t)
  }, [firstSeen])
  return elapsed
}

function formatAge(ms) {
  const s = Math.floor(ms / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function TrustBadge({ trust }) {
  const m = TRUST_META[trust] || TRUST_META.LOW
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 10px',
      borderRadius: '20px',
      background: m.bg,
      border: `1px solid ${m.border}`,
      color: m.color,
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.08em',
      animation: 'badge-pop 0.3s ease',
      fontFamily: 'var(--mono)',
    }}>
      <span style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: m.color, flexShrink: 0,
      }}/>
      {trust}
    </div>
  )
}

function ConfidenceBar({ count }) {
  const pct = Math.min(100, (count / 10) * 100)
  const color = count >= 10 ? 'var(--trust-high)' : count >= 3 ? 'var(--trust-medium)' : 'var(--trust-low)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
      <div style={{
        flex: 1, height: '4px', borderRadius: '2px',
        background: 'var(--border)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: '2px',
          background: color, transition: 'width 0.4s ease',
        }}/>
      </div>
      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--mono)', minWidth: '24px' }}>
        {count}/10
      </span>
    </div>
  )
}

function EventCard({ event }) {
  const meta    = TYPE_META[event.type] || TYPE_META.UNKNOWN
  const elapsed = useElapsed(event.first_seen)
  const fading  = elapsed > TTL_MS

  return (
    <div style={{
      ...styles.card,
      borderLeft: `3px solid ${meta.color}`,
      opacity: fading ? 0.35 : 1,
      transition: 'opacity 1s ease',
      animation: 'slide-in 0.25s ease',
    }}>
      {/* Row 1: Icon + Type + Trust + Age */}
      <div style={styles.cardRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: meta.bg, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '18px', flexShrink: 0,
          }}>
            {meta.icon}
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: meta.color, letterSpacing: '-0.01em' }}>
              {meta.label} Alert
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              {formatAge(elapsed)} • hop {event.hop_count}
              {event.authorized_node && (
                <span style={{ color: 'var(--trust-high)', marginLeft: '6px' }}>★ AUTHORIZED</span>
              )}
            </div>
          </div>
        </div>
        <TrustBadge trust={event.trust} />
      </div>

      {/* Row 2: Stats */}
      <div style={styles.statsRow}>
        <div style={styles.stat}>
          <div style={styles.statNum}>{event.confirmed_by_count}</div>
          <div style={styles.statLabel}>neighbors alerted</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statNum}>{event.relay_count}</div>
          <div style={styles.statLabel}>relay count</div>
        </div>
        <div style={styles.stat}>
          <div style={styles.statNum}>{event.confirmed_by_count}</div>
          <div style={styles.statLabel}>cross-checks</div>
        </div>
      </div>

      {/* Row 3: Confidence bar */}
      <div style={styles.barRow}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
          CONFIDENCE
        </span>
        <ConfidenceBar count={event.confirmed_by_count} />
      </div>

      {/* Row 4: Device IDs */}
      {event.confirmed_by.length > 0 && (
        <div style={styles.devices}>
          {event.confirmed_by.slice(0, 5).map(d => (
            <span key={d} style={styles.deviceChip}>{d.slice(-8)}</span>
          ))}
          {event.confirmed_by.length > 5 && (
            <span style={{ ...styles.deviceChip, color: 'var(--text-muted)' }}>
              +{event.confirmed_by.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* TTL warning */}
      {fading && (
        <div style={styles.ttlNotice}>⏳ Alert expired — fading out</div>
      )}
    </div>
  )
}

export default function EventFeed({ events, onRefresh }) {
  const [filter, setFilter] = useState('ALL')

  const filtered = filter === 'ALL'
    ? events
    : events.filter(e => e.type === filter || e.trust === filter)

  return (
    <div style={styles.feed}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.feedTitle}>Live Alerts</span>
          <span style={styles.feedCount}>{events.length}</span>
        </div>
        <div style={styles.filters}>
          {['ALL', 'FIRE', 'MEDICAL', 'SECURITY', 'HIGH', 'MEDIUM', 'LOW'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                ...styles.filterBtn,
                ...(filter === f ? styles.filterBtnActive : {}),
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={onRefresh} style={styles.refreshBtn} title="Refresh">
          ↻
        </button>
      </div>

      {/* Cards */}
      <div style={styles.cards}>
        {filtered.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>📡</div>
            <div style={styles.emptyTitle}>No Alerts Detected</div>
            <div style={styles.emptyText}>
              MeshSentinel is listening. When a peer broadcasts an emergency alert,<br/>
              it will appear here in real time.
            </div>
          </div>
        ) : (
          filtered.map(e => <EventCard key={e.event_id} event={e} />)
        )}
      </div>
    </div>
  )
}

const styles = {
  feed: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginRight: 'auto',
  },
  feedTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.01em',
  },
  feedCount: {
    background: 'var(--accent-blue)',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 700,
    padding: '1px 7px',
    borderRadius: '20px',
    fontFamily: 'var(--mono)',
  },
  filters: {
    display: 'flex',
    gap: '4px',
  },
  filterBtn: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'all 0.15s ease',
  },
  filterBtnActive: {
    background: 'var(--accent-blue)',
    borderColor: 'var(--accent-blue)',
    color: '#fff',
  },
  refreshBtn: {
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cards: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    transition: 'background 0.15s ease',
  },
  cardRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  statsRow: {
    display: 'flex',
    gap: '20px',
    padding: '10px 0',
    borderTop: '1px solid var(--border)',
    borderBottom: '1px solid var(--border)',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  statNum: {
    fontSize: '20px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    fontFamily: 'var(--mono)',
    lineHeight: 1,
  },
  statLabel: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  devices: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  deviceChip: {
    fontFamily: 'var(--mono)',
    fontSize: '10px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-secondary)',
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
  },
  ttlNotice: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    textAlign: 'center',
    gap: '12px',
  },
  emptyIcon: {
    fontSize: '48px',
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
  },
  emptyText: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: 1.6,
  },
}
