// Resolve ?returnTo= to a safe same-origin path, else "/".
export function safeReturnTo() {
  // Support both hash-based search params and regular search params
  const hashPart = window.location.hash || '';
  const hashSearch = hashPart.includes('?') ? hashPart.split('?')[1] : '';
  const params = new URLSearchParams(hashSearch || window.location.search);
  const raw = params.get('returnTo');
  if (!raw) return '/';
  try {
    // Only allow simple paths, no protocol-relative or backslash tricks
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
    return raw;
  } catch {
    return '/';
  }
}
