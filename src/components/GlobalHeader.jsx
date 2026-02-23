// GlobalHeader.jsx
import React, { useState, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import HeaderPencil3D from './HeaderPencil3D';
import '../styles/globalHeader.css';

function navStyle({ isActive }) {
  return {
    textDecoration: 'none',
    padding: '10px 12px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.14)',
    background: isActive ? 'rgba(0,0,0,0.26)' : 'rgba(0,0,0,0.16)',
    color: 'rgba(255,255,255,0.92)',
    fontWeight: 900,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  };
}

export default function GlobalHeader({ user, modeLabel, rightSlot }) {
  const location = useLocation();
  const headerRef = useRef(null);

  // ⭐ PANEL STATE
  const [panelOpen, setPanelOpen] = useState(false);

  const page =
    location.pathname === '/'
      ? 'Home'
      : location.pathname.startsWith('/play')
        ? 'Play'
        : 'Menu';

  return (
    <header ref={headerRef} className="gg-header gg-header--pencil">
      <HeaderPencil3D open={panelOpen} cssTargetRef={headerRef} />

      <div className="gg-header__inner">
        {/* LEFT */}
        <div className="gg-left">
          <Link to="/" className="gg-brand" aria-label="Go home">
            <span className="gg-brand__mark">🖊️</span>
            <span className="gg-brand__text">Daily Doodle</span>
          </Link>

          <nav className="gg-nav" aria-label="Primary">
            <NavLink to="/" style={navStyle}>Home</NavLink>
            <NavLink to="/play" style={navStyle}>Play</NavLink>
          </nav>
        </div>

        {/* CENTER */}
        <div className="gg-center">
          <div className="gg-pill" title={modeLabel || page}>
            <span className="gg-pill__dot" />
            <span className="gg-pill__text">{modeLabel || page}</span>
          </div>
        </div>

        {/* RIGHT */}
        <div className="gg-right">
          {rightSlot}

          {/* ⭐ NEW BUTTON */}
          <button
            className={`gg-pencil-toggle ${panelOpen ? 'is-open' : ''}`}
            onClick={() => setPanelOpen(o => !o)}
            aria-expanded={panelOpen}
            aria-controls="gg-header-panel"
          >
            ☰
          </button>

          <div className="gg-user">
            <div className="gg-user__avatar">
              {user?.displayName?.[0]?.toUpperCase() ||
                user?.email?.[0]?.toUpperCase() ||
                '👤'}
            </div>

            <div className="gg-user__meta">
              <div className="gg-user__name">
                {user?.displayName || user?.email || 'Guest'}
              </div>
              <div className="gg-user__sub">
                {user ? 'Signed in' : 'Not signed in'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL */}
      <div
        id="gg-header-panel"
        className={`gg-panel ${panelOpen ? 'is-open' : ''}`}
        role="region"
        aria-label="Header menu"
      >
        <div className="gg-panel__inner">
          <div style={{ padding: 16 }}>Panel content</div>
          <div style={{ padding: 16 }}>Panel content</div>
          <div style={{ padding: 16 }}>Panel content</div>
          <div style={{ padding: 16 }}>Panel content</div>
          <div style={{ padding: 16 }}>Panel content</div>
          <div style={{ padding: 16 }}>Panel content</div>
          <div style={{ padding: 16 }}>Panel content</div>
          <div style={{ padding: 16 }}>Panel content</div>
          <div style={{ padding: 16 }}>Panel content</div>
        </div>
      </div>
    </header>
  );
}