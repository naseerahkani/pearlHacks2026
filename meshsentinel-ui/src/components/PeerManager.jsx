import { useState } from 'react'

export default function PeerManager({ peers, onClose, onAddPeer, onRemovePeer }) {
  const [newIp, setNewIp]   = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError]   = useState('')

  const validateIp = (ip) => {
    const parts = ip.split('.')
    return parts.length === 4 && parts.every(p => {
      const n = parseInt(p)
      return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p
    })
  }

  const handleAdd = async () => {
    const ip = newIp.trim()
    if (!ip) return
    if (!validateIp(ip)) {
      setError('Invalid IP address. Example: 192.168.137.2')
      return
    }
    setError('')
    setAdding(true)
    await onAddPeer(ip)
    setNewIp('')
    setAdding(false)
  }

  const discoveredPeers = peers.discovered_peers || []
  const manualPeers     = peers.manual_peers || []
  const myIps           = peers.my_ips || []

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}><span>🔗</span> Peer Management</div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* This device */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>THIS DEVICE</div>
          <div style={styles.deviceId}>{peers.device_id || 'Loading...'}</div>
          {myIps.length > 0 && (
            <div style={styles.myIps}>
              {myIps.map(ip => (
                <span key={ip} style={styles.ipChip}>{ip}</span>
              ))}
            </div>
          )}
        </div>

        {/* Auto-discovered peers */}
        <div style={styles.section}>
          <div style={styles.sectionLabelRow}>
            <div style={styles.sectionLabel}>AUTO-DISCOVERED PEERS</div>
            <div style={{
              ...styles.badge,
              background: discoveredPeers.length > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
              color: discoveredPeers.length > 0 ? 'var(--trust-high)' : 'var(--text-muted)',
              borderColor: discoveredPeers.length > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.2)',
            }}>
              {discoveredPeers.length} found
            </div>
          </div>

          {discoveredPeers.length === 0 ? (
            <div style={styles.emptyBox}>
              <div style={styles.emptyIcon}>📡</div>
              <div style={styles.emptyText}>
                Listening for peers on the network…<br/>
                Start MeshSentinel on another machine on the same Wi-Fi to see it appear here automatically.
              </div>
            </div>
          ) : (
            <div style={styles.peerList}>
              {discoveredPeers.map(p => (
                <div key={p.ip} style={styles.peerRow}>
                  <div style={styles.peerLeft}>
                    <div style={{ ...styles.peerDot, background: 'var(--trust-high)' }} />
                    <span style={styles.peerIp}>{p.ip}</span>
                    <span style={{ ...styles.sourceTag, color: 'var(--trust-high)', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)' }}>
                      auto
                    </span>
                  </div>
                  <span style={styles.lastSeen}>{p.last_seen_ago}s ago</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual peers */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>MANUALLY ADDED PEERS</div>
          {manualPeers.length === 0 ? (
            <div style={styles.hint}>None — use the field below to add one manually.</div>
          ) : (
            <div style={styles.peerList}>
              {manualPeers.map(p => (
                <div key={p.ip} style={styles.peerRow}>
                  <div style={styles.peerLeft}>
                    <div style={{ ...styles.peerDot, background: 'var(--accent-blue)' }} />
                    <span style={styles.peerIp}>{p.ip}</span>
                    <span style={{ ...styles.sourceTag, color: 'var(--accent-blue)', borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.08)' }}>
                      manual
                    </span>
                  </div>
                  <button style={styles.removeBtn} onClick={() => onRemovePeer(p.ip)} title="Remove">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add peer manually */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>ADD PEER MANUALLY</div>
          <div style={styles.addRow}>
            <input
              type="text"
              placeholder="192.168.137.2"
              value={newIp}
              onChange={e => { setNewIp(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              style={styles.ipInput}
            />
            <button style={styles.addBtn} onClick={handleAdd} disabled={adding || !newIp.trim()}>
              {adding ? '…' : 'Add'}
            </button>
          </div>
          {error && <div style={styles.error}>{error}</div>}
        </div>

        {/* How auto-discovery works */}
        <div style={styles.infoBox}>
          <div style={styles.infoTitle}>⚡ How Auto-Discovery Works</div>
          <p style={styles.infoText}>
            Every machine running MeshSentinel broadcasts a UDP announcement every 3 seconds
            to the entire subnet. Any machine listening on the same network picks it up and
            automatically adds the sender as a peer — <strong style={{ color: 'var(--text-primary)' }}>no manual IP setup needed</strong>.
            Peers that go offline are automatically removed after 15 seconds.
          </p>
          <div style={styles.infoTitle} style={{ marginTop: '10px', ...styles.infoTitle }}>📡 Wi-Fi Direct Setup (Windows)</div>
          <ol style={styles.ol}>
            <li>Machine A: Settings → Network & Internet → Mobile Hotspot → Turn ON</li>
            <li>Machine B (and C): Connect to Machine A's hotspot via Wi-Fi</li>
            <li>Start <code style={styles.code}>python server.py</code> on all machines</li>
            <li>Wait ~5 seconds — peers appear automatically in this panel</li>
          </ol>
        </div>

      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '20px',
  },
  modal: {
    background: 'var(--bg-card)', border: '1px solid var(--border-bright)',
    borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '480px',
    maxHeight: '88vh', overflowY: 'auto',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column', gap: '0',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '20px',
  },
  title: {
    fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)',
    display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '-0.01em',
  },
  closeBtn: {
    width: '32px', height: '32px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font)',
  },
  section: {
    marginBottom: '18px', paddingBottom: '18px',
    borderBottom: '1px solid var(--border)',
  },
  sectionLabel: {
    fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
    letterSpacing: '0.1em', marginBottom: '8px',
  },
  sectionLabelRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '10px',
  },
  badge: {
    fontSize: '10px', fontWeight: 700, padding: '2px 10px',
    borderRadius: '20px', border: '1px solid', letterSpacing: '0.04em',
  },
  deviceId: {
    fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--accent-blue)',
    background: 'var(--bg-secondary)', padding: '8px 12px',
    borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '8px',
  },
  myIps: {
    display: 'flex', flexWrap: 'wrap', gap: '6px',
  },
  ipChip: {
    fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-secondary)',
    background: 'var(--bg-secondary)', padding: '3px 9px',
    borderRadius: '6px', border: '1px solid var(--border)',
  },
  emptyBox: {
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '12px', background: 'var(--bg-secondary)',
    borderRadius: '10px', border: '1px dashed var(--border-bright)',
  },
  emptyIcon: { fontSize: '22px', flexShrink: 0 },
  emptyText: {
    fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5,
  },
  peerList: {
    display: 'flex', flexDirection: 'column', gap: '4px',
  },
  peerRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 12px', background: 'var(--bg-secondary)',
    borderRadius: '8px', border: '1px solid var(--border)',
  },
  peerLeft: {
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  peerDot: {
    width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
  },
  peerIp: {
    fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--text-primary)',
  },
  sourceTag: {
    fontSize: '9px', fontWeight: 700, padding: '1px 7px',
    borderRadius: '10px', border: '1px solid', letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  lastSeen: {
    fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)',
  },
  removeBtn: {
    width: '22px', height: '22px', border: 'none',
    background: 'rgba(239,68,68,0.15)', color: 'var(--trust-low)',
    borderRadius: '5px', fontSize: '11px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font)',
  },
  hint: { fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' },
  addRow: { display: 'flex', gap: '8px' },
  ipInput: {
    flex: 1, padding: '9px 12px',
    background: 'var(--bg-secondary)', border: '1px solid var(--border-bright)',
    borderRadius: '8px', color: 'var(--text-primary)',
    fontFamily: 'var(--mono)', fontSize: '13px', outline: 'none',
  },
  addBtn: {
    padding: '9px 18px', background: 'var(--accent-blue)',
    border: 'none', borderRadius: '8px', color: '#fff',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)', transition: 'opacity 0.2s ease',
  },
  error: { fontSize: '11px', color: 'var(--trust-low)', marginTop: '6px' },
  infoBox: {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: '10px', padding: '14px',
  },
  infoTitle: {
    fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)',
    marginBottom: '8px',
  },
  infoText: {
    fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6,
    marginBottom: '10px',
  },
  ol: {
    paddingLeft: '18px', display: 'flex', flexDirection: 'column',
    gap: '5px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5,
  },
  code: {
    fontFamily: 'var(--mono)', background: 'var(--bg-card)',
    padding: '1px 5px', borderRadius: '4px',
    fontSize: '11px', color: 'var(--accent-blue)',
  },
}
