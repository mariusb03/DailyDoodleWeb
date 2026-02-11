import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';

export async function uploadDoodlePng({ uid, dateKey, pngBlob }) {
  if (!uid) throw new Error('Missing uid');
  if (!dateKey) throw new Error('Missing dateKey');
  if (!pngBlob) throw new Error('Missing pngBlob');

  const storagePath = `doodles/${uid}/${dateKey}.png`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, pngBlob, {
    contentType: 'image/png',
    cacheControl: 'public,max-age=3600',
  });

  const downloadURL = await getDownloadURL(storageRef);
  return { storagePath, downloadURL };
}

export async function createAttemptPending({
  uid,
  dateKey,
  word,
  mode = 'classic',
  storagePath,
  imageURL,
  threshold = 0.75,
}) {
  const attemptId = `${uid}_${dateKey}`;
  const attemptRef = doc(db, 'attempts', attemptId);

  // Overwrite doc each submit (so the backend can re-score if needed)
  await setDoc(attemptRef, {
    uid,
    date: dateKey,
    word,
    mode,
    threshold,
    storagePath,
    imageURL,
    status: 'pending',
    scoredAt: null, // guard for the Cloud Function
    createdAt: serverTimestamp(),
  });

  return attemptId;
}

