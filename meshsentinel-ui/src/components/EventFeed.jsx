import { useState, useEffect } from 'react'

const TYPE_META = {
  FIRE:     { icon: '🔥', color: '#f97316', label: 'Fire',     bg: 'rgba(249,115,22,0.1)'  },
  MEDICAL:  { icon: '🚑', color: '#3b82f6', label: 'Medical',  bg: 'rgba(59,130,246,0.1)'  },
  SECURITY: { icon: '🚨', color: '#8b5cf6', label: 'Security', bg: 'rgba(139,92,246,0.1)'  },
  UNKNOWN:  { icon: '⚠️', color: '#6b7280', label: 'Alert',    bg: 'rgba(107,114,128,0.1)' },
}

const TRUST_META = {
  HIGH:   { color: 'var(--trust-high)',   bg: 'var(--trust-high-bg)',   border: 'var(--trust-high-border)'   },
  MEDIUM: { color: 'var(--trust-medium)', bg: 'var(--trust-medium-bg)', border: 'var(--trust-medium-border)' },
  LOW:    { color: 'var(--trust-low)',     bg: 'var(--trust-low-bg)',    border: 'var(--trust-low-border)'    },
}

// Trust thresholds matching the backend
const TRUST_THRESHOLDS = { MEDIUM: 2, HIGH: 9 }
const TTL_MS = 10 * 60 * 1000

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
  const desc = {
    LOW:    '1 source only',
    MEDIUM: '2+ independent verifications',
    HIGH:   '9+ verifications or authorized',
  }[trust]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '4px 12px', borderRadius: '20px',
        background: m.bg, border: `1px solid ${m.border}`,
        color: m.color, fontSize: '11px', fontWeight: 700,
        letterSpacing: '0.08em', fontFamily: 'var(--mono)',
        animation: 'badge-pop 0.3s ease',
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: m.color, flexShrink: 0 }}/>
        {trust} TRUST
      </div>
      <div style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{desc}</div>
    </div>
  )
}

// Progress bar toward next trust level
function TrustProgress({ crossChecks, trust }) {
  let pct, nextLabel, nextAt
  if (trust === 'HIGH') {
    pct = 100; nextLabel = null
  } else if (trust === 'MEDIUM') {
    pct = Math.min(100, (crossChecks / TRUST_THRESHOLDS.HIGH) * 100)
    nextLabel = 'HIGH'; nextAt = TRUST_THRESHOLDS.HIGH
  } else {
    pct = Math.min(100, (crossChecks / TRUST_THRESHOLDS.MEDIUM) * 100)
    nextLabel = 'MEDIUM'; nextAt = TRUST_THRESHOLDS.MEDIUM
  }
  const color = trust === 'HIGH' ? 'var(--trust-high)'
              : trust === 'MEDIUM' ? 'var(--trust-medium)'
              : 'var(--trust-low)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          CROSS-VERIFICATION PROGRESS
        </span>
        {nextLabel && (
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {crossChecks}/{nextAt} → {nextLabel}
          </span>
        )}
        {!nextLabel && (
          <span style={{ fontSize: '9px', color: 'var(--trust-high)', fontWeight: 700 }}>✓ MAX TRUST</span>
        )}
      </div>
      <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: '3px',
          background: color, transition: 'width 0.5s ease',
        }}/>
      </div>
    </div>
  )
}

function StatBox({ value, label, sublabel, color }) {
  return (
    <div style={styles.statBox}>
      <div style={{ ...styles.statNum, color: color || 'var(--text-primary)' }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {sublabel && <div style={styles.statSub}>{sublabel}</div>}
    </div>
  )
}

function InfoTooltip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}
         onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', cursor: 'help', marginLeft: '4px' }}>ⓘ</span>
      {show && (
        <div style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--border-bright)',
          borderRadius: '8px', padding: '8px 12px', width: '200px',
          fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 100, pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </div>
  )
}

function EventCard({ event }) {
  const meta    = TYPE_META[event.type] || TYPE_META.UNKNOWN
  const elapsed = useElapsed(event.first_seen)
  const fading  = elapsed > TTL_MS
  const [expanded, setExpanded] = useState(false)

  const crossChecks   = event.cross_checks    || 0
  const devicesReached = event.devices_reached || 0

  return (
    <div style={{
      ...styles.card,
      borderLeft: `3px solid ${meta.color}`,
      opacity: fading ? 0.35 : 1,
      transition: 'opacity 1s ease',
      animation: 'slide-in 0.25s ease',
    }}>

      {/* Row 1: Icon + type + trust badge */}
      <div style={styles.cardTop}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: meta.bg, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '20px', flexShrink: 0,
          }}>
            {meta.icon}
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: meta.color, letterSpacing: '-0.01em' }}>
              {meta.label} Alert
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              {formatAge(elapsed)}
              {' · '}traveled {event.max_hop || 0} hop{event.max_hop !== 1 ? 's' : ''}
              {event.authorized_node && (
                <span style={{ color: 'var(--trust-high)', marginLeft: '6px', fontWeight: 700 }}>★ AUTHORIZED NODE</span>
              )}
            </div>
          </div>
        </div>
        <TrustBadge trust={event.trust} />
      </div>

      {/* Row 2: Three clear stats */}
      <div style={styles.statsRow}>
        <StatBox
          value={devicesReached}
          label="devices reached"
          sublabel="received this alert"
        />
        <div style={styles.statDivider}/>
        <StatBox
          value={crossChecks}
          label="cross-checks"
          sublabel="independently verified"
          color={crossChecks >= 2 ? 'var(--trust-medium)' : crossChecks >= 9 ? 'var(--trust-high)' : undefined}
        />
        <div style={styles.statDivider}/>
        <StatBox
          value={event.max_hop || 0}
          label="max hops"
          sublabel="relay depth"
        />
      </div>

      {/* Row 3: What these mean */}
      <div style={styles.explainer}>
        <div style={styles.explainerRow}>
          <span style={styles.explainerDot('var(--accent-blue)')}/>
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>Devices reached</strong>
            {' '}— every machine that has received this alert through the mesh
          </span>
        </div>
        <div style={styles.explainerRow}>
          <span style={styles.explainerDot(crossChecks > 0 ? 'var(--trust-medium)' : 'var(--text-muted)')}/>
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>Cross-checks</strong>
            {' '}— devices that independently re-broadcast it, verifying it as real.
            Trust upgrades at 2 (MEDIUM) and 9 (HIGH).
          </span>
        </div>
      </div>

      {/* Row 4: Progress bar */}
      {!event.authorized_node && (
        <TrustProgress crossChecks={crossChecks} trust={event.trust} />
      )}

      {/* Row 5: Device chips — expandable */}
      {devicesReached > 0 && (
        <div>
          <button
            style={styles.expandBtn}
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? '▾' : '▸'} {devicesReached} device{devicesReached !== 1 ? 's' : ''} in mesh
            {crossChecks > 0 && ` · ${crossChecks} verified`}
          </button>
          {expanded && (
            <div style={styles.chipGroups}>
              {(event.devices_reached_ids || []).map(d => {
                const isVerifier = (event.cross_check_ids || []).includes(d)
                const isOrigin   = d === event.origin_device
                return (
                  <span key={d} style={{
                    ...styles.deviceChip,
                    ...(isOrigin   ? styles.chipOrigin   : {}),
                    ...(isVerifier ? styles.chipVerifier : {}),
                  }}>
                    {isOrigin && '📡 '}
                    {isVerifier && !isOrigin && '✓ '}
                    {d.replace('DEVICE-', '')}
                  </span>
                )
              })}
              <div style={styles.chipLegend}>
                <span>📡 origin</span>
                <span>✓ cross-checked</span>
                <span style={{ color: 'var(--text-muted)' }}>plain = received only</span>
              </div>
            </div>
          )}
        </div>
      )}

      {fading && <div style={styles.ttlNotice}>⏳ Alert expired — fading out</div>}
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
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.feedTitle}>Live Alerts</span>
          <span style={styles.feedCount}>{events.length}</span>
        </div>
        <div style={styles.filters}>
          {['ALL', 'FIRE', 'MEDICAL', 'SECURITY', 'HIGH', 'MEDIUM', 'LOW'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              ...styles.filterBtn,
              ...(filter === f ? styles.filterBtnActive : {}),
            }}>
              {f}
            </button>
          ))}
        </div>
        <button onClick={onRefresh} style={styles.refreshBtn} title="Refresh">↻</button>
      </div>

      <div style={styles.cards}>
        {filtered.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>📡</div>
            <div style={styles.emptyTitle}>No Alerts Detected</div>
            <div style={styles.emptyText}>
              MeshSentinel is listening on the mesh.<br/>
              When a peer broadcasts an emergency alert it will appear here instantly.
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
  feed:   { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)', flexShrink: 0,
  },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto' },
  feedTitle: { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  feedCount: {
    background: 'var(--accent-blue)', color: '#fff',
    fontSize: '11px', fontWeight: 700, padding: '1px 7px',
    borderRadius: '20px', fontFamily: 'var(--mono)',
  },
  filters: { display: 'flex', gap: '4px' },
  filterBtn: {
    padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)',
    background: 'transparent', color: 'var(--text-muted)', fontSize: '10px',
    fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer',
    fontFamily: 'var(--font)', transition: 'all 0.15s ease',
  },
  filterBtnActive: { background: 'var(--accent-blue)', borderColor: 'var(--accent-blue)', color: '#fff' },
  refreshBtn: {
    width: '30px', height: '30px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text-secondary)', fontSize: '16px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cards: {
    flex: 1, overflowY: 'auto', padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: '12px',
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '16px',
    display: 'flex', flexDirection: 'column', gap: '12px',
  },
  cardTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  statsRow: {
    display: 'flex', alignItems: 'stretch',
    padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
  },
  statBox: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' },
  statNum: { fontSize: '22px', fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1 },
  statLabel: { fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 },
  statSub:   { fontSize: '9px',  color: 'var(--text-muted)' },
  statDivider: { width: '1px', background: 'var(--border)', margin: '0 8px', flexShrink: 0 },
  explainer: {
    background: 'var(--bg-secondary)', borderRadius: '8px',
    padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px',
  },
  explainerRow: {
    display: 'flex', alignItems: 'flex-start', gap: '8px',
    fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5,
  },
  explainerDot: (color) => ({
    width: '7px', height: '7px', borderRadius: '50%',
    background: color, flexShrink: 0, marginTop: '3px',
  }),
  expandBtn: {
    background: 'none', border: 'none', padding: '2px 0',
    color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer',
    fontFamily: 'var(--font)', textAlign: 'left',
  },
  chipGroups: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' },
  deviceChip: {
    fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text-secondary)',
    background: 'var(--bg-secondary)', padding: '2px 8px',
    borderRadius: '4px', border: '1px solid var(--border)',
  },
  chipOrigin:   { color: 'var(--accent-blue)',   borderColor: 'rgba(59,130,246,0.4)',  background: 'rgba(59,130,246,0.08)'  },
  chipVerifier: { color: 'var(--trust-medium)', borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)' },
  chipLegend: {
    width: '100%', display: 'flex', gap: '12px', marginTop: '4px',
    fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.04em',
  },
  ttlNotice: { fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' },
  empty: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '60px 20px', textAlign: 'center', gap: '12px',
  },
  emptyIcon:  { fontSize: '48px', opacity: 0.4 },
  emptyTitle: { fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)' },
  emptyText:  { fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 },
}
