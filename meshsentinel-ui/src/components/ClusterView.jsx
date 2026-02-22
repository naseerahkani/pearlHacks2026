import { useState, useEffect, useCallback } from 'react'

const SEVERITY_META = {
  CRITICAL: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   icon: '🔴', label: 'CRITICAL' },
  HIGH:     { color: '#f97316', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.3)',  icon: '🟠', label: 'HIGH'     },
  MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  icon: '🟡', label: 'MEDIUM'   },
}

const TYPE_ICONS = { FIRE: '🔥', MEDICAL: '🚑', SECURITY: '🚨', MIXED: '⚠️', UNKNOWN: '⚠️' }

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
          <span>Ollama connected · <strong>{status.host}:{status.port}</strong></span>
          <span style={{ color: status.model_ready ? 'var(--trust-high)' : '#f59e0b' }}>
            {status.model_ready ? `✓ ${status.model} ready` : `⚠ ${status.model} not pulled yet`}
          </span>
          {!status.model_ready && (
            <span style={{ fontFamily: 'var(--mono)', background: 'var(--bg-secondary)', padding: '1px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
              run: ollama pull {status.model}
            </span>
          )}
        </>
      ) : (
        <>
          <span>Ollama not found at <strong>{status.host}:{status.port}</strong> — using rule-based fallback</span>
          <button onClick={onCheck} style={styles.smallBtn}>Retry</button>
        </>
      )}
    </div>
  )
}

function ClusterCard({ cluster, allEvents }) {
  const [expanded, setExpanded] = useState(false)
  const sev  = SEVERITY_META[cluster.severity] || SEVERITY_META.MEDIUM
  const icon = TYPE_ICONS[cluster.type]        || '⚠️'

  // Find the full event objects for this cluster
  const clusterEvents = (allEvents || []).filter(e =>
    (cluster.event_ids || []).includes(e.event_id)
  )

  return (
    <div style={{
      ...styles.clusterCard,
      borderLeft: `3px solid ${sev.color}`,
    }}>
      {/* Header row */}
      <div style={styles.clusterHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '10px',
            background: sev.bg, border: `1px solid ${sev.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', flexShrink: 0,
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {cluster.label}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {cluster.event_ids?.length || 0} report{cluster.event_ids?.length !== 1 ? 's' : ''} · {cluster.type}
              {cluster.source === 'fallback' && (
                <span style={{ marginLeft: '6px', color: 'var(--text-muted)', fontStyle: 'italic' }}>rule-based</span>
              )}
            </div>
          </div>
        </div>
        {/* Severity badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '4px 10px', borderRadius: '20px',
          background: sev.bg, border: `1px solid ${sev.border}`,
          color: sev.color, fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
          fontFamily: 'var(--mono)',
        }}>
          {sev.icon} {sev.label}
        </div>
      </div>

      {/* Summary */}
      {cluster.summary && (
        <div style={styles.clusterSummary}>"{cluster.summary}"</div>
      )}

      {/* Recommended action */}
      {cluster.recommended_action && (
        <div style={styles.actionRow}>
          <span style={styles.actionIcon}>→</span>
          <span style={styles.actionText}>{cluster.recommended_action}</span>
        </div>
      )}

      {/* Expand to see individual reports */}
      <button style={styles.expandBtn} onClick={() => setExpanded(e => !e)}>
        {expanded ? '▾' : '▸'} {expanded ? 'Hide' : 'Show'} {clusterEvents.length} individual report{clusterEvents.length !== 1 ? 's' : ''}
      </button>

      {expanded && clusterEvents.length > 0 && (
        <div style={styles.reportList}>
          {clusterEvents.map(e => (
            <div key={e.event_id} style={styles.reportRow}>
              <span style={{ fontSize: '14px' }}>{TYPE_ICONS[e.type] || '⚠️'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {e.type} · Trust: {e.trust}
                  {e.location && <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>📍 {e.location}</span>}
                </div>
                {e.description && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                    "{e.description}"
                  </div>
                )}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                  {e.cross_checks} cross-check{e.cross_checks !== 1 ? 's' : ''} · {e.devices_reached} device{e.devices_reached !== 1 ? 's' : ''} reached
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ClusterView({ events }) {
  const [status,    setStatus]    = useState(null)
  const [result,    setResult]    = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [autoRun,   setAutoRun]   = useState(false)
  const safeEvents = Array.isArray(events) ? events : []

  // Check Ollama status on mount
  const checkStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/cluster/status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ available: false, host: 'localhost', port: 11434, model: 'llama3.2:1b', model_ready: false, error: 'Backend unreachable' })
    }
  }, [])

  useEffect(() => { checkStatus() }, [checkStatus])

  // Auto-run clustering when events change (if autoRun is on)
  useEffect(() => {
    if (autoRun && safeEvents.length > 0) {
      runClustering(false)
    }
  }, [events, autoRun])

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
      if (res.ok) {
        setResult(data)
      } else {
        setError(data.error || 'Clustering failed')
      }
    } catch {
      setError('Could not reach backend')
    } finally {
      setLoading(false)
    }
  }, [safeEvents])

  // ── Empty state ──
  if (safeEvents.length === 0) {
    return (
      <div style={styles.container}>
        <StatusBar status={status} onCheck={checkStatus} />
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🧠</div>
          <div style={styles.emptyTitle}>No alerts to cluster</div>
          <div style={styles.emptyText}>Once alerts arrive on the mesh, cluster them here to identify which reports describe the same real-world incident.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <StatusBar status={status} onCheck={checkStatus} />

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.title}>Incident Clusters</span>
          {result && (
            <span style={styles.badge}>
              {result.cluster_count} cluster{result.cluster_count !== 1 ? 's' : ''} · {result.event_count} alert{result.event_count !== 1 ? 's' : ''}
            </span>
          )}
          {result?.source === 'ollama' && (
            <span style={styles.aiTag}>🧠 AI clustered</span>
          )}
          {result?.cached && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>cached</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Auto-cluster toggle */}
          <label style={styles.autoLabel}>
            <input
              type="checkbox"
              checked={autoRun}
              onChange={e => setAutoRun(e.target.checked)}
              style={{ accentColor: 'var(--accent-blue)', marginRight: '5px' }}
            />
            Auto-cluster
          </label>
          <button
            style={{ ...styles.runBtn, opacity: loading ? 0.6 : 1 }}
            onClick={() => runClustering(true)}
            disabled={loading}
          >
            {loading ? '⏳ Clustering…' : '🧠 Run Clustering'}
          </button>
        </div>
      </div>

      {/* Explainer (shown before first run) */}
      {!result && !loading && (
        <div style={styles.explainer}>
          <div style={styles.explainerTitle}>What does clustering do?</div>
          <div style={styles.explainerText}>
            Multiple devices may independently report the <em>same</em> incident.
            Clustering groups those reports together so you see one unified incident card
            instead of separate alerts — helping you prioritise the real situation.
          </div>
          <div style={styles.explainerGrid}>
            <div style={styles.explainerStep}>
              <span style={styles.stepNum}>1</span>
              <span>All {safeEvents.length} alert{safeEvents.length !== 1 ? 's' : ''} are sent to {status?.available ? `Ollama (${status.model})` : 'the rule-based engine'}</span>
            </div>
            <div style={styles.explainerStep}>
              <span style={styles.stepNum}>2</span>
              <span>Reports with matching type + location + description are grouped together</span>
            </div>
            <div style={styles.explainerStep}>
              <span style={styles.stepNum}>3</span>
              <span>Each cluster gets a severity rating and a recommended action</span>
            </div>
          </div>
          <button style={styles.runBtn} onClick={() => runClustering(true)}>
            🧠 Cluster {safeEvents.length} alert{safeEvents.length !== 1 ? 's' : ''} now
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={styles.loadingBox}>
          <div style={styles.loadingSpinner}>⏳</div>
          <div style={styles.loadingTitle}>Analysing {safeEvents.length} alerts…</div>
          <div style={styles.loadingText}>
            {status?.available
              ? `Sending to ${OLLAMA_MODEL || 'llama3.2:1b'} at ${status.host} — may take 5–15 seconds`
              : 'Running rule-based clustering…'}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <span>❌ {error}</span>
          <button style={styles.smallBtn} onClick={() => runClustering(true)}>Retry</button>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div style={styles.clusters}>
          {/* Sort: CRITICAL first */}
          {[...result.clusters]
            .sort((a, b) => {
              const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 }
              return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
            })
            .map(cluster => (
              <ClusterCard
                key={cluster.cluster_id}
                cluster={cluster}
                allEvents={safeEvents}
              />
            ))
          }
        </div>
      )}
    </div>
  )
}

const styles = {
  container:      { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  toolbar:        { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 },
  toolbarLeft:    { display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap' },
  title:          { fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  badge:          { background: 'var(--accent-blue)', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', fontFamily: 'var(--mono)' },
  aiTag:          { background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' },
  autoLabel:      { display: 'flex', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' },
  runBtn:         { padding: '8px 16px', background: 'var(--accent-blue)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'opacity 0.2s ease' },
  smallBtn:       { padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'transparent', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font)' },
  clusters:       { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' },
  clusterCard:    { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' },
  clusterHeader:  { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
  clusterSummary: { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic', paddingLeft: '4px' },
  actionRow:      { display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '8px 12px' },
  actionIcon:     { color: 'var(--trust-high)', fontWeight: 700, fontSize: '13px', flexShrink: 0 },
  actionText:     { fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 },
  expandBtn:      { background: 'none', border: 'none', padding: '2px 0', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' },
  reportList:     { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' },
  reportRow:      { display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '8px 10px' },
  explainer:      { margin: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' },
  explainerTitle: { fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' },
  explainerText:  { fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 },
  explainerGrid:  { display: 'flex', flexDirection: 'column', gap: '8px' },
  explainerStep:  { display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12px', color: 'var(--text-secondary)' },
  stepNum:        { width: '20px', height: '20px', borderRadius: '50%', background: 'var(--accent-blue)', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  loadingBox:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px' },
  loadingSpinner: { fontSize: '36px', animation: 'pulse-panic 1.5s ease-in-out infinite' },
  loadingTitle:   { fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' },
  loadingText:    { fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '320px', lineHeight: 1.6 },
  errorBox:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', margin: '16px 20px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: 'var(--trust-low)' },
  empty:          { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', gap: '12px' },
  emptyIcon:      { fontSize: '48px', opacity: 0.4 },
  emptyTitle:     { fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)' },
  emptyText:      { fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '320px' },
}