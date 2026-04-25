## v0.1.8 - 2026-04-26

- Patch
  - Changes font size on the registration screen.

## v0.1.7 - 2026-04-23

- Patch
  - Changes the input character limit for name from 10 to 50.

## v0.1.6 - 2026-04-21

- Patch
  - Adds tests
  - Minor improvement to UI

## v0.1.5 - 2026-04-19

- Patch
  - Addresses minor security volnerability and added further comments.

## v0.1.4 - 2026-04-19

- Bug fix
  - Fixed a bug which prevented value such as 1-1 entered to class not matching
  - Standardised number/dash entry to class so that half-width and full-width characters will not be treated differently

- Patch
  - Updates the successful cancellation message so that the readability improves
  - Adds unit tests.

## v0.1.3 - 2026-04-18

- Patch
  - Fixes issues of text size shared for thank you message and class between desktop and mobile
  - Minor fix to the link to external source

## v0.1.2 - 2026-04-17

- Patch
  - remove redundant code
    - Removed the unused currentTab variable from Code.gs and its write-only assignments.
    - Extracted shared backend helpers for role lookup and string normalization: getCanonicalRole, normaliseWhitespace, normaliseComparable, normaliseCompact.
    - Reused a single SpreadsheetApp.openById(sheetId) per function in the affected backend paths.
    - Consolidated the duplicated frontend message rendering into showMessage(...)

  - Some efficiency gains:
  1. Frontend lookup precomputation
     Replace repeated find/filter scans with maps built once from gridData.
  2. Resize rerender throttling
     Debounce renderResponsiveView() or rerender only when crossing the compact/desktop threshold.
  3. Reuse the opened spreadsheet in doGet/getGridData  
     Avoid opening the same spreadsheet twice in one request.
  4. Single-pass slot counting in getGridData  
     Count role fills once instead of filtering the same signup array three times per event.
  - Font size adjustments
  - comments added throughout

## v0.1.1 - 2026-04-16

- Patch
  - puts colour to the slots left depending on the role
  - puts colour to the volunteer's name depending on the role
  - adjust various font/button sizes

## v0.1.0 - 2026-04-15

- Major update
  - Added option to cancel
  - Updated some wording

## v0.0.9 - 2026-04-12

- Major update
  - Changes the way MASTER_SHEET_ID is called - removed hard coding of the ID
  - Improved security

## v0.0.8 - 2026-04-11

- Minor update
  - Changed the "Spot is full" message to Japanese
  - Changed the colour of names being displayed after registered

## v0.0.7 - 2026-04-10

- Minor update
  - Changed the column name in the original Google Sheet for clarity
  - Added SubTitle column in the pop-up

## v0.0.6 - 2026-04-10

- Bug fix - should only allow 10 chars for names and class

## v0.0.5 - 2026-04-10

- Adds further security patches
  - Limit the number of entries in a minute
  - Checks the date in submitSignup()
  - Added timeout
  - Further sanitisation on alias

## v0.0.4 - 2026-04-10

- Adds security patches

## v0.0.3 - 2026-04-09

- Minor documentation updates

## v0.0.2 - 2026-04-09

- Major update
  - Allow different volunteer slots depending on the person's role
  - Control the position of the pop-up
  - Improved security
  - Adds description column to be displayed next to the time
  - Dynamic title update based on Google Sheet file name

## v0.0.1 - 2026-04-06

- Initial release
