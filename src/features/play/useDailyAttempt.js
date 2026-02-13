import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export function useDailyAttempt(user, dateKey) {
  const [attempt, setAttempt] = useState(null);

  useEffect(() => {
    if (!user?.uid || !dateKey) return;

    const attemptId = `${user.uid}_${dateKey}`;
    const unsub = onSnapshot(doc(db, 'attempts', attemptId), (snap) => {
      if (snap.exists()) setAttempt({ id: snap.id, ...snap.data() });
      else setAttempt(null);
    });

    return () => unsub();
  }, [user?.uid, dateKey]);

  return { attempt, alreadyPlayedToday: !!attempt };
}
