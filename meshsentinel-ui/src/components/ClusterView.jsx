import { useState, useEffect, useCallback } from 'react'

const SEVERITY_META = {
  CRITICAL: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   icon: '🔴', label: 'CRITICAL' },
  HIGH:     { color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.3)',  icon: '🟠', label: 'HIGH'     },
  MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  icon: '🟡', label: 'MEDIUM'   },
}

const TYPE_ICONS  = { FIRE: '🔥', MEDICAL: '🚑', SECURITY: '🚨', MIXED: '⚠️', UNKNOWN: '⚠️' }
const TRUST_COLOR = { HIGH: 'var(--trust-high)', MEDIUM: 'var(--trust-medium)', LOW: 'var(--trust-low)' }

function StatusBar({ status, onCheck }) {
  if (!status) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '8px 16px', fontSize: '11px',
      background: status.available ? 'rgba(16,185,129,0.06)' : 'rgba(107,114,128,0.08)',
      borderBottom: '1px solid var(--border)',
      color: status.available ? 'var(--trust-high)' : 'var(--text-muted)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: '8px' }}>{status.available ? '●' : '○'}</span>
      {status.available ? (
        <>
          <span>Ollama · <strong>{status.host}:{status.port}</strong></span>
          <span style={{ color: status.model_ready ? 'var(--trust-high)' : '#f59e0b' }}>
            {status.model_ready ? `✓ ${status.model} ready` : `⚠ ${status.model} not pulled`}
          </span>
          {!status.model_ready && (
            <span style={{ fontFamily: 'var(--mono)', background: 'var(--bg-secondary)', padding: '1px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
              ollama pull {status.model}
            </span>
          )}
        </>
      ) : (
        <>
          <span>Ollama offline — rule-based fallback active</span>
          <button onClick={onCheck} style={styles.smallBtn}>Retry</button>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Aggregate stats across all events in a cluster
// ─────────────────────────────────────────────
function aggregateCluster(cluster, allEvents) {
  const clusterEvents = (allEvents || []).filter(e =>
    (cluster.event_ids || []).includes(e.event_id)
  )
  const totalDevices   = new Set(clusterEvents.flatMap(e => e.devices_reached_ids || [])).size
  const totalChecks    = new Set(clusterEvents.flatMap(e => e.cross_check_ids    || [])).size
  const maxHop         = Math.max(0, ...clusterEvents.map(e => e.max_hop || 0))
  const highestTrust   = clusterEvents.some(e => e.trust === 'HIGH')   ? 'HIGH'
                       : clusterEvents.some(e => e.trust === 'MEDIUM') ? 'MEDIUM' : 'LOW'
  const locations      = [...new Set(clusterEvents.map(e => e.location).filter(Boolean))]
  const descriptions   = clusterEvents.map(e => e.description).filter(Boolean)
  return { clusterEvents, totalDevices, totalChecks, maxHop, highestTrust, locations, descriptions }
}

// ─────────────────────────────────────────────
// The main condensed cluster card
// ─────────────────────────────────────────────
function ClusterCard({ cluster, allEvents }) {
  const [expanded, setExpanded] = useState(false)
  const sev  = SEVERITY_META[cluster.severity] || SEVERITY_META.MEDIUM
  const icon = TYPE_ICONS[cluster.type] || '⚠️'
  const { clusterEvents, totalDevices, totalChecks, maxHop, highestTrust, locations } = aggregateCluster(cluster, allEvents)
  const reportCount = clusterEvents.length

  return (
    <div style={{ ...styles.clusterCard, borderLeft: `3px solid ${sev.color}` }}>

      {/* ── Top: icon + label + severity badge ── */}
      <div style={styles.clusterTop}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
          background: sev.bg, border: `1px solid ${sev.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px', flexShrink: 0,
        }}>
          {icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {cluster.label}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>{cluster.type}</span>
            {locations.length > 0 && <><span style={{ opacity: 0.4 }}>·</span><span>📍 {locations[0]}{locations.length > 1 ? ` +${locations.length - 1}` : ''}</span></>}
            {cluster.source === 'fallback' && <span style={{ fontStyle: 'italic' }}>rule-based</span>}
          </div>
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '4px 10px', borderRadius: '20px',
          background: sev.bg, border: `1px solid ${sev.border}`,
          color: sev.color, fontSize: '10px', fontWeight: 700,
          letterSpacing: '0.08em', fontFamily: 'var(--mono)', flexShrink: 0,
        }}>
          {sev.icon} {sev.label}
        </div>
      </div>

      {/* ── AI Summary ── */}
      {cluster.summary && (
        <div style={styles.summary}>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em' }}>AI SUMMARY</span>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '3px' }}>
            {cluster.summary}
          </div>
        </div>
      )}

      {/* ── Aggregated stats across all reports in this cluster ── */}
      <div style={styles.statsRow}>
        <div style={styles.statBox}>
          <div style={styles.statNum}>{reportCount}</div>
          <div style={styles.statLabel}>reports</div>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statBox}>
          <div style={styles.statNum}>{totalDevices}</div>
          <div style={styles.statLabel}>devices reached</div>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statBox}>
          <div style={{ ...styles.statNum, color: TRUST_COLOR[highestTrust] }}>{totalChecks}</div>
          <div style={styles.statLabel}>cross-checks</div>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statBox}>
          <div style={styles.statNum}>{maxHop}</div>
          <div style={styles.statLabel}>max hops</div>
        </div>
      </div>

      {/* ── Trust summary bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
          CLUSTER TRUST
        </span>
        <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '3px',
            background: TRUST_COLOR[highestTrust],
            width: highestTrust === 'HIGH' ? '100%' : highestTrust === 'MEDIUM' ? '55%' : '20%',
            transition: 'width 0.5s ease',
          }} />
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, color: TRUST_COLOR[highestTrust], fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
          {highestTrust}
        </span>
      </div>

      {/* ── Recommended action ── */}
      {cluster.recommended_action && (
        <div style={styles.actionRow}>
          <span style={styles.actionIcon}>→</span>
          <span style={styles.actionText}>{cluster.recommended_action}</span>
        </div>
      )}

      {/* ── Expand to show individual reports ── */}
      <button style={styles.expandBtn} onClick={() => setExpanded(e => !e)}>
        {expanded ? '▾ Hide' : '▸ Show'} {reportCount} individual report{reportCount !== 1 ? 's' : ''}
      </button>

      {expanded && (
        <div style={styles.reportList}>
          {clusterEvents.map(e => (
            <div key={e.event_id} style={styles.reportRow}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>{TYPE_ICONS[e.type] || '⚠️'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{e.type}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: TRUST_COLOR[e.trust], fontFamily: 'var(--mono)' }}>{e.trust}</span>
                  {e.location && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📍 {e.location}</span>}
                </div>
                {e.description && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '3px', lineHeight: 1.4 }}>
                    "{e.description}"
                  </div>
                )}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginTop: '3px' }}>
                  {e.cross_checks} check{e.cross_checks !== 1 ? 's' : ''} · {e.devices_reached} device{e.devices_reached !== 1 ? 's' : ''} · hop {e.max_hop}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// ClusterView
// ─────────────────────────────────────────────
export default function ClusterView({ events }) {
  const [status,  setStatus]  = useState(null)
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [autoRun, setAutoRun] = useState(false)
  const safeEvents = Array.isArray(events) ? events : []

  const checkStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/cluster/status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ available: false, host: 'localhost', port: 11434, model: 'llama3.2:1b', model_ready: false })
    }
  }, [])

  useEffect(() => { checkStatus() }, [checkStatus])

  const runClustering = useCallback(async (force = true) => {
    if (safeEvents.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/cluster', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ force }),
      })
      const data = await res.json()
      if (res.ok) setResult(data)
      else        setError(data.error || 'Clustering failed')
    } catch {
      setError('Could not reach backend')
    } finally {
      setLoading(false)
    }
  }, [safeEvents])

  useEffect(() => {
    if (autoRun && safeEvents.length > 0) runClustering(false)
  }, [events, autoRun, runClustering])

  if (safeEvents.length === 0) {
    return (
      <div style={styles.container}>
        <StatusBar status={status} onCheck={checkStatus} />
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🧠</div>
          <div style={styles.emptyTitle}>No alerts to cluster</div>
          <div style={styles.emptyText}>Once alerts arrive on the mesh, run clustering to group similar reports into unified incident cards.</div>
        </div>
      </div>
    )
  }

  // Derive summary counts from result
  const totalReports  = result?.event_count   || 0
  const totalClusters = result?.cluster_count || 0
  const dedupSaved    = totalReports - totalClusters

  return (
    <div style={styles.container}>
      <StatusBar status={status} onCheck={checkStatus} />

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.title}>Incident Clusters</span>
          {result && (
            <>
              <span style={styles.badge}>{totalClusters} incident{totalClusters !== 1 ? 's' : ''}</span>
              {dedupSaved > 0 && (
                <span style={styles.dedupTag}>↓ {dedupSaved} duplicate{dedupSaved !== 1 ? 's' : ''} merged</span>
              )}
              {result.source === 'ollama' && <span style={styles.aiTag}>🧠 AI</span>}
              {result.cached && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>cached</span>}
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={styles.autoLabel}>
            <input type="checkbox" checked={autoRun} onChange={e => setAutoRun(e.target.checked)}
              style={{ accentColor: 'var(--accent-blue)', marginRight: '5px' }} />
            Auto
          </label>
          <button style={{ ...styles.runBtn, opacity: loading ? 0.6 : 1 }}
            onClick={() => runClustering(true)} disabled={loading}>
            {loading ? '⏳ Clustering…' : '🧠 Run Clustering'}
          </button>
        </div>
      </div>

      {/* Explainer before first run */}
      {!result && !loading && (
        <div style={styles.explainer}>
          <div style={styles.explainerTitle}>Group similar alerts into unified incidents</div>
          <div style={styles.explainerText}>
            Multiple devices reporting the same emergency become <strong>one condensed incident card</strong>.
            You see the aggregated picture — total devices reached, combined cross-checks, highest trust —
            with individual reports available on demand by expanding the card.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              `${safeEvents.length} raw alert${safeEvents.length !== 1 ? 's' : ''} → analysed by ${status?.available ? `Ollama (${status.model})` : 'rule-based engine'}`,
              'Similar type + location + description → merged into one incident',
              'Each incident card shows aggregated stats + recommended action',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--accent-blue)', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ paddingTop: '2px' }}>{s}</span>
              </div>
            ))}
          </div>
          <button style={styles.runBtn} onClick={() => runClustering(true)}>
            🧠 Cluster {safeEvents.length} alert{safeEvents.length !== 1 ? 's' : ''} now
          </button>
        </div>
      )}

      {loading && (
        <div style={styles.loadingBox}>
          <div style={{ fontSize: '36px' }}>⏳</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Grouping {safeEvents.length} alerts…</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '320px', lineHeight: 1.6 }}>
            {status?.available
              ? `Sending to ${status?.model || 'llama3.2:1b'} at ${status?.host} — may take 10–30 seconds`
              : 'Running rule-based clustering…'}
          </div>
        </div>
      )}

      {error && (
        <div style={styles.errorBox}>
          <span>❌ {error}</span>
          <button style={styles.smallBtn} onClick={() => runClustering(true)}>Retry</button>
        </div>
      )}

      {result && !loading && (
        <div style={styles.clusters}>
          {[...result.clusters]
            .sort((a, b) => ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2 }[a.severity] ?? 3) - ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2 }[b.severity] ?? 3))
            .map(cluster => (
              <ClusterCard key={cluster.cluster_id} cluster={cluster} allEvents={safeEvents} />
            ))
          }
        </div>
      )}
    </div>
  )
}

const styles = {
  container:   { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  toolbar:     { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap' },
  title:       { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  badge:       { background: 'var(--accent-blue)', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', fontFamily: 'var(--mono)' },
  dedupTag:    { background: 'rgba(16,185,129,0.1)', color: 'var(--trust-high)', border: '1px solid rgba(16,185,129,0.25)', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' },
  aiTag:       { background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' },
  autoLabel:   { display: 'flex', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' },
  runBtn:      { padding: '8px 16px', background: 'var(--accent-blue)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'opacity 0.2s ease' },
  smallBtn:    { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font)' },
  clusters:    { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' },

  clusterCard: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  clusterTop:  { display: 'flex', alignItems: 'flex-start', gap: '12px' },
  summary:     { background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 12px', borderLeft: '2px solid var(--border-bright)' },
  statsRow:    { display: 'flex', alignItems: 'stretch', padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' },
  statBox:     { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px' },
  statNum:     { fontSize: '20px', fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: 'var(--text-primary)' },
  statLabel:   { fontSize: '10px', color: 'var(--text-muted)' },
  statDivider: { width: '1px', background: 'var(--border)', margin: '0 8px', flexShrink: 0 },
  actionRow:   { display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '8px 12px' },
  actionIcon:  { color: 'var(--trust-high)', fontWeight: 700, fontSize: '13px', flexShrink: 0 },
  actionText:  { fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 },
  expandBtn:   { background: 'none', border: 'none', padding: '2px 0', color: 'var(--accent-blue)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' },
  reportList:  { display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '10px' },
  reportRow:   { display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '8px 10px' },

  explainer:      { margin: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' },
  explainerTitle: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' },
  explainerText:  { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 },
  loadingBox:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px' },
  errorBox:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '16px 20px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: 'var(--trust-low)' },
  empty:          { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', gap: '12px' },
  emptyIcon:      { fontSize: '48px', opacity: 0.4 },
  emptyTitle:     { fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)' },
  emptyText:      { fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '320px' },
}