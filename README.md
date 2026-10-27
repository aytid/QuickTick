# QuickTick Browser Extension (Chrome / Edge) — v1.3.9

## Install locally
1. Extract the zip into a folder.
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder.
4. Pin the QuickTick icon to your toolbar.

## Use
- Click the toolbar icon on any normal web page to open the draggable floating checklist (with previous/next-day navigation).
- On a new-tab page the icon opens a small QuickTick window instead.
- On browser pages (chrome://, Web Store, etc.) QuickTick cannot run; the icon shows a "!" badge. Use **Full dashboard** from the panel or the extension's options page.
- The full dashboard has the calendar, filters, deadline colours, CSV export and JSON backup/restore.
- Tasks can be marked **pending** (and un-marked), and **moved to the next day** (a copy is created; the original is marked pending and shows where it went).

## Data storage
All three views (floating panel, new-tab window, dashboard) share `chrome.storage.local` under the key `QuickTick_action_items_v1`. The dashboard also keeps a fallback copy in its own localStorage. Data from older builds (`daymark_action_items_v1`) is migrated automatically and the old copy is left untouched as a backup.
Do not uninstall the extension or clear its data without first downloading a JSON backup from the dashboard.

## Permissions
`activeTab` + `scripting` (inject the panel only when you click the icon), `storage` (tasks), `tabs` (detect new-tab pages). No access to all websites is requested.

## CSV export
Cells that start with `=`, `+`, `-` or `@` are prefixed with an apostrophe so spreadsheets don't run them as formulas.

## Troubleshooting
After replacing an older build, remove the old unpacked extension (or click **Reload** on `chrome://extensions`), then close and reopen any open QuickTick panels. Pages that were open before the update need a refresh before the panel works there again.
