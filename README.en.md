# Signup App

[日本語はこちら](README.ja.md)

A free, open-source volunteer signup app built on Google Apps Script and Google Sheets. This app was developed to assist with volunteer signup management for Japanese school events.

---

## Features

- Grid view — activities across the top, time slots down the side
- Time ranges displayed per slot (e.g. 9:00 am - 10:00 am)
- Three volunteer roles per slot — General, Class Rep, Committee (fully configurable)
- Role-based slot limits — each role has its own quota
- Roles with zero quota are hidden automatically
- Colour-coded roles — green (General), amber (Class Rep), blue (Committee)
- Names displayed in role colour in each grid cell
- Users sign up with name and class — no Google account required
- Users can cancel their own signup via the modal
- Names grouped by role in the signup modal
- Notes shown in the modal when clicking a slot
- Slot limits enforced server-side with race condition protection
- Duplicate name prevention per slot
- Subtitle shown per activity column (e.g. responsible person)
- Notes/description column per time slot
- Hint text shown on slots with existing signups
- Page title driven dynamically by the Google Sheet name
- Multiple events supported via a URL parameter — no redeployment needed
- Works on mobile — signup and cancellation via clean modal popup
- Fully Unicode-compatible — supports any language
- Data stored in Google Sheets — easy to view and manage
- Free to run — no hosting costs beyond a Google account

---

## How It Works

```
Master Admin Sheet (Config tab)
      ↓ lookup alias
Event Google Sheet (Events + Signups tabs)
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
3. Create two tabs:

**Events tab** — add these headers in row 1:

| A       | B        | C        | D    | E         | F       | G           | H        | I            | J             | K              |
| ------- | -------- | -------- | ---- | --------- | ------- | ----------- | -------- | ------------ | ------------- | -------------- |
| EventID | Activity | SubTitle | Date | StartTime | EndTime | Description | Location | GeneralSlots | ClassRepSlots | CommitteeSlots |

**Signups tab** — add these headers in row 1:

| A        | B       | C    | D     | E    | F         |
| -------- | ------- | ---- | ----- | ---- | --------- |
| SignupID | EventID | Name | Class | Role | Timestamp |

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
git clone https://github.com/YOURUSERNAME/signup-app.git
cd signup-app
```

### Step 7 — Create an Apps Script Project

```bash
clasp create --title "Signup App"
```

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
  committee: "Committee",
};
```

The keys (`general`, `classRep`, `committee`) must stay the same — only change the values on the right.

### Step 9 — Push the Code

```bash
clasp push
```

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

## Managing Events

### Adding a New Event

1. Duplicate an existing event Sheet in Google Drive
2. Clear the data rows (keep the headers)
3. Update the Sheet name — this becomes the page title
4. Note the new Sheet ID
5. Open the **Master Admin Sheet** → **Config tab**
6. Add a new row with the alias and Sheet ID
7. Share the new URL with users — no redeployment needed

### Editing Events

Edit rows directly in the **Events tab** of the relevant Sheet. Changes appear on the next page load.

### Removing Events

Delete the row from the **Config tab** — the event URL immediately stops working. Optionally delete the event Sheet from Google Drive.

### Viewing Signups

All signups are in the **Signups tab** of each event Sheet, with:

- Signup ID
- Event ID
- Participant name
- Participant class
- Role (General / Class Rep / Committee)
- Timestamp

### Cancelling a Signup (Admin)

Delete the relevant row directly from the **Signups tab**. The slot opens up automatically on the next page load.

### Cancelling a Signup (User)

Users can cancel their own signup from the app:

1. Click the slot they signed up for
2. Switch to the **Cancel** tab in the modal
3. Select their role, enter their name and class
4. Click **Find my signup** → confirm cancellation

---

## Events Tab Column Reference

| Column | Field          | Description                                                             |
| ------ | -------------- | ----------------------------------------------------------------------- |
| A      | EventID        | Unique number per row (e.g. 1, 2, 3)                                    |
| B      | Activity       | Activity name — shown as grid column header                             |
| C      | SubTitle       | Subtitle shown below the column title — shown below the activity name    |
| D      | Date           | Date in YYYY-MM-DD format                                               |
| E      | StartTime      | Start time in HH:MM format (e.g. 09:00)                                 |
| F      | EndTime        | End time in HH:MM format (e.g. 10:00)                                   |
| G      | Description    | Short notes shown in the grid                                           |
| H      | Location       | Room or location name                                                   |
| I      | GeneralSlots   | Max General volunteer spots (0 = not needed)                            |
| J      | ClassRepSlots  | Max Class Rep spots (0 = not needed)                                    |
| K      | CommitteeSlots | Max Committee spots (0 = not needed)                                    |

---

## Customisation

### Changing Role Names

In `Code.gs`, update the `ROLES` constant:

```javascript
const ROLES = {
  general: "Volunteer",
  classRep: "Team Leader",
  committee: "Coordinator",
};
```

The keys (`general`, `classRep`, `committee`) must stay the same — only change the values on the right. Changes apply everywhere automatically after redeployment.

### Changing Role Colours

In `index.html`, find and update the role colour CSS:

```css
.count-general {
  color: #2e7d32;
} /* green */
.count-classrep {
  color: #f57f17;
} /* amber */
.count-committee {
  color: #1565c0;
} /* blue  */
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
- `MASTER_SHEET_ID` is stored in Script Properties
- Only Sheet IDs registered in the Config tab can be loaded — arbitrary Sheet IDs are rejected
- The sheet identifier is derived server-side from the event alias — clients never supply a sheet ID directly
- Input length and characters are validated both client-side and server-side
- `eventId` is validated as a strict positive integer before use
- A honeypot field and timing check deter basic bot submissions
- Rate limiting prevents rapid repeated submissions
- `LockService` prevents race conditions when multiple users sign up simultaneously
- Role validation is enforced server-side using canonical values — clients cannot submit invalid roles
- All user-supplied data is sanitised before embedding in the page
- Cancellation requires matching name, class and role — reduces risk of accidental cancellation
- Error messages shown to users are generic — internal details are logged privately

---

## Project Structure

```
signup-app/
├── Code.gs          # Backend — reads/writes Google Sheets, serves web app (no secrets hardcoded)
├── index.html       # Frontend — grid view, modal signup and cancellation form
├── appsscript.json  # Apps Script configuration
├── .claspignore     # Excludes local test/dev files from Apps Script deployments
├── test/            # Unit tests for backend and frontend logic
├── test-support/    # Test harnesses and Apps Script/browser mocks
├── package.json     # Local test commands
├── CHANGELOG.md     # Version history
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
- Shared normalization behavior for names, classes, digits, and class separators
- `index.html` client-side utility and state logic such as event indexing, layout decisions, message rendering, and client normalization

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
