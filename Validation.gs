/**
 * @fileoverview Request, output-safety, sheet-schema, and row validation.
 * These helpers occupy Apps Script's shared global scope. They depend on role
 * and header-schema constants from Config.gs and canonicalisation helpers from
 * Normalisation.gs; they have no direct Apps Script service dependencies.
 */

/**
 * Escapes script-sensitive characters as literal Unicode escape sequences.
 * Falsy values intentionally become an empty string.
 * @param {*} str - Value destined for a JSON/script context.
 * @returns {string} Escaped text safe to carry in the client data model.
 */
function sanitiseForScript_(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/"/g, "\\u0022")
    .replace(/'/g, "\\u0027")
    .replace(/\//g, "\\u002f")
    .replace(/`/g, "\\u0060");
}

/**
 * Accepts a role only when it exactly matches a configured canonical label.
 * @param {*} role - Client- or sheet-supplied role value.
 * @returns {(string|undefined)} Canonical role, or `undefined` when invalid.
 */
function getCanonicalRole_(role) {
  if (typeof role !== "string") return undefined;
  return CANONICAL_ROLES.indexOf(role) === -1 ? undefined : role;
}

/**
 * Checks the public event-alias syntax and length.
 * @param {*} alias - Alias value to coerce to text.
 * @returns {boolean} Whether it contains 1-50 ASCII letters, digits, or hyphens.
 */
function isValidAlias_(alias) {
  return /^[a-zA-Z0-9\-]{1,50}$/.test(String(alias || ""));
}

/**
 * Parses a request EventID while rejecting non-canonical integer spellings.
 * For example, positive numbers and `"1"` pass, while `"01"` and `"1.0"` fail.
 * @param {(number|string)} eventId - Client-supplied identifier.
 * @returns {?number} Positive integer EventID, or `null` when invalid.
 */
function parseRequestEventId_(eventId) {
  const parsedEventId = parseInt(eventId, 10);
  if (
    isNaN(parsedEventId) ||
    parsedEventId <= 0 ||
    String(parsedEventId) !== String(eventId)
  ) {
    return null;
  }
  return parsedEventId;
}

/**
 * Validates and canonicalises a participant name from a write request.
 * @param {*} name - Client-supplied name.
 * @returns {{ok: boolean, value: (string|undefined), message: (string|undefined)}}
 *   Normalised value on success or a user-facing validation message.
 */
function validateNameInput_(name) {
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return { ok: false, message: "名前を入力してください。" };
  }

  const normalisedName = normaliseNameValue_(name);
  if (normalisedName.length > 50) {
    return {
      ok: false,
      message: "名前は５０文字以下で入力してください。",
    };
  }

  if (!isValidNameValue_(normalisedName)) {
    return {
      ok: false,
      message: "名前に不正な文字が含まれています。",
    };
  }

  return { ok: true, value: normalisedName };
}

/**
 * Validates and canonicalises a participant class from a write request.
 * @param {*} cls - Client-supplied class value.
 * @returns {{ok: boolean, value: (string|undefined), message: (string|undefined)}}
 *   Normalised value on success or a user-facing validation message.
 */
function validateClassInput_(cls) {
  if (!cls || typeof cls !== "string" || cls.trim().length === 0) {
    return { ok: false, message: "クラスを入力してください。" };
  }

  const normalisedClass = normaliseClassValue_(cls);
  if (normalisedClass.length > 10) {
    return {
      ok: false,
      message: "クラスは１０文字以下で入力してください。",
    };
  }

  if (!/^[\p{L}\p{N}\s\-'.]+$/u.test(normalisedClass)) {
    return {
      ok: false,
      message: "クラス名に不正な文字が含まれています。",
    };
  }

  return { ok: true, value: normalisedClass };
}

/**
 * Validates required leading sheet headers against accepted aliases.
 * Additional trailing columns are permitted.
 * @param {Array<*>} headerRow - Raw first row from the sheet.
 * @param {Array<Array<string>>} expectedHeaders - Accepted aliases by column.
 * @param {string} sheetName - Name used in diagnostic errors.
 * @returns {void}
 * @throws {Error} If a required header is missing or invalid.
 */
function validateSheetHeaders_(headerRow, expectedHeaders, sheetName) {
  if (!headerRow || headerRow.length < expectedHeaders.length) {
    throw new Error(
      'The "' + sheetName + '" sheet headers are missing or incomplete.',
    );
  }

  expectedHeaders.forEach(function (acceptedValues, index) {
    const actualValue = normaliseHeaderValue_(headerRow[index]);
    if (acceptedValues.indexOf(actualValue) === -1) {
      throw new Error('The "' + sheetName + '" sheet headers are invalid.');
    }
  });
}

/**
 * Produces a case-insensitive header key without spaces, underscores, or dashes.
 * @param {*} value - Header cell value.
 * @returns {string} Canonical header key.
 */
function normaliseHeaderValue_(value) {
  return String(value == null ? "" : value)
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

/**
 * Validates the required identity, timing, activity, and capacity event cells.
 * @param {Array<*>} row - Raw Events row.
 * @param {number} rowNumber - One-based sheet row number for diagnostics.
 * @returns {void}
 * @throws {Error} If the row shape or any required field is invalid.
 */
function validateEventRow_(row, rowNumber) {
  if (!row || row.length < EVENT_HEADER_ALIASES.length) {
    throw new Error("Malformed row " + rowNumber + ' in "Events" sheet.');
  }

  parsePositiveIntegerCell_(
    row[0],
    'Invalid EventID in "Events" sheet row ' + rowNumber + ".",
  );
  requireNonEmptyCell_(
    row[1],
    'Activity is required in "Events" sheet row ' + rowNumber + ".",
  );
  parseDateCell_(
    row[3],
    'Invalid date in "Events" sheet row ' + rowNumber + ".",
  );
  parseDateCell_(
    row[4],
    'Invalid start time in "Events" sheet row ' + rowNumber + ".",
  );
  parseDateCell_(
    row[5],
    'Invalid end time in "Events" sheet row ' + rowNumber + ".",
  );
  parseNonNegativeIntegerCell_(
    row[8],
    'Invalid general slot limit in "Events" sheet row ' + rowNumber + ".",
  );
  parseNonNegativeIntegerCell_(
    row[9],
    'Invalid class rep slot limit in "Events" sheet row ' + rowNumber + ".",
  );
  parseNonNegativeIntegerCell_(
    row[10],
    'Invalid steering committee slot limit in "Events" sheet row ' +
      rowNumber +
      ".",
  );
  parseNonNegativeIntegerCell_(
    row[11],
    'Invalid org committee slot limit in "Events" sheet row ' + rowNumber + ".",
  );
}

/**
 * Validates a signup row, using displayed class text when it is available.
 * @param {Array<*>} row - Raw Signups row.
 * @param {Array<string>} displayRow - Formatted values for the same row.
 * @param {number} rowNumber - One-based sheet row number for diagnostics.
 * @returns {void}
 * @throws {Error} If the row shape, identity, role, or timestamp is invalid.
 */
function validateSignupRow_(row, displayRow, rowNumber) {
  if (!row || row.length < SIGNUP_HEADER_ALIASES.length) {
    throw new Error("Malformed row " + rowNumber + ' in "Signups" sheet.');
  }

  requireNonEmptyCell_(
    row[0],
    'SignupID is required in "Signups" sheet row ' + rowNumber + ".",
  );
  parsePositiveIntegerCell_(
    row[1],
    'Invalid EventID in "Signups" sheet row ' + rowNumber + ".",
  );
  requireNonEmptyCell_(
    row[2],
    'Name is required in "Signups" sheet row ' + rowNumber + ".",
  );
  requireNonEmptyCell_(
    displayRow && displayRow[3] !== undefined ? displayRow[3] : row[3],
    'Class is required in "Signups" sheet row ' + rowNumber + ".",
  );
  if (!getCanonicalRole_(row[4])) {
    throw new Error('Invalid role in "Signups" sheet row ' + rowNumber + ".");
  }
  parseDateCell_(
    row[5],
    'Invalid timestamp in "Signups" sheet row ' + rowNumber + ".",
  );
}

/**
 * Requires a cell value to contain non-whitespace text.
 * @param {*} value - Cell value to inspect.
 * @param {string} message - Error text used when validation fails.
 * @returns {void}
 * @throws {Error} If the value is empty after string coercion and trimming.
 */
function requireNonEmptyCell_(value, message) {
  if (String(value == null ? "" : value).trim() === "") {
    throw new Error(message);
  }
}

/**
 * Parses a sheet cell as a strictly positive integer.
 * @param {*} value - Cell value to parse with Number().
 * @param {string} message - Error text used when validation fails.
 * @returns {number} Parsed positive integer.
 * @throws {Error} If the numeric value is not a positive integer.
 */
function parsePositiveIntegerCell_(value, message) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(message);
  }
  return parsedValue;
}

/**
 * Parses a sheet cell as a non-negative integer.
 * @param {*} value - Cell value to parse with Number().
 * @param {string} message - Error text used when validation fails.
 * @returns {number} Parsed integer, including zero.
 * @throws {Error} If the numeric value is negative or not an integer.
 */
function parseNonNegativeIntegerCell_(value, message) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new Error(message);
  }
  return parsedValue;
}

/**
 * Parses a sheet cell as a valid JavaScript Date.
 * @param {*} value - Date-like cell value.
 * @param {string} message - Error text used when validation fails.
 * @returns {Date} Parsed date value.
 * @throws {Error} If the value produces an invalid date.
 */
function parseDateCell_(value, message) {
  const parsedValue = new Date(value);
  if (isNaN(parsedValue.getTime())) {
    throw new Error(message);
  }
  return parsedValue;
}
