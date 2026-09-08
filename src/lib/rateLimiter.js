// ---------------------------------------------------------------------------
// rateLimiter.js – Client-side rate limiting for auth actions
// Uses localStorage to persist across sessions (survives reloads)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "wiz_rate_limit";

function getData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Check if an action is rate-limited.
 * @param {string} action - e.g. "login", "register"
 * @param {object} opts
 * @param {number} opts.maxAttempts - Max attempts before lockout (default 5)
 * @param {number} opts.windowMs - Time window in ms (default 15 min)
 * @returns {{ allowed: boolean, attemptsLeft: number, retryAfterMs: number }}
 */
export function checkRateLimit(action, { maxAttempts = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const data = getData();
  const now = Date.now();
  const entry = data[action] || { attempts: 0, firstAttemptAt: now, lockedUntil: 0 };

  // If currently locked out
  if (entry.lockedUntil && now < entry.lockedUntil) {
    return {
      allowed: false,
      attemptsLeft: 0,
      retryAfterMs: entry.lockedUntil - now,
    };
  }

  // If window has expired, reset
  if (entry.firstAttemptAt && now - entry.firstAttemptAt > windowMs) {
    entry.attempts = 0;
    entry.firstAttemptAt = now;
    entry.lockedUntil = 0;
  }

  // If within window and not locked
  if (entry.attempts >= maxAttempts) {
    entry.lockedUntil = now + windowMs;
    data[action] = entry;
    setData(data);
    return {
      allowed: false,
      attemptsLeft: 0,
      retryAfterMs: windowMs,
    };
  }

  return {
    allowed: true,
    attemptsLeft: maxAttempts - entry.attempts,
    retryAfterMs: 0,
  };
}

/**
 * Record a failed attempt for the given action.
 */
export function recordFailedAttempt(action, { maxAttempts = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const data = getData();
  const now = Date.now();
  const entry = data[action] || { attempts: 0, firstAttemptAt: now, lockedUntil: 0 };

  // Reset window if expired
  if (entry.firstAttemptAt && now - entry.firstAttemptAt > windowMs) {
    entry.attempts = 0;
    entry.firstAttemptAt = now;
    entry.lockedUntil = 0;
  }

  entry.attempts += 1;
  if (entry.attempts >= maxAttempts) {
    entry.lockedUntil = now + windowMs;
  }

  data[action] = entry;
  setData(data);
}

/**
 * Clear rate limit for an action (e.g. after successful login).
 */
export function clearRateLimit(action) {
  const data = getData();
  delete data[action];
  setData(data);
}

/**
 * Get remaining lockout time in seconds.
 */
export function getRetryAfterSeconds(action) {
  const data = getData();
  const entry = data[action];
  if (!entry?.lockedUntil) return 0;
  const remaining = entry.lockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}
