# Signup App

[日本語はこちら](README.ja.md)

A free, open source volunteer signup app built on Google Apps Script and Google Sheets. This app was developed to assist a voluteer sign up management for Japanese school events.

---

## Features

- Grid view — activities across the top, time slots down the side
- Time ranges displayed per slot (e.g. 9:00 am - 10:00 am)
- Three volunteer roles per slot — General, Class Rep, Committee (fully configurable)
- Role-based slot limits — each role has its own quota
- Roles with zero quota are hidden automatically
- Colour coded roles — green (General), amber (Class Rep), blue (Committee)
- Users sign up with name and class — no Google account required
- Names grouped by role in the signup modal
- Slot limits enforced server-side with race condition protection
- Duplicate name prevention per slot
- Responsible person shown per activity column
- Notes/description column per time slot
- Page title driven dynamically by the Google Sheet name
- Multiple events supported via URL parameter — no redeployment needed
- Works on mobile — signup via clean modal popup
- Fully Unicode compatible — supports any language
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

The admin manages events directly in Google Sheets. Users visit the public web app URL with an event alias parameter, see available slots, and sign up by entering their name and class. All data is written back to the event's Google Sheet in real time.

---

## Requirements

- A Google account
- [Node.js](https://nodejs.org) (LTS version)
- [CLASP](https://github.com/google/clasp) — Google's Apps Script CLI
- [VS Code](https://code.visualstudio.com) or any text editor
- Git (optional, for version control)

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

| A       | B        | C      | D    | E         | F       | G           | H        | I            | J             | K              |
| ------- | -------- | ------ | ---- | --------- | ------- | ----------- | -------- | ------------ | ------------- | -------------- |
| EventID | Activity | Person | Date | StartTime | EndTime | Description | Location | GeneralSlots | ClassRepSlots | CommitteeSlots |

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

### Step 8 — Configure the Script

Open `Code.gs` and update these two constants at the top:

```javascript
const MASTER_SHEET_ID = "YOUR_MASTER_SHEET_ID_HERE";

const ROLES = {
  general: "General",
  classRep: "Class Rep",
  committee: "Committee",
};
```

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
6. Authorise the permissions when prompted
7. Copy the web app URL ending in `/exec`
8. Note your **Deployment ID** for future redeployments

---

## Sharing Event Links

Each event gets its own URL using the `?event=` parameter:

```
https://script.google.com/.../exec?event=myevent
```

The alias in the URL must match the **Event Alias** column in your Config tab exactly (case insensitive).

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

All signups are in the **Signups tab** of each event Sheet with:

- Signup ID
- Event ID
- Participant name
- Participant class
- Role (General / Class Rep / Committee)
- Timestamp

---

## Events Tab Column Reference

| Column | Field          | Description                                    |
| ------ | -------------- | ---------------------------------------------- |
| A      | EventID        | Unique number per row (e.g. 1, 2, 3)           |
| B      | Activity       | Activity name — shown as grid column header    |
| C      | Person         | Responsible person — shown below activity name |
| D      | Date           | Date in YYYY-MM-DD format                      |
| E      | StartTime      | Start time in HH:MM format (e.g. 09:00)        |
| F      | EndTime        | End time in HH:MM format (e.g. 10:00)          |
| G      | Description    | Short notes shown in the grid                  |
| H      | Location       | Room or location name                          |
| I      | GeneralSlots   | Max General volunteer spots (0 = not needed)   |
| J      | ClassRepSlots  | Max Class Rep spots (0 = not needed)           |
| K      | CommitteeSlots | Max Committee spots (0 = not needed)           |

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
- Only Sheet IDs registered in the Config tab can be loaded — arbitrary Sheet IDs are rejected
- Input length and characters are validated both client-side and server-side
- A honeypot field deters basic bot submissions
- `LockService` prevents race conditions when multiple users sign up simultaneously
- Role validation is enforced server-side — clients cannot submit invalid roles

---

## Project Structure

```
signup-app/
├── Code.gs          # Backend — reads/writes Google Sheets, serves web app
├── index.html       # Frontend — grid view, modal signup form
├── appsscript.json  # Apps Script configuration
├── CHANGELOG.md     # Version history
└── README.md        # This file
```

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

## Acknowledgements

Built with [Google Apps Script](https://developers.google.com/apps-script) and [Google Sheets](https://sheets.google.com).
