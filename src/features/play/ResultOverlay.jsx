import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/resultOverlay.css';

function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${Math.round(v * 100)}%`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default function ResultOverlay({ open, attempt, threshold, word, dateKey }) {
  const TRANSITION_MS = 240;
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // pending UX state
  const [progress, setProgress] = useState(8);
  const [phaseIdx, setPhaseIdx] = useState(0);

  const status = attempt?.status;
  const conf = Number(attempt?.confidence ?? 0);
  const win = !!attempt?.isWin;

  const pendingPhases = useMemo(
    () => [
      'AI analyzing your doodle…',
      'Extracting shapes & strokes…',
      'Comparing to today’s word…',
      'Double-checking confidence…',
      'Finalizing result…',
    ],
    [],
  );

  // Mount/unmount + fade
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(raf2);
      });
      return () => cancelAnimationFrame(raf1);
    }

    setVisible(false);
    const t = setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Progress animation while pending
  useEffect(() => {
    if (!mounted) return;

    // reset when overlay opens or status changes
    setProgress(status === 'pending' ? 10 : 100);
    setPhaseIdx(0);

    if (status !== 'pending') return;

    let p = 10;
    let stopped = false;

    // smooth progress that slows down near ~92% (never hits 100% until scored)
    const tick = setInterval(() => {
      if (stopped) return;

      const cap = 92;
      const remaining = cap - p;

      // smaller increments as we approach cap
      const step =
        remaining > 40 ? 2.6 : remaining > 20 ? 1.4 : remaining > 8 ? 0.7 : 0.25;

      p = clamp(p + step + Math.random() * 0.35, 0, cap);
      setProgress(p);
    }, 120);

    const phaseTimer = setInterval(() => {
      setPhaseIdx((i) => (i + 1) % pendingPhases.length);
    }, 1200);

    return () => {
      stopped = true;
      clearInterval(tick);
      clearInterval(phaseTimer);
    };
  }, [mounted, status, pendingPhases.length]);

  // When scored, fill bar quickly to 100 for a satisfying finish
  useEffect(() => {
    if (!mounted) return;
    if (status !== 'scored') return;

    let p = progress;
    const t = setInterval(() => {
      p = clamp(p + 6, 0, 100);
      setProgress(p);
      if (p >= 100) clearInterval(t);
    }, 30);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mounted]);

  if (!mounted) return null;

  return (
    <div className={`result-overlay ${visible ? 'visible' : ''}`}>
      <div className="result-panel">
        <div className="result-header" style={{ justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="result-title">Today’s Result</div>
            <div className="result-subtitle">
              {dateKey && <>UTC {dateKey} • </>}
              One attempt per day
            </div>
          </div>
        </div>

        {/* Horizontal row: word | image | results */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 16,
            alignItems: 'start',
            width: '100%',
            marginTop: 14,
          }}
        >
          {/* LEFT: Word */}
          <div className="result-score-card">
            <div className="result-word-label">Today’s word</div>
            <div className="result-word">{String(word || '—').toLowerCase()}</div>
            <div style={{ marginTop: 10, opacity: 0.8 }}>
              Needed: <strong>{fmtPct(threshold)}</strong>
            </div>
          </div>

          {/* MIDDLE: doodle */}
          <div className="result-score-card">
            <div className="result-word-label">Your doodle</div>
            {attempt?.imageURL ? (
              <img
                src={attempt.imageURL}
                alt="Your doodle"
                className="result-image"
                style={{ marginTop: 12 }}
              />
            ) : (
              <div style={{ marginTop: 12, opacity: 0.7 }}>No image</div>
            )}
          </div>

          {/* RIGHT: actual results */}
          <div className="result-score-card">
            {status === 'pending' && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div
                  style={{
                    fontWeight: 1000,
                    letterSpacing: 0.2,
                    opacity: 0.95,
                  }}
                >
                  <span className="result-pulse">{pendingPhases[phaseIdx]}</span>
                </div>

                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  This usually takes a few seconds.
                </div>

                {/* Progress bar */}
                <div className="result-progress">
                  <div
                    className="result-progress-bar"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  {Math.round(progress)}%
                </div>
              </div>
            )}

            {status === 'error' && (
              <div style={{ color: '#ffb4b4', fontWeight: 900 }}>
                {attempt?.error ?? 'Something went wrong'}
              </div>
            )}

            {status === 'scored' && (
              <>
                <div className={win ? 'result-win' : 'result-lose'}>
                  {win ? '✅ You got it!' : '❌ Not quite'}
                </div>

                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  <div>
                    AI guess: <strong>{attempt?.openaiGuess ?? '—'}</strong>
                  </div>
                  <div>
                    Confidence: <strong>{fmtPct(conf)}</strong>
                  </div>
                  
                </div>

                {/* progress "finishes" */}
                <div style={{ marginTop: 14 }}>
                  <div className="result-progress">
                    <div
                      className="result-progress-bar"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ONLY ACTION */}
        <div style={{ width: '100%', marginTop: 18 }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <button
              type="button"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.92)',
                fontWeight: 1100,
                cursor: 'pointer',
              }}
            >
              ← Return to Home
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}