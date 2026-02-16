/* eslint-disable no-unused-vars */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

import DoodleCanvas from '../features/doodle/DoodleCanvas';
import {
  createAttemptPending,
  uploadDoodlePng,
} from '../features/doodle/doodleService';
import { isValidDateKey, getUtcDateKey } from '../lib/date';

import { useDailyWord } from '../features/play/useDailyWord';
import { useLockBodyScroll } from '../features/play/useLockBodyScroll';
import ResultOverlay from '../features/play/ResultOverlay';
import IntroOverlay from '../features/play/IntroOverlay';

import { db } from '../lib/firebase';

function pickAttemptForDate(docs, uid, dateKey) {
  const attemptId = `${uid}_${dateKey}`;

  // 1) Best: exact id match
  const byId = docs.find((d) => d.id === attemptId);
  if (byId) return byId;

  // 2) Next: dateKey field match
  const byDateKey = docs.find((d) => String(d.dateKey || '') === dateKey);
  if (byDateKey) return byDateKey;

  // 3) Fallback: some people store it as "date"
  const byDate = docs.find((d) => String(d.date || '') === dateKey);
  if (byDate) return byDate;

  return null;
}

export default function Play({ user }) {
  const [params] = useSearchParams();

  const dateKey = useMemo(() => {
    const override = params.get('date');
    if (override && isValidDateKey(override)) return override;
    return getUtcDateKey();
  }, [params]);

  const { daily, loading: dailyLoading, error: dailyError } = useDailyWord(dateKey);
  const computedThreshold = daily?.threshold ?? 0.75;

  // optimistic attempt shown instantly after submit
  const [localAttempt, setLocalAttempt] = useState(null);

  // real attempt from Firestore (live)
  const [liveAttempt, setLiveAttempt] = useState(null);

  // prefer live; fallback to optimistic
  const attempt = liveAttempt || localAttempt;
  const alreadyPlayedToday = !!attempt;

  const [pngBlob, setPngBlob] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [showIntro, setShowIntro] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // prevents “intro opens again immediately” after user closes it
  const [introDismissed, setIntroDismissed] = useState(false);

  // Reset when user/date changes
  useEffect(() => {
    setLocalAttempt(null);
    setLiveAttempt(null);
    setShowResults(false);
    setShowIntro(false);
    setIntroDismissed(false);
    setError('');
    setPngBlob(null);
  }, [user?.uid, dateKey]);

  /**
   * ✅ Robust live attempt listener
   * We only query by uid, then find the correct "today" attempt locally.
   * This works even if your doc uses:
   * - id = `${uid}_${dateKey}` OR auto-id
   * - dateKey OR date
   */
  useEffect(() => {
    if (!user?.uid) return;

    const attemptsRef = collection(db, 'attempts');
    const q = query(attemptsRef, where('uid', '==', user.uid));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const todays = pickAttemptForDate(docs, user.uid, dateKey);

        setLiveAttempt(todays || null);

        // If we now have the real attempt (pending or scored), drop optimistic
        if (todays) setLocalAttempt(null);
      },
      (err) => {
        console.error('Attempt listener error:', err);
      },
    );

    return () => unsub();
  }, [user?.uid, dateKey]);

  // Show intro once when entering play page (only if user hasn't played and we have the word)
  useEffect(() => {
    if (!daily?.word) return;
    if (alreadyPlayedToday) return;
    if (introDismissed) return;

    setShowIntro(true);
  }, [daily?.word, alreadyPlayedToday, introDismissed]);

  // Auto open results overlay when attempt exists
  useEffect(() => {
    if (alreadyPlayedToday) {
      setShowIntro(false);
      setShowResults(true);
    }
  }, [alreadyPlayedToday]);

  useLockBodyScroll(showResults && alreadyPlayedToday);

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

      // ✅ optimistic UI instantly
      setLocalAttempt({
        status: 'pending',
        mode: 'classic',
        imageURL: downloadURL,
        confidence: null,
        openaiGuess: null,
        isWin: null,
        threshold: computedThreshold,
        dateKey,
        uid: user.uid,
      });

      // close intro + open results
      setShowIntro(false);
      setIntroDismissed(true);
      setShowResults(true);

      // Create attempt doc (Cloud Function updates later to scored)
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
      setLocalAttempt(null);
      setError(e?.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 18,
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(1200px 700px at 50% 0%, rgba(120,120,255,0.14), transparent 60%), radial-gradient(900px 600px at 10% 30%, rgba(255,120,200,0.10), transparent 65%), radial-gradient(900px 600px at 90% 40%, rgba(120,255,200,0.08), transparent 65%), #07070a',
      }}
    >
      <div style={{ width: 'min(1100px, 100%)', display: 'grid', gap: 14 }}>
        {/* TOP INFO */}
        <section
          style={{
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 18,
            padding: 14,
            textAlign: 'center',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          {dailyLoading && (
            <div style={{ opacity: 0.85 }}>Loading today’s word…</div>
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
                <div style={{ color: 'crimson', fontWeight: 900 }}>
                  No daily word set for <strong>{dateKey}</strong>.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 18, fontWeight: 1100 }}>
                    Today’s word:{' '}
                    <span style={{ textTransform: 'lowercase' }}>
                      {daily.word}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Solo • Daily Word • One attempt per day
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* CANVAS */}
        {!alreadyPlayedToday && (
          <section
            style={{
              display: 'grid',
              justifyItems: 'center',
              gap: 10,
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
              submitLabel="Submit"
            />

            {error && (
              <span style={{ color: 'crimson', fontWeight: 900 }}>{error}</span>
            )}
          </section>
        )}
      </div>

      {/* INTRO OVERLAY */}
      <IntroOverlay
        open={showIntro && !alreadyPlayedToday}
        difficulty={daily?.difficulty}
        word={daily?.word}
        onContinue={() => {
          setShowIntro(false);
          setIntroDismissed(true);
        }}
      />

      {/* RESULTS OVERLAY */}
      <ResultOverlay
        open={showResults && !!attempt}
        attempt={attempt}
        threshold={computedThreshold}
        word={daily?.word}
        dateKey={dateKey}
      />
    </main>
  );
}