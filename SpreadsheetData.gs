/**
 * @fileoverview Validated event-sheet reads and optional activity-limit loading.
 * These shared-global helpers depend on sheet names and header schemas from
 * Config.gs, row/header validators from Validation.gs, and whitespace
 * normalisation from Normalisation.gs. They read Sheets but do not mutate them.
 */

/**
 * Reads a required sheet and validates its leading header columns.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - Parent file.
 * @param {string} sheetName - Required sheet tab name.
 * @param {Array<Array<string>>} expectedHeaders - Accepted values per column.
 * @param {{valueColumnCount: (number|undefined), displayColumnIndex: (number|undefined)}} [options]
 *   Explicit raw width and optional zero-based formatted-value column.
 * @returns {{sheet: GoogleAppsScript.Spreadsheet.Sheet, values: Array<Array<*>>, displayValues: (Array<Array<string>>|undefined)}}
 *   Sheet handle and raw values, with formatted values when requested.
 * @throws {Error} If the sheet is missing, empty, or has invalid headers.
 */
function getSheetData_(
  spreadsheet,
  sheetName,
  expectedHeaders,
  options,
) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('The "' + sheetName + '" sheet is missing.');
  }

  const dataRange = sheet.getDataRange();
  const rowCount = dataRange.getNumRows();
  if (!rowCount) {
    throw new Error('The "' + sheetName + '" sheet is empty.');
  }
  const readOptions = options || {};
  const requestedValueColumnCount =
    readOptions.valueColumnCount || expectedHeaders.length;
  const valueColumnCount = Math.min(
    requestedValueColumnCount,
    dataRange.getNumColumns(),
  );
  const values = sheet
    .getRange(1, 1, rowCount, valueColumnCount)
    .getValues();

  validateSheetHeaders_(values[0], expectedHeaders, sheetName);

  const result = {
    sheet: sheet,
    values: values,
  };

  if (readOptions.displayColumnIndex !== undefined) {
    const displayColumnIndex = readOptions.displayColumnIndex;
    const displayColumnValues = sheet
      .getRange(1, displayColumnIndex + 1, rowCount, 1)
      .getDisplayValues();
    result.displayValues = displayColumnValues.map(function (row) {
      const displayRow = [];
      displayRow[displayColumnIndex] = row[0];
      return displayRow;
    });
  }

  return result;
}

/**
 * Produces the exact whitespace-normalised key used to match activity labels.
 * Matching remains case-sensitive.
 * @param {*} value - Activity label to coerce to text.
 * @returns {string} Canonical activity lookup key.
 */
function normaliseActivityKey_(value) {
  return normaliseWhitespace_(value);
}

/**
 * Loads and validates per-person limits from the optional ActivityLimits tab.
 * Blank rows are ignored; every configured activity must exist in Events and
 * appear at most once. A missing tab means that no activity limits apply.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - Event file.
 * @param {Array<Array<*>>} eventRows - Events values including the header row.
 * @returns {Object<string, number>} Positive signup limit by activity key.
 * @throws {Error} If the optional sheet exists but is empty or malformed.
 */
function getOptionalActivityLimits_(spreadsheet, eventRows) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.activityLimits);
  if (!sheet) return Object.create(null);

  const dataRange = sheet.getDataRange();
  const rowCount = dataRange.getNumRows();
  if (!rowCount) {
    throw new Error('The "ActivityLimits" sheet is empty.');
  }
  const values = sheet
    .getRange(
      1,
      1,
      rowCount,
      ACTIVITY_LIMIT_HEADER_ALIASES.length,
    )
    .getValues();

  validateSheetHeaders_(
    values[0],
    ACTIVITY_LIMIT_HEADER_ALIASES,
    SHEET_NAMES.activityLimits,
  );

  const eventActivities = Object.create(null);
  eventRows.slice(1).forEach(function (row) {
    eventActivities[normaliseActivityKey_(row[1])] = true;
  });

  const limits = Object.create(null);
  values.slice(1).forEach(function (row, index) {
    const rowNumber = index + 2;
    const activity = normaliseActivityKey_(row && row[0]);
    const rawLimit = row && row[1];
    const limitText = String(rawLimit == null ? "" : rawLimit).trim();

    if (!activity && !limitText) return;
    if (!activity) {
      throw new Error(
        'Activity is required in "ActivityLimits" sheet row ' + rowNumber + ".",
      );
    }
    if (!limitText) {
      throw new Error(
        'MaxPerPerson is required in "ActivityLimits" sheet row ' +
          rowNumber +
          ".",
      );
    }

    const hasSupportedLimitType =
      typeof rawLimit === "number" || typeof rawLimit === "string";
    const limit = Number(rawLimit);
    if (!hasSupportedLimitType || !Number.isInteger(limit) || limit <= 0) {
      throw new Error(
        'Invalid MaxPerPerson in "ActivityLimits" sheet row ' + rowNumber + ".",
      );
    }
    if (!eventActivities[activity]) {
      throw new Error(
        'Unknown Activity in "ActivityLimits" sheet row ' + rowNumber + ".",
      );
    }
    if (limits[activity] !== undefined) {
      throw new Error(
        'Duplicate Activity in "ActivityLimits" sheet row ' + rowNumber + ".",
      );
    }

    limits[activity] = limit;
  });

  return limits;
}

/**
 * Reads and validates the required Events and Signups tabs as one snapshot.
 * Both raw and displayed signup values are returned because Sheets can coerce
 * class labels such as `1-1` in the raw value stream.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - Event file.
 * @returns {{eventRows: Array<Array<*>>, signupRows: Array<Array<*>>, signupDisplayRows: Array<Array<string>>, signupsSheet: GoogleAppsScript.Spreadsheet.Sheet}}
 *   Validated rows and the Signups sheet handle used by mutation workflows.
 * @throws {Error} If a required tab, header, or data row is invalid.
 */
function getValidatedEventSpreadsheetData_(spreadsheet) {
  const eventsData = getSheetData_(
    spreadsheet,
    SHEET_NAMES.events,
    EVENT_HEADER_ALIASES,
  );
  const signupsData = getSheetData_(
    spreadsheet,
    SHEET_NAMES.signups,
    SIGNUP_HEADER_ALIASES,
    { displayColumnIndex: 3 },
  );

  for (let index = 1; index < eventsData.values.length; index += 1) {
    validateEventRow_(eventsData.values[index], index + 1);
  }
  for (let index = 1; index < signupsData.values.length; index += 1) {
    validateSignupRow_(
      signupsData.values[index],
      signupsData.displayValues[index],
      index + 1,
    );
  }

  return {
    eventRows: eventsData.values,
    signupRows: signupsData.values,
    signupDisplayRows: signupsData.displayValues,
    signupsSheet: signupsData.sheet,
  };
}
