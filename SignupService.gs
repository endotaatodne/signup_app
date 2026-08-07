/**
 * @fileoverview Signup/cancellation workflows and scheduling conflict rules.
 * This file runs in Apps Script's project-wide global scope and coordinates
 * configuration, validation, normalisation, spreadsheet-data, and rate-limit
 * globals from the other server files. Mutations use SpreadsheetApp,
 * LockService, and Utilities under the deployer's authority.
 */

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
 * Finds another signup for the same normalised name in an overlapping event.
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
  const normalisedName = normaliseComparable_(name);
  const eventById = {};

  eventRows.slice(1).forEach(function (row) {
    eventById[String(row[0])] = row;
  });

  return signupRows.slice(1).find(function (row) {
    if (row[1] == eventId) return false;
    if (normaliseComparable_(row[2]) !== normalisedName) return false;

    const conflictingEvent = eventById[String(row[1])];
    if (!conflictingEvent) return false;

    return eventRangesOverlap_(targetRange, getEventRange_(conflictingEvent));
  });
}

/**
 * Counts a participant's signups across events with the same activity key.
 * @param {Array<Array<*>>} eventRows - Events values including the header row.
 * @param {Array<Array<*>>} signupRows - Signups values including the header row.
 * @param {*} activity - Target activity label.
 * @param {string} name - Validated participant name.
 * @returns {number} Number of matching signup rows.
 */
function countPersonSignupsForActivity_(eventRows, signupRows, activity, name) {
  const targetActivity = normaliseActivityKey_(activity);
  const normalisedName = normaliseComparable_(name);
  const activityByEventId = Object.create(null);

  eventRows.slice(1).forEach(function (row) {
    activityByEventId[String(row[0])] = normaliseActivityKey_(row[1]);
  });

  return signupRows.slice(1).reduce(function (count, row) {
    if (activityByEventId[String(row[1])] !== targetActivity) return count;
    if (normaliseComparable_(row[2]) !== normalisedName) return count;

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
 * Submits a new signup for a given event and role.
 * SheetId is derived server-side from the alias — never trusted from client.
 * Under a project script lock, this revalidates sheet data, consumes rate-limit
 * state, enforces capacity/activity/time rules, rechecks write policy, and
 * appends one row. Operational exceptions are logged and normally converted to
 * safe failures; an acquired lock is always released in the finally block.
 * @param {(number|string)} eventId - EventID from the Events sheet.
 * @param {*} name - Client-supplied participant name.
 * @param {*} cls - Client-supplied participant class.
 * @param {*} role - Client-supplied canonical role label.
 * @param {*} alias - Event alias from the page URL.
 * @returns {{success: boolean, message: string, code: (string|undefined), name: (string|undefined), cls: (string|undefined), role: (string|undefined)}}
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
    const eventSettings = getEventSettings_()[alias.toLowerCase()];
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

    // Only valid, writable requests may contend for the global mutation lock.
    lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
      lockAcquired = true;
    } catch (e) {
      return {
        success: false,
        message: "システムがビジー状態です。もう少し待ってから試してください。",
      };
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

    // Run the limiter only after confirming that EventID exists. The durable
    // layer must never create persistent counters for arbitrary request IDs.
    if (!checkRateLimit_(eventId, name, cls, "signup", sheetId)) {
      return {
        success: false,
        message: "使用回数を超過しました。少し待ってからお試しください。",
      };
    }

    // Get max slots for the selected role
    const roleMaxMap = {
      [ROLES.general]: Number(eventRow[8]) || 0,
      [ROLES.classRep]: Number(eventRow[9]) || 0,
      [ROLES.steeringCommittee]: Number(eventRow[10]) || 0,
      [ROLES.orgCommittee]: Number(eventRow[11]) || 0,
    };
    const maxSlots = roleMaxMap[canonicalRole];
    if (maxSlots === 0) {
      return { success: false, message: "このボランティア枠は存在しません。" };
    }

    const signupRows = data.signupRows;
    // Use loose equality intentionally because stored EventID cells may be
    // typed differently by Sheets while still representing the same ID.
    const existing = signupRows.slice(1).filter((r) => r[1] == eventId);

    // Check slot capacity for this role
    const roleSignups = existing.filter((r) => r[4] === canonicalRole);
    if (roleSignups.length >= maxSlots) {
      return {
        success: false,
        code: "slot_full",
        message: "申し訳ありません、この枠のボランティア募集は終了しました。",
      };
    }

    // Normalise name for comparison — case insensitive, collapse regular
    // and full-width spaces (common in Japanese input)
    const normalisedInput = normaliseComparable_(name);
    const duplicate = existing.find(
      (r) => normaliseComparable_(r[2]) === normalisedInput,
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
    if (!isEventOpenForWrite_(alias, sheetId)) {
      return getEventReadOnlyResult_();
    }

    const signupId = Utilities.getUuid();
    signupsSheet.appendRow([
      signupId,
      eventId,
      name,
      String(cls),
      canonicalRole,
      new Date(),
    ]);

    return {
      success: true,
      message: "ありがとうございます！登録が完了しました！",
      name: name,
      cls: cls,
      role: canonicalRole,
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
 * Cancels a signup for a given event, matching on name, class, and role.
 * The Sheet ID and write policy are derived server-side. Under a project script
 * lock, this revalidates sheet data, consumes cancellation rate-limit state,
 * rechecks policy, and deletes at most one matching row. Operational exceptions
 * are logged and normally converted to safe failures; an acquired lock is
 * always released in the finally block.
 * @param {(number|string)} eventId - EventID from the Events sheet.
 * @param {*} name - Client-supplied participant name.
 * @param {*} cls - Client-supplied participant class.
 * @param {*} role - Client-supplied canonical role label.
 * @param {*} alias - Event alias from the page URL.
 * @returns {{success: boolean, message: string, code: (string|undefined)}}
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
    const eventSettings = getEventSettings_()[alias.toLowerCase()];
    const sheetId = eventSettings && eventSettings.sheetId;
    if (!sheetId) {
      return { success: false, message: "不正なリクエストです。" };
    }
    if (eventSettings.status !== EVENT_STATUSES.open) {
      return getEventReadOnlyResult_();
    }

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    if (!getEventRowForRequest_(spreadsheet, parsedEventId)) {
      return { success: false, message: "イベントが見つかりません。" };
    }

    // Only valid, writable requests may contend for the global mutation lock.
    lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
      lockAcquired = true;
    } catch (e) {
      return {
        success: false,
        message: "システムがビジー状態です。もう少し待ってから試してください。",
      };
    }

    const data = getValidatedEventSpreadsheetData_(spreadsheet);
    const eventExists = data.eventRows
      .slice(1)
      .some((row) => row[0] == parsedEventId);
    if (!eventExists) {
      return { success: false, message: "イベントが見つかりません。" };
    }

    if (!checkRateLimit_(parsedEventId, name, cls, "cancel", sheetId)) {
      return {
        success: false,
        message: "使用回数を超過しました。少し待ってからお試しください。",
      };
    }

    const signupsSheet = data.signupsSheet;
    const signupRows = data.signupRows;
    const signupDisplayRows = data.signupDisplayRows;

    // Normalise name for comparison
    const normalisedInput = normaliseComparable_(name);
    const normalisedCls = normaliseClassComparable_(cls);

    // Find matching row — name + role + eventId
    let matchRowIndex = -1;
    for (let i = 1; i < signupRows.length; i++) {
      const rowEventId = signupRows[i][1];
      const rowName = normaliseComparable_(signupRows[i][2]);
      // Compare against the displayed sheet text so values like "1-1" are
      // matched consistently even if Sheets auto-detects the raw cell value.
      const rowCls = normaliseClassComparable_(signupDisplayRows[i][3]);
      const rowRole = signupRows[i][4];
      if (
        // Use loose equality intentionally because Sheets can return EventID
        // cells as numbers or strings depending on how the sheet is formatted.
        rowEventId == parsedEventId &&
        rowName === normalisedInput &&
        rowCls === normalisedCls &&
        rowRole === canonicalRole
      ) {
        matchRowIndex = i + 1;
        break;
      }
    }

    if (matchRowIndex === -1) {
      return {
        success: false,
        message:
          "お名前とクラスの登録が見つかりません。入力内容をご確認ください。",
      };
    }

    // Re-read the policy immediately before deleting for the same reason as
    // the final check in submitSignup.
    if (!isEventOpenForWrite_(alias, sheetId)) {
      return getEventReadOnlyResult_();
    }

    // Delete the matching row
    signupsSheet.deleteRow(matchRowIndex);

    return {
      success: true,
      message: "キャンセルされました。ページをリフレッシュしてください。",
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
