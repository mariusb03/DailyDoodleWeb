import { useNavigate } from 'react-router-dom';

function ModeCard({ title, description, badge, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type="button"
      className="card"
      style={{
        textAlign: 'left',
        padding: 18,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        borderColor: disabled ? 'rgba(255,255,255,0.08)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
        {badge ? <span className="pill">{badge}</span> : null}
      </div>
      <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
        {description}
      </p>
    </button>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const isDev = import.meta.env.DEV;

  return (
    <main className="container">
      <header
        className="card"
        style={{
          padding: 21,
          marginBottom: 18,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
        }}
      >
        <div className="pill">🎨 Daily game • 1 attempt per day</div>

        <h1 style={{ margin: '14px 0 8px', fontSize: 34, letterSpacing: -0.5 }}>
          Daily Doodle
        </h1>

        <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', maxWidth: 640, lineHeight: 1.5 }}>
          Draw the daily word, submit your doodle, and see if AI can guess it.
          Build streaks, earn points, and climb leaderboards.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button
            className="btn btnPrimary"
            type="button"
            onClick={() => navigate('/play')}
          >
            Play Daily Word →
          </button>

          {isDev && (
            <button
              className="btn"
              type="button"
              onClick={() => navigate('/play?date=2026-02-01')}
            >
              🧪 Dev: Time travel
            </button>
          )}
        </div>
      </header>

      <section className="grid">
        <ModeCard
          title="Daily Word"
          badge="LIVE"
          description="One word per day for everyone. One shot. Make it count."
          onClick={() => navigate('/play')}
        />

        <ModeCard
          title="Geo Mode"
          badge="Coming soon"
          disabled
          description="GeoGuessr-inspired doodle challenges and map-based modes."
        />

        <ModeCard
          title="Speed Run"
          badge="Coming soon"
          disabled
          description="Draw fast. Score fast. Chain wins for big streaks."
        />

        <ModeCard
          title="Leaderboards"
          badge="Coming soon"
          disabled
          description="Worldwide, country, and city rankings."
        />
      </section>

      <footer style={{ marginTop: 18, color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
        Tip: We’ll hide the word until after you submit once you’re done testing.
      </footer>
    </main>
  );
}
