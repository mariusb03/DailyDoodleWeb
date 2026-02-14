// IntroOverlay.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/introOverlay.css';
import SpotlightCard from '../../components/SpotlightCard.jsx';
import ElectricBorder from '../../components/ElectricBorder.jsx';

const STAGES = {
  TITLE: 0,
  SHOW_DIFF_LABEL: 1,
  ROLL_DIFF: 2,
  SHOW_WORD_LABEL: 3,
  SHOW_WORD: 4,
  SHOW_BUTTON: 5,
};

const DIFFS = ['easy', 'medium', 'hard'];
const ITEM_H = 56; // must match CSS .intro-slot height AND .intro-slot-item height

function normalizeDiff(d) {
  const x = String(d || '').toLowerCase().trim();
  if (DIFFS.includes(x)) return x;
  return 'medium';
}

export default function IntroOverlay({ open, difficulty, word, onContinue }) {
  const TRANSITION_MS = 500;

  // suspense timings
  const SPIN_MS = 2400; // slower spin
  const LOCK_SETTLE_MS = 900; // must match CSS locked transition duration
  const FINAL_POP_MS = 520; // must match CSS final-pop animation duration
  const AFTER_LOCK_BUFFER = 180; // little pause for suspense

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const [stage, setStage] = useState(STAGES.TITLE);

  // slot-machine state
  const [slotPos, setSlotPos] = useState(0); // position within the REPEATED list (can be fractional)
  const [isRolling, setIsRolling] = useState(false);
  const [diffLocked, setDiffLocked] = useState(false);

  const animationRef = useRef(null);
  const stopTimeoutRef = useRef(null);

  const diffKey = useMemo(() => normalizeDiff(difficulty), [difficulty]);
  const finalBaseIndex = useMemo(() => Math.max(0, DIFFS.indexOf(diffKey)), [diffKey]);

  // repeat list so it always rolls smoothly + can “snap” safely
  const reel = useMemo(() => [...DIFFS, ...DIFFS, ...DIFFS], []);
  const middleOffset = DIFFS.length; // start in the middle copy

  // This is the index INSIDE `reel` we want to be visible when locked.
  const finalReelIndex = useMemo(() => middleOffset + finalBaseIndex, [middleOffset, finalBaseIndex]);

  useEffect(() => {
    // cleanup helper
    const cleanup = () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      animationRef.current = null;
      stopTimeoutRef.current = null;
    };

    if (!open) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), TRANSITION_MS);
      return () => clearTimeout(t);
    }

    setMounted(true);
    setStage(STAGES.TITLE);

    // reset reel position to middle copy (so we have runway)
    setSlotPos(middleOffset);
    setIsRolling(false);
    setDiffLocked(false);

    const raf = requestAnimationFrame(() => setVisible(true));

    const timers = [];

    // 1) label
    timers.push(setTimeout(() => setStage(STAGES.SHOW_DIFF_LABEL), 700));

    // 2) roll
    timers.push(
      setTimeout(() => {
        setStage(STAGES.ROLL_DIFF);
        startDifficultyRoll();
      }, 2000),
    );

    // 3) word label AFTER spin + settle + pop + tiny pause
    const wordLabelAt =
      1400 + SPIN_MS + LOCK_SETTLE_MS + FINAL_POP_MS + AFTER_LOCK_BUFFER;

    timers.push(setTimeout(() => setStage(STAGES.SHOW_WORD_LABEL), wordLabelAt));
    timers.push(setTimeout(() => setStage(STAGES.SHOW_WORD), wordLabelAt + 650));
    timers.push(setTimeout(() => setStage(STAGES.SHOW_BUTTON), wordLabelAt + 1400));

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      cleanup();
      // ensure flags are sane
      setIsRolling(false);
      setDiffLocked(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, finalReelIndex]);

  function stopRoll(immediate = false) {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    animationRef.current = null;
    stopTimeoutRef.current = null;

    if (immediate) {
      setIsRolling(false);
      setDiffLocked(false);
    }
  }

  function startDifficultyRoll() {
  stopRoll(true);

  setIsRolling(true);
  setDiffLocked(false);

  // start somewhere inside the middle copy
  let position = middleOffset + Math.random() * DIFFS.length;
  setSlotPos(position);

  // speed curve (slower + smoother)
  const maxVel = 3;     // px per frame peak
  const accel = 0.28;    // ramp up
  let vel = 0;

  const start = performance.now();
  const duration = SPIN_MS;

  function tick(now) {
    const t = Math.min(1, (now - start) / duration);

    // smooth "spinning" speed curve (no sudden changes)
    const easeIn = t < 0.35 ? t / 0.35 : 1;
    const easeOut = t > 0.65 ? 1 - (t - 0.65) / 0.35 : 1;
    const speedFactor = Math.max(0.16, easeIn * easeOut);

    vel = Math.min(maxVel, vel + accel);
    const stepPx = vel * speedFactor;

    position += stepPx / ITEM_H;

    // wrap inside reel
    if (position >= reel.length - DIFFS.length) {
      position = middleOffset + (position % DIFFS.length);
    }

    setSlotPos(position);

    if (t < 1) {
      animationRef.current = requestAnimationFrame(tick);
      return;
    }

    // stop spinning -> glide to the final position
    animationRef.current = null;
    setIsRolling(false);

    const final = finalReelIndex;

    // choose a "glide start" position that is before final, so it keeps moving forward
    // (no overshoot past final)
    let cur = position;
    while (cur > final) cur -= DIFFS.length;

    // ensure we glide at least a little forward
    if (final - cur < 0.8) cur -= DIFFS.length;

    // set to this normalized position first (so the final glide is always forward)
    setSlotPos(cur);

    // next frame: animate to the final index using the locked transition
    requestAnimationFrame(() => {
      setSlotPos(final);
      // mark locked after the glide finishes
      setTimeout(() => setDiffLocked(true), LOCK_SETTLE_MS);
    });
  }

  animationRef.current = requestAnimationFrame(tick);
}


  function handleContinue() {
    setVisible(false);
    setTimeout(() => {
      setMounted(false);
      onContinue?.();
    }, TRANSITION_MS);
  }

  if (!mounted) return null;

  const showDiffLabel = stage >= STAGES.SHOW_DIFF_LABEL;
  const showDiffRoll = stage >= STAGES.ROLL_DIFF;
  const showWordLabel = stage >= STAGES.SHOW_WORD_LABEL;
  const showWord = stage >= STAGES.SHOW_WORD;
  const showButton = stage >= STAGES.SHOW_BUTTON;

  return (
    <div className={`intro-overlay ${visible ? 'visible' : ''}`}>
      <div className={`intro-enter ${visible ? 'on' : ''}`}>
        <ElectricBorder
          color="#0026ff"
          speed={0.1}
          chaos={0.03}
          thickness={2}
          className="intro-electric"
          style={{ borderRadius: 28 }}
        >
          <SpotlightCard
            className="intro-panel"
            spotlightColor="rgba(0, 13, 126, 0.62)"
          >
            <div className="intro-title intro-reveal">DailyDoodle</div>

            {showDiffLabel && (
              <div className="intro-line intro-reveal intro-reveal-delay-1">
                Today’s difficulty is:
              </div>
            )}

            {showDiffRoll && (
              <div className="intro-reveal intro-reveal-delay-2">
                <div className="intro-slot">
                  <div
                    className={`intro-slot-inner ${isRolling ? 'rolling' : 'locked'}`}
                    style={{ transform: `translateY(-${slotPos * ITEM_H}px)` }}
                  >
                    {reel.map((d, idx) => {
                      const isFinalVisible = diffLocked && idx === finalReelIndex;
                      return (
                        <div
                          key={`${d}-${idx}`}
                          className={[
                            'intro-slot-item',
                            `diff-${d}`,
                            isFinalVisible ? 'final-pop' : '',
                          ].join(' ')}
                        >
                          {d.toUpperCase()}
                        </div>
                      );
                    })}
                  </div>
                </div>

                
              </div>
            )}

            {showWordLabel && (
              <div
                className="intro-line intro-reveal intro-reveal-delay-3"
                style={{ marginTop: 28 }}
              >
                Today’s word is:
              </div>
            )}

            {showWord && (
              <div className="intro-word intro-reveal intro-reveal-delay-4">
                {String(word || '').toLowerCase()}
              </div>
            )}

            {showButton && (
              <button
                className="intro-continue intro-reveal intro-reveal-delay-5"
                onClick={handleContinue}
                type="button"
              >
                Continue
              </button>
            )}
          </SpotlightCard>
        </ElectricBorder>
      </div>
    </div>
  );
}
