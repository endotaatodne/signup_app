/**
 * @fileoverview Public web-app entry points and HTML-template helpers.
 * This file runs in Apps Script's project-wide global scope and depends on
 * configuration and grid-building globals declared in the other server files,
 * plus HtmlService, SpreadsheetApp, Utilities, and ScriptApp.
 * @author endotaatodne
 * @version 0.2.10
 */

/**
 * Handles a web-app GET request and evaluates the page for a configured event.
 * Event data, status, role labels, alias, and title are Base64-encoded before
 * being assigned to the template. Expected request or data errors are rendered
 * as simple HTML responses; unexpected errors are logged and rendered safely.
 * Reads the master Config sheet and the selected event spreadsheet.
 * @param {Object} e - Apps Script request event containing `parameter.event`.
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Evaluated page or safe error page.
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

    // Validate alias — only allow alphanumeric and hyphens, max 50 chars
    if (!isValidAlias_(alias)) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:Arial;padding:20px;">Invalid event link.</p>',
      );
    }

    const eventSettings = getEventSettings_()[alias.toLowerCase()];
    const sheetId = eventSettings && eventSettings.sheetId;

    if (!sheetId) {
      return HtmlService.createHtmlOutput(
        '<p style="font-family:Arial;padding:20px;">Event not found. Please check your link.</p>',
      );
    }

    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const title = spreadsheet.getName();
    const gridData = JSON.stringify(getGridData_(spreadsheet));

    // Base64 encode all template data to prevent script injection
    const encodedGridData = Utilities.base64Encode(
      gridData,
      Utilities.Charset.UTF_8,
    );
    const encodedAlias = Utilities.base64Encode(alias, Utilities.Charset.UTF_8);
    const encodedEventStatus = Utilities.base64Encode(
      eventSettings.status,
      Utilities.Charset.UTF_8,
    );
    const encodedRoles = Utilities.base64Encode(
      JSON.stringify(ROLES),
      Utilities.Charset.UTF_8,
    );
    const encodedTitle = Utilities.base64Encode(title, Utilities.Charset.UTF_8);

    const template = HtmlService.createTemplateFromFile("index");
    template.gridData = encodedGridData;
    template.alias = encodedAlias;
    template.eventStatus = encodedEventStatus;
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
 * Loads a static HTML partial for use by a trusted server-side template.
 * The trailing underscore keeps this helper private from `google.script.run`.
 * @param {string} filename - Apps Script HTML filename without its extension.
 * @returns {string} Raw content of the requested HTML partial.
 * @throws {Error} If Apps Script cannot load the named HTML file.
 */
function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Returns the active deployment URL for client-side navigation.
 * @returns {?string} Deployed web-app URL, or `null` when not deployed.
 */
function getDeployedUrl() {
  return ScriptApp.getService().getUrl();
}
