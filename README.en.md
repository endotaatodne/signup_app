# Signup App

[日本語はこちら](README.ja.md)

A free, open-source volunteer signup app built on Google Apps Script and Google Sheets. This app was developed to assist with volunteer signup management for Japanese school events.

---

## Features

- Responsive card-based schedule on desktop and mobile
- Switch between a searchable さがす view and a compact まとめ day-summary timeline
- Shared filters for activity, role, multiple schedule time slots, and keyword search
- Sticky schedule controls keep the relevant tabs and filters available while scrolling, with a compact single-row filter toolbar on desktop where space permits
- Desktop summary cards show total vacancies and current registrations/capacity, with clickable detail lists
- Activity-coloured ribbons identify related activities in both vacancy and current-registration detail lists
- Role-coloured 募集中 chips and activity accents make open slots easy to scan
- Time ranges displayed per slot/card (e.g. 9:00 am - 10:00 am)
- Four volunteer roles per slot — General, Class Rep, Steering Committee, Org Committee (fixed role keys with configurable display names)
- Role-based slot limits — each role has its own quota
- Optional per-person signup limits for selected activities, configured in Google Sheets
- Roles with zero quota are hidden automatically
- Colour-coded roles — green (General), amber (Class Rep), blue (Steering Committee), purple (Org Committee)
- Names displayed by role in each schedule card
- Users sign up with name and class — no Google account required
- Japanese names are stored and matched without spaces, while non-Japanese name spacing is preserved
- Users can select and cancel their own signup via the modal
- Confirmed signups and cancellations update the visible schedule and modal immediately; cancellations then reconcile with fresh server data in the background and reload the page only if that refresh cannot be applied
- Signup and cancellation requests are single-flight in the browser, preventing repeated actions from starting overlapping mutations
- A short lock collision may be retried at most once, only when the server explicitly confirms that no write started and the captured modal session is still current; other failures are not retried automatically
- Names grouped by role in the signup modal
- Notes shown in the modal when clicking a slot
- Slot limits enforced server-side with race condition protection
- Name-based duplicate prevention within a slot, across overlapping slots, and within restricted activities
- Subtitle and location shown for each activity/card (e.g. responsible person and room)
- Notes/description shown per schedule card
- Hint text shown on slots with existing signups
- Page title driven dynamically by the Google Sheet name
- Multiple events supported via a URL parameter — no redeployment needed
- The selected schedule view is remembered between visits
- Names and classes accept Unicode letters and numbers, spaces, and limited punctuation; arbitrary Unicode such as emoji or standalone combining marks is rejected
- Data stored in Google Sheets — easy to view and manage
- Free to run — no hosting costs beyond a Google account

---

## How It Works

```
Master Admin Sheet (Config tab)
      ↓ lookup alias
Event Google Sheet (Events + Signups tabs, optional ActivityLimits tab)
      ↓
Google Apps Script (backend + web server)
      ↓
Public Web App (no login required for users)
```

The admin manages events directly in Google Sheets. Users visit the public web app URL with an event alias parameter, see available slots, and sign up by entering their name and class. Users can also cancel their own signup from the same modal. All data is written back to the event's Google Sheet in real time.

---

## Requirements

- A Google account
- [Node.js](https://nodejs.org) (LTS version)
- [CLASP](https://github.com/google/clasp) — Google's Apps Script CLI
- [VS Code](https://code.visualstudio.com) or any text editor
- Git (optional, for version control)

Recommended: Use a dedicated Google account for this app rather than your personal account. The app runs as the account owner, so all Sheets access and script execution happen under that account. A dedicated account keeps your personal data separate, makes it easier to share admin access with a colleague, and avoids any impact on your personal Google services if the app's quota is exceeded.

---

## Setup Guide

### Step 1 — Create the Master Admin Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it anything you like (e.g. **Signup App Admin**)
3. Create a tab called **Config** (capital C)
4. Add these headers in row 1:

| A           | B        | C      |
| ----------- | -------- | ------ |
| Event Alias | Sheet ID | Status |

5. Note the Sheet ID from the URL:

```
https://docs.google.com/spreadsheets/d/YOUR_MASTER_SHEET_ID/edit
```

6. Set sharing to **Restricted** — only authorised administrators or editors should be able to edit this Sheet

### Step 2 — Create an Event Sheet

1. Create a new spreadsheet for your first event (or duplicate an existing one)
2. Name it whatever you like — this name appears as the page title in the app
3. Create the two required tabs below. Add the optional tab only if the event needs per-activity signup limits:

**Events tab** — add these headers in row 1:

| A       | B        | C        | D    | E         | F       | G           | H        | I            | J             | K                      | L                 |
| ------- | -------- | -------- | ---- | --------- | ------- | ----------- | -------- | ------------ | ------------- | ---------------------- | ----------------- |
| EventID | Activity | SubTitle | Date | StartTime | EndTime | Description | Location | GeneralSlots | ClassRepSlots | SteeringCommitteeSlots | OrgCommitteeSlots |

**Signups tab** — add these headers in row 1:

| A        | B       | C    | D     | E    | F         |
| -------- | ------- | ---- | ----- | ---- | --------- |
| SignupID | EventID | Name | Class | Role | Timestamp |

**ActivityLimits tab (optional)** — add these headers in row 1:

| A        | B            |
| -------- | ------------ |
| Activity | MaxPerPerson |

Add one row for each activity that should have a per-person limit. For example, `競技ボランティア` with a `MaxPerPerson` value of `1` allows each participant to register for only one slot with that activity. Activities that are not listed remain unrestricted. If this tab does not exist, or contains only the header row, the app keeps its existing behaviour with no per-activity limits.

4. Add your events data under the Events headers. Use `0` for roles not needed in a slot.
5. Note the Sheet ID from the URL.
6. Set sharing to **Restricted** — only authorised administrators or editors should be able to edit this Sheet

For migration only, the `SteeringCommitteeSlots` column also accepts the legacy `CommitteeSlots` and `CommitteeMax` headers. Rename legacy headers to the current name when practical; the aliases are compatibility support, not additional columns.

### Step 3 — Register the Event in the Config Tab

1. Open your **Master Admin Sheet** → **Config tab**
2. Add a new row:

| Event Alias | Sheet ID            | Status |
| ----------- | ------------------- | ------ |
| myevent     | YOUR_EVENT_SHEET_ID | OPEN   |

Set a Google Sheets dropdown on the **Status** column with the exact values `OPEN`, `READ_ONLY`, and `CLOSED`. Protect the Config tab or Status column so only administrators can change it. A missing or invalid Status fails closed to `READ_ONLY`: the schedule remains visible, but public signup and cancellation requests are rejected.

### Step 4 — Enable Apps Script API

Go to [script.google.com/home/usersettings](https://script.google.com/home/usersettings) and turn on **Google Apps Script API**. This dashboard toggle lets authorised tools such as clasp manage scripts and deployments. If you use custom Google Cloud/OAuth credentials, also enable the Apps Script API in that Cloud project; see [Enable the Apps Script API](https://developers.google.com/apps-script/api/how-tos/enable).

### Step 5 — Install CLASP

```bash
npm install -g @google/clasp
clasp login
```

### Step 6 — Clone This Repo

```bash
git clone https://github.com/endotaatodne/signup_app.git
cd signup_app
```

### Step 7 — Create an Apps Script Project

```bash
clasp create-script --title "Signup App"
```

`clasp create-script` creates a local `.clasp.json` file in the repository root. This file binds your local checkout to the Apps Script project that `clasp push` and `clasp update-deployment` will update. It contains the Apps Script project script ID, so keep it local only: do not commit it, paste it into issues, or share it with others. This repository already lists `.clasp.json` in `.gitignore`.

If you need to connect this checkout to an existing Apps Script project instead of creating a new one, create or update `.clasp.json` locally with placeholders like this:

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "."
}
```

Find the script ID in Apps Script under **Project Settings** -> **Script ID**, replace `YOUR_SCRIPT_ID`, and save the file. Do not put Sheet IDs or deployment IDs in `.clasp.json`; it should point to the Apps Script project itself.

### Step 8 — Set Script Properties

The Master Sheet ID is stored securely in Script Properties.

1. Go to [script.google.com](https://script.google.com) → open your Signup App project
2. Click **Project Settings** (gear icon) → **Script Properties**
3. Click **Add script property** and add:

| Property          | Value                       |
| ----------------- | --------------------------- |
| `MASTER_SHEET_ID` | `your_master_sheet_id_here` |

4. Click **Save script properties**

### Step 8b — Configure Role Names in Config.gs

Open `Config.gs` and update the `ROLES` constant if you want to use different role names:

```javascript
const ROLES = {
  general: "General",
  classRep: "Class Rep",
  steeringCommittee: "Steering Committee",
  orgCommittee: "Org Committee",
};
```

The keys (`general`, `classRep`, `steeringCommittee`, `orgCommittee`) must stay the same — only change the values on the right.

### Step 9 — Push the Code

```bash
clasp push
```

This command reads the local `.clasp.json` file to decide which Apps Script project to update. If the file is missing or points to the wrong script ID, `clasp push` will fail or update the wrong project. [clasp push](https://github.com/google/clasp#push) replaces the entire remote Apps Script project content, so run `clasp show-file-status` and inspect the push set before pushing.

### Step 10 — Deploy as a Web App

1. Go to [script.google.com](https://script.google.com) and open your Signup App project
2. Click **Deploy** → **New Deployment**
3. Click the gear icon → select **Web App**
4. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone (anonymous users can open the public web app without signing in)
5. Click **Deploy**
6. Authorise the requested permissions when prompted
7. Copy the web app URL ending in `/exec`
8. Note your **Deployment ID** for future redeployments

---

## Sharing Event Links

Each event gets its own URL using the `?event=` parameter:

```
https://script.google.com/.../exec?event=myevent
```

The alias in the URL must match the **Event Alias** column in your Config tab exactly (case-insensitive).

Visiting the URL without a parameter shows a friendly "No event specified" message.

---

## Using the Schedule

- **さがす** shows full signup cards grouped by time. Filter by activity, volunteer role, one or more start times (including times where matching slots are full), or a keyword that matches the activity details or a registered volunteer's name. On desktop, the activity and role controls open compact panels of pill-style choices. After a choice is selected, its panel stays open until you click elsewhere or press Escape.
- **まとめ** shows a compact, time-ordered overview of the day. Activity accents identify related slots, and role-coloured chips show the remaining vacancies.
- On desktop, the summary cards above the filters show overall vacancies and current registrations/capacity. When filters are active, they also show counts for the visible results.
- Click either desktop summary card to see its time-ordered detail list. If filters are active, switch between **Overall** and **Current filters**; selecting a detail opens that slot's registration/cancellation modal.
- The schedule controls remain available while scrolling. On desktop, the filters use one compact row where space permits and fall back to two rows on narrower screens. The selected さがす/まとめ view is saved in the browser for the next visit.

When a name containing Japanese characters is submitted, spaces (including full-width spaces) are removed consistently by both the browser and backend. For example, `山田 太郎` is stored as `山田太郎`. Names without Japanese characters keep a single normalised space between words.

For duplicate, overlapping-time, and activity-limit checks, the backend derives a server-only NFKC identity key from the participant's normalised name. Compatibility-equivalent forms, such as full-width and half-width Latin text, therefore identify the same participant. This extra identity folding does not change the app's existing display/storage normalisation or browser filtering. Class is validated free-text information stored and displayed with the signup, and changing it does not create a separate participant for these checks.

Cancellation checks the exact normalised name/class tier first. Legacy and NFKC compatibility tiers are accepted only when exactly one row matches; an ambiguous tier is rejected instead of deleting an arbitrary signup. A successful response returns the deleted row's actual name and displayed class so the browser can remove that exact visible row immediately, with a unique-only legacy fallback for older payloads.

After the server confirms a signup or cancellation, the current schedule, counts, and modal state are synchronised immediately. A successful cancellation also requests an authoritative grid snapshot in the background so concurrent changes are reconciled without delaying the confirmation. If that refresh cannot be applied, the app falls back to reloading the deployed event page. While either mutation is pending, repeated clicks do not start another request. If the 250 ms lock attempt reports the explicit pre-write `busy_retryable` result, the browser may make at most one jittered retry after 400–799 ms, provided the captured modal session is still current; generic server responses and transport failures are never retried automatically.

---

## Managing Events

### Adding a New Event

1. Duplicate an existing event Sheet in Google Drive
2. Clear the data rows from the **Events** and **Signups** tabs (keep the headers)
3. Update the Sheet name — this becomes the page title
4. Review, replace, or remove any copied **ActivityLimits** rules so they match the new event
5. Note the new Sheet ID
6. Open the **Master Admin Sheet** → **Config tab**
7. Add a new row with the alias, Sheet ID, and an initial Status of `OPEN`
8. Share the new URL with users — no redeployment needed

### Editing Events

Edit rows directly in the **Events tab** of the relevant Sheet. Changes appear on the next page load. If an activity is renamed or removed, update the matching **ActivityLimits** row at the same time.

### Limiting Signups Per Activity

The optional **ActivityLimits** tab is read and validated on the server during each new signup. Its rules are not sent to the browser.

- Use the exact headers `Activity` and `MaxPerPerson` in columns A and B.
- Enter each restricted activity once. Duplicate activities are not allowed.
- Use the same activity value as the **Activity** column in the **Events** tab. A Google Sheets dropdown sourced from the Events activity column is recommended.
- Set `MaxPerPerson` to a positive whole number such as `1` or `2`. Leave unrestricted activities out of this tab.
- A participant is matched by their normalised name. The limit counts all signups under that name across every slot with the same activity, including different dates, times, classes, and roles.
- Cancelling a signup immediately releases one place under the activity limit.
- Lowering a limit does not remove existing signups. A participant who already meets or exceeds the new limit cannot add another signup for that activity.

When a participant reaches a limit, the app explains that the named activity is limited to the configured number of slots per person. If the attempted signup also overlaps another signup, this more specific activity-limit message is shown first. Existing same-slot duplicate and overlapping-time checks continue to apply independently when the activity limit has not been reached.

If the tab has invalid headers, an unknown activity, a duplicate activity, or an invalid limit, new signups are stopped with a generic message asking the participant to contact the organiser. Schedule viewing and cancellation continue to work, and the detailed configuration error is recorded in the Apps Script execution log for the administrator.

### Making an Event Read-Only

In the Master Admin Sheet's **Config tab**, change the event's **Status** value:

- `OPEN` allows public signup and cancellation.
- `READ_ONLY` keeps the schedule and existing signup information visible, but blocks both new signups and cancellations.
- `CLOSED` returns a generic unavailable page and denies schedule refresh, signup, and cancellation without opening the event Sheet.

Every request that begins after `CLOSED` is set is denied by the backend. Signup and cancellation reread Status immediately before writing, but a direct administrator edit cannot be atomic with that write: an already in-flight request may finish if `CLOSED` is set after its final Status check. A page loaded before closure retains data already delivered until its next server request or reload; that later request navigates to the unavailable page. Changing the value back to `OPEN` or `READ_ONLY` reopens the event without a code deployment.

Use a dropdown containing only the three supported values. Blank, misspelled, or unsupported values are treated as `READ_ONLY` and logged privately. Before deploying this version over an existing installation, add the `Status` header in column C and set every event that should remain writable to `OPEN`.

### Removing Events

Delete the row from the **Config tab** — the event URL immediately stops working. Optionally delete the event Sheet from Google Drive.

### Viewing Signups

All signups are in the **Signups tab** of each event Sheet, with:

- Signup ID
- Event ID
- Participant name
- Participant class
- Role (General / Class Rep / Steering Committee / Org Committee)
- Timestamp

### Cancelling a Signup (Admin)

Delete the relevant row directly from the **Signups tab**. The slot opens up automatically on the next page load.

### Cancelling a Signup (User)

Users can cancel their own signup from the app:

1. Click the slot they signed up for
2. Switch to the **Cancel** tab in the modal
3. Select their registration from the list of names, classes, and roles
4. Click **Cancel selected registration**
5. Check the highlighted registration details and confirm the cancellation

---

## Events Tab Column Reference

| Column | Field          | Description                                                        |
| ------ | -------------- | ------------------------------------------------------------------ |
| A      | EventID        | Unique number per row (e.g. 1, 2, 3)                               |
| B      | Activity       | Activity name — shown as the schedule card title                    |
| C      | SubTitle       | Subtitle shown below the activity name where space allows          |
| D      | Date           | Date in YYYY-MM-DD format                                          |
| E      | StartTime      | Start time in HH:MM format (e.g. 09:00)                            |
| F      | EndTime        | End time in HH:MM format (e.g. 10:00)                              |
| G      | Description    | Short notes shown in schedule cards and the modal                  |
| H      | Location       | Room or location name shown in headers/cards and the modal         |
| I      | GeneralSlots   | Max General volunteer spots (0 = not needed)                       |
| J      | ClassRepSlots  | Max Class Rep spots (0 = not needed)                               |
| K      | SteeringCommitteeSlots | Max Steering Committee spots (0 = not needed)              |
| L      | OrgCommitteeSlots | Max Org Committee spots (0 = not needed)                        |

---

## ActivityLimits Tab Column Reference

| Column | Field        | Description                                                                  |
| ------ | ------------ | ---------------------------------------------------------------------------- |
| A      | Activity     | Activity value from the Events tab; each restricted activity may appear once |
| B      | MaxPerPerson | Positive whole-number limit for one normalised participant name across that activity |

The tab is optional. Keep only the header row, or remove the tab, when no activities need this restriction.

---

## Customisation

### Changing Role Names

In `Config.gs`, update the `ROLES` constant:

```javascript
const ROLES = {
  general: "Volunteer",
  classRep: "Team Leader",
  steeringCommittee: "Coordinator",
  orgCommittee: "Org Committee",
};
```

The keys (`general`, `classRep`, `steeringCommittee`, `orgCommittee`) must stay the same — only change the values on the right. Changes apply everywhere automatically after redeployment.

### Changing Role Colours

In `Styles.html`, update the matching role selector families: `.name-role-*`, `.role-btn-*`, `.modal-submit-*`, `.names-role-label-*`, `.name-chip.name-role-*`, `.mobile-slot-summary-item.role-*`, `.mobile-role-filter-pill.role-*`, `.mobile-overview-role-chip.role-*`, and `.desktop-insight-chip.role-*`. Each family has `general`, `classrep`, `steeringcommittee`, and `orgcommittee` variants. Keep the foreground, background, and accent shades aligned as intended; they can differ between component families.

### Changing the Button Text

In the bootstrap `<script>` block near the top of `index.html`:

```javascript
var SIGNUP_BTN_TEXT = "Your Text Here";
```

### Changing the Timezone

Set the same IANA timezone identifier in both `appsscript.json` and `Config.gs` (`APP_TIME_ZONE`). The manifest controls the Apps Script project timezone, while `APP_TIME_ZONE` controls application date formatting and overlap checks.

In `appsscript.json`:

```json
{
  "timeZone": "Australia/Brisbane"
}
```

In `Config.gs`:

```javascript
const APP_TIME_ZONE = "Australia/Brisbane";
```

A full list of timezone strings is available at [List of tz database time zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).

---

## Redeploying After Code Changes

After editing code locally:

```bash
clasp push
clasp update-deployment YOUR_DEPLOYMENT_ID --description "describe what changed"
```

Always use the same deployment ID to keep the same public URL.

For convenience, add this to `package.json`:

```json
{
  "scripts": {
    "deploy": "clasp push && clasp update-deployment YOUR_DEPLOYMENT_ID --description \"update\""
  }
}
```

Then deploying is just:

```bash
npm run deploy
```

---

## Security Notes

- All Google Sheets should be set to **Restricted** sharing — only authorised administrators or editors should have access
- The web app runs as you (the deployer) — anonymous users cannot access your Sheets directly
- Activity limit rules are validated and enforced server-side and are not sent to the browser
- `MASTER_SHEET_ID` is stored in Script Properties
- `.clasp.json` is local-only CLASP configuration containing the Apps Script project script ID; it is included in `.gitignore` and should not be version controlled or shared
- Only Sheet IDs registered in the Config tab can be loaded — arbitrary Sheet IDs are rejected
- Event Status is validated and enforced server-side; `CLOSED` exposes no event data, while missing or invalid values default to `READ_ONLY`
- The sheet identifier is derived server-side from the event alias — clients never supply a sheet ID directly
- Input length and characters are validated both client-side and server-side
- `eventId` is validated as a strict positive integer before use
- A browser-side honeypot and 3-second post-load delay add low-friction checks to signup; direct callers can bypass both, and neither is authentication, CAPTCHA, or a security boundary
- Layered fixed-window limits protect signup and cancellation mutations; their exact scopes and admission points are documented below
- `LockService` serialises mutations with a 250 ms lock attempt; only the explicit pre-write `busy_retryable` result permits at most one 400–799 ms browser retry while the captured modal session remains current
- Browser-side single-flight guards retain request ownership through that retry; generic server errors, ambiguous outcomes, and transport failures are terminal
- Event policy and business rules are rechecked from the locked snapshot, and each confirmed Sheet mutation is flushed before the lock is released
- Role validation is enforced server-side using canonical values — clients cannot submit invalid roles
- Template values are Base64 encoded, with structured payloads JSON serialised and parsed; user-visible DOM values are assigned with `textContent`, preserving exact valid text without HTML interpretation or destructive rewriting
- Backend cancellation checks exact name/class identity first, permits legacy or NFKC compatibility only for a unique match, and rejects collisions
- Error messages shown to users are generic — internal details are logged privately

### Mutation rate-limit behaviour

All three layers use fixed windows beginning with the first counted request. They are independently scoped by target Sheet, EventID, and action, so `signup` and `cancel` never consume each other's allowances.

- **Personal attempt limit:** the first 3 attempts in 60 seconds are admitted; the 4th and later attempts in that window are blocked. The scope also includes the NFKC-normalised name/class tuple, stored in the cache key only as a length-delimited SHA-256 digest. The counter is charged after the request has passed initial validation and the emergency fuse and has acquired `ScriptLock`, but before the full locked business-rule checks. A well-formed attempt can therefore count even if it is later rejected as full, duplicate, conflicting, ambiguous, not found, misconfigured, or newly read-only. Malformed input, an unknown or initially read-only event, a past-date signup, an already cached block, an emergency-fuse rejection, and a lock-busy or lock-service failure do not consume this personal allowance.
- **Emergency attempt fuse:** the first 100 otherwise eligible attempts in 10 seconds are admitted; the 101st and later are blocked. This cache-only counter is shared by identities within its Sheet/EventID/action scope. It is charged immediately before lock acquisition, so an explicit busy result or lock-service failure counts. If the browser dispatches its permitted retry, that retry is another emergency-fuse attempt, but it consumes no personal or durable allowance unless it acquires the lock and progresses further.
- **Durable validated-write budget:** the first 20 fully validated write admissions in 60 seconds are allowed; the 21st and later are blocked. It is consumed under `ScriptLock`, after the final policy and business checks and immediately before `appendRow` or `deleteRow`. Earlier validation and business-rule rejections do not consume it. Because admission is recorded before the Sheet call, a later append, delete, or flush failure can still consume one unit; after a flush failure, the mutation outcome may be uncertain.

The personal and emergency counters, plus the cached mirror of a durable denial, use `CacheService`. They are advisory resource fuses: Google may evict cache entries early, and cache failures fail open. The durable counter in Script Properties remains authoritative under the lock and fails closed if it cannot be updated. A fixed window does not slide forward with each attempt.

Under ordinary use, a person making one signup or cancellation should not notice these controls. Repeated well-formed failures using the same name/class can reach the personal limit. Short global-lock contention may receive at most one bounded retry while the captured modal session remains current; if contention remains, the user receives a safe failure and can try again later rather than risking an automatic duplicate mutation.

### Script Properties created by the limiter

In addition to the administrator-supplied `MASTER_SHEET_ID`, the app creates properties matching `signup_app_rate_limit_v3_success_<action>_<sheet-id>_<event-id>` after a request reaches durable write admission. Their JSON values contain only a fixed-window start timestamp and hit count; they do not contain participant names or classes. An expired property may remain until that same scope next reaches a validated write admission and reuses it. Leave these properties unchanged during normal operation: deleting one resets that scope's durable protection, while editing one can weaken, strengthen, prolong, or corrupt it.

Older `signup_app_rate_limit_v2_*` properties are not read by v3 and can remain safely; no migration cleanup is required. Transient personal and emergency counters live in `CacheService`, so they do not appear in Script Properties.

### Remaining public-deployment limits

These controls reduce mutation abuse; they do not authenticate users. The deployed schedule and grid-refresh read paths remain anonymous and are not covered by the mutation counters. Public read traffic can therefore consume Apps Script and Sheets quotas, and the participant fields displayed by the schedule should be treated as public data.

The app uses one project-wide `ScriptLock`, so valid mutations for different Sheets or events can contend with each other. The short lock attempt and at-most-one safe retry limit how long a normal user waits, but they do not isolate events during a burst. There is no CAPTCHA, verified user identity, per-IP limiter, or upstream edge rate limit; direct callers can bypass the browser honeypot and 3-second delay. Deployments needing stronger abuse resistance should add access control or an upstream protection layer rather than treating the in-app counters as an authorization boundary.

---

## Project Structure

```
signup_app/
├── Code.gs                 # Web entry points and HTML partial inclusion
├── Config.gs               # Roles, sheet schemas, event policy, and shared constants
├── GridData.gs             # Public schedule data retrieval and shaping
├── Normalisation.gs        # Shared name, class, and comparison normalisation
├── RateLimit.gs            # Layered advisory and durable mutation rate limiting
├── SignupService.gs        # Signup/cancellation workflows and scheduling rules
├── SpreadsheetData.gs      # Validated sheet reads and activity-limit loading
├── Validation.gs           # Request, schema, row, and cell validation
├── index.html              # Main page template and client bootstrap values
├── Styles.html             # Page, responsive, schedule, and modal styles
├── Schedule.html           # Schedule, filter, summary, and insight markup
├── SignupModal.html        # Signup and cancellation modal markup
├── ClientCore.html         # Client state, indexes, and shared helpers
├── ClientFilters.html      # Activity, role, time, and keyword filtering
├── ClientInsights.html     # Desktop summaries and detail panels
├── ClientSchedule.html     # Schedule card and day-overview rendering
├── ClientFormatting.html   # Client formatting and normalisation helpers
├── ClientModal.html        # Signup and cancellation modal behaviour
├── ClientInit.html         # DOM event binding and client startup
├── appsscript.json         # Apps Script configuration
├── .claspignore            # Excludes local test/dev files from Apps Script deployments
├── test/                   # Unit tests for backend and frontend logic
├── test-support/           # Multi-file test harnesses and Apps Script/browser mocks
├── package.json            # Local test commands
├── CHANGELOG.md            # Version history
├── README.md               # Documentation index
├── README.ja.md            # Japanese README
└── README.en.md            # This file
```

The current design keeps `MASTER_SHEET_ID` in Script Properties rather than source and excludes local CLASP configuration from Git. Before sharing the repository, still review the tracked changes and do not add Sheet exports, credentials, participant records, or other sensitive data.

Apps Script loads every root `.gs` file into one shared global scope. These files are responsibility boundaries, not ES modules, so avoid cross-file top-level initialisation and duplicate global names. `index.html` defines the canonical HTML-partial order; `ClientInit.html` must remain last because it binds DOM events and starts client rendering.

### Source responsibilities and flow

Each production source file starts with an `@fileoverview` that describes its responsibility and important dependencies. Every named JavaScript function has adjacent JSDoc describing its inputs, result, and significant side effects. Keep those contracts current when behaviour changes; the source-documentation test checks that coverage is not accidentally lost.

The main runtime paths are:

- Page load: `doGet` resolves the event configuration, loads validated spreadsheet data, builds the public grid model, and renders `index.html`. The template composes the markup and scripts, then `ClientInit.html` binds the page controls and performs the first render.
- Schedule interaction: `ClientFilters.html` owns filter state and matching, `ClientSchedule.html` renders the responsive schedule, and `ClientInsights.html` derives desktop summaries from the currently visible events.
- Signup or cancellation: `ClientModal.html` validates the immediate browser input and allows only one mutation request at a time. `SignupService.gs` repeats authoritative validation, checks the layered rate limits, and makes a 250 ms `ScriptLock` attempt. Under the lock it reloads the validated data, rechecks final policy and business rules, charges the durable budget immediately before append/delete, and flushes the confirmed mutation before release. Only an explicit pre-write busy response may receive at most one bounded client retry while its modal session remains current. After success, the client updates visible state immediately; cancellations also reconcile with an authoritative background grid refresh and use a page reload only as a fallback.

Required Sheet reads are bounded to the declared schema columns. Repeated Config checks within one server execution reuse the same opened master-spreadsheet handle, but the Config values are still read again immediately before a mutation so a status or target change cannot be bypassed. This is handle reuse, not a cache of event or signup data.

Server helpers whose names end in `_` are internal conventions rather than browser entry points. The intended public server surface is limited to `doGet`, `getGridDataForAlias`, `submitSignup`, `cancelSignup`, and `getDeployedUrl`.

---

## Unit Tests

This project includes local unit tests for the Google Apps Script backend distributed across the root `.gs` files and the composed frontend built from `index.html` and its HTML partials.

Run all tests from the repository root:

```bash
node --test --test-isolation=none test/*.test.js
```

If your shell allows `npm` scripts, you can also run:

```bash
npm test
```

Current test coverage includes:

- Server-side `.gs` files covering config loading, signup/cancellation flows, layered rate limiting, spreadsheet validation, safe template transport, and normalisation
- Shared normalisation behaviour for names (including Japanese spacing), classes, digits, and class separators
- Composed client-side logic across `Client*.html`, including event indexing, responsive layouts, schedule filters and views, desktop summaries, cancellation selection, message rendering, and client normalisation
- Post-mutation UI synchronisation, single-flight signup/cancellation requests, authoritative cancellation refresh, and reload fallback behaviour
- Deterministic spreadsheet-service call counts using synthetic, non-identifying fixtures
- Source-documentation coverage for every production file and named function

Testing strategy:

- Run the full test suite after every meaningful change to a production `.gs` or `.html` file, especially shared validation or normalisation logic
- Update or add tests in the same change whenever expected behavior changes
- Keep the test harness aligned with the deployed project by loading every root `.gs` file and resolving the HTML includes from `index.html`
- Keep Apps Script-specific and browser-specific dependencies mocked in tests so production logic can be exercised without deploying
- Treat unit tests as regression protection: if you fix a bug, add a test that would have failed before the fix

Performance work is measured with deterministic mock service-call counts and synthetic fixture data rather than real participant records. Local test timings do not represent Google Apps Script or network latency. If deployment-level timings are collected, use only allowlisted operation/outcome values, duration totals, and coarse dataset-size buckets; never record names, classes, roles, aliases, Sheet IDs, Event IDs, search text, messages, or row contents.

Note: the current suite focuses on unit-level behavior. It does not replace full browser interaction testing.

---

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## Licence

MIT — see [LICENSE](LICENSE) for details.

---

Built with [Google Apps Script](https://developers.google.com/apps-script) and [Google Sheets](https://sheets.google.com).
