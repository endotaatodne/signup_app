const MASTER_SHEET_ID = "xxxxxxxxx";

const ROLES = {
  general: "一般保護者",
  classRep: "学年委員",
  committee: "運営委員・役員",
};

/**
 * @fileoverview Signup App - Google Apps Script backend.
 * Serves the web app and handles all interactions with Google Sheets.
 * @author endotaatodne
 * @version 0.0.2
 */

/**
 * Entry point for the web app. Called automatically by Google Apps Script
 * when the public URL is visited. Builds the HTML page server-side and
 * returns it to the browser.
 *
 * @returns {HtmlOutput} The rendered HTML page
 */

function doGet(e) {
  try {
    const alias = e.parameter.event;

    if (!alias) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:Arial;padding:20px;">No event specified. Please use a valid event link.</p>',
      );
    }

    // Load config from master Sheet
    const config = getEventConfig();
    const sheetId = config[alias.toLowerCase()];

    if (!sheetId) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:Arial;padding:20px;">Event not found. Please check your link.</p>',
      );
    }

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const title = spreadsheet.getName();
    const template = HtmlService.createTemplateFromFile("index");
    template.gridData = JSON.stringify(getGridData(sheetId));
    template.sheetId = sheetId;
    template.roles = JSON.stringify(ROLES);
    template.title = title;
    return template.evaluate().setTitle(title);
  } catch (err) {
    return HtmlService.createHtmlOutput("Error: " + err.message);
  }
}
/**
 * Retrieves all events and signup data from Google Sheets and structures
 * it for the grid view. Returns unique sorted time slots and activities
 * as separate arrays so the frontend can build the grid headers.
 *
 * @param {string} sheetId - The Google Sheet ID
 * @returns {{events: Object[], times: string[], activities: string[]}}
 *   - events: array of event objects with signup counts and remaining slots
 *   - times: sorted unique start times in HH:mm format
 *   - activities: unique activity names for column headers
 */
function getGridData(sheetId) {
  const eventsSheet = SpreadsheetApp.openById(sheetId).getSheetByName("Events");
  const signupsSheet =
    SpreadsheetApp.openById(sheetId).getSheetByName("Signups");

  const eventRows = eventsSheet.getDataRange().getValues();
  const signupRows = signupsSheet.getDataRange().getValues();

  // Build signups lookup: eventId -> [{name, cls, role}]
  const signupsMap = {};
  signupRows.slice(1).forEach((row) => {
    const eventId = row[1];
    const name = row[2];
    const cls = String(row[3]);
    const role = row[4];
    if (!signupsMap[eventId]) signupsMap[eventId] = [];
    signupsMap[eventId].push({ name, cls, role });
  });

  const events = eventRows.slice(1).map((row) => {
    const eventId = row[0];
    const allSignups = signupsMap[eventId] || [];
    const generalMax = Number(row[8]) || 0;
    const classRepMax = Number(row[9]) || 0;
    const committeeMax = Number(row[10]) || 0;

    return {
      eventId: eventId,
      activity: row[1],
      person: String(row[2]),
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
      description: String(row[6]),
      location: row[7],
      slots: {
        general: {
          max: generalMax,
          filled: allSignups.filter((s) => s.role === ROLES.general).length,
        },
        classRep: {
          max: classRepMax,
          filled: allSignups.filter((s) => s.role === ROLES.classRep).length,
        },
        committee: {
          max: committeeMax,
          filled: allSignups.filter((s) => s.role === ROLES.committee).length,
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
 * @param {string} sheetId - The Google Sheet ID
 * @param {number} eventId - The EventID from the Events sheet
 * @param {string} name - The participant's name
 * @param {string} cls - The participant's class
 * @param {string} role - The participant's role
 * @returns {{success: boolean, message: string}}
 */
function submitSignup(eventId, name, cls, role, sheetId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    // Input validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return { success: false, message: "名前を入力してください。" };
    }
    if (name.trim().length > 100) {
      return {
        success: false,
        message: "名前は１０文字以下で入力してください。",
      };
    }
    if (!/^[\p{L}\p{N}\s\-'.]+$/u.test(name.trim())) {
      return { success: false, message: "名前に不正な文字が含まれています。" };
    }
    if (!cls || typeof cls !== "string" || cls.trim().length === 0) {
      return { success: false, message: "クラスを入力してください。" };
    }
    if (cls.trim().length > 100) {
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

    // Validate role
    const validRoles = Object.values(ROLES);
    if (!validRoles.includes(role)) {
      return { success: false, message: "ロールを選択してください" };
    }

    // Safety check
    // Security: validate sheetId against config
    const config = getEventConfig();
    const allowedSheetIds = Object.values(config);
    if (!allowedSheetIds.includes(sheetId)) {
      return { success: false, message: "エラーが発生しました" };
    }

    name = name.trim();
    cls = cls.trim();

    const eventsSheet =
      SpreadsheetApp.openById(sheetId).getSheetByName("Events");
    const signupsSheet =
      SpreadsheetApp.openById(sheetId).getSheetByName("Signups");

    const eventRows = eventsSheet.getDataRange().getValues();
    const eventRow = eventRows.find((r) => r[0] == eventId);
    if (!eventRow) return { success: false, message: "Event not found." };

    // Get max slots for the selected role
    const roleMaxMap = {
      [ROLES.general]: Number(eventRow[8]) || 0,
      [ROLES.classRep]: Number(eventRow[9]) || 0,
      [ROLES.committee]: Number(eventRow[10]) || 0,
    };
    const maxSlots = roleMaxMap[role];
    if (maxSlots === 0) {
      return {
        success: false,
        message: "このボランティア枠は存在しません。",
      };
    }

    const signupRows = signupsSheet.getDataRange().getValues();
    const existing = signupRows.slice(1).filter((r) => r[1] == eventId);

    // Check slot capacity for this role
    const roleSignups = existing.filter((r) => r[4] === role);
    if (roleSignups.length >= maxSlots) {
      return {
        success: false,
        message: "申し訳ありません、この枠のボランティア募集は終了しました。",
      };
    }

    // Duplicate check per slot (regardless of role)
    const duplicate = existing.find(
      (r) => r[2].toString().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      return {
        success: false,
        message:
          "同じ名前の方がボランティアに入っています。違う名前を入力してください。",
      };
    }

    const signupId = new Date().getTime();
    signupsSheet.appendRow([
      signupId,
      eventId,
      name,
      String(cls),
      role,
      new Date(),
    ]);

    return {
      success: true,
      message: "ありがとうございます！登録が完了しました！",
      role: role,
    };
  } catch (e) {
    return { success: false, message: "Error: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reads allowed event aliases and Sheet IDs from the Config tab
 * of the master Sheet.
 * @returns {Object} Map of alias to Sheet ID
 */
function getEventConfig() {
  const sheet =
    SpreadsheetApp.openById(MASTER_SHEET_ID).getSheetByName("Config");
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  const config = {};
  rows.slice(1).forEach(function (row) {
    const alias = row[0].toString().trim().toLowerCase();
    const sheetId = row[1].toString().trim();
    if (alias && sheetId) config[alias] = sheetId;
  });
  return config;
}
