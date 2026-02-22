import { useState, useEffect, useCallback } from 'react'

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

const TTL_MS = 10 * 60 * 1000

function useElapsed(firstSeen) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const ts = (firstSeen || 0) * 1000
    const update = () => setElapsed(Date.now() - ts)
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
  const t = trust || 'LOW'
  const m = TRUST_META[t] || TRUST_META.LOW
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '4px 12px', borderRadius: '20px',
        background: m.bg, border: `1px solid ${m.border}`,
        color: m.color, fontSize: '11px', fontWeight: 700,
        letterSpacing: '0.08em', fontFamily: 'var(--mono)',
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: m.color, flexShrink: 0 }} />
        {t} TRUST
      </div>
    </div>
  )
}

function TrustProgress({ crossChecks, trust }) {
  const t  = trust || 'LOW'
  const cc = crossChecks || 0
  let pct, nextLabel, nextAt
  if (t === 'HIGH')        { pct = 100; nextLabel = null;     nextAt = null }
  else if (t === 'MEDIUM') { pct = Math.min(100, (cc / 9) * 100); nextLabel = 'HIGH';   nextAt = 9 }
  else                     { pct = Math.min(100, (cc / 2) * 100); nextLabel = 'MEDIUM'; nextAt = 2 }

  const color = t === 'HIGH' ? 'var(--trust-high)' : t === 'MEDIUM' ? 'var(--trust-medium)' : 'var(--trust-low)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          VERIFICATION PROGRESS
        </span>
        {nextLabel
          ? <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{cc}/{nextAt} → {nextLabel}</span>
          : <span style={{ fontSize: '9px', color: 'var(--trust-high)', fontWeight: 700 }}>✓ MAX TRUST</span>
        }
      </div>
      <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: '3px', background: color, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

// ── The verify button — the main new UI element ──
function VerifyButton({ event, myDeviceId, onVerified }) {
  const [state, setState]   = useState('idle') // idle | confirming | sending | done | error | own
  const [result, setResult] = useState(null)

  const originDevice = event.origin_device || ''
  const checkIds     = Array.isArray(event.cross_check_ids) ? event.cross_check_ids : []

  // Work out this device's relationship to this alert
  const isOwn        = myDeviceId && originDevice && myDeviceId === originDevice
  const alreadyDone  = myDeviceId && checkIds.includes(myDeviceId)

  const handleClick = () => {
    if (isOwn || alreadyDone || state !== 'idle') return
    setState('confirming')
  }

  const handleConfirm = async () => {
    setState('sending')
    try {
      const res = await fetch(`/api/events/${event.event_id}/verify`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setResult(data)
        setState('done')
        onVerified && onVerified()
      } else {
        setState('error')
        setResult({ error: data.error || 'Verification failed' })
      }
    } catch {
      setState('error')
      setResult({ error: 'Could not reach backend' })
    }
  }

  const handleCancel = () => setState('idle')

  // ── Disabled states ──
  if (isOwn) {
    return (
      <div style={styles.verifyDisabled}>
        <span style={{ fontSize: '13px' }}>📡</span>
        <span>You broadcast this alert — you cannot verify your own report</span>
      </div>
    )
  }

  if (alreadyDone || state === 'done') {
    const cc = result?.cross_checks ?? (event.cross_checks || 0)
    const tr = result?.trust        ?? event.trust
    return (
      <div style={styles.verifyDone}>
        <span style={{ fontSize: '16px' }}>✅</span>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--trust-high)', fontSize: '13px' }}>
            You verified this alert
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Your cross-check has been broadcast to all peers.
            Total verifications: {cc} · Trust: {tr}
          </div>
        </div>
      </div>
    )
  }

  // ── Confirming ──
  if (state === 'confirming') {
    return (
      <div style={styles.verifyConfirmBox}>
        <div style={styles.verifyConfirmTitle}>
          <span style={{ fontSize: '16px' }}>👁️</span>
          Confirm you can witness this emergency
        </div>
        <div style={styles.verifyConfirmDesc}>
          By verifying, you confirm this alert appears genuine from your location.
          Your device ID will be broadcast to all peers as an independent cross-check,
          raising the trust level for everyone in the mesh.
        </div>
        <div style={styles.verifyConfirmBtns}>
          <button style={styles.verifyCancelBtn} onClick={handleCancel}>Cancel</button>
          <button style={styles.verifyConfirmBtn} onClick={handleConfirm}>
            ✅ Yes, I can confirm this
          </button>
        </div>
      </div>
    )
  }

  // ── Sending ──
  if (state === 'sending') {
    return (
      <div style={styles.verifySending}>
        <span style={{ fontSize: '13px', animation: 'pulse 1s infinite' }}>⏳</span>
        Broadcasting your verification to all peers…
      </div>
    )
  }

  // ── Error ──
  if (state === 'error') {
    return (
      <div style={styles.verifyError}>
        <span>❌ {result?.error}</span>
        <button style={styles.verifyRetryBtn} onClick={() => setState('idle')}>Retry</button>
      </div>
    )
  }

  // ── Default: idle prompt ──
  return (
    <div style={styles.verifyPrompt}>
      <div style={styles.verifyPromptLeft}>
        <div style={styles.verifyPromptTitle}>Can you witness this emergency?</div>
        <div style={styles.verifyPromptDesc}>
          If you can confirm this alert is real, tap verify.
          Your device becomes an independent cross-check, raising trust for everyone in the mesh.
        </div>
      </div>
      <button style={styles.verifyBtn} onClick={handleClick}>
        <span style={{ fontSize: '16px' }}>👁️</span>
        Verify
      </button>
    </div>
  )
}

function EventCard({ event, myDeviceId, onRefresh }) {
  const [expanded, setExpanded] = useState(false)

  const type           = event.type            || 'UNKNOWN'
  const trust          = event.trust           || 'LOW'
  const firstSeen      = event.first_seen      || 0
  const maxHop         = event.max_hop         != null ? event.max_hop : 0
  const crossChecks    = event.cross_checks    != null ? event.cross_checks : 0
  const devicesReached = event.devices_reached != null ? event.devices_reached : 0
  const authorizedNode = event.authorized_node || false
  const description    = event.description     || ''
  const location       = event.location        || ''
  const originDevice   = event.origin_device   || ''
  const reachedIds     = Array.isArray(event.devices_reached_ids) ? event.devices_reached_ids : []
  const checkIds       = Array.isArray(event.cross_check_ids)     ? event.cross_check_ids     : []

  const meta    = TYPE_META[type] || TYPE_META.UNKNOWN
  const elapsed = useElapsed(firstSeen)
  const fading  = elapsed > TTL_MS

  return (
    <div style={{
      ...styles.card,
      borderLeft: `3px solid ${meta.color}`,
      opacity: fading ? 0.35 : 1,
      transition: 'opacity 1s ease',
    }}>

      {/* Header row: icon + title + trust badge */}
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
              {' · '}hop {maxHop}
              {authorizedNode && (
                <span style={{ color: 'var(--trust-high)', marginLeft: '6px', fontWeight: 700 }}>★ AUTHORIZED NODE</span>
              )}
            </div>
          </div>
        </div>
        <TrustBadge trust={trust} />
      </div>

      {/* Description + location */}
      {(description || location) && (
        <div style={styles.descBlock}>
          {description && <div style={styles.descText}>"{description}"</div>}
          {location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📍</span>
              <span style={styles.locationText}>{location}</span>
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      <div style={styles.statsRow}>
        <div style={styles.statBox}>
          <div style={styles.statNum}>{devicesReached}</div>
          <div style={styles.statLabel}>devices reached</div>
          <div style={styles.statSub}>received this alert</div>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statBox}>
          <div style={{ ...styles.statNum, color: crossChecks >= 2 ? 'var(--trust-medium)' : crossChecks >= 9 ? 'var(--trust-high)' : undefined }}>
            {crossChecks}
          </div>
          <div style={styles.statLabel}>cross-checks</div>
          <div style={styles.statSub}>independently verified</div>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statBox}>
          <div style={styles.statNum}>{maxHop}</div>
          <div style={styles.statLabel}>max hops</div>
          <div style={styles.statSub}>relay depth</div>
        </div>
      </div>

      {/* Verification progress bar */}
      {!authorizedNode && <TrustProgress crossChecks={crossChecks} trust={trust} />}

      {/* ── VERIFY BUTTON — the main new element ── */}
      <VerifyButton
        event={event}
        myDeviceId={myDeviceId}
        onVerified={onRefresh}
      />

      {/* Expandable device list */}
      {devicesReached > 0 && (
        <div>
          <button style={styles.expandBtn} onClick={() => setExpanded(e => !e)}>
            {expanded ? '▾' : '▸'} {devicesReached} device{devicesReached !== 1 ? 's' : ''} in mesh
            {crossChecks > 0 && ` · ${crossChecks} verified`}
          </button>
          {expanded && reachedIds.length > 0 && (
            <div style={styles.chipGroups}>
              {reachedIds.map(d => {
                const isVerifier = checkIds.includes(d)
                const isOrigin   = d === originDevice
                return (
                  <span key={d} style={{
                    ...styles.deviceChip,
                    ...(isOrigin   ? styles.chipOrigin   : {}),
                    ...(isVerifier ? styles.chipVerifier : {}),
                  }}>
                    {isOrigin   && '📡 '}
                    {isVerifier && !isOrigin && '✓ '}
                    {d.replace('DEVICE-', '')}
                  </span>
                )
              })}
              <div style={styles.chipLegend}>
                <span>📡 origin</span>
                <span>✓ cross-checked</span>
                <span style={{ color: 'var(--border)' }}>|</span>
                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>plain = received only</span>
              </div>
            </div>
          )}
        </div>
      )}

      {fading && <div style={styles.ttlNotice}>⏳ Alert expired — fading out</div>}
    </div>
  )
}

export default function EventFeed({ events, myDeviceId, onRefresh }) {
  const [filter, setFilter] = useState('ALL')
  const safeEvents = Array.isArray(events) ? events : []
  const filtered   = filter === 'ALL'
    ? safeEvents
    : safeEvents.filter(e => e.type === filter || e.trust === filter)

  return (
    <div style={styles.feed}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.feedTitle}>Live Alerts</span>
          <span style={styles.feedCount}>{safeEvents.length}</span>
        </div>
        <div style={styles.filters}>
          {['ALL', 'FIRE', 'MEDICAL', 'SECURITY', 'HIGH', 'MEDIUM', 'LOW'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}),
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
              MeshSentinel is listening on the mesh.<br />
              When a peer broadcasts an emergency alert it will appear here instantly.
            </div>
          </div>
        ) : (
          filtered.map(e => (
            <EventCard
              key={e.event_id}
              event={e}
              myDeviceId={myDeviceId}
              onRefresh={onRefresh}
            />
          ))
        )}
      </div>
    </div>
  )
}

const styles = {
  feed:    { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  toolbar: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 },
  toolbarLeft:     { display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto' },
  feedTitle:       { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  feedCount:       { background: 'var(--accent-blue)', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', fontFamily: 'var(--mono)' },
  filters:         { display: 'flex', gap: '4px' },
  filterBtn:       { padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s ease' },
  filterBtnActive: { background: 'var(--accent-blue)', borderColor: 'var(--accent-blue)', color: '#fff' },
  refreshBtn:      { width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cards:           { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' },
  card:            { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  cardTop:         { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  statsRow:        { display: 'flex', alignItems: 'stretch', padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' },
  statBox:         { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' },
  statNum:         { fontSize: '22px', fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: 'var(--text-primary)' },
  statLabel:       { fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 },
  statSub:         { fontSize: '9px', color: 'var(--text-muted)' },
  statDivider:     { width: '1px', background: 'var(--border)', margin: '0 8px', flexShrink: 0 },
  descBlock:       { background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 12px', borderLeft: '2px solid var(--border-bright)', display: 'flex', flexDirection: 'column', gap: '6px' },
  descText:        { fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, fontStyle: 'italic' },
  locationText:    { fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 },
  expandBtn:       { background: 'none', border: 'none', padding: '2px 0', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' },
  chipGroups:      { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' },
  deviceChip:      { fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' },
  chipOrigin:      { color: 'var(--accent-blue)',  borderColor: 'rgba(59,130,246,0.4)',  background: 'rgba(59,130,246,0.08)'  },
  chipVerifier:    { color: 'var(--trust-medium)', borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)' },
  chipLegend:      { width: '100%', display: 'flex', gap: '10px', marginTop: '4px', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.04em' },
  ttlNotice:       { fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' },
  empty:           { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', gap: '12px' },
  emptyIcon:       { fontSize: '48px', opacity: 0.4 },
  emptyTitle:      { fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)' },
  emptyText:       { fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 },

  // ── Verify button styles ──
  verifyPrompt: {
    display: 'flex', alignItems: 'center', gap: '14px',
    background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
    borderRadius: '10px', padding: '12px 14px',
  },
  verifyPromptLeft:  { flex: 1 },
  verifyPromptTitle: { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' },
  verifyPromptDesc:  { fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 },
  verifyBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
    padding: '10px 18px', background: 'var(--accent-blue)', border: 'none',
    borderRadius: '10px', color: '#fff', fontSize: '12px', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0,
    boxShadow: '0 0 16px rgba(59,130,246,0.3)',
  },
  verifyConfirmBox: {
    background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
    borderRadius: '10px', padding: '14px',
    display: 'flex', flexDirection: 'column', gap: '10px',
  },
  verifyConfirmTitle: {
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '13px', fontWeight: 700, color: 'var(--trust-medium)',
  },
  verifyConfirmDesc: { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 },
  verifyConfirmBtns: { display: 'flex', gap: '8px' },
  verifyCancelBtn: {
    flex: 1, padding: '9px', border: '1px solid var(--border)', borderRadius: '8px',
    background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px',
    fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
  },
  verifyConfirmBtn: {
    flex: 2, padding: '9px', border: 'none', borderRadius: '8px',
    background: 'var(--trust-medium)', color: '#000', fontSize: '12px',
    fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
  },
  verifySending: {
    display: 'flex', alignItems: 'center', gap: '10px',
    background: 'var(--bg-secondary)', borderRadius: '10px', padding: '12px 14px',
    fontSize: '12px', color: 'var(--text-muted)',
  },
  verifyDone: {
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
    borderRadius: '10px', padding: '12px 14px',
  },
  verifyDisabled: {
    display: 'flex', alignItems: 'center', gap: '10px',
    background: 'var(--bg-secondary)', borderRadius: '10px', padding: '10px 14px',
    fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic',
  },
  verifyError: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: '10px', padding: '10px 14px',
    fontSize: '12px', color: 'var(--trust-low)',
  },
  verifyRetryBtn: {
    padding: '4px 12px', border: '1px solid var(--trust-low)', borderRadius: '6px',
    background: 'transparent', color: 'var(--trust-low)', fontSize: '11px',
    cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0,
  },
}