# Website Time Tracker (Firefox Extension)

Website Time Tracker is a lightweight Firefox browser extension that helps you understand where your time actually goes online.  
It tracks active browsing time per website and presents your usage through clear summaries and visual charts, all stored locally in your browser.

No accounts. No tracking servers. No data sharing.

NOTE: The debug flag is on for now. As long as the debug flag is on, the program for would console log a trace of all the actions taken by the user, 
      and each second on a website would count as 2 minutes.
----

## Overview

The extension automatically tracks how long you actively spend on each website and presents this information through a simple popup interface.

You can:
- View total time spent per website
- Click any website to see detailed habits over the past 7 days
- Analyze your usage through pie charts showing time distribution

---

## Key Features

- Tracks active time spent per website/domain
- Automatically handles:
  - Tab switches
  - Window focus changes
  - Page navigation
  - User idle state
- Clickable domain list for per-site analysis
- 7-day history per website
- Pie charts showing:
  - Aggregated usage across the last 7 days
  - Daily breakdown for each of the last 7 days
- Ignores untrackable pages (`about:`, `moz-extension:`)
- Simple, fast popup UI
- All data stored locally in Firefox

---

## How It Works

1. Detects the currently active tab
2. Extracts the top-level domain
3. Starts timing when the tab becomes active
4. Stops timing when:
   - You switch tabs
   - You leave Firefox
   - You become idle
5. Saves usage data locally
6. Aggregates data by domain and day for visualization

---

## Using the Extension

### Main Popup View

- Click the extension icon in the Firefox toolbar
- See a list of websites with total time spent
- Websites are sorted by usage
- Domain names are clickable

### Site-Specific Habit View

- Click on any domain name
- View:
  - Total usage for that site over the last 7 days
  - A 7-day aggregated pie chart
  - Individual pie charts for each day, showing how time was distributed

This makes it easy to identify:
- Daily usage patterns
- Weekend vs weekday behavior
- Short frequent visits versus long sessions

---

## Screenshots

### Popup UI (Website List)

**Screenshot to add here**
<img width="877" height="609" alt="image" src="https://github.com/user-attachments/assets/1d1be47f-eab1-48b7-aca9-ac04591f4204" />



### Site Habit View (7-Day Analysis)

<img width="1106" height="742" alt="image" src="https://github.com/user-attachments/assets/00948b83-d853-4369-ae71-4733285aa110" />





## Privacy

This extension is designed with privacy as a core principle.

- No sign-ups or user accounts
- No analytics or telemetry
- No external network requests
- No cloud storage

All browsing data:
- Is stored locally using Firefox storage APIs
- Is automatically removed when the extension is uninstalled

---

## Permissions Explained

| Permission | Purpose |
|-----------|---------|
| `tabs` | Detect active tab changes |
| `webNavigation` | Track navigation events accurately |
| `idle` | Pause tracking when user is inactive |
| `storage` | Save usage data locally |

---

## Installation

### Firefox Add-ons Marketplace

The extension will be available on the Firefox Add-ons marketplace.

A link will be added after publication.

---

### Manual Installation (Development / Testing)

1. Open Firefox and go to `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on**
4. Select the `manifest.json` file

The plan is to get the extension published for everyone to install!

---

## Technology Stack

- JavaScript
- Webpack
- Firefox WebExtensions API
- Manifest v2

---

## Licenses

This project uses the following open-source libraries:

- Chart.js (MIT)
- tldts (MIT)
- webpack (MIT)

## Planned Enhancements

- Longer history views (30 days, 90 days)
- Export usage data (CSV)
- Time-of-day analysis
- Category tagging for websites
- Dark mode

