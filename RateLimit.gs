/**
 * @fileoverview Layered resource protection for public mutation requests.
 * Cache-only personal counters and the emergency fuse are best-effort load
 * shedding, not authorization or durable fairness controls. Script Properties
 * provide the authoritative per-sheet/event/action validated-write budget,
 * updated only under ScriptLock after final policy and business validation.
 */

// All counters use fixed windows: the first N calls are admitted and call N+1
// is denied until the original window ends. The personal layer allows 3/60s;
// the emergency event/action fuse allows 100/10s; durable write admission allows
// 20/60s. Cache eviction or failure can reset/bypass only the advisory layers.
const RATE_LIMIT_PERSON_WINDOW_SECONDS = 60;
const RATE_LIMIT_PERSON_MAX_HITS = 3;
const RATE_LIMIT_EMERGENCY_ATTEMPT_WINDOW_SECONDS = 10;
const RATE_LIMIT_EMERGENCY_ATTEMPT_MAX_HITS = 100;
const RATE_LIMIT_EVENT_SUCCESS_WINDOW_SECONDS = 60;
const RATE_LIMIT_EVENT_SUCCESS_MAX_HITS = 20;
const RATE_LIMIT_CACHE_PREFIX = "signup_app_rate_limit_v3_cache_";
// The v3 namespace is intentionally disjoint from legacy v2 attempt counters;
// old properties are neither read, migrated, nor deleted by this implementation.
const RATE_LIMIT_PROPERTY_PREFIX = "signup_app_rate_limit_v3_success_";

/**
 * Maps an action to the only two mutation namespaces supported by the app.
 * Public workflows pass only validated internal action literals.
 * @param {*} action - Requested mutation action.
 * @returns {string} `cancel` for cancellation; otherwise `signup`.
 */
function getRateLimitActionKey_(action) {
  return action === "cancel" ? "cancel" : "signup";
}

/**
 * Produces a bounded sheet scope for internal rate-limit keys.
 * Public callers supply a Config-derived Sheet ID, never request-controlled text.
 * @param {*} scope - Validated event spreadsheet identifier.
 * @returns {string} Compact bounded scope, or `default` when empty.
 */
function getRateLimitScopeKey_(scope) {
  return (
    String(scope || "default")
      .replace(/[\s\u3000]+/g, "")
      .substring(0, 80) || "default"
  );
}

/**
 * Builds the non-PII namespace shared by event/action counters.
 * @param {(number|string)} eventId - Validated event identifier.
 * @param {*} action - Mutation action.
 * @param {*} scope - Validated event spreadsheet identifier.
 * @returns {string} Bounded event/action/sheet namespace.
 */
function getRateLimitEventNamespace_(eventId, action, scope) {
  return (
    getRateLimitActionKey_(action) +
    "_" +
    getRateLimitScopeKey_(scope) +
    "_" +
    String(eventId)
  );
}

/**
 * Parses an advisory fixed-window cache counter.
 * Missing, malformed, expired, negative, or future-dated state starts a new
 * window so corrupt cache data cannot create a long-lived denial.
 * @param {*} storedValue - Cached JSON counter state.
 * @param {number} now - Current epoch milliseconds.
 * @param {number} windowMilliseconds - Counter window length.
 * @returns {{windowStart: number, hits: number}} Active or fresh counter state.
 */
function parseAdvisoryCounter_(storedValue, now, windowMilliseconds) {
  if (storedValue) {
    try {
      const stored = JSON.parse(storedValue);
      if (
        Number.isFinite(stored.windowStart) &&
        Number.isInteger(stored.hits) &&
        stored.hits >= 0 &&
        now >= stored.windowStart &&
        now - stored.windowStart < windowMilliseconds
      ) {
        return { windowStart: stored.windowStart, hits: stored.hits };
      }
    } catch (e) {
      // Malformed advisory state safely starts a fresh window.
    }
  }
  return { windowStart: now, hits: 0 };
}

/**
 * Returns the minimum safe cache TTL for the remainder of a fixed window.
 * Using remaining time avoids extending a nearly-ended durable denial merely
 * because its advisory marker was refreshed at the Nth admission.
 * @param {number} windowStart - Fixed-window epoch start.
 * @param {number} now - Current epoch milliseconds.
 * @param {number} windowMilliseconds - Fixed-window duration.
 * @returns {number} Remaining whole seconds rounded up, with a minimum of one.
 */
function getRemainingWindowSeconds_(windowStart, now, windowMilliseconds) {
  return Math.max(
    1,
    Math.ceil((windowStart + windowMilliseconds - now) / 1000),
  );
}

/**
 * Consumes a best-effort cache-only fixed-window counter.
 * Calls 1 through maxHits increment and return true; the next active-window call
 * returns false without extending the window. Cache eviction, races, malformed
 * state, or service outages can undercount/fail open by design because durable
 * write admission—not CacheService—is the authoritative mutation boundary.
 * @param {string} key - Bounded non-sensitive cache key.
 * @param {number} maxHits - Maximum allowed hits in the window.
 * @param {number} windowSeconds - Fixed-window duration in seconds.
 * @returns {boolean} Whether the advisory counter permits this attempt.
 */
function consumeAdvisoryCounter_(key, maxHits, windowSeconds) {
  try {
    const cache = CacheService.getScriptCache();
    const now = Date.now();
    const windowMilliseconds = windowSeconds * 1000;
    const counter = parseAdvisoryCounter_(
      cache.get(key),
      now,
      windowMilliseconds,
    );
    if (counter.hits >= maxHits) return false;
    cache.put(
      key,
      JSON.stringify({
        windowStart: counter.windowStart,
        hits: counter.hits + 1,
      }),
      getRemainingWindowSeconds_(
        counter.windowStart,
        now,
        windowMilliseconds,
      ),
    );
    return true;
  } catch (e) {
    console.error("Advisory cache rate limiter error: " + e.message);
    return true;
  }
}

/**
 * Charges the high-threshold pre-lock emergency mutation-attempt fuse.
 * Workflows call it only after a configured EventID (and, for signup, a current
 * date) is confirmed and cached personal/durable denials miss. It therefore
 * counts lock-busy attempts and later validation failures, but not malformed or
 * unknown-event requests and not requests already rejected by cached sentinels.
 * @param {(number|string)} eventId - Confirmed event identifier.
 * @param {*} action - Mutation action.
 * @param {*} scope - Validated event spreadsheet identifier.
 * @returns {boolean} Whether this event/action/sheet attempt may proceed.
 */
function checkEmergencyAttemptFuse_(eventId, action, scope) {
  const key =
    RATE_LIMIT_CACHE_PREFIX +
    "emergency_" +
    getRateLimitEventNamespace_(eventId, action, scope);
  return consumeAdvisoryCounter_(
    key,
    RATE_LIMIT_EMERGENCY_ATTEMPT_MAX_HITS,
    RATE_LIMIT_EMERGENCY_ATTEMPT_WINDOW_SECONDS,
  );
}

/**
 * Builds the bounded cache key for one participant/action tuple.
 * @param {(number|string)} eventId - Confirmed event identifier.
 * @param {*} name - Validated participant name.
 * @param {*} cls - Validated participant class.
 * @param {*} action - Mutation action.
 * @param {*} scope - Validated event spreadsheet identifier.
 * @returns {string} Bounded key containing a digest, not plaintext identity.
 */
function getPersonAttemptKey_(eventId, name, cls, action, scope) {
  return (
    RATE_LIMIT_CACHE_PREFIX +
    "person_" +
    getRateLimitEventNamespace_(eventId, action, scope) +
    "_" +
    buildIdentityTupleHash_(name, cls)
  );
}

/**
 * Checks the advisory cached personal block without consuming an attempt.
 * Workflows use this before the emergency fuse and lock, so a known fourth call
 * sheds work without consuming shared-fuse capacity. Cache outages and invalid,
 * expired, or evicted entries fail open and proceed toward the locked charge.
 * @param {(number|string)} eventId - Confirmed event identifier.
 * @param {*} name - Validated participant name.
 * @param {*} cls - Validated participant class.
 * @param {*} action - Mutation action.
 * @param {*} scope - Validated event spreadsheet identifier.
 * @returns {boolean} Whether the current personal window is already blocked.
 */
function isPersonAttemptBlocked_(eventId, name, cls, action, scope) {
  try {
    const cache = CacheService.getScriptCache();
    const now = Date.now();
    const counter = parseAdvisoryCounter_(
      cache.get(getPersonAttemptKey_(eventId, name, cls, action, scope)),
      now,
      RATE_LIMIT_PERSON_WINDOW_SECONDS * 1000,
    );
    return counter.hits >= RATE_LIMIT_PERSON_MAX_HITS;
  } catch (e) {
    console.error("Advisory cache rate limiter error: " + e.message);
    return false;
  }
}

/**
 * Charges the per-identity attempt counter while the script lock is held.
 * Callers first recheck the cached durable denial after acquiring the lock.
 * Surviving requests reach this charge before the fresh full snapshot, so
 * duplicate, full-slot, no-match, and later configuration/policy failures count.
 * Busy attempts and cached durable denials never reach this charge.
 * @param {(number|string)} eventId - Confirmed event identifier.
 * @param {*} name - Validated participant name.
 * @param {*} cls - Validated participant class.
 * @param {*} action - Mutation action.
 * @param {*} scope - Validated event spreadsheet identifier.
 * @returns {boolean} Whether this identity attempt may proceed.
 */
function checkPersonAttemptLimit_(eventId, name, cls, action, scope) {
  return consumeAdvisoryCounter_(
    getPersonAttemptKey_(eventId, name, cls, action, scope),
    RATE_LIMIT_PERSON_MAX_HITS,
    RATE_LIMIT_PERSON_WINDOW_SECONDS,
  );
}

/**
 * Builds the advisory denial key for a durable validated-write budget.
 * @param {(number|string)} eventId - Confirmed event identifier.
 * @param {*} action - Mutation action.
 * @param {*} scope - Validated event spreadsheet identifier.
 * @returns {string} Bounded cache key for an event/action/sheet budget.
 */
function getEventSuccessBlockedKey_(eventId, action, scope) {
  return (
    RATE_LIMIT_CACHE_PREFIX +
    "success_blocked_" +
    getRateLimitEventNamespace_(eventId, action, scope)
  );
}

/**
 * Checks the non-authoritative cached denial for a durable write budget.
 * A future `blockedUntil` denies; stale/malformed markers are removed. Cache
 * failures fail open so locked Script Properties remain authoritative.
 * @param {(number|string)} eventId - Confirmed event identifier.
 * @param {*} action - Mutation action.
 * @param {*} scope - Validated event spreadsheet identifier.
 * @returns {boolean} Whether a known durable denial is cached.
 */
function isEventSuccessLimitBlocked_(eventId, action, scope) {
  try {
    const cache = CacheService.getScriptCache();
    const key = getEventSuccessBlockedKey_(eventId, action, scope);
    const storedValue = cache.get(key);
    if (!storedValue) return false;
    try {
      const stored = JSON.parse(storedValue);
      if (
        Number.isFinite(stored.blockedUntil) &&
        Date.now() < stored.blockedUntil
      ) {
        return true;
      }
    } catch (parseError) {
      // Malformed advisory state is stale and can be removed below.
    }
    cache.remove(key);
    return false;
  } catch (e) {
    console.error("Advisory cache rate limiter error: " + e.message);
    return false;
  }
}

/**
 * Publishes an advisory denial for only the durable window's remaining time.
 * It is written when the last allowed admission reaches 20 as well as on later
 * durable denial. Cache failures are logged but do not change the locked result.
 * @param {(number|string)} eventId - Confirmed event identifier.
 * @param {*} action - Mutation action.
 * @param {*} scope - Validated event spreadsheet identifier.
 * @param {number} windowStart - Durable fixed-window epoch start.
 * @param {number} now - Current epoch milliseconds.
 * @returns {void}
 */
function cacheEventSuccessDenial_(eventId, action, scope, windowStart, now) {
  try {
    const windowMilliseconds = RATE_LIMIT_EVENT_SUCCESS_WINDOW_SECONDS * 1000;
    CacheService.getScriptCache().put(
      getEventSuccessBlockedKey_(eventId, action, scope),
      JSON.stringify({ blockedUntil: windowStart + windowMilliseconds }),
      getRemainingWindowSeconds_(windowStart, now, windowMilliseconds),
    );
  } catch (e) {
    console.error("Advisory cache rate limiter error: " + e.message);
  }
}

/**
 * Atomically consumes one durable validated-write admission under ScriptLock.
 * Calls 1-20 in an event/action/sheet fixed window are allowed; call 21 is
 * denied. Workflows invoke it after the final fresh OPEN check and immediately
 * before append/delete. The unit remains consumed if that mutation or flush
 * subsequently fails; the client treats those ambiguous failures as
 * non-retryable rather than assuming no write occurred.
 * Malformed/expired/future state starts fresh; persistent service failures fail
 * closed. Legacy v2 properties are never consulted.
 * @param {(number|string)} eventId - Confirmed event identifier.
 * @param {*} action - Mutation action.
 * @param {*} scope - Validated event spreadsheet identifier.
 * @returns {boolean} Whether one validated write attempt was recorded/allowed.
 */
function consumeEventSuccessLimit_(eventId, action, scope) {
  const eventNamespace = getRateLimitEventNamespace_(eventId, action, scope);
  const propertyKey = RATE_LIMIT_PROPERTY_PREFIX + eventNamespace;
  try {
    const properties = PropertiesService.getScriptProperties();
    const now = Date.now();
    const windowMilliseconds = RATE_LIMIT_EVENT_SUCCESS_WINDOW_SECONDS * 1000;
    const storedValue = properties.getProperty(propertyKey);
    let windowStart = now;
    let hits = 0;

    if (storedValue) {
      try {
        const stored = JSON.parse(storedValue);
        if (
          Number.isFinite(stored.windowStart) &&
          Number.isInteger(stored.hits) &&
          stored.hits >= 0 &&
          now >= stored.windowStart &&
          now - stored.windowStart < windowMilliseconds
        ) {
          windowStart = stored.windowStart;
          hits = stored.hits;
        }
      } catch (e) {
        console.error(
          "Invalid persistent rate-limit state for key: " + propertyKey,
        );
      }
    }

    if (hits >= RATE_LIMIT_EVENT_SUCCESS_MAX_HITS) {
      cacheEventSuccessDenial_(eventId, action, scope, windowStart, now);
      return false;
    }

    const nextHits = hits + 1;
    properties.setProperty(
      propertyKey,
      JSON.stringify({ windowStart: windowStart, hits: nextHits }),
    );
    if (nextHits >= RATE_LIMIT_EVENT_SUCCESS_MAX_HITS) {
      cacheEventSuccessDenial_(eventId, action, scope, windowStart, now);
    }
    return true;
  } catch (e) {
    console.error("Persistent rate limiter error: " + e.message);
    return false;
  }
}
