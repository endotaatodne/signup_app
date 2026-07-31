# Signup App

[日本語はこちら](README.ja.md)

A free, open-source volunteer signup app built on Google Apps Script and Google Sheets. This app was developed to assist with volunteer signup management for Japanese school events.

---

## Features

- Responsive card-based schedule on desktop and mobile
- Switch between a searchable さがす view and a compact まとめ day-summary timeline
- Shared filters for activity, role, multiple available time slots, and keyword search
- Sticky schedule controls keep the relevant tabs and filters available while scrolling, with a compact single-row filter toolbar on desktop where space permits
- Desktop summary cards show total vacancies and current registrations/capacity, with clickable detail lists
- Activity-coloured ribbons identify related activities in both vacancy and current-registration detail lists
- Role-coloured 募集中 chips and activity accents make open slots easy to scan
- Time ranges displayed per slot/card (e.g. 9:00 am - 10:00 am)
- Four volunteer roles per slot — General, Class Rep, Steering Committee, Org Committee (fully configurable)
- Role-based slot limits — each role has its own quota
- Optional per-person signup limits for selected activities, configured in Google Sheets
- Roles with zero quota are hidden automatically
- Colour-coded roles — green (General), amber (Class Rep), blue (Steering Committee), purple (Org Committee)
- Names displayed by role in each schedule card
- Users sign up with name and class — no Google account required
- Japanese names are stored and matched without spaces, while non-Japanese name spacing is preserved
- Users can select and cancel their own signup via the modal
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
- Fully Unicode-compatible — supports any language
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

| A           | B        |
| ----------- | -------- |
| Event Alias | Sheet ID |

5. Note the Sheet ID from the URL:

```
https://docs.google.com/spreadsheets/d/YOUR_MASTER_SHEET_ID/edit
```

6. Set sharing to **Restricted** — only you should be able to edit this Sheet

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
6. Set sharing to **Restricted**

### Step 3 — Register the Event in the Config Tab

1. Open your **Master Admin Sheet** → **Config tab**
2. Add a new row:

| Event Alias | Sheet ID            |
| ----------- | ------------------- |
| myevent     | YOUR_EVENT_SHEET_ID |

### Step 4 — Enable Apps Script API

Go to [script.google.com/home/usersettings](https://script.google.com/home/usersettings) and turn on **Google Apps Script API**.

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
clasp create --title "Signup App"
```

`clasp create` creates a local `.clasp.json` file in the repository root. This file binds your local checkout to the Apps Script project that `clasp push` and `clasp deploy` will update. It contains the Apps Script project script ID, so keep it local only: do not commit it, paste it into issues, or share it with others. This repository already lists `.clasp.json` in `.gitignore`.

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

### Step 8b — Configure Role Names in Code.gs

Open `Code.gs` and update the `ROLES` constant if you want to use different role names:

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

This command reads the local `.clasp.json` file to decide which Apps Script project to update. If the file is missing or points to the wrong script ID, `clasp push` will fail or update the wrong project.

### Step 10 — Deploy as a Web App

1. Go to [script.google.com](https://script.google.com) and open your Signup App project
2. Click **Deploy** → **New Deployment**
3. Click the gear icon → select **Web App**
4. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
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

- **さがす** shows full signup cards grouped by time. Filter by activity, volunteer role, one or more available start times, or a keyword that matches the activity details or a registered volunteer's name. On desktop, the activity and role controls open compact panels of pill-style choices. After a choice is selected, its panel stays open until you click elsewhere or press Escape.
- **まとめ** shows a compact, time-ordered overview of the day. Activity accents identify related slots, and role-coloured chips show the remaining vacancies.
- On desktop, the summary cards above the filters show overall vacancies and current registrations/capacity. When filters are active, they also show counts for the visible results.
- Click either desktop summary card to see its time-ordered detail list. If filters are active, switch between **Overall** and **Current filters**; selecting a detail opens that slot's registration/cancellation modal.
- The schedule controls remain available while scrolling. On desktop, the filters use one compact row where space permits and fall back to two rows on narrower screens. The selected さがす/まとめ view is saved in the browser for the next visit.

When a name containing Japanese characters is submitted, spaces (including full-width spaces) are removed consistently by both the browser and backend. For example, `山田 太郎` is stored as `山田太郎`. Names without Japanese characters keep a single normalised space between words.

For duplicate, overlapping-time, and activity-limit checks, the participant is identified by their normalised name only. Class remains free-text information that is stored and displayed with the signup, and it is used when cancelling the selected registration, but changing the class does not create a separate identity for these checks.

---

## Managing Events

### Adding a New Event

1. Duplicate an existing event Sheet in Google Drive
2. Clear the data rows from the **Events** and **Signups** tabs (keep the headers)
3. Update the Sheet name — this becomes the page title
4. Review, replace, or remove any copied **ActivityLimits** rules so they match the new event
5. Note the new Sheet ID
6. Open the **Master Admin Sheet** → **Config tab**
7. Add a new row with the alias and Sheet ID
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

In `Code.gs`, update the `ROLES` constant:

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

In `index.html`, find and update the role colour CSS:

```css
.count-general {
  color: #2e7d32;
} /* green */
.count-classrep {
  color: #f57f17;
} /* amber */
.count-steeringcommittee {
  color: #1565c0;
} /* blue  */
.count-orgcommittee {
  color: #6a1b9a;
} /* purple */
```

### Changing the Button Text

At the top of the `<script>` block in `index.html`:

```javascript
var SIGNUP_BTN_TEXT = "Your Text Here";
```

### Changing the Timezone

In `appsscript.json`:

```json
{
  "timeZone": "Australia/Brisbane"
}
```

A full list of timezone strings is available at [List of tz database time zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).

---

## Redeploying After Code Changes

After editing code locally:

```bash
clasp push
clasp deploy --deploymentId YOUR_DEPLOYMENT_ID --description "describe what changed"
```

Always use the same deployment ID to keep the same public URL.

For convenience, add this to `package.json`:

```json
{
  "scripts": {
    "deploy": "clasp push && clasp deploy --deploymentId YOUR_DEPLOYMENT_ID --description \"update\""
  }
}
```

Then deploying is just:

```bash
npm run deploy
```

---

## Security Notes

- All Google Sheets should be set to **Restricted** sharing — only you can edit
- The web app runs as you (the deployer) — anonymous users cannot access your Sheets directly
- Activity limit rules are validated and enforced server-side and are not sent to the browser
- `MASTER_SHEET_ID` is stored in Script Properties
- `.clasp.json` is local-only CLASP configuration containing the Apps Script project script ID; it is included in `.gitignore` and should not be version controlled or shared
- Only Sheet IDs registered in the Config tab can be loaded — arbitrary Sheet IDs are rejected
- The sheet identifier is derived server-side from the event alias — clients never supply a sheet ID directly
- Input length and characters are validated both client-side and server-side
- `eventId` is validated as a strict positive integer before use
- A honeypot field and timing check deter basic bot submissions
- Rate limiting prevents rapid repeated submissions
- `LockService` prevents race conditions when multiple users sign up simultaneously
- Role validation is enforced server-side using canonical values — clients cannot submit invalid roles
- All user-supplied data is sanitised before embedding in the page
- Backend cancellation requires the selected signup's name, class, and role to match an existing row
- Error messages shown to users are generic — internal details are logged privately

---

## Project Structure

```
signup_app/
├── Code.gs          # Backend — reads/writes Google Sheets, serves web app (no secrets hardcoded)
├── index.html       # Frontend — responsive schedule, filters, summaries, and signup/cancellation modal
├── appsscript.json  # Apps Script configuration
├── .claspignore     # Excludes local test/dev files from Apps Script deployments
├── test/            # Unit tests for backend and frontend logic
├── test-support/    # Test harnesses and Apps Script/browser mocks
├── package.json     # Local test commands
├── CHANGELOG.md     # Version history
├── README.md        # Documentation index
├── README.ja.md     # Japanese README
└── README.en.md     # This file
```

Sensitive values (`MASTER_SHEET_ID`) are stored in Script Properties — not in source code — so the entire repo is safe to share publicly.

---

## Unit Tests

This project includes local unit tests for the Google Apps Script backend and the testable logic inside `index.html`.

Run all tests from the repository root:

```bash
node --test --test-isolation=none test/*.test.js
```

If your shell allows `npm` scripts, you can also run:

```bash
npm test
```

Current test coverage includes:

- `Code.gs` backend logic such as config loading, signup/cancellation flows, rate limiting, sanitisation, and normalization
- Shared normalization behavior for names (including Japanese spacing), classes, digits, and class separators
- `index.html` client-side utility and state logic such as event indexing, responsive layouts, schedule filters and views, desktop summaries, cancellation selection, message rendering, and client normalization

Testing strategy:

- Run the full test suite after every meaningful change to `Code.gs`, `index.html`, or shared validation/normalization logic
- Update or add tests in the same change whenever expected behavior changes
- Keep Apps Script-specific and browser-specific dependencies mocked in tests so production logic can be exercised without deploying
- Treat unit tests as regression protection: if you fix a bug, add a test that would have failed before the fix

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
