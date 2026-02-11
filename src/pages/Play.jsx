/* eslint-disable no-unused-vars */
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';

import DoodleCanvas from '../features/doodle/DoodleCanvas';
import {
  createAttemptPending,
  uploadDoodlePng,
} from '../features/doodle/doodleService';
import { getDailyWord } from '../features/daily/dailyService';
import { isValidDateKey, getUtcDateKey } from '../lib/date';
import { db } from '../lib/firebase';

function fmtPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${Math.round(v * 100)}%`;
}

export default function Play({ user }) {
  const [params] = useSearchParams();

  // SOLO: Daily Word mode only
  const modeLabel = 'Solo • Daily Word';

  const dateKey = useMemo(() => {
    const override = params.get('date');
    if (override && isValidDateKey(override)) return override;
    return getUtcDateKey();
  }, [params]);

  const [daily, setDaily] = useState(null); // { word, difficulty, threshold, mode, date }
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyError, setDailyError] = useState('');

  const [pngBlob, setPngBlob] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [attempt, setAttempt] = useState(null);
  const [error, setError] = useState('');

  const attemptId = user ? `${user.uid}_${dateKey}` : null;

  // Load daily word
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setDailyLoading(true);
        setDailyError('');
        const data = await getDailyWord(dateKey);
        if (!cancelled) setDaily(data);
      } catch (e) {
        if (!cancelled)
          setDailyError(e?.message || 'Failed to load daily word');
      } finally {
        if (!cancelled) setDailyLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  // Live attempt listener (lock: one try per day)
  useEffect(() => {
    if (!attemptId) return;
    const unsub = onSnapshot(doc(db, 'attempts', attemptId), (snap) => {
      if (snap.exists()) setAttempt({ id: snap.id, ...snap.data() });
      else setAttempt(null);
    });
    return () => unsub();
  }, [attemptId]);

  const alreadyPlayedToday = !!attempt;

  // Prefer threshold from Firestore daily doc (server truth)
  const computedThreshold = daily?.threshold ?? 0.75;

  async function onSubmit() {
    setError('');

    if (alreadyPlayedToday)
      return setError("You've already played today. Come back tomorrow!");
    if (!user?.uid) return setError('Not signed in.');
    if (!daily?.word) return setError("Today's word isn't available yet.");
    if (!pngBlob) return setError('Draw something first 🙂');

    try {
      setSubmitting(true);

      const { storagePath, downloadURL } = await uploadDoodlePng({
        uid: user.uid,
        dateKey,
        pngBlob,
      });

      await createAttemptPending({
        uid: user.uid,
        dateKey,
        word: daily.word,
        mode: 'classic',
        storagePath,
        imageURL: downloadURL,
        threshold: computedThreshold,
      });
    } catch (e) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  const isDev = import.meta.env.DEV;

  const cardStyle = {
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    padding: 14,
  };

  const btnStyle = (primary = false) => ({
    padding: '10px 14px',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.18)',
    background: primary ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.92)',
    fontWeight: 900,
    cursor: 'pointer',
  });

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 18,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div style={{ width: 'min(1100px, 100%)', display: 'grid', gap: 14 }}>
        {/* NAVBAR */}
        <header
          style={{
            ...cardStyle,
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            padding: '12px 14px',
          }}
        >
          <div style={{ justifySelf: 'start' }}>
            <Link
              to="/"
              style={{
                textDecoration: 'none',
                color: 'rgba(255,255,255,0.92)',
                fontWeight: 900,
              }}
            >
              ← Back
            </Link>
          </div>

          <div style={{ justifySelf: 'center', textAlign: 'center' }}>
            <div style={{ fontWeight: 1000, letterSpacing: 0.3 }}>
              Daily Doodle
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              {modeLabel}
            </div>
          </div>

          <div style={{ justifySelf: 'end' }}>
            <button
              type="button"
              style={btnStyle(false)}
              onClick={() => alert('Settings coming soon 🙂')}
            >
              ⚙️ Settings
            </button>
          </div>
        </header>

        {/* TOP INFO (centered) */}
        <section style={{ ...cardStyle, textAlign: 'center' }}>
          {dailyLoading && (
            <div style={{ opacity: 0.8 }}>Loading today’s word…</div>
          )}

          {!dailyLoading && dailyError && (
            <div style={{ color: 'crimson', fontWeight: 800 }}>
              {dailyError}
            </div>
          )}

          {!dailyLoading && !dailyError && (
            <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Date (UTC): <code>{dateKey}</code>
              </div>

              {!daily?.word ? (
                <div style={{ color: 'crimson', fontWeight: 800 }}>
                  No daily word set for <strong>{dateKey}</strong>.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 18, fontWeight: 1000 }}>
                    Today’s word{' : '}
                    <span style={{ textTransform: 'lowercase' }}>
                      {alreadyPlayedToday ? daily.word : daily.word}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ opacity: 0.85 }}>
                      Difficulty: <strong>{daily.difficulty ?? '—'}</strong>
                    </span>

                    <span style={{ opacity: 0.85 }}>
                      AI confidence needed:{' '}
                      <strong>{fmtPct(computedThreshold)}</strong>
                    </span>
                  </div>

                  {alreadyPlayedToday && (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      One attempt per day — come back tomorrow 🙂
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* DEV DATE JUMP (small + tidy) */}
          
        </section>

        {/* CANVAS AREA (centered) */}
        <section
          style={{
            display: 'grid',
            justifyItems: 'center',
            gap: 12,
            padding: 10,
          }}
        >
          <DoodleCanvas
            width={640}
            height={640}
            strokeWidth={10}
            onChangePngBlob={setPngBlob}
            onSubmit={onSubmit}
            canSubmit={!submitting && !alreadyPlayedToday && !!daily?.word}
            submitting={submitting}
            submitLabel={alreadyPlayedToday ? 'Already played' : 'Submit'}
          />

          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >

            {error && (
              <span style={{ color: 'crimson', fontWeight: 800 }}>{error}</span>
            )}
          </div>
        </section>

        {/* ATTEMPT STATUS */}
        <section style={cardStyle}>
          <div style={{ fontWeight: 1000, marginBottom: 10 }}>Attempt</div>

          {!attempt && (
            <div style={{ opacity: 0.7 }}>No attempt yet for this day.</div>
          )}

          {attempt && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ opacity: 0.7 }}>Status:</span>{' '}
                  <strong>{attempt.status}</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.7 }}>Mode:</span>{' '}
                  <strong>{attempt.mode ?? 'classic'}</strong>
                </div>
              </div>

              {attempt.imageURL && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    Uploaded image
                  </div>
                  <img
                    src={attempt.imageURL}
                    alt="Your doodle"
                    style={{
                      width: 220,
                      height: 220,
                      objectFit: 'cover',
                      borderRadius: 14,
                      border: '1px solid rgba(255,255,255,0.18)',
                      background: '#fff',
                    }}
                  />
                </div>
              )}

              {attempt.status === 'scored' && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>Guess:</span>{' '}
                    <strong>{attempt.openaiGuess ?? '—'}</strong>{' '}
                    <span style={{ opacity: 0.75 }}>
                      ({fmtPct(attempt.confidence ?? 0)})
                    </span>
                  </div>
                  <div>
                    <span style={{ opacity: 0.7 }}>Win:</span>{' '}
                    <strong>{String(!!attempt.isWin)}</strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
