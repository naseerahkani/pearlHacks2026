export default function Toast({ msg, type }) {
  const colors = {
    alert:   { bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.4)',   color: '#ef4444' },
    success: { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.4)',  color: '#10b981' },
    error:   { bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.4)',   color: '#ef4444' },
    info:    { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.4)',  color: '#3b82f6' },
  }
  const c = colors[type] || colors.info

  return (
    <div style={{
      padding: '10px 16px',
      borderRadius: '10px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.color,
      fontSize: '13px',
      fontWeight: 600,
      whiteSpace: 'nowrap',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      pointerEvents: 'none',
      animation: 'slide-in 0.2s ease',
      maxWidth: '360px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>
      {msg}
    </div>
  )
}
