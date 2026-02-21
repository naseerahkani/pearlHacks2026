import { useState } from 'react'

function SafetyPulse({ connected }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        background: connected ? 'var(--trust-high)' : 'var(--trust-low)',
        animation: connected ? 'pulse-green 2s infinite' : 'pulse-red 2s infinite',
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: '12px',
        color: connected ? 'var(--trust-high)' : 'var(--trust-low)',
        fontWeight: 600,
        letterSpacing: '0.05em',
      }}>
        {connected ? `${connected} PEER${connected > 1 ? 'S' : ''} CONNECTED` : 'ISOLATED'}
      </span>
    </div>
  )
}

export default function Header({ deviceId, connectedPeers, eventCount, onOpenPeerMgr }) {
  return (
    <header style={styles.header}>
      <div style={styles.left}>
        {/* Logo */}
        <div style={styles.logo}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <polygon points="14,2 26,8 26,20 14,26 2,20 2,8" fill="none" stroke="#3b82f6" strokeWidth="1.5"/>
            <polygon points="14,6 22,10 22,18 14,22 6,18 6,10" fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.5"/>
            <circle cx="14" cy="14" r="3" fill="#3b82f6"/>
            <line x1="14" y1="2"  x2="14" y2="6"  stroke="#3b82f6" strokeWidth="1.5"/>
            <line x1="14" y1="22" x2="14" y2="26" stroke="#3b82f6" strokeWidth="1.5"/>
            <line x1="2"  y1="8"  x2="6"  y2="10" stroke="#3b82f6" strokeWidth="1.5"/>
            <line x1="22" y1="18" x2="26" y2="20" stroke="#3b82f6" strokeWidth="1.5"/>
            <line x1="26" y1="8"  x2="22" y2="10" stroke="#3b82f6" strokeWidth="1.5"/>
            <line x1="6"  y1="18" x2="2"  y2="20" stroke="#3b82f6" strokeWidth="1.5"/>
          </svg>
          <div>
            <div style={styles.logoName}>MeshSentinel</div>
            <div style={styles.logoSub}>Offline-First P2P Safety</div>
          </div>
        </div>

        <div style={styles.divider} />

        <SafetyPulse connected={connectedPeers} />
      </div>

      <div style={styles.right}>
        <div style={styles.stat}>
          <span style={styles.statNum}>{eventCount}</span>
          <span style={styles.statLabel}>ACTIVE ALERTS</span>
        </div>

        <button style={styles.peerBtn} onClick={onOpenPeerMgr} title="Manage Peers">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="5" r="2.5" opacity="0.7"/>
            <circle cx="11" cy="5" r="2.5" opacity="0.7"/>
            <circle cx="8" cy="11" r="2.5"/>
            <line x1="5" y1="7.5" x2="8" y2="9" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="11" y1="7.5" x2="8" y2="9" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          Manage Peers
        </button>

        {deviceId && (
          <div style={styles.deviceId} title="Your Device ID">
            {deviceId}
          </div>
        )}
      </div>
    </header>
  )
}

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: '60px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    gap: '16px',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoName: {
    fontSize: '16px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  logoSub: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  divider: {
    width: '1px',
    height: '28px',
    background: 'var(--border)',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    lineHeight: 1.2,
  },
  statNum: {
    fontSize: '18px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    fontFamily: 'var(--mono)',
  },
  statLabel: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    letterSpacing: '0.1em',
  },
  peerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    background: 'transparent',
    border: '1px solid var(--border-bright)',
    borderRadius: '8px',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'all 0.15s ease',
  },
  deviceId: {
    fontFamily: 'var(--mono)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    background: 'var(--bg-card)',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    letterSpacing: '0.05em',
  },
}
