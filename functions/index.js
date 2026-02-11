/* eslint-disable no-undef */
/* eslint-env node */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const OpenAI = require('openai');
const { getStorage } = require('firebase-admin/storage');

admin.initializeApp();

/* ------------------------ helpers ------------------------ */

function normalizeWord(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safeJsonParseFromText(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const chunk = text.slice(start, end + 1);
  try {
    return JSON.parse(chunk);
  } catch {
    return null;
  }
}

function getUtcDateKey(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function hashToUint32(str) {
  // Simple deterministic hash (FNV-1a-ish)
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickFromArray(arr, seedStr) {
  const h = hashToUint32(seedStr);
  return arr[h % arr.length];
}

/* ------------------- 1) score attempt ------------------- */

exports.scoreAttempt = functions
  .runWith({ secrets: ['OPENAI_API_KEY'] })
  .region('europe-west1')
  .firestore.document('attempts/{attemptId}')
  .onWrite(async (change) => {
    // deleted doc?
    if (!change.after.exists) return null;

    const after = change.after.data();
    const before = change.before.exists ? change.before.data() : null;

    // ✅ Only score when it becomes pending (prevents re-trigger loops on updates)
    const becamePending =
      after?.status === 'pending' && before?.status !== 'pending';

    if (!becamePending) return null;

    // Only score if not already scored
    if (after.scoredAt) return null;

    const { uid, word, threshold, date, storagePath } = after;

    // use change.after.ref (not snap.ref)
    const attemptRef = change.after.ref;

    if (!uid || !word || !date || !storagePath) {
      await attemptRef.set(
        {
          status: 'error',
          error: 'Missing uid/word/date/storagePath',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return null;
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 1) Download doodle from Storage
    let base64;
    try {
      const bucket = getStorage().bucket();
      const [fileBuffer] = await bucket.file(storagePath).download();
      base64 = fileBuffer.toString('base64');
    } catch (err) {
      await attemptRef.set(
        {
          status: 'error',
          error: err?.message || 'Failed to download image from Storage',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return null;
    }

    // 2) Ask OpenAI to guess the doodle
    let modelText = '';
    try {
      const response = await openai.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'developer',
            content: [
              {
                type: 'input_text',
                text:
                  'You are an image classifier for simple doodles. ' +
                  'Return ONLY valid JSON: {"guess":"...", "confidence":0..1}. ' +
                  'guess must be one short lowercase word. No extra text.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Target word: "${word}". Guess the doodle.`,
              },
              {
                type: 'input_image',
                image_url: `data:image/png;base64,${base64}`,
              },
            ],
          },
        ],
      });

      modelText = response.output_text || '';
    } catch (err) {
      await attemptRef.set(
        {
          status: 'error',
          error: err?.message || 'OpenAI call failed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return null;
    }

    const parsed = safeJsonParseFromText(modelText);
    if (!parsed || typeof parsed.guess !== 'string') {
      await attemptRef.set(
        {
          status: 'error',
          error: 'Model output was not valid JSON',
          rawModelText: modelText.slice(0, 2000),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return null;
    }

    const guess = normalizeWord(parsed.guess);
    const confRaw = Number(parsed.confidence);
    const confidence = Number.isFinite(confRaw)
      ? Math.max(0, Math.min(1, confRaw))
      : 0;

    const target = normalizeWord(word);
    const winThreshold = Number.isFinite(Number(threshold))
      ? Number(threshold)
      : 0.75;

    const isWin = guess === target && confidence >= winThreshold;

    // 3) Update attempt + user transactionally
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);

    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const user = userSnap.exists ? userSnap.data() : {};

      const prevLastWin = user.lastWinDate || null;
      const prevStreak = Number(user.streakCurrent || 0);
      const prevBest = Number(user.streakBest || 0);
      const prevPoints = Number(user.pointsTotal || 0);

      let nextStreak = prevStreak;
      let nextBest = prevBest;
      let nextPoints = prevPoints;
      let nextLastWin = prevLastWin;

      if (isWin) {
        const today = String(date);
        const [y, m, d] = today.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() - 1);
        const yy = dt.getUTCFullYear();
        const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dt.getUTCDate()).padStart(2, '0');
        const yesterday = `${yy}-${mm}-${dd}`;

        nextStreak = prevLastWin === yesterday ? prevStreak + 1 : 1;
        nextBest = Math.max(prevBest, nextStreak);
        nextPoints = prevPoints + 1;
        nextLastWin = today;
      }

      tx.set(
        attemptRef,
        {
          status: 'scored',
          openaiGuess: guess,
          confidence,
          isWin,
          scoredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      tx.set(
        userRef,
        {
          pointsTotal: nextPoints,
          streakCurrent: nextStreak,
          streakBest: nextBest,
          lastWinDate: nextLastWin,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: userSnap.exists
            ? user.createdAt
            : admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    return null;
  });

/* ---------------- 2) generate daily word ----------------
   Needs Blaze plan (Cloud Scheduler).
   Wordbank doc: wordbank/default { words: ["cat","bicycle", ...] }
   State doc: meta/dailyWordState { index: 0 }
   Output: dailyWords/{yyyy-mm-dd} { word, mode, createdAt }
---------------------------------------------------------- */

exports.generateDailyWord = functions
  .region('europe-west1')
  .pubsub.schedule('0 0 * * *') // 00:00 UTC daily
  .timeZone('UTC')
  .onRun(async () => {
    const db = admin.firestore();
    const dateKey = getUtcDateKey();

    const dailyRef = db.collection('dailyWords').doc(dateKey);

    // If already generated, do nothing (idempotent)
    const existing = await dailyRef.get();
    if (existing.exists) return null;

    const bankSnap = await db.collection('wordbank').doc('default').get();
    if (!bankSnap.exists) throw new Error('Missing wordbank/default');

    const bank = bankSnap.data();
    const difficulties = ['easy', 'medium', 'hard'];

    // 1) Pick difficulty deterministically from date
    const difficulty = pickFromArray(difficulties, `difficulty:${dateKey}`);

    const list = bank[difficulty];
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(`wordbank/default.${difficulty} is missing or empty`);
    }

    // 2) Pick word deterministically from date + difficulty
    const word = pickFromArray(list, `word:${dateKey}:${difficulty}`);

    const thresholdByDifficulty = { easy: 0.7, medium: 0.75, hard: 0.8 };
    const threshold = thresholdByDifficulty[difficulty] ?? 0.75;

    await dailyRef.set({
      word,
      difficulty,
      threshold,
      mode: 'classic',
      date: dateKey,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return null;
  });
