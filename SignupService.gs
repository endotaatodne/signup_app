/**
 * @fileoverview Signup/cancellation workflows and scheduling conflict rules.
 * Public mutations validate cheap request/config/event facts, consult cached
 * denial sentinels, charge the emergency fuse, and attempt a short ScriptLock.
 * Under that lock they recheck the cached durable denial; surviving requests
 * charge personal attempts, take a fresh full snapshot, enforce business rules,
 * re-read OPEN policy, consume durable write admission, mutate, flush, and only
 * then release. Apps Script services run as deployer.
 */

// Bound how long each anonymous execution occupies a runtime while waiting for
// the project-wide mutation lock. Only an explicit false return after 250 ms is
// reported as busy_retryable; LockService exceptions remain generic failures.
const SCRIPT_LOCK_TIMEOUT_MILLISECONDS = 250;

/**
 * Creates the standard non-retryable failure for every rate-limit layer.
 * It deliberately has no `busy_retryable` code, so the client cannot replay a
 * durable denial as if it were confirmed pre-write lock contention.
 * @returns {{success: boolean, message: string}} User-safe limit response.
 */
function getMutationRateLimitResult_() {
  return {
    success: false,
    message: "使用回数を超過しました。少し待ってからお試しください。",
  };
}

/**
 * Creates the retryable result only for an explicit `tryLock(250) === false`.
 * The emergency fuse has already counted this attempt, but no personal/durable
 * charge, locked snapshot, or write has occurred. Lock service exceptions use
 * the outer generic non-retryable failure instead.
 * @returns {{success: boolean, code: string, message: string}} Busy response.
 */
function getBusyRetryableResult_() {
  return {
    success: false,
    code: "busy_retryable",
    message: "システムがビジー状態です。もう少し待ってから試してください。",
  };
}

/**
 * Creates a non-retryable cancellation failure for an ambiguous match tier.
 * Ambiguity never deletes a row or consumes durable write admission.
 * @returns {{success: boolean, code: string, message: string}} Failure result.
 */
function getAmbiguousCancellationResult_() {
  return {
    success: false,
    code: "ambiguous_signup",
    message:
      "一致する登録が複数見つかったため、キャンセルできませんでした。主催者にお問い合わせください。",
  };
}

/**
 * Selects a cancellation target using exact, legacy, then NFKC identity tiers.
 * Tier 1 is case-sensitive domain/display-normalised matching; tier 2 uses the
 * unchanged case-insensitive legacy comparator; tier 3 uses server-only NFKC
 * identity. A unique match returns immediately. Zero falls through, while two
 * or more at any tier is terminal so no arbitrary colliding row is deleted.
 * @param {Array<{rowIndex: number, rawName: string, displayClass: string}>} candidates
 *   Signup rows already restricted to the requested event and role.
 * @param {string} name - Validated request name.
 * @param {string} cls - Validated request class.
 * @returns {{match: (?{rowIndex: number, rawName: string, displayClass: string}), ambiguous: boolean}}
 *   Unique selected raw/display tuple, ambiguity indicator, or no match.
 */
function selectCancellationMatch_(candidates, name, cls) {
  const exactName = normaliseNameValue_(name);
  const exactClass = normaliseClassValue_(cls);
  const legacyName = normaliseComparable_(name);
  const legacyClass = normaliseClassComparable_(cls);
  const identityName = normaliseNameIdentityKey_(name);
  const identityClass = normaliseClassIdentityKey_(cls);
  const tiers = [
    function (candidate) {
      return (
        normaliseNameValue_(candidate.rawName) === exactName &&
        normaliseClassValue_(candidate.displayClass) === exactClass
      );
    },
    function (candidate) {
      return (
        normaliseComparable_(candidate.rawName) === legacyName &&
        normaliseClassComparable_(candidate.displayClass) === legacyClass
      );
    },
    function (candidate) {
      return (
        normaliseNameIdentityKey_(candidate.rawName) === identityName &&
        normaliseClassIdentityKey_(candidate.displayClass) === identityClass
      );
    },
  ];

  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex += 1) {
    const matches = candidates.filter(tiers[tierIndex]);
    if (matches.length === 1) {
      return { match: matches[0], ambiguous: false };
    }
    if (matches.length > 1) {
      return { match: null, ambiguous: true };
    }
  }

  return { match: null, ambiguous: false };
}

/**
 * Converts an Events row into a timezone-aware date and minute range.
 * @param {Array<*>} eventRow - Validated Events row with date/start/end cells.
 * @returns {{dateKey: string, startMinutes: number, endMinutes: number}}
 *   Brisbane date key and minutes after midnight.
 * @throws {Error} If Apps Script cannot format a supplied date/time value.
 */
function getEventRange_(eventRow) {
  const dateKey = Utilities.formatDate(
    new Date(eventRow[3]),
    APP_TIME_ZONE,
    "yyyy-MM-dd",
  );
  const startTime = Utilities.formatDate(
    new Date(eventRow[4]),
    APP_TIME_ZONE,
    "HH:mm",
  );
  const endTime = Utilities.formatDate(
    new Date(eventRow[5]),
    APP_TIME_ZONE,
    "HH:mm",
  );

  return {
    dateKey: dateKey,
    startMinutes: timeStringToMinutes_(startTime),
    endMinutes: timeStringToMinutes_(endTime),
  };
}

/**
 * Converts an `HH:mm`-style value to minutes after midnight.
 * The caller is responsible for supplying a valid formatted time.
 * @param {*} time - Colon-separated time value.
 * @returns {number} Minute offset, or `NaN` for malformed numeric components.
 */
function timeStringToMinutes_(time) {
  const parts = String(time || "").split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

/**
 * Tests whether two event ranges overlap on the same calendar date.
 * Back-to-back positive ranges do not overlap. A zero/negative-duration range
 * conflicts only when both ranges start at the same minute.
 * @param {{dateKey: string, startMinutes: number, endMinutes: number}} a - Range.
 * @param {{dateKey: string, startMinutes: number, endMinutes: number}} b - Range.
 * @returns {boolean} Whether the ranges conflict.
 */
function eventRangesOverlap_(a, b) {
  if (a.dateKey !== b.dateKey) return false;

  if (a.endMinutes <= a.startMinutes || b.endMinutes <= b.startMinutes) {
    return a.startMinutes === b.startMinutes;
  }

  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

/**
 * Finds another signup for the same NFKC participant identity in an overlap.
 * Rows whose EventID no longer exists in Events are ignored.
 * @param {Array<Array<*>>} eventRows - Events values including the header row.
 * @param {Array<Array<*>>} signupRows - Signups values including the header row.
 * @param {(number|string)} eventId - Target EventID to exclude from conflicts.
 * @param {string} name - Validated participant name.
 * @param {Array<*>} eventRow - Target Events row.
 * @returns {(Array<*>|undefined)} First conflicting Signups row, if one exists.
 */
function findConcurrentSignup_(eventRows, signupRows, eventId, name, eventRow) {
  const targetRange = getEventRange_(eventRow);
  const normalisedName = normaliseNameIdentityKey_(name);
  const eventById = {};

  eventRows.slice(1).forEach(function (row) {
    eventById[String(row[0])] = row;
  });

  return signupRows.slice(1).find(function (row) {
    if (row[1] == eventId) return false;
    if (normaliseNameIdentityKey_(row[2]) !== normalisedName) return false;

    const conflictingEvent = eventById[String(row[1])];
    if (!conflictingEvent) return false;

    return eventRangesOverlap_(targetRange, getEventRange_(conflictingEvent));
  });
}

/**
 * Counts an NFKC participant identity across the same legacy activity key.
 * @param {Array<Array<*>>} eventRows - Events values including the header row.
 * @param {Array<Array<*>>} signupRows - Signups values including the header row.
 * @param {*} activity - Target activity label.
 * @param {string} name - Validated participant name.
 * @returns {number} Number of matching signup rows.
 */
function countPersonSignupsForActivity_(eventRows, signupRows, activity, name) {
  const targetActivity = normaliseActivityKey_(activity);
  const normalisedName = normaliseNameIdentityKey_(name);
  const activityByEventId = Object.create(null);

  eventRows.slice(1).forEach(function (row) {
    activityByEventId[String(row[0])] = normaliseActivityKey_(row[1]);
  });

  return signupRows.slice(1).reduce(function (count, row) {
    if (activityByEventId[String(row[1])] !== targetActivity) return count;
    if (normaliseNameIdentityKey_(row[2]) !== normalisedName) return count;

    return count + 1;
  }, 0);
}

/**
 * Reads the Events tab and returns the requested row after validating that row.
 * EventID comparison is intentionally loose to tolerate Sheets cell formatting.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - Event file.
 * @param {(number|string)} eventId - Requested EventID.
 * @returns {?(Array<*>)} Matching validated row, or `null` when absent.
 * @throws {Error} If the Events tab/header or matching row is invalid.
 */
function getEventRowForRequest_(spreadsheet, eventId) {
  const eventRows = getSheetData_(
    spreadsheet,
    SHEET_NAMES.events,
    EVENT_HEADER_ALIASES,
  ).values;
  // Use loose equality intentionally because Sheets can surface EventID cells
  // as either numbers or strings depending on column formatting.
  const eventRow = eventRows.slice(1).find((row) => row[0] == eventId);
  if (eventRow) {
    validateEventRow_(eventRow, eventRows.indexOf(eventRow) + 1);
  }
  return eventRow || null;
}

/**
 * Submits one signup using only a Config-derived event spreadsheet.
 * Cached blocks shed work before the emergency fuse; otherwise that fuse also
 * counts an attempt that later finds the lock busy. After lock acquisition a
 * cached durable denial is checked again; surviving requests charge a personal
 * attempt before the fresh snapshot and business checks.
 * Durable admission is charged only after those checks and a final fresh OPEN
 * policy read, immediately before appendRow. The append is flushed while the
 * lock is held. Mutation/flush errors are generic and non-retryable to the
 * client because the write outcome may be ambiguous; finally releases every
 * acquired lock.
 * @param {(number|string)} eventId - EventID from the Events sheet.
 * @param {*} name - Client-supplied participant name.
 * @param {*} cls - Client-supplied participant class.
 * @param {*} role - Client-supplied canonical role label.
 * @param {*} alias - Event alias from the page URL.
 * @returns {{success: boolean, message: string, code: (string|undefined), name: (string|undefined), cls: (string|undefined), role: (string|undefined), filled: (number|undefined), max: (number|undefined)}}
 *   Success details or a user-safe rejection/failure payload.
 */
function submitSignup(eventId, name, cls, role, alias) {
  let lock = null;
  let lockAcquired = false;
  try {
    // Validate alias
    if (!isValidAlias_(alias)) {
      return { success: false, message: "不正なリクエストです。" };
    }

    // Validate eventId as strict positive integer
    const parsedEventId = parseRequestEventId_(eventId);
    if (parsedEventId === null) {
      return { success: false, message: "不正なリクエストです。" };
    }
    eventId = parsedEventId;

    // Derive sheetId server-side
    const masterSpreadsheet = getMasterSpreadsheet_();
    const eventSettings =
      getEventSettings_(masterSpreadsheet)[alias.toLowerCase()];
    const sheetId = eventSettings && eventSettings.sheetId;
    if (!sheetId) {
      return { success: false, message: "不正なリクエストです。" };
    }
    if (eventSettings.status !== EVENT_STATUSES.open) {
      return getEventReadOnlyResult_();
    }

    // Validate name
    const nameValidation = validateNameInput_(name);
    if (!nameValidation.ok) {
      return { success: false, message: nameValidation.message };
    }
    name = nameValidation.value;

    // Validate class
    const classValidation = validateClassInput_(cls);
    if (!classValidation.ok) {
      return { success: false, message: classValidation.message };
    }
    cls = classValidation.value;

    // Validate role against canonical values
    const canonicalRole = getCanonicalRole_(role);
    if (!canonicalRole) {
      return { success: false, message: "ポジションを選択してください。" };
    }

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const initialEventRow = getEventRowForRequest_(spreadsheet, eventId);
    if (!initialEventRow) {
      return { success: false, message: "イベントが見つかりません。" };
    }

    const initialEventDate = new Date(initialEventRow[3]);
    const initialToday = new Date();
    initialToday.setHours(0, 0, 0, 0);
    if (initialEventDate < initialToday) {
      return { success: false, message: "このイベントは既に終了しています。" };
    }

    if (
      isPersonAttemptBlocked_(eventId, name, cls, "signup", sheetId) ||
      isEventSuccessLimitBlocked_(eventId, "signup", sheetId)
    ) {
      return getMutationRateLimitResult_();
    }

    // Charge only the high-threshold cache fuse before lock acquisition. This
    // busy attempt cannot consume personal/durable budgets; its optional client
    // retry is a new attempt and can do so only if it acquires the lock.
    if (!checkEmergencyAttemptFuse_(eventId, "signup", sheetId)) {
      return getMutationRateLimitResult_();
    }

    // Only valid, writable requests may contend for the global mutation lock.
    lock = LockService.getScriptLock();
    lockAcquired = lock.tryLock(SCRIPT_LOCK_TIMEOUT_MILLISECONDS);

    if (!lockAcquired) {
      return getBusyRetryableResult_();
    }

    if (isEventSuccessLimitBlocked_(eventId, "signup", sheetId)) {
      return getMutationRateLimitResult_();
    }
    if (!checkPersonAttemptLimit_(eventId, name, cls, "signup", sheetId)) {
      return getMutationRateLimitResult_();
    }

    const data = getValidatedEventSpreadsheetData_(spreadsheet);
    const eventRows = data.eventRows;
    const signupsSheet = data.signupsSheet;
    // Use loose equality intentionally because Sheets can surface EventID cells
    // as either numbers or strings depending on column formatting.
    const eventRow = eventRows.find((r) => r[0] == eventId);
    if (!eventRow)
      return { success: false, message: "イベントが見つかりません。" };

    // Check event date has not passed
    const eventDate = new Date(eventRow[3]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (eventDate < today) {
      return { success: false, message: "このイベントは既に終了しています。" };
    }

    // Get max slots for the selected role
    // Retain the former role-to-capacity map's last-match behaviour if a
    // malformed configuration happens to reuse the same label.
    const roleSlotDescriptor = ROLE_SLOT_DESCRIPTORS.reduce(function (
      matchingDescriptor,
      descriptor,
    ) {
      return descriptor.label === canonicalRole
        ? descriptor
        : matchingDescriptor;
    }, null);
    const maxSlots = Number(eventRow[roleSlotDescriptor.eventColumnIndex]) || 0;
    if (maxSlots === 0) {
      return { success: false, message: "このボランティア枠は存在しません。" };
    }

    const signupRows = data.signupRows;
    // Use loose equality intentionally because stored EventID cells may be
    // typed differently by Sheets while still representing the same ID.
    let roleSignupCount = 0;
    const existing = [];
    for (let index = 1; index < signupRows.length; index += 1) {
      const row = signupRows[index];
      if (row[1] != eventId) continue;
      if (row[4] === canonicalRole) roleSignupCount += 1;
      existing.push(row);
    }

    // Check slot capacity for this role
    if (roleSignupCount >= maxSlots) {
      return {
        success: false,
        code: "slot_full",
        message: "申し訳ありません、この枠のボランティア募集は終了しました。",
      };
    }

    // Use the server-only compatibility identity without changing stored text.
    const normalisedInput = normaliseNameIdentityKey_(name);
    const duplicate = existing.find(
      (r) => normaliseNameIdentityKey_(r[2]) === normalisedInput,
    );
    if (duplicate) {
      return {
        success: false,
        message:
          "同じ名前の方がボランティアに入っています。違う名前を入力してください。",
      };
    }

    let activityLimits;
    try {
      activityLimits = getOptionalActivityLimits_(spreadsheet, eventRows);
    } catch (configurationError) {
      console.error(
        "ActivityLimits configuration error: " + configurationError.message,
      );
      return {
        success: false,
        code: "configuration_error",
        message:
          "現在、登録を受け付けることができません。主催者にお問い合わせください。",
      };
    }

    const activityKey = normaliseActivityKey_(eventRow[1]);
    const activityLimit = activityLimits[activityKey];
    if (
      activityLimit !== undefined &&
      countPersonSignupsForActivity_(
        eventRows,
        signupRows,
        eventRow[1],
        name,
      ) >= activityLimit
    ) {
      return {
        success: false,
        code: "activity_limit",
        message:
          "申し訳ございません。「" +
          normaliseWhitespace_(eventRow[1]) +
          "」は現在、お一人につき" +
          activityLimit +
          "枠までのお申し込みとさせていただいております。",
      };
    }

    const concurrentSignup = findConcurrentSignup_(
      eventRows,
      signupRows,
      eventId,
      name,
      eventRow,
    );
    if (concurrentSignup) {
      return {
        success: false,
        code: "time_conflict",
        message: "同じ時間帯に別のボランティアに登録されています。",
      };
    }

    // Re-read the policy immediately before writing so an already-open page,
    // or a request that began while the event was open, cannot bypass a lock.
    if (!isEventOpenForWrite_(alias, sheetId, masterSpreadsheet)) {
      return getEventReadOnlyResult_();
    }

    const signupId = Utilities.getUuid();
    if (!consumeEventSuccessLimit_(eventId, "signup", sheetId)) {
      return getMutationRateLimitResult_();
    }
    signupsSheet.appendRow([
      signupId,
      eventId,
      name,
      String(cls),
      canonicalRole,
      new Date(),
    ]);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "ありがとうございます！登録が完了しました！",
      name: name,
      cls: cls,
      role: canonicalRole,
      filled: roleSignupCount + 1,
      max: maxSlots,
    };
  } catch (e) {
    console.error("submitSignup error: " + e.message);
    return {
      success: false,
      message: "エラーが発生しました。再度試してください。",
    };
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

/**
 * Cancels at most one signup in a Config-derived event spreadsheet.
 * Cached blocks shed work before the emergency fuse; otherwise that fuse also
 * counts an attempt that later finds the lock busy. After lock acquisition a
 * cached durable denial is checked again; surviving requests charge a personal
 * attempt before the fresh snapshot and tiered target selection. Ambiguous
 * matches delete nothing. Durable admission is charged only after a unique
 * match and a final fresh OPEN policy read, immediately
 * before deleteRow. The deletion is flushed while the lock is held. Mutation/
 * flush errors are generic and non-retryable because the outcome may be
 * ambiguous; finally releases every acquired lock.
 * @param {(number|string)} eventId - EventID from the Events sheet.
 * @param {*} name - Client-supplied participant name.
 * @param {*} cls - Client-supplied participant class.
 * @param {*} role - Client-supplied canonical role label.
 * @param {*} alias - Event alias from the page URL.
 * @returns {{success: boolean, message: string, code: (string|undefined), name: (string|undefined), cls: (string|undefined), role: (string|undefined), filled: (number|undefined)}}
 *   Cancellation confirmation or a user-safe rejection/failure payload.
 */
function cancelSignup(eventId, name, cls, role, alias) {
  let lock = null;
  let lockAcquired = false;
  try {
    // Validate alias
    if (!isValidAlias_(alias)) {
      return { success: false, message: "不正なリクエストです。" };
    }

    // Validate eventId
    const parsedEventId = parseRequestEventId_(eventId);
    if (parsedEventId === null) {
      return { success: false, message: "不正なリクエストです。" };
    }

    // Validate name
    const nameValidation = validateNameInput_(name);
    if (!nameValidation.ok) {
      return { success: false, message: nameValidation.message };
    }
    name = nameValidation.value;

    // Validate class
    const classValidation = validateClassInput_(cls);
    if (!classValidation.ok) {
      return { success: false, message: classValidation.message };
    }
    cls = classValidation.value;

    // Validate role against canonical values
    const canonicalRole = getCanonicalRole_(role);
    if (!canonicalRole) {
      return { success: false, message: "ポジションが不正です。" };
    }

    // Derive sheetId server-side
    const masterSpreadsheet = getMasterSpreadsheet_();
    const eventSettings =
      getEventSettings_(masterSpreadsheet)[alias.toLowerCase()];
    const sheetId = eventSettings && eventSettings.sheetId;
    if (!sheetId) {
      return { success: false, message: "不正なリクエストです。" };
    }
    if (eventSettings.status !== EVENT_STATUSES.open) {
      return getEventReadOnlyResult_();
    }

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const initialEventRow = getEventRowForRequest_(spreadsheet, parsedEventId);
    if (!initialEventRow) {
      return { success: false, message: "イベントが見つかりません。" };
    }

    if (
      isPersonAttemptBlocked_(parsedEventId, name, cls, "cancel", sheetId) ||
      isEventSuccessLimitBlocked_(parsedEventId, "cancel", sheetId)
    ) {
      return getMutationRateLimitResult_();
    }
    if (!checkEmergencyAttemptFuse_(parsedEventId, "cancel", sheetId)) {
      return getMutationRateLimitResult_();
    }

    // Only valid, writable requests may contend for the global mutation lock.
    lock = LockService.getScriptLock();
    lockAcquired = lock.tryLock(SCRIPT_LOCK_TIMEOUT_MILLISECONDS);

    if (!lockAcquired) {
      return getBusyRetryableResult_();
    }

    if (isEventSuccessLimitBlocked_(parsedEventId, "cancel", sheetId)) {
      return getMutationRateLimitResult_();
    }
    if (
      !checkPersonAttemptLimit_(parsedEventId, name, cls, "cancel", sheetId)
    ) {
      return getMutationRateLimitResult_();
    }

    const data = getValidatedEventSpreadsheetData_(spreadsheet);
    const eventExists = data.eventRows
      .slice(1)
      .some((row) => row[0] == parsedEventId);
    if (!eventExists) {
      return { success: false, message: "イベントが見つかりません。" };
    }

    const signupsSheet = data.signupsSheet;
    const signupRows = data.signupRows;
    const signupDisplayRows = data.signupDisplayRows;

    // Collect only same-event/same-role rows; tiered name/class matching below
    // decides whether exactly one safe cancellation target exists.
    const candidates = [];

    // Find matching row — name + role + eventId
    let roleSignupCount = 0;
    for (let i = 1; i < signupRows.length; i++) {
      const rowEventId = signupRows[i][1];
      const rowRole = signupRows[i][4];
      // Avoid expensive name/class canonicalisation for unrelated rows.
      if (rowEventId != parsedEventId || rowRole !== canonicalRole) continue;
      roleSignupCount += 1;
      candidates.push({
        rowIndex: i + 1,
        rawName: String(signupRows[i][2]),
        displayClass: String(signupDisplayRows[i][3]),
      });
    }

    const selection = selectCancellationMatch_(candidates, name, cls);
    if (selection.ambiguous) {
      return getAmbiguousCancellationResult_();
    }
    const matchedSignup = selection.match;
    const matchRowIndex = matchedSignup ? matchedSignup.rowIndex : -1;

    if (matchRowIndex === -1) {
      return {
        success: false,
        message:
          "お名前とクラスの登録が見つかりません。入力内容をご確認ください。",
      };
    }

    // Re-read the policy immediately before deleting for the same reason as
    // the final check in submitSignup.
    if (!isEventOpenForWrite_(alias, sheetId, masterSpreadsheet)) {
      return getEventReadOnlyResult_();
    }

    if (!consumeEventSuccessLimit_(parsedEventId, "cancel", sheetId)) {
      return getMutationRateLimitResult_();
    }

    // Delete the matching row
    signupsSheet.deleteRow(matchRowIndex);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "登録がキャンセルされました。",
      name: matchedSignup.rawName,
      cls: matchedSignup.displayClass,
      role: canonicalRole,
      filled: roleSignupCount - 1,
    };
  } catch (e) {
    console.error("cancelSignup error: " + e.message);
    return {
      success: false,
      message: "エラーが発生しました。再度試してください。",
    };
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}
