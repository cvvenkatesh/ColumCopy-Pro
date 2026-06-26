# ColumnCopy Pro — Open Free Edition

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)](#)
[![Serverless](https://img.shields.io/badge/Architecture-100%25%20Serverless-success.svg)](#)
[![License](https://img.shields.io/badge/License-MIT-orange.svg)](file:///d:/ColumnCopy-Pro/ColumnCopy-Pro/LICENSE)

ColumnCopy Pro is a powerful, lightweight, and completely local browser extension that enables instant column selection, copying, and advanced formatting from any HTML table on the web. 

All premium features—including full table copies, multi-column select, formatting exports (CSV, Markdown, SQL, JSON), tab pinning, and multi-page pagination merging—are **100% unlocked and free** with **zero backend dependencies**, databases, or external logins.

---

## ⚡ Key Features

*   **Instant Column Copying:** Hold `Alt` and click any table cell to copy its column contents to the clipboard.
*   **Entire Table Copying:** Hold `Shift + Alt` and click any cell to copy the entire table.
*   **Multi-Column Selection:** Select and combine non-contiguous columns into a single copy operation using the selection bar.
*   **Advanced Formatting Exports:** Right-click any cell to export columns or tables as **CSV**, **TSV**, **JSON**, **Markdown**, **SQL**, or **HTML** download files.
*   **Hyperlink Formatting Modes:** Automatically format cell anchors during copy operations. Supports:
    *   **Excel-style:** `=HYPERLINK("url","text")`
    *   **Markdown:** `[text](url)`
    *   **HTML:** `<a href="url">text</a>`
*   **Pagination Merging:** Click "Add Next Page" on multi-page tables to automatically merge paginated tables into one single clipboard export.
*   **Tab Pinning:** Pin column indices on specific websites for quick-copying from the extension toolbar popup.
*   **Backup & Restore:** Export all configurations, custom settings, pinned columns, and copy history into a single `.json` file for easy migration.
*   **Native Dark Mode:** Adaptive styling using `@media (prefers-color-scheme: dark)` color tokens.

---

## 🔒 Privacy & Architecture

ColumnCopy Pro is built with a **Privacy-First** architecture:
*   **100% Local Execution:** No data ever leaves your device. All table scanning, formatting, and history logging occur entirely inside the browser's sandbox.
*   **No Remote Services:** Google OAuth, Gumroad tracking, payment portals, and external APIs have been completely removed.
*   **Minimal Permissions:** We request only standard local permissions (`clipboardWrite`, `contextMenus`, `storage`, and `tabs`) to perform table copying actions.

---

## 🚀 Installation (Load Unpacked)

To install the extension locally in developer mode:

1.  Download or clone this repository.
2.  Open Google Chrome and navigate to the Extensions page: `chrome://extensions/`
3.  In the top-right corner, toggle the **Developer mode** switch to **ON**.
4.  Click the **Load unpacked** button in the top-left corner.
5.  In the folder picker, select this project directory (`ColumnCopy-Pro`).
6.  The extension is now installed and ready to use!

---

## 🛠️ Usage Guide

### 1. Keyboard Shortcuts
*   **Copy Column:** Hold `Alt` (or `Ctrl` on Linux) and **click** a table cell.
*   **Copy Table:** Hold `Shift + Alt` (or `Shift + Ctrl` on Linux) and **click** any cell in the table.

*Note: You can customize these hotkeys at any time in the settings page.*

### 2. Context Menu (Right-Click)
Right-click on any table cell to trigger premium operations:
*   **Export Column:** Convert and download the column as a `.csv` or `.tsv` file.
*   **Export Table:** Convert and download the entire table as `.json`, `.md`, `.sql`, or `.html`.
*   **Add to Multi-select:** Stage the column. A selection bar will appear at the bottom of the page allowing you to copy or export all staged columns at once.
*   **Pin this Column:** Saves the column's index. Clicking this pin inside the extension popup will quick-copy that column from any tab matching the website.

### 3. Settings & Options
Click the **Settings** link inside the toolbar popup (or right-click the extension icon and select **Options**) to configure:
*   Custom hotkeys for columns and tables.
*   Row and column separators (e.g. Tab, Comma, custom delimiters).
*   CSV cell wrapping parameters.
*   Hyperlink copy modes.
*   **Backup & Restore:** Click *Export Backup* to download a backup file. Click *Import Backup* to restore your preferences, history, and pins from a previously saved backup file.

---

## 🧪 Local Testing

You can verify all extension operations using the built-in offline test suite:
1.  Open the local test page: [TEST-TABLE.html](file:///d:/ColumnCopy-Pro/ColumnCopy-Pro/TEST-TABLE.html)
2.  Interact with the sample tables to verify copying, context menu exports, multi-select bar actions, and hyperlink formatting settings.

---

## 📝 License

Distributed under the MIT License. See [LICENSE](file:///d:/ColumnCopy-Pro/ColumnCopy-Pro/LICENSE) for more details.
