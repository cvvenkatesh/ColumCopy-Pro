var HISTORY_KEY = 'cc_history';

function byId(id) { return document.getElementById(id); }
function show(id) { byId(id).classList.remove('hidden'); }
function hide(id) { byId(id).classList.add('hidden'); }

function timeAgo(ts) {
  var d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60)    return 'just now';
  if (d < 3600)  return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}

function typeLabel(t) {
  var map = {
    'column':       '\uD83D\uDCCB Col',
    'table':        '\uD83D\uDCCA Table',
    'csv-export':   '\uD83D\uDCC1 CSV',
    'tsv-export':   '\uD83D\uDCC4 TSV',
    'json-export':  '\uD83D\uDDC2 JSON',
    'md-export':    '\uD83D\uDCDD Markdown',
    'sql-export':   '\uD83D\uDDC3 SQL',
    'html-export':  '\uD83C\uDF10 HTML',
    'multi-column': '\uD83D\uDD22 Multi'
  };
  return map[t] || '\uD83D\uDCCB Copy';
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPins(pins, tabId, hostname) {
  if (!pins || !pins.length) { hide('pinned-section'); return; }
  show('pinned-section');
  var list = byId('pinned-list');
  list.innerHTML = '';
  pins.forEach(function(pin, i) {
    var li = document.createElement('li');
    li.className = 'pinned-item';
    li.innerHTML =
      '<span class="pin-label">' + esc(pin.header) + '</span>' +
      '<button class="pin-copy-btn" data-idx="' + i + '">Copy</button>' +
      '<button class="pin-del-btn" data-idx="' + i + '">\u2715</button>';
    list.appendChild(li);
  });
  list.querySelectorAll('.pin-copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(this.dataset.idx, 10);
      chrome.tabs.sendMessage(tabId, { columnCopyAction: 'copyPinned', pinIndex: idx });
      window.close();
    });
  });
  list.querySelectorAll('.pin-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(this.dataset.idx, 10);
      chrome.tabs.sendMessage(tabId, { columnCopyAction: 'deletePin', pinIndex: idx, hostname: hostname });
      pins.splice(idx, 1);
      renderPins(pins, tabId, hostname);
    });
  });
}

function render(history) {
  show('history-section');
  document.querySelectorAll('.pro-row').forEach(function(el) { el.classList.remove('locked'); });

  var list = byId('history-list');
  if (history && history.length) {
    list.innerHTML = '';
    history.forEach(function(item) {
      var li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML =
        '<span class="h-type">'    + typeLabel(item.type) + '</span>' +
        '<span class="h-preview">' + esc(item.preview || '') + '</span>' +
        '<span class="h-time">'    + timeAgo(item.timestamp) + '</span>';
      list.appendChild(li);
    });
  }

  var searchEl = byId('history-search');
  if (searchEl) {
    searchEl.addEventListener('input', function() {
      var q = this.value.toLowerCase().trim();
      list.querySelectorAll('.history-item').forEach(function(el) {
        var preview = el.querySelector('.h-preview');
        el.style.display = (!q || (preview && preview.textContent.toLowerCase().indexOf(q) >= 0)) ? '' : 'none';
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', function() {
  byId('options-link').addEventListener('click', function(e) {
    e.preventDefault(); chrome.runtime.openOptionsPage();
  });

  chrome.storage.local.get([HISTORY_KEY], function(d) {
    render(d[HISTORY_KEY] || []);

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0]) return;
      var hostname;
      try { hostname = new URL(tabs[0].url).hostname; } catch(e) { return; }
      chrome.storage.local.get(['cc_pins'], function(pd) {
        var pins = ((pd.cc_pins || {})[hostname] || []).slice();
        renderPins(pins, tabs[0].id, hostname);
      });
    });
  });
});
