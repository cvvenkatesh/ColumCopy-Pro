// ColumnCopy Pro — shared utilities
//
// NOTE: Options are now stored in chrome.storage.local (managed via background.js
// messages 'getOptions' and 'saveOptions'). License state is in chrome.storage.sync
// (managed via 'activateLicense' and 'deactivateLicense' messages).
// This file only retains getDefaultOptions() for reference in the options page.

function getDefaultOptions() {
  var o = {
    columnSeparator: '\t',
    rowSeparator:    '\n',
    cellWrapper:     '"',
    columnHotkey:    'alt',
    tableHotkey:     'alt+shift',
    hyperlinkMode:   'off'
  };
  if (typeof window !== 'undefined') {
    if (window.navigator.userAgent.match(/Windows/)) o.rowSeparator = '\r\n';
    if (window.navigator.userAgent.match(/Linux/))   { o.columnHotkey = 'ctrl'; o.tableHotkey = 'ctrl+shift'; }
  }
  return o;
}
