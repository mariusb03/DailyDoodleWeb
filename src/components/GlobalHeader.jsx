import { Link, NavLink, useLocation } from 'react-router-dom';

function navStyle({ isActive }) {
  return {
    textDecoration: 'none',
    padding: '10px 12px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    background: isActive ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.92)',
    fontWeight: 900,
  };
}

export default function GlobalHeader({ user, modeLabel, rightSlot }) {
  const location = useLocation();

  const page =
    location.pathname === '/'
      ? 'Home'
      : location.pathname.startsWith('/play')
        ? 'Play'
        : 'Menu';

  return (
    <header className="gg-header">
      <div className="gg-header__inner">
        {/* LEFT */}
        <div className="gg-left">
          <Link to="/" className="gg-brand" aria-label="Go home">
            <span className="gg-brand__mark">🖊️</span>
            <span className="gg-brand__text">Daily Doodle</span>
          </Link>

          <nav className="gg-nav" aria-label="Primary">
            <NavLink to="/" style={navStyle}>
              Home
            </NavLink>
            <NavLink to="/play" style={navStyle}>
              Play
            </NavLink>
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

          <div className="gg-user">
            <div className="gg-user__avatar" aria-hidden="true">
              {user?.displayName?.[0]?.toUpperCase() ||
                user?.email?.[0]?.toUpperCase() ||
                '👤'}
            </div>

            <div className="gg-user__meta">
              <div className="gg-user__name">
                {user?.displayName || user?.email || 'Guest'}
              </div>
              <div className="gg-user__sub">{user ? 'Signed in' : 'Not signed in'}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
