(function (window, document, $) {
  'use strict';

  var IS_PRO       = true;
  var CC_SELECTION = [];   // each entry: { rawValues, values, header }
  var $CC_BAR      = null;
  var paginationBuffer = null;

  // ── Row selector (includes tfoot — was missing, causing footer rows to be
  //    skipped in all table operations) ────────────────────────────────────────
  var ROW_SEL = '> tr, > thead > tr, > tbody > tr, > tfoot > tr';

  /* ── Toasts ── */
  function showToast(msg) {
    var $t = $('<div class="CC-toast"></div>').text(msg); // use .text() — never .html() — to prevent XSS
    $('body').append($t);
    setTimeout(function() { $t.addClass('CC-toast-visible'); }, 10);
    setTimeout(function() { $t.removeClass('CC-toast-visible'); setTimeout(function() { $t.remove(); }, 300); }, 2500);
  }

  function showToastWithAction(msg, btnText, onAction) {
    var $msg = $('<span class="CC-toast-msg"></span>').text(msg);
    var $btn = $('<button class="CC-toast-btn"></button>').text(btnText);
    var $t   = $('<div class="CC-toast CC-toast-action"></div>').append($msg).append($btn);
    $('body').append($t);
    setTimeout(function() { $t.addClass('CC-toast-visible'); }, 10);
    var timer = setTimeout(function() { $t.removeClass('CC-toast-visible'); setTimeout(function() { $t.remove(); }, 300); }, 9000);
    $btn.on('click', function() {
      clearTimeout(timer);
      $t.removeClass('CC-toast-visible');
      setTimeout(function() { $t.remove(); }, 300);
      onAction();
    });
  }

  /* ── File download ── */
  function downloadFile(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  /* ── History ── */
  function saveHistory(type, values) {
    chrome.runtime.sendMessage({ method: 'saveHistory', entry: {
      type: type, preview: (values[0] || '').substring(0, 60), timestamp: Date.now()
    }});
  }

  /* ── Clipboard ── */
  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function() { fallbackCopy(text); });
    } else { fallbackCopy(text); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  }

  /* ── Animation ── */
  function animateCopied($els) {
    $els.addClass('CC-animated CC-copiedToClipboard');
    setTimeout(function() { $els.removeClass('CC-animated CC-copiedToClipboard'); }, 1000);
  }

  /* ── Cell text ──────────────────────────────────────────────────────────────
   * Fixed: HYPERLINK formula was broken by result.join(' ') adding spaces
   * inside the formula, e.g. =HYPERLINK("url"," Text ") — invalid in Excel.
   * Now builds the formula as a single string via getChildText(). ───────────── */

  function getChildText(el, hyperlinkMode) {
    var parts = [], c = el.firstChild;
    while (c) { parts.push(getCellText(c, hyperlinkMode)); c = c.nextSibling; }
    return parts.filter(Boolean).join(' ');
  }

  function getCellText(cell, hyperlinkMode) {
    // Text node
    if (cell.nodeType === 3) { return cell.data.trim(); }
    // Non-element node (comment, etc.)
    if (cell.nodeType !== 1) { return ''; }

    // INPUT: return the value for text-like inputs; skip interactive/button types
    if (cell.nodeName === 'INPUT') {
      switch (cell.type) {
        case 'button': case 'checkbox': case 'file': case 'hidden':
        case 'image': case 'password': case 'radio': case 'range':
        case 'reset': case 'search': case 'submit': return '';
        default: return cell.value.trim();
      }
    }

    // ANCHOR hyperlink mode — build formulas/links based on mode
    if (cell.nodeName === 'A') {
      var href = (cell.getAttribute('href') || '').trim();
      if (href) {
        var linkText = getChildText(cell, hyperlinkMode).trim();
        if (hyperlinkMode === 'excel') {
          return '=HYPERLINK("' + href + '","' + linkText + '")';
        } else if (hyperlinkMode === 'markdown') {
          return '[' + linkText + '](' + href + ')';
        } else if (hyperlinkMode === 'html') {
          return '<a href="' + href + '">' + linkText + '</a>';
        }
      }
    }

    // Generic element: collect child text
    return getChildText(cell, hyperlinkMode);
  }

  /* ── Cell wrapping ──────────────────────────────────────────────────────────
   * Fixed: was using backslash-escaping ( \" ) which is non-standard.
   * RFC 4180 requires the wrapper char to be escaped by doubling it ( "" ). ─── */
  function wrapCell(text, opts) {
    var w = opts.cellWrapper, r = opts.rowSeparator;
    if (text.indexOf(w) === -1 && text.indexOf(r) === -1) return text;
    // RFC 4180: escape wrapper by doubling, then wrap the whole value
    return w + text.split(w).join(w + w) + w;
  }

  /* ── Colspan map ── */
  function buildColspanMap($table) {
    $(ROW_SEL, $table).each(function() {
      var col = 0;
      $('> td, > th', this).each(function() {
        var $t = $(this), cs = parseInt($t.attr('colspan') || 1, 10), map = [], i;
        for (i = 0; i < cs; i++) { map.push(col); col++; }
        $t.data('_CC', map);
      });
    });
  }

  /* ── Column data ────────────────────────────────────────────────────────────
   * Added rawMode parameter: when true, returns raw cell text without wrapCell
   * applied — needed by CSV/TSV exports which do their own RFC-4180 quoting. ─ */
  function getColumnData(cell, $table, opts, rawMode) {
    var $cell = $(cell), cellMap = $cell.data('_CC') || [], column = [], values = [];
    if (!cellMap.length) return false;
    $(ROW_SEL, $table).each(function() {
      var row = [];
      $('> td, > th', this).each(function() {
        var $t = $(this), map = $t.data('_CC'), i;
        for (i = map.length - 1; i >= 0; i--) {
          if (cellMap.indexOf(map[i]) !== -1) {
            var text = getCellText($t[0], opts.hyperlinkMode).trim();
            row.push(rawMode ? text : wrapCell(text, opts));
            column.push(this); break;
          }
        }
      });
      values.push(row.join(opts.columnSeparator));
    });
    return { column: $(column), values: values };
  }

  function getTableValues($table, opts) {
    var values = [];
    $(ROW_SEL, $table).each(function() {
      var row = [];
      $('> td, > th', this).each(function() {
        row.push(wrapCell(getCellText(this, opts.hyperlinkMode).trim(), opts));
      });
      values.push(row.join(opts.columnSeparator));
    });
    return values;
  }

  /* ── Pagination helper ── */
  function findNextButton() {
    var SELECTORS = [
      'a[rel="next"]',
      '[aria-label="Next page"]',
      '[aria-label="Next"]',
      '.pagination .next a',
      '.pagination a.next',
      '.pager .next a',
      '.paginator a.next',
      'a.next-page',
      'button.next-page'
    ];
    var $found = null;
    for (var i = 0; i < SELECTORS.length; i++) {
      var $el = $(SELECTORS[i]).not('.disabled').not('[disabled]').filter(':visible').first();
      if ($el.length) { $found = $el; break; }
    }
    if ($found) return $found;
    $('a:visible, button:visible').each(function() {
      var t = $(this).text().trim();
      if (t === 'Next' || t === '\u203a' || t === '\u00bb' || t === 'Next \u203a' || t === 'Next \u2192') {
        $found = $(this); return false;
      }
    });
    return $found;
  }

  /* ── Pagination merge ──────────────────────────────────────────────────────
   * Fixed race condition: the old table is still visible immediately after
   * clicking Next, so checking $tables.length fired at once. Now we capture
   * a fingerprint of the first data cell before clicking and wait until it
   * actually changes, indicating the new page has loaded. ──────────────────── */
  function mergeNextPage(opts) {
    if (!paginationBuffer) { showToast('No active pagination session.'); return; }
    var $next = findNextButton();
    if (!$next) { showToast('No next page button found.'); paginationBuffer = null; return; }

    showToast('Loading page ' + (paginationBuffer.pages + 1) + '\u2026');

    // Snapshot first-cell text to detect when the new page has rendered
    var $prevTable = $('table:visible').first();
    var prevFirstCell = $prevTable.find('td, th').first().text().trim();

    $next[0].click();

    var attempts = 0;
    var interval = setInterval(function() {
      attempts++;
      var $tables       = $('table:visible');
      var newFirstCell  = $tables.first().find('td, th').first().text().trim();
      var pageChanged   = $tables.length && newFirstCell !== prevFirstCell;

      if (pageChanged || attempts > 25) {
        clearInterval(interval);
        if ($tables.length) {
          var newVals = getTableValues($tables.first(), opts).slice(1); // skip header row
          paginationBuffer.allValues = paginationBuffer.allValues.concat(newVals);
          paginationBuffer.pages++;
          writeClipboard(paginationBuffer.allValues.join(opts.rowSeparator));
          saveHistory('table', paginationBuffer.allValues);
          var $nx = findNextButton();
          if ($nx) {
            showToastWithAction(
              'Page ' + paginationBuffer.pages + ' merged \u2014 ' + paginationBuffer.allValues.length + ' rows total',
              'Add Next Page',
              function() { mergeNextPage(opts); }
            );
          } else {
            showToast('All ' + paginationBuffer.pages + ' pages merged (' + paginationBuffer.allValues.length + ' rows)!');
            paginationBuffer = null;
          }
        } else {
          showToast('Table not found after navigation.');
          paginationBuffer = null;
        }
      }
    }, 300);
  }

  /* ── Core actions ── */
  function doCopyColumn(cell, $table, opts) {
    buildColspanMap($table);
    var data = getColumnData(cell, $table, opts);
    if (!data) return;
    animateCopied(data.column);
    writeClipboard(data.values.join(opts.rowSeparator));
    saveHistory('column', data.values);
    showToast('Column copied!');
  }

  function doCopyTable(cell, $table, opts) {
    if (!$table.length) return;
    var values = getTableValues($table, opts);
    animateCopied($table);
    writeClipboard(values.join(opts.rowSeparator));
    saveHistory('table', values);
    paginationBuffer = { allValues: values, pages: 1 };
    var $next = findNextButton();
    if ($next) {
      showToastWithAction(
        'Table copied (' + values.length + ' rows) \u2014 next page detected!',
        'Add Next Page',
        function() { mergeNextPage(opts); }
      );
    } else {
      showToast('Table copied!');
    }
  }

  /* ── Column exports ─────────────────────────────────────────────────────────
   * Fixed: both functions now use rawMode=true in getColumnData so cells are
   * not double-quoted. CSV quoting is handled here per RFC 4180. Also fixed
   * hardcoded '\n' — now uses opts.rowSeparator. ────────────────────────────── */
  function doExportCsv(cell, $table, opts) {
    buildColspanMap($table);
    var data = getColumnData(cell, $table, opts, true); // rawMode=true
    if (!data) return;
    var csv = data.values.map(function(v) {
      if (v.indexOf(',') !== -1 || v.indexOf('"') !== -1 ||
          v.indexOf('\n') !== -1 || v.indexOf('\r') !== -1) {
        return '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    }).join(opts.rowSeparator); // Fixed: was hardcoded '\n'
    downloadFile(csv, 'column-export.csv', 'text/csv;charset=utf-8;');
    saveHistory('csv-export', data.values);
    showToast('CSV downloaded!');
  }

  function doExportTsv(cell, $table, opts) {
    buildColspanMap($table);
    var data = getColumnData(cell, $table, opts, true); // rawMode=true
    if (!data) return;
    downloadFile(data.values.join(opts.rowSeparator), 'column-export.tsv', 'text/tab-separated-values'); // Fixed: was hardcoded '\n'
    saveHistory('tsv-export', data.values);
    showToast('TSV downloaded!');
  }

  /* ── Table exports ── */
  function doExportJson(cell, $table) {
    if (!$table.length) return;
    var headers = [], rows = [], isFirst = true;
    $(ROW_SEL, $table).each(function() {
      var rowData = [];
      $('> td, > th', this).each(function() { rowData.push(getCellText(this, 'off').trim()); });
      if (isFirst) { headers = rowData; isFirst = false; }
      else {
        var obj = {};
        rowData.forEach(function(v, i) { obj[headers[i] || ('col' + i)] = v; });
        rows.push(obj);
      }
    });
    downloadFile(JSON.stringify(rows, null, 2), 'table-export.json', 'application/json');
    saveHistory('json-export', ['JSON: ' + rows.length + ' rows']);
    showToast('JSON downloaded!');
  }

  function doExportMarkdown(cell, $table) {
    if (!$table.length) return;
    var rows = [];
    $(ROW_SEL, $table).each(function() {
      var cells = [];
      $('> td, > th', this).each(function() {
        cells.push(getCellText(this, 'off').trim().replace(/\|/g, '\\|'));
      });
      rows.push(cells);
    });
    if (!rows.length) return;
    var colCount = Math.max.apply(null, rows.map(function(r) { return r.length; }));
    var lines = [];
    var header = rows[0];
    while (header.length < colCount) header.push('');
    lines.push('| ' + header.join(' | ') + ' |');
    var sep = [];
    for (var c = 0; c < colCount; c++) sep.push(' --- ');
    lines.push('|' + sep.join('|') + '|');
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      while (row.length < colCount) row.push('');
      lines.push('| ' + row.join(' | ') + ' |');
    }
    downloadFile(lines.join('\n'), 'table-export.md', 'text/markdown');
    saveHistory('md-export', [lines[0] ? lines[0].substring(0, 60) : '']);
    showToast('Markdown downloaded!');
  }

  function doExportSql(cell, $table) {
    if (!$table.length) return;
    var headers = [], rows = [], isFirst = true;
    $(ROW_SEL, $table).each(function() {
      var rowData = [];
      $('> td, > th', this).each(function() { rowData.push(getCellText(this, 'off').trim()); });
      if (isFirst) { headers = rowData; isFirst = false; }
      else { rows.push(rowData); }
    });
    function sqlName(h, i) {
      return ((h || 'col' + i).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^(\d)/, 'c$1')) || ('col' + i);
    }
    var tbl     = 'my_table';
    var colDefs = headers.map(function(h, i) { return '  `' + sqlName(h, i) + '` TEXT'; }).join(',\n');
    var sql     = '-- Generated by ColumnCopy Pro\nCREATE TABLE IF NOT EXISTS `' + tbl + '` (\n' + colDefs + '\n);\n';
    if (rows.length) {
      var colNames  = headers.map(function(h, i) { return '`' + sqlName(h, i) + '`'; }).join(', ');
      var valueRows = rows.map(function(row) {
        return '  (' + row.map(function(v) { return "'" + v.replace(/'/g, "''") + "'"; }).join(', ') + ')';
      });
      sql += '\nINSERT INTO `' + tbl + '` (' + colNames + ') VALUES\n' + valueRows.join(',\n') + ';\n';
    }
    downloadFile(sql, 'table-export.sql', 'text/plain');
    saveHistory('sql-export', ['SQL: ' + rows.length + ' rows, ' + headers.length + ' cols']);
    showToast('SQL downloaded!');
  }

  function doExportHtml($table) {
    if (!$table.length) return;
    var html =
      '<!DOCTYPE html>\n<html><head><meta charset="utf-8">' +
      '<style>table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 12px;font-family:sans-serif}</style>' +
      '</head><body>\n' + $table[0].outerHTML + '\n</body></html>';
    downloadFile(html, 'table-export.html', 'text/html');
    saveHistory('html-export', ['HTML table export']);
    showToast('HTML downloaded!');
  }

  /* ── Multi-column selection ─────────────────────────────────────────────────
   * Fixed: CC_SELECTION now stores both rawValues (for CSV export) and values
   * (wrapped, for clipboard). This prevents the double-quoting bug that
   * occurred when doExportSelectedCsv tried to re-quote already-wrapped data. ─ */
  function addColumnToSelection(cell, $table, opts) {
    buildColspanMap($table);
    var rawData = getColumnData(cell, $table, opts, true);  // raw (for export)
    var fmtData = getColumnData(cell, $table, opts, false); // wrapped (for clipboard)
    if (!rawData || !rawData.values.length) { showToast('Could not identify column.'); return; }
    var header = rawData.values[0] || ('Column ' + (CC_SELECTION.length + 1));
    CC_SELECTION.push({ rawValues: rawData.values, values: fmtData.values, header: header });
    updateSelectionBar(opts);
    showToast('"' + header + '" added (' + CC_SELECTION.length + ' selected)');
  }

  function doCopySelectedColumns(opts) {
    if (!CC_SELECTION.length) { showToast('No columns in selection. Right-click a column \u2192 Add to multi-select.'); return; }
    var maxRows = Math.max.apply(null, CC_SELECTION.map(function(c) { return c.values.length; }));
    var rows = [];
    for (var i = 0; i < maxRows; i++) {
      rows.push(CC_SELECTION.map(function(c) { return c.values[i] || ''; }).join(opts.columnSeparator));
    }
    writeClipboard(rows.join(opts.rowSeparator));
    saveHistory('multi-column', [CC_SELECTION.map(function(c) { return c.header; }).join(' + ')]);
    showToast(CC_SELECTION.length + ' columns copied!');
    CC_SELECTION = [];
    updateSelectionBar(opts);
  }

  // Fixed: now uses rawValues + RFC-4180 quoting (no double-processing)
  function doExportSelectedCsv(opts) {
    if (!CC_SELECTION.length) { showToast('No columns in selection.'); return; }
    var maxRows = Math.max.apply(null, CC_SELECTION.map(function(c) { return c.rawValues.length; }));
    var lines = [];
    for (var i = 0; i < maxRows; i++) {
      var row = CC_SELECTION.map(function(c) {
        var v = c.rawValues[i] || '';
        if (v.indexOf(',') !== -1 || v.indexOf('"') !== -1 || v.indexOf('\n') !== -1)
          return '"' + v.replace(/"/g, '""') + '"';
        return v;
      });
      lines.push(row.join(','));
    }
    downloadFile(lines.join(opts.rowSeparator), 'multi-column-export.csv', 'text/csv');
    saveHistory('csv-export', [CC_SELECTION.map(function(c) { return c.header; }).join(', ')]);
    showToast('Multi-column CSV downloaded!');
    CC_SELECTION = [];
    updateSelectionBar(opts);
  }

  function updateSelectionBar(opts) {
    if (!CC_SELECTION.length) {
      if ($CC_BAR) { $CC_BAR.remove(); $CC_BAR = null; }
      return;
    }
    if (!$CC_BAR || !$CC_BAR.parent().length) {
      $CC_BAR = $(
        '<div id="CC-select-bar">' +
          '<span id="CC-sel-count"></span>' +
          '<button id="CC-sel-copy">&#128203; Copy All</button>' +
          '<button id="CC-sel-csv">&#128193; Export CSV</button>' +
          '<button id="CC-sel-clear">&#10005; Clear</button>' +
        '</div>'
      );
      $('body').append($CC_BAR);
      $('#CC-sel-copy').on('click', function() { doCopySelectedColumns(opts); });
      $('#CC-sel-csv').on('click', function() { doExportSelectedCsv(opts); });
      $('#CC-sel-clear').on('click', function() {
        CC_SELECTION = []; updateSelectionBar(opts); showToast('Selection cleared.');
      });
    }
    $('#CC-sel-count').text(
      CC_SELECTION.length + ' column' + (CC_SELECTION.length !== 1 ? 's' : '') + ' selected'
    );
  }

  /* ── Pin column ── */
  function doPinColumn(cell, $table, opts) {
    buildColspanMap($table);
    var data = getColumnData(cell, $table, opts);
    if (!data || !data.values.length) { showToast('Could not identify column.'); return; }
    var header = data.values[0] || 'Column';
    var $cell  = $(cell);
    var cellMap = $cell.data('_CC') || [];
    if (!cellMap.length) { showToast('Could not determine column index.'); return; }
    var colIndex   = cellMap[0];
    var tableIndex = $('table').index($table[0]);
    chrome.runtime.sendMessage({
      method: 'savePin',
      pin: {
        hostname:   window.location.hostname,
        url:        window.location.href,
        tableIndex: tableIndex,
        colIndex:   colIndex,
        header:     header
      }
    }, function() {
      showToast('\uD83D\uDCCC "' + header + '" pinned! Open the popup to quick-copy.');
    });
  }

  /* ── Bootstrap ──────────────────────────────────────────────────────────────
   * Fixed: options no longer fall back to the web page's localStorage (which
   * is a completely different storage from the extension options page). They
   * are now loaded exclusively from chrome.storage.local via background.js. ── */
  chrome.runtime.sendMessage({ method: 'getOptions' }, function(optResp) {
    var opts = Object.assign(
      { columnSeparator: '\t', rowSeparator: '\n', cellWrapper: '"',
        columnHotkey: 'alt', tableHotkey: 'alt+shift', hyperlinkMode: 'off' },
      (optResp && optResp.options) || {}
    );

    var activeHotkey = { column: false, table: false };
    var activeCell = null;

    $(document).on('keyup', null, '', function() { activeHotkey.column = false; activeHotkey.table = false; });
    $(document).on('keydown', null, opts.columnHotkey, function() { activeHotkey.column = true; });
    $(document).on('keydown', null, opts.tableHotkey, function() { activeHotkey.table = true; });

    $(document).on('click', 'th,td', function(e) {
      var $table = $(this).parents('table:first');
      if (activeHotkey.table)  { doCopyTable(this, $table, opts);  e.stopPropagation(); }
      else if (activeHotkey.column)      { doCopyColumn(this, $table, opts); e.stopPropagation(); }
    });

    // Fixed: reset activeCell to null at the start of every contextmenu event
    // before re-assigning, so stale state from a prior right-click never leaks.
    $(document).on('contextmenu', function(e) {
      activeCell = null; // reset first
      if (['TH', 'TD'].indexOf(e.target.tagName) >= 0) {
        activeCell = e.target;
      } else {
        var p = $(e.target).parents('th,td').first();
        if (p.length) activeCell = p[0];
      }
    });

    chrome.runtime.onMessage.addListener(function(req) {
      if (!req || !req.columnCopyAction) return;
      var $table = activeCell ? $(activeCell).parents('table:first') : $();

      switch (req.columnCopyAction) {
        case 'copyColumn':
          if (activeCell) { doCopyColumn(activeCell, $table, opts); activeCell = null; }
          break;
        case 'copyTable':
          if (activeCell) { doCopyTable(activeCell, $table, opts); activeCell = null; }
          break;
        case 'exportCsv':
          if (activeCell) { doExportCsv(activeCell, $table, opts); activeCell = null; }
          break;
        case 'exportTsv':
          if (activeCell) { doExportTsv(activeCell, $table, opts); activeCell = null; }
          break;
        case 'exportJson':
          if (activeCell) { doExportJson(activeCell, $table); activeCell = null; }
          break;
        case 'exportMarkdown':
          if (activeCell) { doExportMarkdown(activeCell, $table); activeCell = null; }
          break;
        case 'exportSql':
          if (activeCell) { doExportSql(activeCell, $table); activeCell = null; }
          break;
        case 'exportHtml':
          if (activeCell) { doExportHtml($table); activeCell = null; }
          break;
        case 'addToSelection':
          if (activeCell) addColumnToSelection(activeCell, $table, opts);
          break;
        case 'copySelected':
          doCopySelectedColumns(opts);
          break;
        case 'pinColumn':
          if (activeCell) { doPinColumn(activeCell, $table, opts); activeCell = null; }
          break;
        case 'copyPinned':
          chrome.runtime.sendMessage({ method: 'getPins', hostname: window.location.hostname }, function(resp) {
            var pins = (resp && resp.pins) || [];
            var pin  = pins[req.pinIndex];
            if (!pin) { showToast('Pin not found.'); return; }
            var $t = $('table').eq(pin.tableIndex);
            if (!$t.length) { showToast('Table not found on this page.'); return; }
            buildColspanMap($t);
            var targetCell = null;
            $(ROW_SEL, $t).first().find('> td, > th').each(function() {
              var map = $(this).data('_CC') || [];
              if (map.indexOf(pin.colIndex) !== -1) { targetCell = this; return false; }
            });
            if (targetCell) {
              doCopyColumn(targetCell, $t, opts);
              showToast('\uD83D\uDCCC "' + pin.header + '" copied from pin!');
            } else {
              showToast('Column not found \u2014 table structure may have changed.');
            }
          });
          break;
        case 'deletePin':
          chrome.runtime.sendMessage({ method: 'deletePin', hostname: req.hostname, pinIndex: req.pinIndex });
          break;
      }
    });
  });

}(window, document, jQuery));
