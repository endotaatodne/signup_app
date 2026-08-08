/**
 * @fileoverview Project configuration, sheet schemas, and event access policy.
 * Constants and functions here are globals shared by every server-side `.gs`
 * file. The policy readers depend on spreadsheet helpers from
 * SpreadsheetData.gs and validators from Validation.gs, plus PropertiesService
 * and SpreadsheetApp. Reading MASTER_SHEET_ID at load time is intentional.
 */

const MASTER_SHEET_ID =
  PropertiesService.getScriptProperties().getProperty("MASTER_SHEET_ID");

const ROLES = {
  general: "一般保護者",
  classRep: "学年委員",
  steeringCommittee: "役員、運営・実行委員",
  orgCommittee: "実行委員",
};

/**
 * Ordered role metadata shared by grid projection and capacity enforcement.
 * Keep eventColumnIndex aligned with the Events sheet schema below.
 * @type {ReadonlyArray<{key: string, label: string, eventColumnIndex: number}>}
 */
const ROLE_SLOT_DESCRIPTORS = Object.freeze([
  Object.freeze({ key: "general", label: ROLES.general, eventColumnIndex: 8 }),
  Object.freeze({ key: "classRep", label: ROLES.classRep, eventColumnIndex: 9 }),
  Object.freeze({
    key: "steeringCommittee",
    label: ROLES.steeringCommittee,
    eventColumnIndex: 10,
  }),
  Object.freeze({
    key: "orgCommittee",
    label: ROLES.orgCommittee,
    eventColumnIndex: 11,
  }),
]);
const CANONICAL_ROLES = ROLE_SLOT_DESCRIPTORS.map(function (descriptor) {
  return descriptor.label;
});

const SHEET_NAMES = {
  config: "Config",
  events: "Events",
  signups: "Signups",
  activityLimits: "ActivityLimits",
};

const CONFIG_HEADER_ALIASES = [["alias", "eventalias"], ["sheetid"]];
const CONFIG_STATUS_HEADER_ALIASES = ["status"];
const EVENT_STATUSES = {
  open: "OPEN",
  readOnly: "READ_ONLY",
};
const EVENT_READ_ONLY_MESSAGE =
  "現在、このページは閲覧専用です。登録やキャンセルはできません。";
const ACTIVITY_LIMIT_HEADER_ALIASES = [["activity"], ["maxperperson"]];
const EVENT_HEADER_ALIASES = [
  ["eventid"],
  ["activity"],
  ["subtitle"],
  ["date"],
  ["starttime"],
  ["endtime"],
  ["description"],
  ["location"],
  ["generalmax", "generalslots"],
  ["classrepmax", "classrepslots"],
  // Keep the old Committee* aliases so existing event sheets can migrate
  // without failing header validation immediately.
  [
    "steeringcommitteemax",
    "steeringcommitteeslots",
    "committeemax",
    "committeeslots",
  ],
  ["orgcommitteemax", "orgcommitteeslots"],
];
const SIGNUP_HEADER_ALIASES = [
  ["signupid"],
  ["eventid"],
  ["name"],
  ["class"],
  ["role"],
  ["createdat", "timestamp"],
];

const APP_TIME_ZONE = "Australia/Brisbane";

/**
 * Reads the master Config sheet into a case-normalised event-settings map.
 * Rows with invalid aliases or Sheet IDs are ignored. A missing/invalid Status
 * header or value is logged and fails closed to READ_ONLY.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [masterSpreadsheet]
 *   Existing master handle; Config values are freshly read on every call.
 * @returns {Object<string, {sheetId: string, status: string}>} Settings by alias.
 * @throws {Error} If the master spreadsheet or Config sheet cannot be read, or
 *   if the required Config headers are invalid.
 */
function getEventSettings_(masterSpreadsheet) {
  if (!MASTER_SHEET_ID) {
    console.error("MASTER_SHEET_ID not set in Script Properties");
    return {};
  }
  const rows = getSheetData_(
    masterSpreadsheet || getMasterSpreadsheet_(),
    SHEET_NAMES.config,
    CONFIG_HEADER_ALIASES,
    { valueColumnCount: 3 },
  ).values;
  const hasValidStatusHeader =
    rows[0].length >= 3 &&
    CONFIG_STATUS_HEADER_ALIASES.indexOf(normaliseHeaderValue_(rows[0][2])) !==
      -1;
  if (!hasValidStatusHeader) {
    console.error(
      'The "Config" sheet Status header is missing or invalid. Events default to READ_ONLY.',
    );
  }

  const config = {};
  rows.slice(1).forEach(function (row) {
    const alias = String(row[0] || "")
      .trim()
      .toLowerCase();
    const sheetId = String(row[1] || "").trim();
    if (
      alias &&
      isValidAlias_(alias) &&
      sheetId &&
      /^[a-zA-Z0-9_\-]{20,60}$/.test(sheetId)
    ) {
      const parsedStatus = hasValidStatusHeader
        ? parseEventStatus_(row[2])
        : null;
      if (!parsedStatus) {
        console.error(
          'Invalid or missing Status for event alias "' +
            alias +
            '". Defaulting to READ_ONLY.',
        );
      }
      config[alias] = {
        sheetId: sheetId,
        status: parsedStatus || EVENT_STATUSES.readOnly,
      };
    }
  });
  return config;
}

/**
 * Opens the configured master spreadsheet for reuse within one request.
 * Values and sheets are not cached by this helper.
 * @returns {?GoogleAppsScript.Spreadsheet.Spreadsheet} Master handle, or `null`
 *   when MASTER_SHEET_ID is not configured.
 * @throws {Error} If Apps Script cannot open the configured spreadsheet.
 */
function getMasterSpreadsheet_() {
  if (!MASTER_SHEET_ID) return null;
  return SpreadsheetApp.openById(MASTER_SHEET_ID);
}

/**
 * Builds the backwards-compatible alias-to-Sheet-ID map used by integrations.
 * Access decisions must use getEventSettings_ so event status is not discarded.
 * @returns {Object<string, string>} Sheet ID by lower-case event alias.
 * @throws {Error} If the underlying Config data cannot be loaded or validated.
 */
function getEventConfig_() {
  const settings = getEventSettings_();
  const config = {};
  Object.keys(settings).forEach(function (alias) {
    config[alias] = settings[alias].sheetId;
  });
  return config;
}

/**
 * Canonicalises a Config status value to one of the supported policy values.
 * @param {*} value - Status cell value.
 * @returns {?string} `OPEN` or `READ_ONLY`, otherwise `null`.
 */
function parseEventStatus_(value) {
  const status = String(value == null ? "" : value)
    .trim()
    .toUpperCase();
  if (status === EVENT_STATUSES.open) return EVENT_STATUSES.open;
  if (status === EVENT_STATUSES.readOnly) return EVENT_STATUSES.readOnly;
  return null;
}

/**
 * Re-reads event policy and confirms that an alias still targets the expected
 * spreadsheet and remains open. Used immediately before mutations.
 * @param {*} alias - Event alias supplied with the request.
 * @param {string} expectedSheetId - Previously resolved event Sheet ID.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [masterSpreadsheet]
 *   Reusable master handle; Config values are still read again.
 * @returns {boolean} Whether the event is still safe to mutate.
 * @throws {Error} If the Config sheet cannot be read or validated.
 */
function isEventOpenForWrite_(alias, expectedSheetId, masterSpreadsheet) {
  const eventSettings = getEventSettings_(masterSpreadsheet)[
    String(alias || "").toLowerCase()
  ];
  return Boolean(
    eventSettings &&
    eventSettings.sheetId === expectedSheetId &&
    eventSettings.status === EVENT_STATUSES.open,
  );
}

/**
 * Creates the standard failure result returned for read-only events.
 * @returns {{success: boolean, code: string, message: string}} Failure payload.
 */
function getEventReadOnlyResult_() {
  return {
    success: false,
    code: "event_read_only",
    message: EVENT_READ_ONLY_MESSAGE,
  };
}
