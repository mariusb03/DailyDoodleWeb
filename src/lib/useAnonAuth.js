import { useEffect, useState } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

export function useAnonAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        setReady(true);
        return;
      }
      await signInAnonymously(auth);
    });

    return () => unsub();
  }, []);

  return { user, ready };
}
