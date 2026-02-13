import { useEffect, useState } from 'react';
import { getDailyWord } from '../daily/dailyService';

export function useDailyWord(dateKey) {
  const [daily, setDaily] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError('');
        const data = await getDailyWord(dateKey);
        if (!cancelled) setDaily(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load daily word');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  return { daily, loading, error };
}
