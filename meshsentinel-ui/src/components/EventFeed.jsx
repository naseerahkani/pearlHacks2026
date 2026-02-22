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
  )
}

function TrustProgress({ crossChecks, trust }) {
  const t  = trust || 'LOW'
  const cc = crossChecks || 0
  let pct, nextLabel, nextAt
  if (t === 'HIGH')        { pct = 100;                           nextLabel = null;     nextAt = null }
  else if (t === 'MEDIUM') { pct = Math.min(100, (cc / 9) * 100); nextLabel = 'HIGH';   nextAt = 9    }
  else                     { pct = Math.min(100, (cc / 2) * 100); nextLabel = 'MEDIUM'; nextAt = 2    }
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

// ─────────────────────────────────────────────
// Verification Panel — the core new UI element
// State machine: idle → confirming → sending → done / error
//                idle → dismissing → done
// ─────────────────────────────────────────────
function VerificationPanel({ event, myDeviceId, onAction }) {
  const [phase, setPhase]   = useState('idle')
  const [result, setResult] = useState(null)

  const eventId      = event.event_id      || ''
  const originDevice = event.origin_device || ''
  const checkIds     = Array.isArray(event.cross_check_ids) ? event.cross_check_ids : []
  const pendingVerify = event.pending_verify || false
  const dismissed     = event.dismissed     || false

  const isOwn        = myDeviceId && originDevice && myDeviceId === originDevice
  const alreadyDone  = myDeviceId && checkIds.includes(myDeviceId)

  // ── 1. You sent this — nothing to verify ──
  if (isOwn) {
    return (
      <div style={styles.vpRow}>
        <span style={styles.vpIcon}>📡</span>
        <span style={styles.vpMuted}>You broadcast this alert — awaiting peer verifications</span>
      </div>
    )
  }

  // ── 2. Already verified ──
  if (alreadyDone || phase === 'done' && result?.action === 'verify') {
    const cc = result?.cross_checks ?? (event.cross_checks || 0)
    const tr = result?.trust        ?? event.trust
    return (
      <div style={{ ...styles.vpRow, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', padding: '10px 14px' }}>
        <span style={{ fontSize: '16px' }}>✅</span>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--trust-high)', fontSize: '12px' }}>Your verification was broadcast to all peers</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Total cross-checks: {cc} · Trust now: {tr}
          </div>
        </div>
      </div>
    )
  }

  // ── 3. Dismissed ──
  if (dismissed || phase === 'done' && result?.action === 'dismiss') {
    return (
      <div style={{ ...styles.vpRow, ...styles.vpMutedBox }}>
        <span style={{ fontSize: '13px' }}>🚫</span>
        <span style={styles.vpMuted}>You marked this as unconfirmable — no cross-check sent</span>
      </div>
    )
  }

  // ── 4. Not pending (relay propagated but already acted on or not from a peer) ──
  //    Show a lighter "you can still verify manually" prompt
  if (!pendingVerify && phase === 'idle') {
    return (
      <div style={{ ...styles.vpRow, ...styles.vpMutedBox }}>
        <span style={{ fontSize: '13px' }}>👁️</span>
        <div style={{ flex: 1 }}>
          <span style={styles.vpMuted}>Can you witness this emergency? </span>
          <button style={styles.vpInlineBtn} onClick={() => setPhase('confirming')}>
            Verify manually
          </button>
        </div>
      </div>
    )
  }

  // ── 5. PENDING — needs a decision right now ──
  if (pendingVerify && phase === 'idle') {
    return (
      <div style={styles.vpPendingBox}>
        <div style={styles.vpPendingHeader}>
          <span style={{ fontSize: '18px' }}>👁️</span>
          <div>
            <div style={styles.vpPendingTitle}>Can you confirm this emergency?</div>
            <div style={styles.vpPendingDesc}>
              This alert arrived from a peer. If you can see or confirm this situation,
              tap <strong>Yes, I can confirm</strong>. Your device will be broadcast as an
              independent cross-check, raising trust for everyone in the mesh.
              If you cannot confirm, tap <strong>No / Dismiss</strong>.
            </div>
          </div>
        </div>
        <div style={styles.vpBtnRow}>
          <button style={styles.vpDismissBtn} onClick={() => setPhase('dismissing')}>
            🚫 No / Dismiss
          </button>
          <button style={styles.vpVerifyBtn} onClick={() => setPhase('confirming')}>
            ✅ Yes, I can confirm
          </button>
        </div>
      </div>
    )
  }

  // ── 6. Confirm verify ──
  if (phase === 'confirming') {
    const doVerify = async () => {
      setPhase('sending')
      try {
        const res  = await fetch(`/api/events/${eventId}/verify`, { method: 'POST' })
        const data = await res.json()
        setResult({ ...data, action: 'verify' })
        setPhase(res.ok ? 'done' : 'error')
        res.ok && onAction && onAction()
      } catch {
        setResult({ error: 'Could not reach backend', action: 'verify' })
        setPhase('error')
      }
    }
    return (
      <div style={styles.vpConfirmBox}>
        <div style={styles.vpConfirmTitle}>⚠️ Confirm your cross-check</div>
        <div style={styles.vpConfirmDesc}>
          By confirming, you are stating that <strong>you can personally witness or confirm</strong> this
          emergency is real. Your device ID will be permanently recorded as a verifier and broadcast to all peers.
        </div>
        <div style={styles.vpBtnRow}>
          <button style={styles.vpCancelBtn} onClick={() => setPhase('idle')}>← Go back</button>
          <button style={styles.vpVerifyBtn} onClick={doVerify}>✅ Yes, confirm & broadcast</button>
        </div>
      </div>
    )
  }

  // ── 7. Confirm dismiss ──
  if (phase === 'dismissing') {
    const doDismiss = async () => {
      setPhase('sending')
      try {
        const res = await fetch(`/api/events/${eventId}/dismiss`, { method: 'POST' })
        setResult({ action: 'dismiss' })
        setPhase(res.ok ? 'done' : 'error')
        res.ok && onAction && onAction()
      } catch {
        setResult({ error: 'Could not reach backend', action: 'dismiss' })
        setPhase('error')
      }
    }
    return (
      <div style={styles.vpConfirmBox}>
        <div style={styles.vpConfirmTitle}>Dismiss this verification request?</div>
        <div style={styles.vpConfirmDesc}>
          You won't be asked again for this alert. No cross-check is sent — the alert stays
          visible in the feed and can still gain trust from other devices.
        </div>
        <div style={styles.vpBtnRow}>
          <button style={styles.vpCancelBtn} onClick={() => setPhase('idle')}>← Go back</button>
          <button style={styles.vpDismissBtn} onClick={doDismiss}>🚫 Dismiss</button>
        </div>
      </div>
    )
  }

  // ── 8. Sending ──
  if (phase === 'sending') {
    return (
      <div style={{ ...styles.vpRow, ...styles.vpMutedBox }}>
        <span>⏳</span>
        <span style={styles.vpMuted}>Broadcasting your decision to all peers…</span>
      </div>
    )
  }

  // ── 9. Error ──
  if (phase === 'error') {
    return (
      <div style={{ ...styles.vpRow, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '10px 14px' }}>
        <span>❌</span>
        <span style={{ fontSize: '12px', color: 'var(--trust-low)', flex: 1 }}>{result?.error}</span>
        <button style={styles.vpInlineBtn} onClick={() => setPhase('idle')}>Retry</button>
      </div>
    )
  }

  return null
}

// ─────────────────────────────────────────────
// EventCard
// ─────────────────────────────────────────────
function EventCard({ event, myDeviceId, onVerificationAction }) {
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
  const pendingVerify  = event.pending_verify  || false

  const meta    = TYPE_META[type] || TYPE_META.UNKNOWN
  const elapsed = useElapsed(firstSeen)
  const fading  = elapsed > TTL_MS

  return (
    <div style={{
      ...styles.card,
      borderLeft: `3px solid ${meta.color}`,
      opacity: fading ? 0.35 : 1,
      // Pulse the border when pending verification
      boxShadow: pendingVerify ? `0 0 0 2px rgba(245,158,11,0.35)` : undefined,
      transition: 'opacity 1s ease, box-shadow 0.3s ease',
    }}>

      {/* Pending banner */}
      {pendingVerify && (
        <div style={styles.pendingBanner}>
          <span>⚠️</span> This alert needs your verification
        </div>
      )}

      {/* Header */}
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
            <div style={{ fontSize: '15px', fontWeight: 700, color: meta.color }}>
              {meta.label} Alert
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              {formatAge(elapsed)} · hop {maxHop}
              {authorizedNode && <span style={{ color: 'var(--trust-high)', marginLeft: '6px', fontWeight: 700 }}>★ AUTHORIZED</span>}
            </div>
          </div>
        </div>
        <TrustBadge trust={trust} />
      </div>

      {/* Description / location */}
      {(description || location) && (
        <div style={styles.descBlock}>
          {description && <div style={styles.descText}>"{description}"</div>}
          {location    && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span>📍</span><span style={styles.locationText}>{location}</span></div>}
        </div>
      )}

      {/* Stats */}
      <div style={styles.statsRow}>
        <div style={styles.statBox}>
          <div style={styles.statNum}>{devicesReached}</div>
          <div style={styles.statLabel}>devices reached</div>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statBox}>
          <div style={{ ...styles.statNum, color: crossChecks >= 2 ? 'var(--trust-medium)' : undefined }}>{crossChecks}</div>
          <div style={styles.statLabel}>cross-checks</div>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statBox}>
          <div style={styles.statNum}>{maxHop}</div>
          <div style={styles.statLabel}>max hops</div>
        </div>
      </div>

      {/* Trust progress */}
      {!authorizedNode && <TrustProgress crossChecks={crossChecks} trust={trust} />}

      {/* ── Verification panel ── */}
      <VerificationPanel
        event={event}
        myDeviceId={myDeviceId}
        onAction={onVerificationAction}
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
                    {isOrigin && '📡 '}{isVerifier && !isOrigin && '✓ '}
                    {d.replace('DEVICE-', '')}
                  </span>
                )
              })}
              <div style={styles.chipLegend}>
                <span>📡 origin</span><span>✓ verified</span>
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

// ─────────────────────────────────────────────
// EventFeed
// ─────────────────────────────────────────────
export default function EventFeed({ events, myDeviceId, pendingCount, onRefresh, onVerificationAction }) {
  const [filter, setFilter] = useState('ALL')
  const safeEvents = Array.isArray(events) ? events : []

  // Sort: pending verifications first, then by time
  const sorted = [...safeEvents].sort((a, b) => {
    if (a.pending_verify && !b.pending_verify) return -1
    if (!a.pending_verify && b.pending_verify) return 1
    return (b.first_seen || 0) - (a.first_seen || 0)
  })

  const filtered = filter === 'ALL'
    ? sorted
    : sorted.filter(e => e.type === filter || e.trust === filter)

  return (
    <div style={styles.feed}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.feedTitle}>Live Alerts</span>
          <span style={styles.feedCount}>{safeEvents.length}</span>
          {pendingCount > 0 && (
            <span style={styles.pendingPill}>
              {pendingCount} need{pendingCount === 1 ? 's' : ''} verification
            </span>
          )}
        </div>
        <div style={styles.filters}>
          {['ALL', 'FIRE', 'MEDICAL', 'SECURITY', 'HIGH', 'MEDIUM', 'LOW'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}),
            }}>{f}</button>
          ))}
        </div>
        <button onClick={onRefresh} style={styles.refreshBtn} title="Refresh">↻</button>
      </div>

      {/* Cards */}
      <div style={styles.cards}>
        {filtered.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>📡</div>
            <div style={styles.emptyTitle}>No Alerts Detected</div>
            <div style={styles.emptyText}>
              MeshSentinel is listening on the mesh.<br />
              When a peer broadcasts an alert it will appear here instantly.
            </div>
          </div>
        ) : (
          filtered.map(e => (
            <EventCard
              key={e.event_id}
              event={e}
              myDeviceId={myDeviceId}
              onVerificationAction={onVerificationAction}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = {
  feed:            { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  toolbar:         { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 },
  toolbarLeft:     { display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto', flexWrap: 'wrap' },
  feedTitle:       { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  feedCount:       { background: 'var(--accent-blue)', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', fontFamily: 'var(--mono)' },
  pendingPill:     { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', letterSpacing: '0.04em' },
  filters:         { display: 'flex', gap: '4px' },
  filterBtn:       { padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s ease' },
  filterBtnActive: { background: 'var(--accent-blue)', borderColor: 'var(--accent-blue)', color: '#fff' },
  refreshBtn:      { width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cards:           { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' },
  card:            { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  pendingBanner:   { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 600, color: '#f59e0b' },
  cardTop:         { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  statsRow:        { display: 'flex', alignItems: 'stretch', padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' },
  statBox:         { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' },
  statNum:         { fontSize: '22px', fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: 'var(--text-primary)' },
  statLabel:       { fontSize: '10px', color: 'var(--text-muted)' },
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

  // ── Verification panel styles ──
  vpRow:          { display: 'flex', alignItems: 'flex-start', gap: '10px' },
  vpMuted:        { fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' },
  vpMutedBox:     { background: 'var(--bg-secondary)', borderRadius: '10px', padding: '10px 14px' },
  vpIcon:         { fontSize: '13px', flexShrink: 0, marginTop: '1px' },
  vpInlineBtn:    { background: 'none', border: 'none', padding: 0, color: 'var(--accent-blue)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'underline' },

  vpPendingBox:   { background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' },
  vpPendingHeader:{ display: 'flex', gap: '12px', alignItems: 'flex-start' },
  vpPendingTitle: { fontSize: '13px', fontWeight: 700, color: '#f59e0b', marginBottom: '4px' },
  vpPendingDesc:  { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 },

  vpConfirmBox:   { background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' },
  vpConfirmTitle: { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' },
  vpConfirmDesc:  { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 },

  vpBtnRow:       { display: 'flex', gap: '8px' },
  vpDismissBtn:   { flex: 1, padding: '9px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  vpVerifyBtn:    { flex: 2, padding: '9px 14px', border: 'none', borderRadius: '8px', background: 'var(--trust-medium)', color: '#000', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  vpCancelBtn:    { flex: 1, padding: '9px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
}