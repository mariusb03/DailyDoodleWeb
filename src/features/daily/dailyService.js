import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export async function getDailyWord(dateKey) {
  const ref = doc(db, 'dailyWords', dateKey);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data(); // { word, mode?, ... }
}
