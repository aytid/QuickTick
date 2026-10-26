# QuickTick Browser Extension (Chrome / Edge)

## Install locally
1. Extract `QuickTick_extension.zip` into a folder.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted `QuickTick_extension` folder.
6. Pin the QuickTick icon to your browser toolbar.

## Use
- Click the QuickTick toolbar icon to open the compact planner.
- Use **Full Dashboard** to open the full calendar in a browser tab.
- Tasks, calendar navigation, filters, deadline colors, CSV export, and JSON backup/restore are included.

## Data storage
This build retains the existing QuickTick localStorage key (`QuickTick_action_items_v1`) so it can share task data with the supplied standalone HTML when opened from the same origin. Chrome extension pages have their own origin/storage partition, however, so tasks created in the extension are separate from tasks in a normal `file://` HTML page.
The extension requests the `storage` permission for future Chrome storage integration. Do not uninstall the extension or clear its data without first downloading a JSON backup.

## Browser compatibility
Designed for Chromium-based browsers such as Google Chrome and Microsoft Edge (Manifest V3).


## Troubleshooting clicks
This package uses external JavaScript files (`popup.js` and `dashboard.js`) because Chrome Manifest V3 blocks inline JavaScript in extension pages. After replacing the old extension:
1. Extract the new ZIP into a new folder.
2. Open `chrome://extensions`.
3. Click **Reload** on QuickTick, or remove the old unpacked extension and load the new folder.
4. Close any already-open QuickTick popup and click the toolbar icon again.


Made by [Rohan Aditya](https://www.linkedin.com/in/rohan-aditya-thirumala-6b8228264?utm_source=share_via&utm_content=profile&utm_medium=member_android).
