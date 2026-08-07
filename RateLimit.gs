/**
 * @fileoverview Per-person and per-event write rate limiting for mutations.
 * This shared-global service depends on normaliseCompact_ from
 * Normalisation.gs and on Apps Script CacheService and PropertiesService.
 * Callers must hold the script lock while updating the persistent event limit.
 */

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_PERSON_MAX_HITS = 3;
const RATE_LIMIT_EVENT_MAX_HITS = 20;
const RATE_LIMIT_PROPERTY_PREFIX = "signup_app_rate_limit_v2_";

/**
 * Two-layer rate limiter. CacheService cheaply limits repeated person actions,
 * while Script Properties durably enforces the shared event cap even if cache
 * entries are evicted early. Callers hold the script lock, making the durable
 * read/update atomic across concurrent requests.
 * The personal cache counter is consumed before the persistent event counter
 * is checked, including when the event-wide limit ultimately rejects a request.
 * @param {(number|string)} eventId - Validated event identifier.
 * @param {string} name - Normalised participant name.
 * @param {string} cls - Normalised participant class.
 * @param {string} [action] - `cancel`; every other value uses `signup`.
 * @param {string} [scope] - Sheet-specific scope used to isolate events.
 * @returns {boolean} Whether both counters permit the action.
 */
function checkRateLimit_(eventId, name, cls, action, scope) {
  const cache = CacheService.getScriptCache();
  const actionKey = action === "cancel" ? "cancel" : "signup";
  const scopeKey =
    String(scope || "default")
      .replace(/[\s\u3000]+/g, "")
      .substring(0, 80) || "default";
  const namePart = normaliseCompact_(name);
  const clsPart = normaliseCompact_(cls);
  const key =
    "rl_" +
    actionKey +
    "_" +
    scopeKey +
    "_" +
    eventId +
    "_" +
    namePart +
    "_" +
    clsPart;

  const hits = cache.get(key);
  if (hits && parseInt(hits, 10) >= RATE_LIMIT_PERSON_MAX_HITS) return false;
  cache.put(
    key,
    hits ? String(parseInt(hits, 10) + 1) : "1",
    RATE_LIMIT_WINDOW_SECONDS,
  );

  const eventKey =
    RATE_LIMIT_PROPERTY_PREFIX +
    actionKey +
    "_" +
    scopeKey +
    "_" +
    eventId;
  return consumePersistentRateLimit_(
    eventKey,
    RATE_LIMIT_EVENT_MAX_HITS,
    RATE_LIMIT_WINDOW_SECONDS * 1000,
  );
}

/**
 * Atomically consumes one hit from a fixed-window counter in Script Properties.
 * Malformed stored state starts a fresh window; service failures are logged and
 * fail closed. The caller is responsible for holding the project script lock.
 * @param {string} key - Script Property key for the counter.
 * @param {number} maxHits - Maximum allowed hits within the window.
 * @param {number} windowMilliseconds - Fixed-window duration in milliseconds.
 * @returns {boolean} Whether a hit was recorded and allowed.
 */
function consumePersistentRateLimit_(key, maxHits, windowMilliseconds) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const now = Date.now();
    const storedValue = properties.getProperty(key);
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
        console.error("Invalid persistent rate-limit state for key: " + key);
      }
    }

    if (hits >= maxHits) return false;

    properties.setProperty(
      key,
      JSON.stringify({ windowStart: windowStart, hits: hits + 1 }),
    );
    return true;
  } catch (e) {
    // Fail closed: losing durable abuse protection must not silently allow an
    // unlimited write path under the deployer's spreadsheet authority.
    console.error("Persistent rate limiter error: " + e.message);
    return false;
  }
}
