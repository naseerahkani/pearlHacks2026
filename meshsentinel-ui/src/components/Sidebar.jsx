import { useState, useEffect } from 'react'

const TYPE_ICONS = {
  police:    { icon: '🚔', color: '#3b82f6' },
  medical:   { icon: '🏥', color: '#10b981' },
  fire:      { icon: '🔥', color: '#f97316' },
  emergency: { icon: '🆘', color: '#ef4444' },
  utility:   { icon: '⚡', color: '#f59e0b' },
  state:     { icon: '🏛️', color: '#8b5cf6' },
}

export default function Sidebar() {
  const [contacts, setContacts] = useState([])

  useEffect(() => {
    fetch('/api/emergency-contacts')
      .then(r => r.json())
      .then(setContacts)
      .catch(() => {
        // Hardcode fallback if backend unreachable
        setContacts([
          { name: 'UNC Campus Police',     number: '919-962-8100', type: 'police'    },
          { name: 'UNC Health ER',         number: '919-966-4131', type: 'medical'   },
          { name: 'Chapel Hill Fire Dept', number: '919-968-2784', type: 'fire'      },
          { name: 'Orange County 911',     number: '911',          type: 'emergency' },
          { name: 'Duke Energy Outages',   number: '800-769-3766', type: 'utility'   },
          { name: 'Poison Control',        number: '800-222-1222', type: 'medical'   },
        ])
      })
  }, [])

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>📞</span>
        <span style={styles.headerTitle}>Emergency Contacts</span>
      </div>
      <div style={styles.badge}>Available Offline</div>

      <div style={styles.list}>
        {contacts.map((c, i) => {
          const meta = TYPE_ICONS[c.type] || { icon: '📞', color: '#6b7280' }
          return (
            <div key={i} style={styles.contact}>
              <div style={{ ...styles.contactIcon, background: `${meta.color}20` }}>
                {meta.icon}
              </div>
              <div style={styles.contactInfo}>
                <div style={styles.contactName}>{c.name}</div>
                <a
                  href={`tel:${c.number.replace(/-/g, '')}`}
                  style={{ ...styles.contactNumber, color: meta.color }}
                >
                  {c.number}
                </a>
              </div>
            </div>
          )
        })}
      </div>

      <div style={styles.footer}>
        <div style={styles.footerTitle}>About MeshSentinel</div>
        <p style={styles.footerText}>
          Peer-to-peer mesh networking over Wi-Fi Direct.
          No internet. No cell signal required.
          Trust is built through independent cross-verification.
        </p>
        <div style={styles.trustLegend}>
          <div style={styles.legendRow}>
            <div style={{ ...styles.dot, background: 'var(--trust-low)' }}/>
            <span>LOW — 1 report</span>
          </div>
          <div style={styles.legendRow}>
            <div style={{ ...styles.dot, background: 'var(--trust-medium)' }}/>
            <span>MEDIUM — 3+ reports</span>
          </div>
          <div style={styles.legendRow}>
            <div style={{ ...styles.dot, background: 'var(--trust-high)' }}/>
            <span>HIGH — 10+ or Authorized Node</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-secondary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 16px 8px',
    flexShrink: 0,
  },
  headerIcon: {
    fontSize: '16px',
  },
  headerTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  badge: {
    margin: '0 16px 10px',
    padding: '3px 10px',
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    borderRadius: '20px',
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--trust-high)',
    letterSpacing: '0.06em',
    width: 'fit-content',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  contact: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px',
    borderRadius: '8px',
    transition: 'background 0.15s ease',
  },
  contactIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
    flexShrink: 0,
  },
  contactInfo: {
    flex: 1,
    minWidth: 0,
  },
  contactName: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  contactNumber: {
    fontSize: '12px',
    fontFamily: 'var(--mono)',
    textDecoration: 'none',
    fontWeight: 600,
  },
  footer: {
    padding: '12px 16px 16px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  footerTitle: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: '8px',
  },
  footerText: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    marginBottom: '10px',
  },
  trustLegend: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  dot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
  },
}
