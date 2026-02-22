import { useState, useRef } from 'react'

const ALERT_TYPES = [
  { type: 'FIRE',     icon: '🔥', label: 'Fire',     desc: 'Fire or smoke detected',          color: '#f97316', bg: 'rgba(249,115,22,0.15)'  },
  { type: 'MEDICAL',  icon: '🚑', label: 'Medical',  desc: 'Medical emergency, need help',     color: '#3b82f6', bg: 'rgba(59,130,246,0.15)'  },
  { type: 'SECURITY', icon: '🚨', label: 'Security', desc: 'Security threat or active danger',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)'  },
]

export default function PanicButton({ onBroadcast }) {
  const [open, setOpen]               = useState(false)
  const [confirming, setConfirming]   = useState(null)
  const [authorized, setAuthorized]   = useState(false)
  const [description, setDescription] = useState('')
  const [location, setLocation]       = useState('')
  const [imageFile, setImageFile]     = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [sending, setSending]         = useState(false)
  const fileInputRef = useRef(null)

  const handleTypeClick = (type) => setConfirming(type)

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleConfirm = async () => {
    if (!confirming) return
    setSending(true)

    let imageUrl = null
    if (imageFile) {
      try {
        const formData = new FormData()
        formData.append('image', imageFile)
        const res  = await fetch('/api/images/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (res.ok) imageUrl = data.url
      } catch { /* continue without image */ }
    }

    await onBroadcast(confirming, authorized, description.trim(), location.trim(), imageUrl)
    setSending(false)
    handleClose()
  }

  const handleClose = () => {
    if (sending) return
    setOpen(false); setConfirming(null); setAuthorized(false)
    setDescription(''); setLocation(''); clearImage()
  }

  const selectedMeta = ALERT_TYPES.find(a => a.type === confirming)

  return (
    <>
      <div style={styles.panicWrapper}>
        <button style={styles.panicBtn} onClick={() => setOpen(true)}>
          <span style={styles.panicIcon}>⚡</span>
          <span style={styles.panicText}>BROADCAST ALERT</span>
        </button>
        <div style={styles.panicHint}>Tap to send emergency alert to all peers in the mesh</div>
      </div>

      {open && (
        <div style={styles.overlay} onClick={handleClose}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}><span>🚨</span> Broadcast Emergency Alert</div>
              <button style={styles.closeBtn} onClick={handleClose}>✕</button>
            </div>

            {!confirming ? (
              <>
                <p style={styles.modalSubtitle}>
                  Select the alert type. This will immediately broadcast to all connected mesh peers.
                </p>
                <div style={styles.typeGrid}>
                  {ALERT_TYPES.map(a => (
                    <button key={a.type} style={{ ...styles.typeBtn, borderColor: a.color, background: a.bg }} onClick={() => handleTypeClick(a.type)}>
                      <span style={styles.typeIcon}>{a.icon}</span>
                      <span style={{ ...styles.typeLabel, color: a.color }}>{a.label}</span>
                      <span style={styles.typeDesc}>{a.desc}</span>
                    </button>
                  ))}
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>DESCRIPTION <span style={styles.optional}>(optional but helpful)</span></label>
                  <textarea placeholder="e.g. Smoke coming from 3rd floor stairwell, building evacuating..." value={description} onChange={e => setDescription(e.target.value)} maxLength={280} rows={3} style={styles.textarea} />
                  <div style={styles.charCount}>{description.length}/280</div>
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>LOCATION <span style={styles.optional}>(optional)</span></label>
                  <input type="text" placeholder="e.g. Granville East, Room 204, Pittsboro St corner..." value={location} onChange={e => setLocation(e.target.value)} maxLength={100} style={styles.input} />
                </div>

                {/* ── Photo field ── */}
                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>PHOTO <span style={styles.optional}>(optional — helps peers verify)</span></label>
                  {!imagePreview ? (
                    <button style={styles.photoPickerBtn} onClick={() => fileInputRef.current?.click()}>
                      <span style={{ fontSize: '20px' }}>📷</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Tap to attach a photo</span>
                    </button>
                  ) : (
                    <div style={styles.previewWrapper}>
                      <img src={imagePreview} alt="Preview" style={styles.previewImg} />
                      <button style={styles.clearImgBtn} onClick={clearImage}>✕ Remove</button>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageChange} style={{ display: 'none' }} />
                </div>

                <div style={styles.authorizedRow}>
                  <label style={styles.authLabel}>
                    <input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} style={{ marginRight: '8px', accentColor: 'var(--trust-high)' }} />
                    <span>I am an <strong style={{ color: 'var(--trust-high)' }}>Authorized Node</strong> — instantly sets trust to HIGH</span>
                  </label>
                </div>
              </>
            ) : (
              <div style={styles.confirmPane}>
                <div style={{ width: '72px', height: '72px', borderRadius: '20px', background: selectedMeta.bg, border: `2px solid ${selectedMeta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>
                  {selectedMeta.icon}
                </div>
                <div style={{ ...styles.confirmType, color: selectedMeta.color }}>{selectedMeta.label} Alert</div>
                {description && (
                  <div style={styles.confirmDetail}>
                    <span style={styles.confirmDetailLabel}>Description</span>
                    <span style={styles.confirmDetailText}>"{description}"</span>
                  </div>
                )}
                {location && (
                  <div style={styles.confirmDetail}>
                    <span style={styles.confirmDetailLabel}>📍 Location</span>
                    <span style={styles.confirmDetailText}>{location}</span>
                  </div>
                )}
                {imagePreview && (
                  <div style={styles.confirmDetail}>
                    <span style={styles.confirmDetailLabel}>📷 Photo attached</span>
                    <img src={imagePreview} alt="Alert photo" style={{ width: '100%', borderRadius: '8px', marginTop: '6px', maxHeight: '160px', objectFit: 'cover' }} />
                  </div>
                )}
                {authorized && (
                  <div style={styles.authBadge}>★ Broadcasting as Authorized Node — trust will be HIGH</div>
                )}
                <p style={styles.confirmWarning}>This will immediately broadcast to all connected peers. Are you sure?</p>
                <div style={styles.confirmBtns}>
                  <button style={styles.cancelBtn} onClick={() => setConfirming(null)} disabled={sending}>← Back</button>
                  <button style={{ ...styles.sendBtn, background: selectedMeta.color, opacity: sending ? 0.7 : 1 }} onClick={handleConfirm} disabled={sending}>
                    {sending ? '⏳ Sending...' : `⚡ Send ${selectedMeta.label} Alert`}
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
  panicWrapper: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0 },
  panicBtn: { display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 32px', background: '#dc2626', border: 'none', borderRadius: '14px', color: '#fff', cursor: 'pointer', animation: 'pulse-panic 2.5s ease-in-out infinite', fontFamily: 'var(--font)', fontWeight: 800, letterSpacing: '0.04em', boxShadow: '0 0 24px rgba(220,38,38,0.4)', width: '100%', maxWidth: '400px', justifyContent: 'center' },
  panicIcon: { fontSize: '18px' },
  panicText: { fontSize: '15px', letterSpacing: '0.08em' },
  panicHint: { fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.04em' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
  modal: { background: 'var(--bg-card)', border: '1px solid var(--border-bright)', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '500px', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
  modalTitle: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  closeBtn: { width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)' },
  modalSubtitle: { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 },
  typeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' },
  typeBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '18px 10px', border: '1.5px solid', borderRadius: '14px', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'transform 0.15s ease' },
  typeIcon: { fontSize: '28px', lineHeight: 1 },
  typeLabel: { fontSize: '13px', fontWeight: 800, letterSpacing: '0.02em' },
  typeDesc: { fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 },
  fieldGroup: { marginBottom: '16px' },
  fieldLabel: { display: 'block', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '7px' },
  optional: { fontWeight: 400, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 },
  textarea: { width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-bright)', borderRadius: '10px', color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '13px', resize: 'vertical', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' },
  charCount: { fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '4px' },
  input: { width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-bright)', borderRadius: '10px', color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' },
  photoPickerBtn: { width: '100%', padding: '16px', background: 'var(--bg-secondary)', border: '1.5px dashed var(--border-bright)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontFamily: 'var(--font)' },
  previewWrapper: { position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-bright)' },
  previewImg: { width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' },
  clearImgBtn: { position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 600, padding: '4px 8px', cursor: 'pointer', fontFamily: 'var(--font)' },
  authorizedRow: { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '4px' },
  authLabel: { display: 'flex', alignItems: 'flex-start', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 1.5 },
  confirmPane: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', paddingTop: '8px' },
  confirmType: { fontSize: '22px', fontWeight: 900, letterSpacing: '-0.02em' },
  confirmDetail: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', background: 'var(--bg-secondary)', borderRadius: '10px', padding: '10px 16px', width: '100%' },
  confirmDetailLabel: { fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.1em' },
  confirmDetailText: { fontSize: '13px', color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.5 },
  authBadge: { background: 'var(--trust-high-bg)', border: '1px solid var(--trust-high-border)', color: 'var(--trust-high)', fontSize: '12px', fontWeight: 600, padding: '6px 14px', borderRadius: '20px' },
  confirmWarning: { fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 },
  confirmBtns: { display: 'flex', gap: '10px', marginTop: '8px', width: '100%' },
  cancelBtn: { flex: 1, padding: '11px', border: '1px solid var(--border)', borderRadius: '10px', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  sendBtn: { flex: 2, padding: '11px', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', letterSpacing: '0.02em', transition: 'opacity 0.2s ease' },
}