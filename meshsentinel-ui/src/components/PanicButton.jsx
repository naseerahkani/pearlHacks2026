import { useState } from 'react'

const ALERT_TYPES = [
  { type: 'FIRE',     icon: '🔥', label: 'Fire',     desc: 'Fire or smoke detected',         color: '#f97316', bg: 'rgba(249,115,22,0.15)'  },
  { type: 'MEDICAL',  icon: '🚑', label: 'Medical',  desc: 'Medical emergency, need help',    color: '#3b82f6', bg: 'rgba(59,130,246,0.15)'  },
  { type: 'SECURITY', icon: '🚨', label: 'Security', desc: 'Security threat or active danger', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)'  },
]

export default function PanicButton({ onBroadcast }) {
  const [open, setOpen]         = useState(false)
  const [confirming, setConfirming] = useState(null) // type string
  const [authorized, setAuthorized] = useState(false)
  const [sending, setSending]   = useState(false)

  const handleTypeClick = (type) => {
    setConfirming(type)
  }

  const handleConfirm = async () => {
    if (!confirming) return
    setSending(true)
    await onBroadcast(confirming, authorized)
    setSending(false)
    setOpen(false)
    setConfirming(null)
    setAuthorized(false)
  }

  const handleClose = () => {
    if (sending) return
    setOpen(false)
    setConfirming(null)
    setAuthorized(false)
  }

  const selectedMeta = ALERT_TYPES.find(a => a.type === confirming)

  return (
    <>
      {/* Floating Panic Button */}
      <div style={styles.panicWrapper}>
        <button
          style={styles.panicBtn}
          onClick={() => setOpen(true)}
          aria-label="Broadcast Emergency Alert"
        >
          <span style={styles.panicIcon}>⚡</span>
          <span style={styles.panicText}>BROADCAST ALERT</span>
        </button>
        <div style={styles.panicHint}>Tap to send emergency alert to all peers</div>
      </div>

      {/* Modal Overlay */}
      {open && (
        <div style={styles.overlay} onClick={handleClose}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>
                <span style={{ fontSize: '20px' }}>🚨</span>
                Broadcast Emergency Alert
              </div>
              <button style={styles.closeBtn} onClick={handleClose}>✕</button>
            </div>

            {!confirming ? (
              <>
                <p style={styles.modalSubtitle}>
                  Select the alert type. This will immediately broadcast to all connected peers.
                </p>

                <div style={styles.typeGrid}>
                  {ALERT_TYPES.map(a => (
                    <button
                      key={a.type}
                      style={{ ...styles.typeBtn, borderColor: a.color, background: a.bg }}
                      onClick={() => handleTypeClick(a.type)}
                    >
                      <span style={styles.typeIcon}>{a.icon}</span>
                      <span style={{ ...styles.typeLabel, color: a.color }}>{a.label}</span>
                      <span style={styles.typeDesc}>{a.desc}</span>
                    </button>
                  ))}
                </div>

                <div style={styles.authorizedRow}>
                  <label style={styles.authLabel}>
                    <input
                      type="checkbox"
                      checked={authorized}
                      onChange={e => setAuthorized(e.target.checked)}
                      style={{ marginRight: '8px', accentColor: 'var(--trust-high)' }}
                    />
                    <span>
                      I am an <strong style={{ color: 'var(--trust-high)' }}>Authorized Node</strong>
                      {' '}— this will immediately set trust to HIGH
                    </span>
                  </label>
                </div>
              </>
            ) : (
              <div style={styles.confirmPane}>
                <div style={{
                  width: '72px', height: '72px', borderRadius: '20px',
                  background: selectedMeta.bg, border: `2px solid ${selectedMeta.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px',
                }}>
                  {selectedMeta.icon}
                </div>
                <div style={{ ...styles.confirmType, color: selectedMeta.color }}>
                  {selectedMeta.label} Alert
                </div>
                <div style={styles.confirmDesc}>
                  {selectedMeta.desc}
                </div>
                {authorized && (
                  <div style={styles.authBadge}>★ Broadcasting as Authorized Node — trust will be HIGH</div>
                )}
                <p style={styles.confirmWarning}>
                  This will immediately broadcast to all connected peers. Are you sure?
                </p>
                <div style={styles.confirmBtns}>
                  <button style={styles.cancelBtn} onClick={() => setConfirming(null)} disabled={sending}>
                    Back
                  </button>
                  <button
                    style={{ ...styles.sendBtn, background: selectedMeta.color, opacity: sending ? 0.7 : 1 }}
                    onClick={handleConfirm}
                    disabled={sending}
                  >
                    {sending ? '⏳ Sending...' : `✓ Send ${selectedMeta.label} Alert`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const styles = {
  panicWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '16px 20px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  panicBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 32px',
    background: '#dc2626',
    border: 'none',
    borderRadius: '14px',
    color: '#fff',
    cursor: 'pointer',
    animation: 'pulse-panic 2.5s ease-in-out infinite',
    fontFamily: 'var(--font)',
    fontWeight: 800,
    letterSpacing: '0.04em',
    boxShadow: '0 0 24px rgba(220, 38, 38, 0.4)',
    transition: 'background 0.2s ease',
    width: '100%',
    maxWidth: '400px',
    justifyContent: 'center',
  },
  panicIcon: {
    fontSize: '18px',
  },
  panicText: {
    fontSize: '15px',
    letterSpacing: '0.08em',
  },
  panicHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-bright)',
    borderRadius: '20px',
    padding: '28px',
    width: '100%',
    maxWidth: '480px',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  modalTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '17px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '-0.02em',
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font)',
  },
  modalSubtitle: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '20px',
    lineHeight: 1.5,
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '20px',
  },
  typeBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '18px 10px',
    border: '1.5px solid',
    borderRadius: '14px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'transform 0.15s ease, opacity 0.15s ease',
  },
  typeIcon: {
    fontSize: '28px',
    lineHeight: 1,
  },
  typeLabel: {
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.02em',
  },
  typeDesc: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: 1.3,
  },
  authorizedRow: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '12px 14px',
  },
  authLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    lineHeight: 1.5,
  },
  confirmPane: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    paddingTop: '8px',
  },
  confirmType: {
    fontSize: '22px',
    fontWeight: 900,
    letterSpacing: '-0.02em',
  },
  confirmDesc: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  authBadge: {
    background: 'var(--trust-high-bg)',
    border: '1px solid var(--trust-high-border)',
    color: 'var(--trust-high)',
    fontSize: '12px',
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: '20px',
  },
  confirmWarning: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  confirmBtns: {
    display: 'flex',
    gap: '10px',
    marginTop: '8px',
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    padding: '11px',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  sendBtn: {
    flex: 2,
    padding: '11px',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    letterSpacing: '0.02em',
    transition: 'opacity 0.2s ease',
  },
}
