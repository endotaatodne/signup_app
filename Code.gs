/**
 * @fileoverview Signup App - Google Apps Script backend.
 * Serves the web app and handles all interactions with Google Sheets.
 * @author endotaatodne
 * @version 0.0.1
 */

const SHEET_ID = "xxxxxxxxx";

/**
 * Entry point for the web app. Called automatically by Google Apps Script
 * when the public URL is visited. Builds the HTML page server-side and
 * returns it to the browser.
 *
 * @returns {HtmlOutput} The rendered HTML page
 */

function doGet() {
  const template = HtmlService.createTemplateFromFile("index");
  template.gridData = JSON.stringify(getGridData());
  return template
    .evaluate()
    .setTitle("Signup App")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Retrieves all events and signup data from Google Sheets and structures
 * it for the grid view. Returns unique sorted time slots and activities
 * as separate arrays so the frontend can build the grid headers.
 *
 * @returns {{events: Object[], times: string[], activities: string[]}}
 *   - events: array of event objects with signup counts and remaining slots
 *   - times: sorted unique start times in HH:mm format
 *   - activities: unique activity names for column headers
 */
function getGridData() {
  const eventsSheet =
    SpreadsheetApp.openById(SHEET_ID).getSheetByName("Events");
  const signupsSheet =
    SpreadsheetApp.openById(SHEET_ID).getSheetByName("Signups");

  const eventRows = eventsSheet.getDataRange().getValues();
  const signupRows = signupsSheet.getDataRange().getValues();

  // Build signups lookup: eventId -> [names]
  const signupsMap = {};
  signupRows.slice(1).forEach((row) => {
    const eventId = row[1];
    const name = row[2];
    const cls = String(row[3]);
    if (!signupsMap[eventId]) signupsMap[eventId] = [];
    signupsMap[eventId].push({ name: name, cls: cls });
  });

  // Build events list
  const events = eventRows.slice(1).map((row) => ({
    eventId: row[0],
    activity: row[1],
    date: Utilities.formatDate(
      new Date(row[2]),
      "Australia/Brisbane",
      "dd MMM yyyy",
    ),
    startTime: Utilities.formatDate(
      new Date(row[3]),
      "Australia/Brisbane",
      "HH:mm",
    ),
    endTime: Utilities.formatDate(
      new Date(row[4]),
      "Australia/Brisbane",
      "HH:mm",
    ),
    location: row[5],
    maxSlots: row[6],
    signups: signupsMap[row[0]] || [],
    remaining: row[6] - (signupsMap[row[0]] ? signupsMap[row[0]].length : 0),
  }));

  // Get unique sorted time slots and activities
  const times = [...new Set(events.map((e) => e.startTime))].sort();
  const activities = [...new Set(events.map((e) => e.activity))];

  return { events, times, activities };
}

/**
 * Submits a new signup for a given event. Checks slot availability and
 * duplicate names before writing to the Signups sheet. Uses LockService
 * to prevent race conditions when multiple users submit simultaneously.
 *
 * @param {string|number} eventId - The EventID from the Events sheet
 * @param {string} name - The participant's name (required, max 100 chars)
 * @param {string} cls - The participant's class level (required, max 100 chars)
 * @returns {{success: boolean, message: string}}
 *   - success: true if signup was recorded, false otherwise
 *   - message: user-facing message describing the result
 */
function submitSignup(eventId, name, cls) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const eventsSheet =
      SpreadsheetApp.openById(SHEET_ID).getSheetByName("Events");
    const signupsSheet =
      SpreadsheetApp.openById(SHEET_ID).getSheetByName("Signups");

    const eventRows = eventsSheet.getDataRange().getValues();
    const eventRow = eventRows.find((r) => r[0] == eventId);
    if (!eventRow) return { success: false, message: "Event not found." };
    const maxSlots = eventRow[5];

    const signupRows = signupsSheet.getDataRange().getValues();
    const existing = signupRows.slice(1).filter((r) => r[1] == eventId);

    if (existing.length >= maxSlots) {
      return { success: false, message: "Sorry, this slot is now full!" };
    }

    const duplicate = existing.find(
      (r) => r[2].toString().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      return {
        success: false,
        message: "You are already signed up for this slot!",
      };
    }

    const signupId = new Date().getTime();
    signupsSheet.appendRow([signupId, eventId, name, String(cls), new Date()]);

    return { success: true, message: "You are signed up!" };
  } catch (e) {
    return { success: false, message: "Error: " + e.message };
  } finally {
    lock.releaseLock();
  }
}
