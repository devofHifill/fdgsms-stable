// attemptLimiter.js → in-memory limit on failed attempts (used for login).
//
// Counts only FAILED attempts in a fixed window. A success clears that
// client's count. Two limits apply:
//   - per client key (IP): stops one source guessing passwords;
//   - global: caps total failures, so rotating IPs or a spoofed
//     X-Forwarded-For (e.g. hitting the published port directly, around
//     Traefik) can't get unlimited guesses either.
// State is per process and resets on restart — fine for a single server.
export function createAttemptLimiter({
  maxPerKey = 10,
  maxGlobal = 50,
  windowMs = 15 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const perKey = new Map(); // key → { count, resetAt }
  let global = { count: 0, resetAt: 0 };

  function current(entry) {
    return entry && entry.resetAt > now() ? entry : null;
  }

  function prune() {
    const t = now();
    for (const [key, entry] of perKey) {
      if (entry.resetAt <= t) perKey.delete(key);
    }
  }

  // { blocked, retryAfterMs } for this key right now.
  function check(key) {
    const g = current(global);
    if (g && g.count >= maxGlobal) {
      return { blocked: true, retryAfterMs: g.resetAt - now(), scope: "global" };
    }
    const k = current(perKey.get(key));
    if (k && k.count >= maxPerKey) {
      return { blocked: true, retryAfterMs: k.resetAt - now(), scope: "key" };
    }
    return { blocked: false, retryAfterMs: 0 };
  }

  function recordFailure(key) {
    const t = now();
    if (perKey.size > 1000) prune();

    const k = current(perKey.get(key)) || { count: 0, resetAt: t + windowMs };
    k.count += 1;
    perKey.set(key, k);

    global = current(global) || { count: 0, resetAt: t + windowMs };
    global.count += 1;
  }

  function recordSuccess(key) {
    perKey.delete(key);
  }

  return { check, recordFailure, recordSuccess };
}
