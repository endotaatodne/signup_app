/**
 * @fileoverview Signup App - Google Apps Script backend.
 * Serves the web app and handles all interactions with Google Sheets.
 * @author endotaatodne
 * @version 0.1.4
 */

const MASTER_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty("MASTER_SHEET_ID");

const ROLES = {
  general: "一般保護者",
  classRep: "学年委員",
  committee: "運営委員・役員",
};

/**
 * Entry point for the web app. Called automatically by Google Apps Script
 * when the public URL is visited. Builds the HTML page server-side and
 * returns it to the browser.
 * @param {Object} e - Event object containing URL parameters
 * @returns {HtmlOutput} The rendered HTML page
 */
function doGet(e) {
  try {
    const alias = e.parameter.event;

    // No alias provided
    if (!alias) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:Arial;padding:20px;">No event specified. Please use a valid event link.</p>',
      );
    }

    // Sanitise alias — only allow alphanumeric and hyphens, max 50 chars
    if (!/^[a-zA-Z0-9\-]{1,50}$/.test(alias)) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:Arial;padding:20px;">Invalid event link.</p>',
      );
    }

    const config = getEventConfig();
    const sheetId = config[alias.toLowerCase()];

    if (!sheetId) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:Arial;padding:20px;">Event not found. Please check your link.</p>',
      );
    }

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const title = spreadsheet.getName();
    const gridData = JSON.stringify(getGridData(spreadsheet));

    // Base64 encode all template data to prevent script injection
    const encodedGridData = Utilities.base64Encode(
      gridData,
      Utilities.Charset.UTF_8,
    );
    const encodedAlias = Utilities.base64Encode(alias, Utilities.Charset.UTF_8);
    const encodedRoles = Utilities.base64Encode(
      JSON.stringify(ROLES),
      Utilities.Charset.UTF_8,
    );
    const encodedTitle = Utilities.base64Encode(title, Utilities.Charset.UTF_8);

    const template = HtmlService.createTemplateFromFile("index");
    template.gridData = encodedGridData;
    template.alias = encodedAlias;
    template.roles = encodedRoles;
    template.title = encodedTitle;

    return template.evaluate().setTitle(title);
  } catch (err) {
    console.error("doGet error: " + err.message);
    return HtmlService.createHtmlOutput(
      '<p style="font-family:Arial;padding:20px;">Something went wrong. Please try again later.</p>',
    );
  }
}

/**
 * Retrieves all events and signup data from Google Sheets and structures
 * it for the grid view.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - The event spreadsheet
 * @returns {{events: Object[], times: string[], activities: string[]}}
 */
function getGridData(spreadsheet) {
  const eventsSheet = spreadsheet.getSheetByName("Events");
  const signupsSheet = spreadsheet.getSheetByName("Signups");

  const eventRows = eventsSheet.getDataRange().getValues();
  const signupRows = signupsSheet.getDataRange().getValues();
  const signupDisplayRows = signupsSheet.getDataRange().getDisplayValues();

  // Build signups lookup: eventId -> [{name, cls, role}]
  const signupsMap = {};
  const signupCountsMap = {};
  signupRows.slice(1).forEach((row, index) => {
    const displayRow = signupDisplayRows[index + 1] || [];
    const eventId = row[1];
    const name = sanitiseForScript(row[2]);
    // Use the displayed sheet text for class so values like "1-1" are not
    // serialised as Date strings when Sheets auto-detects them internally.
    const cls = sanitiseForScript(String(displayRow[3] || ""));
    const role = sanitiseForScript(row[4]);
    if (!signupsMap[eventId]) signupsMap[eventId] = [];
    if (!signupCountsMap[eventId]) {
      signupCountsMap[eventId] = {
        [ROLES.general]: 0,
        [ROLES.classRep]: 0,
        [ROLES.committee]: 0,
      };
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
    const generalMax = Number(row[8]) || 0;
    const classRepMax = Number(row[9]) || 0;
    const committeeMax = Number(row[10]) || 0;

    return {
      eventId: eventId,
      activity: sanitiseForScript(row[1]),
      subtitle: sanitiseForScript(String(row[2])),
      date: Utilities.formatDate(
        new Date(row[3]),
        "Australia/Brisbane",
        "dd MMM yyyy",
      ),
      startTime: Utilities.formatDate(
        new Date(row[4]),
        "Australia/Brisbane",
        "HH:mm",
      ),
      endTime: Utilities.formatDate(
        new Date(row[5]),
        "Australia/Brisbane",
        "HH:mm",
      ),
      description: sanitiseForScript(String(row[6])),
      location: sanitiseForScript(String(row[7])),
      slots: {
        general: {
          max: generalMax,
          filled: signupCounts[ROLES.general] || 0,
        },
        classRep: {
          max: classRepMax,
          filled: signupCounts[ROLES.classRep] || 0,
        },
        committee: {
          max: committeeMax,
          filled: signupCounts[ROLES.committee] || 0,
        },
      },
      signups: allSignups,
    };
  });

  const times = [...new Set(events.map((e) => e.startTime))].sort();
  const activities = [...new Set(events.map((e) => e.activity))];

  return { events, times, activities };
}

/**
 * Submits a new signup for a given event and role.
 * SheetId is derived server-side from the alias — never trusted from client.
 * @param {number} eventId - The EventID from the Events sheet
 * @param {string} name - The participant's name
 * @param {string} cls - The participant's class
 * @param {string} role - The participant's role
 * @param {string} alias - The event alias from the URL
 * @returns {{success: boolean, message: string}}
 */
function submitSignup(eventId, name, cls, role, alias) {
  const lock = LockService.getScriptLock();
  try {
    // Acquire lock with graceful timeout handling
    try {
      lock.waitLock(5000);
    } catch (e) {
      return {
        success: false,
        message: "システムがビジー状態です。もう少し待ってから試してください。",
      };
    }

    // Validate alias
    if (!alias || !/^[a-zA-Z0-9\-]{1,50}$/.test(alias)) {
      return { success: false, message: "不正なリクエストです。" };
    }

    // Validate eventId as strict positive integer
    const parsedEventId = parseInt(eventId, 10);
    if (
      isNaN(parsedEventId) ||
      parsedEventId <= 0 ||
      String(parsedEventId) !== String(eventId)
    ) {
      return { success: false, message: "不正なリクエストです。" };
    }
    eventId = parsedEventId;

    // Derive sheetId server-side
    const config = getEventConfig();
    const sheetId = config[alias.toLowerCase()];
    if (!sheetId) {
      return { success: false, message: "不正なリクエストです。" };
    }

    // Validate name
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return { success: false, message: "名前を入力してください。" };
    }
    name = normaliseWhitespace(name);
    if (name.trim().length > 10) {
      return {
        success: false,
        message: "名前は１０文字以下で入力してください。",
      };
    }
    if (!/^[\p{L}\p{N}\s\-'.]+$/u.test(name.trim())) {
      return { success: false, message: "名前に不正な文字が含まれています。" };
    }

    // Validate class
    if (!cls || typeof cls !== "string" || cls.trim().length === 0) {
      return { success: false, message: "クラスを入力してください。" };
    }
    cls = normaliseClassValue(cls);
    if (cls.trim().length > 10) {
      return {
        success: false,
        message: "クラスは１０文字以下で入力してください。",
      };
    }
    if (!/^[\p{L}\p{N}\s\-'.]+$/u.test(cls.trim())) {
      return {
        success: false,
        message: "クラス名に不正な文字が含まれています。",
      };
    }

    // Validate role against canonical values
    const canonicalRole = getCanonicalRole(role);
    if (!canonicalRole) {
      return { success: false, message: "ポジションを選択してください。" };
    }

    // Rate limiting — composite key prevents bypass by name variation,
    // global event cap prevents flood attacks
    if (!checkRateLimit(eventId, name, cls)) {
      return {
        success: false,
        message: "使用回数を超過しました。少し待ってからお試しください。",
      };
    }

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const eventsSheet = spreadsheet.getSheetByName("Events");
    const signupsSheet = spreadsheet.getSheetByName("Signups");

    const eventRows = eventsSheet.getDataRange().getValues();
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
    const roleMaxMap = {
      [ROLES.general]: Number(eventRow[8]) || 0,
      [ROLES.classRep]: Number(eventRow[9]) || 0,
      [ROLES.committee]: Number(eventRow[10]) || 0,
    };
    const maxSlots = roleMaxMap[canonicalRole];
    if (maxSlots === 0) {
      return { success: false, message: "このボランティア枠は存在しません。" };
    }

    const signupRows = signupsSheet.getDataRange().getValues();
    const existing = signupRows.slice(1).filter((r) => r[1] == eventId);

    // Check slot capacity for this role
    const roleSignups = existing.filter((r) => r[4] === canonicalRole);
    if (roleSignups.length >= maxSlots) {
      return {
        success: false,
        message: "申し訳ありません、この枠のボランティア募集は終了しました。",
      };
    }

    // Normalise name for comparison — case insensitive, collapse regular
    // and full-width spaces (common in Japanese input)
    const normalisedInput = normaliseComparable(name);
    const duplicate = existing.find(
      (r) => normaliseComparable(r[2]) === normalisedInput,
    );
    if (duplicate) {
      return {
        success: false,
        message:
          "同じ名前の方がボランティアに入っています。違う名前を入力してください。",
      };
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
    lock.releaseLock();
  }
}

/**
 * Cancels a signup for a given event, matching on name, class and role.
 * @param {number} eventId - The EventID from the Events sheet
 * @param {string} name - The participant's name
 * @param {string} cls - The participant's class
 * @param {string} role - The participant's role
 * @param {string} alias - The event alias from the URL
 * @returns {{success: boolean, message: string}}
 */
function cancelSignup(eventId, name, cls, role, alias) {
  const lock = LockService.getScriptLock();
  try {
    // Acquire lock
    try {
      lock.waitLock(5000);
    } catch (e) {
      return {
        success: false,
        message: "システムがビジー状態です。もう少し待ってから試してください。",
      };
    }

    // Validate alias
    if (!alias || !/^[a-zA-Z0-9\-]{1,50}$/.test(alias)) {
      return { success: false, message: "不正なリクエストです。" };
    }

    // Validate eventId
    const parsedEventId = parseInt(eventId, 10);
    if (
      isNaN(parsedEventId) ||
      parsedEventId <= 0 ||
      String(parsedEventId) !== String(eventId)
    ) {
      return { success: false, message: "不正なリクエストです。" };
    }

    // Validate name
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return { success: false, message: "名前を入力してください。" };
    }
    name = normaliseWhitespace(name);
    if (name.trim().length > 10) {
      return {
        success: false,
        message: "名前は１０文字以下で入力してください。",
      };
    }

    // Validate class
    if (!cls || typeof cls !== "string" || cls.trim().length === 0) {
      return { success: false, message: "クラスを入力してください。" };
    }
    cls = normaliseClassValue(cls);

    // Validate role against canonical values
    const canonicalRole = getCanonicalRole(role);
    if (!canonicalRole) {
      return { success: false, message: "ポジションが不正です。" };
    }

    // Derive sheetId server-side
    const config = getEventConfig();
    const sheetId = config[alias.toLowerCase()];
    if (!sheetId) {
      return { success: false, message: "不正なリクエストです。" };
    }

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const signupsSheet = spreadsheet.getSheetByName("Signups");
    const signupRange = signupsSheet.getDataRange();
    const signupRows = signupRange.getValues();
    const signupDisplayRows = signupRange.getDisplayValues();

    // Normalise name for comparison
    const normalisedInput = normaliseComparable(name);
    const normalisedCls = normaliseClassComparable(cls);

    // Find matching row — name + role + eventId
    let matchRowIndex = -1;
    for (let i = 1; i < signupRows.length; i++) {
      const rowEventId = signupRows[i][1];
      const rowName = normaliseComparable(signupRows[i][2]);
      // Compare against the displayed sheet text so values like "1-1" are
      // matched consistently even if Sheets auto-detects the raw cell value.
      const rowCls = normaliseClassComparable(signupDisplayRows[i][3]);
      const rowRole = signupRows[i][4];
      if (
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
        message: "お名前とクラスの登録が見つかりません。入力内容をご確認ください。",
      };
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
    lock.releaseLock();
  }
}

/**
 * Rate limiter — composite key prevents bypass by name variation.
 * Global event cap prevents flood attacks.
 * @param {number} eventId - The event being signed up for
 * @param {string} name - The participant's name
 * @param {string} cls - The participant's class
 * @returns {boolean} true if allowed, false if rate limited
 */
function checkRateLimit(eventId, name, cls) {
  const cache = CacheService.getScriptCache();
  const namePart = normaliseCompact(name).substring(0, 3);
  const clsPart = normaliseCompact(cls).substring(0, 3);
  const key = "rl_" + eventId + "_" + namePart + "_" + clsPart;

  const hits = cache.get(key);
  if (hits && parseInt(hits) >= 3) return false;
  cache.put(key, hits ? String(parseInt(hits) + 1) : "1", 60);

  const eventKey = "rl_event_" + eventId;
  const eventHits = cache.get(eventKey);
  if (eventHits && parseInt(eventHits) >= 20) return false;
  cache.put(eventKey, eventHits ? String(parseInt(eventHits) + 1) : "1", 60);

  return true;
}

/**
 * Reads allowed event aliases and Sheet IDs from the Config tab.
 * Validates Sheet ID format before trusting.
 * @returns {Object} Map of alias to Sheet ID
 */
function getEventConfig() {
  if (!MASTER_SHEET_ID) {
    console.error("MASTER_SHEET_ID not set in Script Properties");
    return {};
  }
  const sheet =
    SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName("Config");
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  const config = {};
  rows.slice(1).forEach(function (row) {
    const alias = row[0].toString().trim().toLowerCase();
    const sheetId = row[1].toString().trim();
    if (alias && sheetId && /^[a-zA-Z0-9_\-]{20,60}$/.test(sheetId)) {
      config[alias] = sheetId;
    }
  });
  return config;
}

/**
 * Sanitises a string for safe embedding in a JSON/script context.
 * @param {string} str - The string to sanitise
 * @returns {string} Sanitised string
 */
function sanitiseForScript(str) {
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

function getCanonicalRole(role) {
  const roleKeyMap = {
    [ROLES.general]: ROLES.general,
    [ROLES.classRep]: ROLES.classRep,
    [ROLES.committee]: ROLES.committee,
  };
  return roleKeyMap[role];
}

function normaliseWhitespace(value) {
  return String(value)
    .replace(/[\s\u3000]+/g, " ")
    .trim();
}

function normaliseAsciiDigits(value) {
  return String(value).replace(/[\uFF10-\uFF19]/g, function (char) {
    return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
  });
}

function isClassTokenChar(char) {
  return /^[0-9A-Za-z\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]$/.test(char);
}

function normaliseClassSeparators(value) {
  const source = String(value);
  let result = "";

  for (let i = 0; i < source.length; i += 1) {
    const char = source.charAt(i);
    if (/[\u2010-\u2015\u2212\uFF0D]/.test(char)) {
      result += "-";
      continue;
    }

    if (
      char === "\u30FC" &&
      isClassTokenChar(source.charAt(i - 1)) &&
      isClassTokenChar(source.charAt(i + 1))
    ) {
      result += "-";
      continue;
    }

    result += char;
  }

  return result;
}

function normaliseClassValue(value) {
  return normaliseClassSeparators(
    normaliseWhitespace(normaliseAsciiDigits(value)),
  );
}

function normaliseComparable(value) {
  return normaliseWhitespace(value).toLowerCase();
}

function normaliseClassComparable(value) {
  return normaliseClassValue(value).toLowerCase();
}

function normaliseCompact(value) {
  return String(value)
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "");
}

/**
 * Returns the deployed web app URL for client-side navigation after cancellation.
 * @returns {string} The deployed web app URL
 */
function getDeployedUrl() {
  return ScriptApp.getService().getUrl();
}
