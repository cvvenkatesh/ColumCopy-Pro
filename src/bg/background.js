// ColumnCopy Pro — MV3 Service Worker (v2.0.0 — Open Free Edition)
// ─────────────────────────────────────────────────────────────────────────────

// ── Default options (content-script readable via getOptions message) ─────────
var DEFAULT_OPTIONS = {
  columnSeparator: '\t',
  rowSeparator:    '\n',
  cellWrapper:     '"',
  columnHotkey:    'alt',
  tableHotkey:     'alt+shift',
  hyperlinkMode:   'off'
};

// ── Pro Status Verification ──────────────────────────────────────────────────
// Returns Promise<boolean>
// In the free edition, all features are unlocked. isPro() always returns true.
function isPro() {
  return Promise.resolve(true);
}

// ── Context menu IDs ──────────────────────────────────────────────────────────
var M = {
  COPY_COL:      'cc_copyColumn',
  COPY_TABLE:    'cc_copyTable',
  SEP1:          'cc_sep1',
  EXP_COL:       'cc_expCol',
  EXP_COL_CSV:   'cc_expColCsv',
  EXP_COL_TSV:   'cc_expColTsv',
  SEP2:          'cc_sep2',
  EXP_TBL:       'cc_expTbl',
  EXP_TBL_JSON:  'cc_expTblJson',
  EXP_TBL_MD:    'cc_expTblMd',
  EXP_TBL_SQL:   'cc_expTblSql',
  EXP_TBL_HTML:  'cc_expTblHtml',
  SEP3:          'cc_sep3',
  ADD_SEL:       'cc_addSel',
  COPY_SEL:      'cc_copySel',
  PIN_COL:       'cc_pinCol'
};

// ── Context menus ─────────────────────────────────────────────────────────────
function buildMenus() {
  chrome.contextMenus.removeAll(function () {
    var ctx = ['page', 'frame'];
    chrome.contextMenus.create({ id: M.COPY_COL, title: 'Copy this column', contexts: ctx });
    chrome.contextMenus.create({ id: M.COPY_TABLE,   title: 'Copy entire table',         contexts: ctx });
    chrome.contextMenus.create({ id: M.SEP1,         type: 'separator',                  contexts: ctx });
    chrome.contextMenus.create({ id: M.EXP_COL,      title: 'Export column',             contexts: ctx });
    chrome.contextMenus.create({ id: M.EXP_COL_CSV,  parentId: M.EXP_COL, title: 'As CSV', contexts: ctx });
    chrome.contextMenus.create({ id: M.EXP_COL_TSV,  parentId: M.EXP_COL, title: 'As TSV', contexts: ctx });
    chrome.contextMenus.create({ id: M.SEP2,         type: 'separator',                  contexts: ctx });
    chrome.contextMenus.create({ id: M.EXP_TBL,      title: 'Export table',              contexts: ctx });
    chrome.contextMenus.create({ id: M.EXP_TBL_JSON, parentId: M.EXP_TBL, title: 'As JSON', contexts: ctx });
    chrome.contextMenus.create({ id: M.EXP_TBL_MD,   parentId: M.EXP_TBL, title: 'As Markdown', contexts: ctx });
    chrome.contextMenus.create({ id: M.EXP_TBL_SQL,  parentId: M.EXP_TBL, title: 'As SQL', contexts: ctx });
    chrome.contextMenus.create({ id: M.EXP_TBL_HTML, parentId: M.EXP_TBL, title: 'As HTML', contexts: ctx });
    chrome.contextMenus.create({ id: M.SEP3,         type: 'separator',                  contexts: ctx });
    chrome.contextMenus.create({ id: M.ADD_SEL,      title: 'Add column to multi-select', contexts: ctx });
    chrome.contextMenus.create({ id: M.COPY_SEL,     title: 'Copy selected columns',     contexts: ctx });
    chrome.contextMenus.create({ id: M.PIN_COL,      title: 'Pin this column',           contexts: ctx });
  });
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);

// ── Context menu clicks ───────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  function send(action) {
    chrome.tabs.sendMessage(tab.id, { columnCopyAction: action }, function () {
      if (chrome.runtime.lastError) {
        console.warn('ColumnCopy: content script unavailable —',
          chrome.runtime.lastError.message);
      }
    });
  }
  switch (info.menuItemId) {
    case M.COPY_COL:     send('copyColumn');     break;
    case M.COPY_TABLE:   send('copyTable');      break;
    case M.EXP_COL_CSV:  send('exportCsv');      break;
    case M.EXP_COL_TSV:  send('exportTsv');      break;
    case M.EXP_TBL_JSON: send('exportJson');     break;
    case M.EXP_TBL_MD:   send('exportMarkdown'); break;
    case M.EXP_TBL_SQL:  send('exportSql');      break;
    case M.EXP_TBL_HTML: send('exportHtml');     break;
    case M.ADD_SEL:      send('addToSelection'); break;
    case M.COPY_SEL:     send('copySelected');   break;
    case M.PIN_COL:      send('pinColumn');      break;
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

  // ── getOptions ──
  if (message.method === 'getOptions') {
    chrome.storage.local.get(['cc_options'], function (data) {
      sendResponse({ options: Object.assign({}, DEFAULT_OPTIONS, data.cc_options || {}) });
    });
    return true;
  }

  // ── checkPro ──
  if (message.method === 'checkPro') {
    isPro().then(function (pro) { sendResponse({ isPro: pro }); });
    return true;
  }

  // ── saveOptions ──
  if (message.method === 'saveOptions') {
    chrome.storage.local.set({ cc_options: message.options }, function () {
      sendResponse({ ok: true });
    });
    return true;
  }

  // ── saveHistory ──
  if (message.method === 'saveHistory') {
    var hKey = 'cc_history';
    chrome.storage.local.get([hKey], function (data) {
      var history = data[hKey] || [];
      history.unshift(message.entry);
      if (history.length > 20) history = history.slice(0, 20);
      var save = {}; save[hKey] = history;
      chrome.storage.local.set(save, function () { sendResponse({ ok: true }); });
    });
    return true;
  }

  // ── savePin ──
  if (message.method === 'savePin') {
    var pKey = 'cc_pins';
    chrome.storage.local.get([pKey], function (data) {
      var pins     = data[pKey] || {};
      var hostPins = pins[message.pin.hostname] || [];
      hostPins = hostPins.filter(function (p) {
        return !(p.colIndex === message.pin.colIndex && p.tableIndex === message.pin.tableIndex);
      });
      hostPins.unshift(message.pin);
      if (hostPins.length > 10) hostPins = hostPins.slice(0, 10);
      pins[message.pin.hostname] = hostPins;
      var save = {}; save[pKey] = pins;
      chrome.storage.local.set(save, function () { sendResponse({ ok: true }); });
    });
    return true;
  }

  // ── getPins ──
  if (message.method === 'getPins') {
    chrome.storage.local.get(['cc_pins'], function (data) {
      sendResponse({ pins: (data.cc_pins || {})[message.hostname] || [] });
    });
    return true;
  }

  // ── deletePin ──
  if (message.method === 'deletePin') {
    var pKey2 = 'cc_pins';
    chrome.storage.local.get([pKey2], function (data) {
      var pins     = data[pKey2] || {};
      var hostPins = pins[message.hostname] || [];
      hostPins.splice(message.pinIndex, 1);
      pins[message.hostname] = hostPins;
      var save = {}; save[pKey2] = pins;
      chrome.storage.local.set(save, function () { sendResponse({ ok: true }); });
    });
    return true;
  }

  // ── openOptions ──
  if (message.method === 'openOptions') {
    chrome.runtime.openOptionsPage();
    return false;
  }
});
