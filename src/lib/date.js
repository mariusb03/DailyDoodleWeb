export function getUtcDateKey(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function isValidDateKey(s) {
  // simple yyyy-mm-dd check
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}
