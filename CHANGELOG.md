## v0.1.9 - 2026-05-03

- Patch
  - Cleans up changelog messages and README wording.
  - Adds further handling for numeric class entries, including Kanji numerals.
  - Adjusts font sizes on the desktop registration screen.
  - Updates unit tests.

## v0.1.8 - 2026-04-26

- Patch
  - Changes the font size on the registration screen.

## v0.1.7 - 2026-04-23

- Patch
  - Changes the input character limit for the name field from 10 to 50.

## v0.1.6 - 2026-04-21

- Patch
  - Adds tests.
  - Minor improvements to the UI.

## v0.1.5 - 2026-04-19

- Patch
  - Addresses a minor security vulnerability and adds further comments.

## v0.1.4 - 2026-04-19

- Bug fix
  - Fixed a bug that prevented values such as 1-1 entered into class from matching.
  - Standardised number/dash entry in class so that half-width and full-width characters are not treated differently.

- Patch
  - Updates the successful cancellation message to improve readability.
  - Adds unit tests.

## v0.1.3 - 2026-04-18

- Patch
  - Fixes text size issues affecting the thank-you message and class between desktop and mobile.
  - Minor fix to the link to the external source.

## v0.1.2 - 2026-04-17

- Patch
  - Removes redundant code.
    - Removed the unused currentTab variable from Code.gs and its write-only assignments.
    - Extracted shared backend helpers for role lookup and string normalization: getCanonicalRole, normaliseWhitespace, normaliseComparable, normaliseCompact.
    - Reused a single SpreadsheetApp.openById(sheetId) per function in the affected backend paths.
    - Consolidated the duplicated frontend message rendering into showMessage(...).

  - Some efficiency gains:
  1. Frontend lookup precomputation.
     Replace repeated find/filter scans with maps built once from gridData.
  2. Resize re-render throttling.
     Debounce renderResponsiveView() or rerender only when crossing the compact/desktop threshold.
  3. Reuse the opened spreadsheet in doGet/getGridData.
     Avoid opening the same spreadsheet twice in one request.
  4. Single-pass slot counting in getGridData.
     Count role fills once instead of filtering the same signup array three times per event.
  - Font size adjustments.
  - Comments added throughout.

## v0.1.1 - 2026-04-16

- Patch
  - Adds colour to the slots left, depending on the role.
  - Adds colour to the volunteer's name, depending on the role.
  - Adjusts various font and button sizes.

## v0.1.0 - 2026-04-15

- Major update
  - Added the option to cancel.
  - Updated some wording.

## v0.0.9 - 2026-04-12

- Major update
  - Changes the way MASTER_SHEET_ID is called, removing hard-coding of the ID.
  - Improved security.

## v0.0.8 - 2026-04-11

- Minor update
  - Changed the "Spot is full" message to Japanese.
  - Changed the colour of names displayed after registration.

## v0.0.7 - 2026-04-10

- Minor update
  - Changed the column name in the original Google Sheet for clarity.
  - Added a SubTitle column in the pop-up.

## v0.0.6 - 2026-04-10

- Bug fix - should only allow 10 characters for names and class.

## v0.0.5 - 2026-04-10

- Adds further security patches
  - Limits the number of entries in a minute.
  - Checks the date in submitSignup().
  - Added a timeout.
  - Further sanitisation of the alias.

## v0.0.4 - 2026-04-10

- Adds security patches.

## v0.0.3 - 2026-04-09

- Minor documentation updates.

## v0.0.2 - 2026-04-09

- Major update
  - Allows different volunteer slots depending on the person's role.
  - Controls the position of the pop-up.
  - Improved security.
  - Adds a description column to be displayed next to the time.
  - Dynamic title update based on the Google Sheet file name.

## v0.0.1 - 2026-04-06

- Initial release.
