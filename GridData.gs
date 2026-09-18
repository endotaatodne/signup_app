/**
 * @fileoverview Public schedule retrieval and browser-facing grid shaping.
 * Functions run in Apps Script's shared global scope and depend on schema/data
 * helpers from SpreadsheetData.gs, constants from Config.gs, and the
 * SpreadsheetApp and Utilities services.
 */

/**
 * Reads a validated event spreadsheet and builds the public schedule model.
 * Sheet text remains exact String data: doGet protects its JSON at the template
 * boundary with UTF-8 Base64, while getGridDataForAlias uses Apps Script's
 * structured RPC channel. The client must still render these strings as text.
 * Class uses displayed sheet text; signup IDs and timestamps are never exposed.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - Event spreadsheet.
 * @returns {{events: Array<Object>, times: Array<string>, activities: Array<string>}}
 *   Events plus distinct start times and activity labels.
 * @throws {Error} If required sheets, headers, or data rows are invalid.
 */
function getGridData_(spreadsheet) {
  const data = getValidatedEventSpreadsheetData_(spreadsheet);
  const eventRows = data.eventRows;
  const signupRows = data.signupRows;
  const signupDisplayRows = data.signupDisplayRows;

  // Build signups lookup: eventId -> [{name, cls, role}]
  const signupsMap = {};
  const signupCountsMap = {};
  signupRows.slice(1).forEach((row, index) => {
    const displayRow = signupDisplayRows[index + 1] || [];
    const eventId = row[1];
    const name = String(row[2]);
    // Use the displayed sheet text for class so values like "1-1" are not
    // serialised as Date strings when Sheets auto-detects them internally.
    const cls = String(displayRow[3] == null ? "" : displayRow[3]);
    const role = String(row[4]);
    if (!signupsMap[eventId]) signupsMap[eventId] = [];
    if (!signupCountsMap[eventId]) {
      // A null-prototype map preserves arbitrary configured role labels as
      // ordinary keys (including names that overlap Object.prototype).
      const signupCounts = Object.create(null);
      ROLE_SLOT_DESCRIPTORS.forEach(function (descriptor) {
        signupCounts[descriptor.label] = 0;
      });
      signupCountsMap[eventId] = signupCounts;
    }
    signupsMap[eventId].push({ name, cls, role });
    if (signupCountsMap[eventId][role] !== undefined) {
      signupCountsMap[eventId][role]++;
    }
  });

  const events = eventRows.slice(1).map((row) => {
    const eventId = row[0];
    const allSignups = signupsMap[eventId] || [];
    const signupCounts = signupCountsMap[eventId] || {};
    const slots = {};
    ROLE_SLOT_DESCRIPTORS.forEach(function (descriptor) {
      slots[descriptor.key] = {
        max: Number(row[descriptor.eventColumnIndex]) || 0,
        filled: signupCounts[descriptor.label] || 0,
      };
    });

    return {
      eventId: eventId,
      activity: String(row[1]),
      subtitle: String(row[2] == null ? "" : row[2]),
      date: Utilities.formatDate(
        new Date(row[3]),
        APP_TIME_ZONE,
        "dd MMM yyyy",
      ),
      startTime: Utilities.formatDate(
        new Date(row[4]),
        APP_TIME_ZONE,
        "HH:mm",
      ),
      endTime: Utilities.formatDate(
        new Date(row[5]),
        APP_TIME_ZONE,
        "HH:mm",
      ),
      description: String(row[6] == null ? "" : row[6]),
      location: String(row[7] == null ? "" : row[7]),
      slots: slots,
      signups: allSignups,
    };
  });

  const times = [...new Set(events.map((e) => e.startTime))].sort();
  const activities = [...new Set(events.map((e) => e.activity))];

  return { events, times, activities };
}

/**
 * Fetches fresh public schedule data and policy status through structured RPC.
 * Validation and spreadsheet errors are logged and converted to safe failures;
 * the response deliberately contains raw public strings, not HTML fragments.
 * @param {string} alias - Event alias from the page URL.
 * @returns {{success: boolean, gridData: (Object|undefined), eventStatus: (string|undefined), title: (string|undefined), message: (string|undefined)}}
 *   Success payload or a user-safe failure payload.
 */
function getGridDataForAlias(alias) {
  try {
    if (!isValidAlias_(alias)) {
      return { success: false, message: "不正なリクエストです。" };
    }

    const eventSettings = getEventSettings_()[alias.toLowerCase()];
    const sheetId = eventSettings && eventSettings.sheetId;
    if (!sheetId) {
      return { success: false, message: "不正なリクエストです。" };
    }
    if (eventSettings.status === EVENT_STATUSES.closed) {
      return getEventClosedResult_();
    }

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    return {
      success: true,
      gridData: getGridData_(spreadsheet),
      eventStatus: eventSettings.status,
      title: spreadsheet.getName(),
    };
  } catch (e) {
    console.error("getGridDataForAlias error: " + e.message);
    return {
      success: false,
      message: "エラーが発生しました。再度試してください。",
    };
  }
}
