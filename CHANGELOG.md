## v0.1.2 - 2026-04-17

- Patch
  - remove redundant code
    - Removed the unused currentTab variable from and its write-only assignments.
    - Extracted shared backend helpers for role lookup and string normalization: getCanonicalRole normaliseWhitespace, normaliseComparable, normaliseCompact.
    - Reused a single SpreadsheetApp.openById(sheetId) per function in the affected backend paths.
    - Consolidated the duplicated frontend message rendering into showMessage(...)

  - some efficiency gains:
  1. Frontend lookup precomputation
     Replace repeated find/filter scans with maps built once from gridData.
  2. Resize rerender throttling  
     Debounce renderResponsiveView() or rerender only when crossing the compact/desktop
  3. Reuse the opened spreadsheet in doGet/getGridData  
     Avoid opening the same spreadsheet twice in one request.
  4. Single-pass slot counting in getGridData  
     Count role fills once instead of filtering the same signup array three times per event.

## v0.1.1 - 2026-04-16

- Patch
  - puts colour to the slots left depending on the role
  - puts colour to the voluteer's name depending on the role
  - adjust various font/button sizes

## v0.1.0 - 2026-04-15

- Major update
  - added option to cancel
  - updated some wording

## v0.0.9 - 2026-04-12

- Major update
  - changes the way MASTER_SHEET_ID is called - removed hard coding of the ID
  - improved security

## v0.0.8 - 2026-04-11

- Minor update
  - changed the "Spot is full" message to Japanese
  - changed the colour of names being displayed after registered

## v0.0.7 - 2026-04-10

- Minor update
  - changed the column name in the original Google Sheet for clarity
  - adds SubTitle column in the pop-up

## v0.0.6 - 2026-04-10

- Bug fix - should only allow 10 chars for names and class

## v0.0.5 - 2026-04-10

- Adds further security patches
  - limit the number of entries in a minute
  - checks the date in submitSignup()
  - added timeout
  - further sanitisation on alias

## v0.0.4 - 2026-04-10

- Adds security patches

## v0.0.3 - 2026-04-09

- Minor documentation updates

## v0.0.2 - 2026-04-09

- Major update
  - allow different volunteer slots depending on the person's role
  - control the position of the pop up
  - improved security
  - adds description column to be displayed next to the time
  - dynamic title update based on Google Sheet file name

## v0.0.1 - 2026-04-06

- Initial release
