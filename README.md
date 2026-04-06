# Signup App

A free, open source event signup app built on Google Apps Script and Google Sheets. 

---

## Features

- Grid view — activities across the top, time slots down the side
- Users sign up with their name and class — no Google account required
- Shows who is already signed up in each slot
- Slot limits enforced server-side with race condition protection
- Duplicate name prevention per slot
- Time ranges displayed per slot (e.g. 9:00 am - 10:00 am)
- Works on mobile — signup via clean modal popup
- Fully Unicode compatible — use any language for labels and content
- Data stored in Google Sheets — easy to view and manage
- Free to run — no hosting costs beyond a Google account

---

## How It Works

```
Google Sheets (database)
      ↕
Google Apps Script (backend + web server)
      ↕
Public Web App (no login required for users)
```

The admin manages events directly in Google Sheets. Users visit the public web app URL, see available slots, and sign up by entering their name and class. All data is written back to Google Sheets in real time.

---

## Requirements

- A Google account
- [Node.js](https://nodejs.org) (LTS version)
- [CLASP](https://github.com/google/clasp) — Google's Apps Script CLI
- [VS Code](https://code.visualstudio.com) or any text editor
- Git (optional, for version control)

---

## Setup Guide

### Step 1 — Set Up the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Give a meaningful name to the file 
3. Create two tabs at the bottom:

**Events tab** — add these headers in row 1:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| EventID | Activity | Date | StartTime | EndTime | Location | MaxSlots |

**Signups tab** — add these headers in row 1:

| A | B | C | D | E |
|---|---|---|---|---|
| SignupID | EventID | Name | Class | Timestamp |

4. Add your events data under the Events headers
5. Note your **Sheet ID** from the URL:
```
https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit
```

### Step 2 — Enable Apps Script API

Go to [script.google.com/home/usersettings](https://script.google.com/home/usersettings) and turn on **Google Apps Script API**.

### Step 3 — Install CLASP

```bash
npm install -g @google/clasp
clasp login
```

### Step 4 — Clone This Repo

```bash
git clone https://github.com/YOURUSERNAME/signup-app.git
cd signup-app
```

### Step 5 — Create an Apps Script Project

```bash
clasp create --title "Signup App"
```

### Step 6 — Add Your Sheet ID

Open `Code.gs` and replace the placeholder with your Sheet ID:

```javascript
const SHEET_ID = 'YOUR_SHEET_ID_HERE';
```

### Step 7 — Push the Code

```bash
clasp push
```

### Step 8 — Deploy as a Web App

1. Go to [script.google.com](https://script.google.com) and open your Signup App project
2. Click **Deploy** → **New Deployment**
3. Click the gear icon → select **Web App**
4. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Click **Deploy**
6. Authorise the permissions when prompted
7. Copy the web app URL ending in `/exec`

Your app is now live. Share the `/exec` URL with your users — no login required.

---

## Managing Events

Events are managed directly in the **Events tab** of your Google Sheet:

| Field | Description |
|---|---|
| EventID | A unique number for each event (e.g. 1, 2, 3) |
| Activity | The activity name shown in the grid column header |
| Date | Date in YYYY-MM-DD format |
| StartTime | Start time in HH:MM format (e.g. 09:00) |
| EndTime | End time in HH:MM format (e.g. 10:00) |
| Location | Room or location name |
| MaxSlots | Maximum number of signups allowed |

To add a new event, add a new row. To remove an event, delete the row. Changes appear immediately on the next page load.

---

## Viewing Signups

All signups are recorded in the **Signups tab** of your Google Sheet with:
- Signup ID
- Event ID
- Participant name
- Participant class
- Timestamp

You can filter, sort, and export this data directly from Google Sheets.

---

## Customisation

### Changing UI Text

All user-facing text is in `index.html`. Since the file is UTF-8 encoded, any language or Unicode characters can be used for button labels, placeholders, headings, and messages.

### Changing the Button Text

At the top of the `<script>` block in `index.html`:

```javascript
var SIGNUP_BTN_TEXT = 'Your Text Here';
```

### Changing the Timezone

In `appsscript.json`, update the timezone:

```json
{
  "timeZone": "Australia/Brisbane"
}
```

A full list of timezone strings is available at [List of tz database time zones](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).

---

## Security Notes

- The Google Sheet should be set to **Restricted** sharing (only you can edit)
- The web app runs as you (the deployer) — anonymous users cannot access your Sheet directly
- Input length is validated server-side to prevent abuse
- `LockService` prevents race conditions when multiple users sign up simultaneously
- A honeypot field is included to deter basic bot submissions

---

## Redeploying After Changes

After editing code locally:

```bash
clasp push
```

Then in [script.google.com](https://script.google.com):
- **Deploy** → **Manage Deployments** → edit your deployment → **Deploy**

Use the same deployment ID each time to keep the same public URL.

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