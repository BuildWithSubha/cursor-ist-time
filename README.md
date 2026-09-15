# Cursor IST Time
Chrome extension (Manifest V3) that rewrites **UTC timestamps** on [cursor.com](https://cursor.com) dashboard pages to **IST (Indian Standard Time, UTC+5:30)**.

Cursor’s usage dashboard (`/dashboard/usage` and related pages) prints times in UTC — for example `Sep 15, 07:06 PM`. This extension converts that in place to `Sep 16, 12:36 AM IST` so the zone is obvious.

No accounts, no analytics, no network requests. The content script only reads the page DOM and `chrome.storage.sync`.

## What it converts

| Seen on the page | Becomes |
| --- | --- |
| `Sep 15, 07:06 PM` | `Sep 16, 12:36 AM IST` |
| `Sep 15, 2026, 07:06 PM` | `Sep 16, 2026, 12:36 AM IST` |
| `2026-09-15T19:06:00Z` | `2026-09-16T00:36:00 IST` |
| `2026-09-15 19:06 UTC` | `2026-09-16 00:36 IST` |
| `Date (UTC)` | `Date (IST)` |
| Bare `07:06 PM` | Converted only when a nearby date or chart tooltip supplies context |

Dates without a year use the current year. If that would land more than two days in the future (December → January rollover), the previous year is used.

Token counts, costs, and model names are left alone.

## How IST is computed

`content.js` defines `OFFSET_MINUTES = 330` (5 hours 30 minutes). Each matched UTC instant is shifted by that fixed offset. IST does not use daylight saving, so the offset never changes.

## Load unpacked in Chrome

1. Clone or download this folder (or unzip `cursor-ist-time.zip`).
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select this folder (the one that contains `manifest.json`).
6. Pin **Cursor IST Time** if you want the popup handy.

The popup checkbox **Convert times to IST** is on by default. Turning it off restores the original UTC text without reloading the page.

## How to verify (a few minutes)

1. Load the extension unpacked (steps above).
2. Open `https://cursor.com/dashboard/usage` while signed in.
3. Find a **Date (UTC)** column or a cell such as `Sep 15, 07:06 PM`.
4. Confirm it is rewritten in place and ends with `IST`.
5. Open the extension popup and uncheck **Convert times to IST** — the original UTC text should return immediately.
6. Check the box again — IST should come back. Navigate around the dashboard; new rows and tooltips should convert without a refresh.

## Pages it targets

Content script matches:

- `https://cursor.com/*`
- `https://www.cursor.com/*`

That covers `/dashboard/usage`, other dashboard tabs, and agent pages on the same host. Host access is only via `content_scripts.matches` — there is no `host_permissions` key.

## Package layout

```
manifest.json
content.js
popup.html
popup.js
icons/icon16.png
icons/icon32.png
icons/icon48.png
icons/icon128.png
README.md
```

No build step, no npm, no bundler. Edit the files and click **Reload** on `chrome://extensions`.

## Export from this workspace

If you only have the Origin/cloud workspace copy, zip the extension folder (exclude `.git`):

```bash
zip -r cursor-ist-time.zip manifest.json content.js popup.html popup.js icons README.md
```

Then load that unzipped folder as unpacked, or keep the zip for sharing.
