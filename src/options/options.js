jQuery(function ($) {
  var $focusedInput;
  var options = {};   // local mirror of chrome.storage.local cc_options
  var isPro   = true;

  // ── Initialise: load options from storage via background ──
  function init() {
    chrome.runtime.sendMessage({ method: 'getOptions' }, function(resp) {
      options = (resp && resp.options) ? resp.options : getDefaultOptions();
      initOptionsUI(options);
    });
  }
  init();

  // ── Persist a single option key ──────────────────────────────────────────
  // Options are saved to chrome.storage.local via background.js so the
  // content script can read them (localStorage contexts differ between pages).
  function setOption(key, value) {
    options[key] = value;
    chrome.runtime.sendMessage({ method: 'saveOptions', options: options });
  }

  // ── Options UI ───────────────────────────────────────────────────────────
  function initOptionsUI(opts) {
    $('#columnHotkey').html(toKeys(opts.columnHotkey));
    $('#tableHotkey').html(toKeys(opts.tableHotkey));
    $('input[name="hyperlinkMode"]').prop('checked', false);
    $('#hyperlinkMode-' + (opts.hyperlinkMode || 'off')).prop('checked', true);
  }

  // ── Hotkey capture ───────────────────────────────────────────────────────
  $(document).on('click', function() { $focusedInput = null; $('.input').removeClass('focus'); });

  $('.input').on('click', function(e) {
    $focusedInput = $(this);
    $('.input').removeClass('focus');
    $focusedInput.addClass('focus');
    e.stopPropagation();
  });

  $(document).on('keydown', null, '', function(e) {
    if (!$focusedInput) return;
    var possible = captureHotkey(e), hotkey;
    for (hotkey in possible) {
      if (possible.hasOwnProperty(hotkey) && possible[hotkey]) {
        setOption($focusedInput.attr('id'), hotkey);
        $focusedInput.html(toKeys(hotkey));
        showSaved();
        break;
      }
    }
  });

  // ── Hyperlink mode ───────────────────────────────────────────────────────
  $('input[name="hyperlinkMode"]').on('click', function() {
    $('input[name="hyperlinkMode"]').not(this).prop('checked', false);
    setOption('hyperlinkMode', $(this).val());
    showSaved();
  });

  // ── Reset to defaults ────────────────────────────────────────────────────
  $('#resetDefault').on('click', function(e) {
    e.preventDefault();
    if (!confirm('Reset all settings to defaults?')) return;
    options = getDefaultOptions();
    chrome.runtime.sendMessage({ method: 'saveOptions', options: options }, function() {
      initOptionsUI(options);
      $('body').trigger('click');
      showSaved();
    });
  });

  // ── Backup & Restore ─────────────────────────────────────────────────────
  $('#exportBackup').on('click', function() {
    chrome.storage.local.get(['cc_options', 'cc_pins', 'cc_history'], function(data) {
      var backup = {
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        cc_options: data.cc_options || {},
        cc_pins: data.cc_pins || {},
        cc_history: data.cc_history || []
      };
      
      var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      
      var now = new Date();
      var dateStr = now.getFullYear() + '-' + 
                    String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                    String(now.getDate()).padStart(2, '0');
      a.download = 'columncopy_backup_' + dateStr + '.json';
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showMsg('backup-status-msg', 'Backup exported successfully!', 'success');
    });
  });

  $('#importBackupBtn').on('click', function() {
    $('#importFileInput').click();
  });

  $('#importFileInput').on('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    
    var reader = new FileReader();
    reader.onload = function(evt) {
      try {
        var data = JSON.parse(evt.target.result);
        
        // Simple validation
        if (!data || (typeof data !== 'object') || 
            (!data.cc_options && !data.cc_pins && !data.cc_history)) {
          throw new Error('Invalid backup file format');
        }
        
        var toSave = {};
        if (data.cc_options) toSave.cc_options = data.cc_options;
        if (data.cc_pins) toSave.cc_pins = data.cc_pins;
        if (data.cc_history) toSave.cc_history = data.cc_history;
        
        chrome.storage.local.set(toSave, function() {
          showMsg('backup-status-msg', 'Backup imported successfully!', 'success');
          // Reset file input
          $('#importFileInput').val('');
          // Re-initialize settings UI
          init();
        });
      } catch (err) {
        showMsg('backup-status-msg', 'Error importing: ' + err.message, 'error');
        $('#importFileInput').val('');
      }
    };
    reader.readAsText(file);
  });


  // ── UI helpers ───────────────────────────────────────────────────────────
  function toKeys(value) {
    return (value || '').split('+').map(function(p) {
      return '<span class="key">' + p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() + '</span>';
    }).join('<span class="sep">+</span>');
  }

  function showMsg(id, text, type) {
    var $el = $('#' + id);
    $el.text(text).removeClass('hidden msg-success msg-error').addClass('msg-' + type);
    setTimeout(function() { $el.addClass('hidden'); }, 5000);
  }

  function showSaved() {
    var $s = $('#saved-msg');
    $s.removeClass('hidden');
    setTimeout(function() { $s.addClass('hidden'); }, 2000);
  }

  function captureHotkey(event) {
    var special   = event.type !== 'keypress' && jQuery.hotkeys.specialKeys[event.which];
    var character = String.fromCharCode(event.which).toLowerCase();
    var modif = '', possible = {};
    if (event.altKey   && special !== 'alt')   modif += 'alt+';
    if (event.ctrlKey  && special !== 'ctrl')  modif += 'ctrl+';
    if (event.metaKey  && !event.ctrlKey && special !== 'meta') modif += 'meta+';
    if (event.shiftKey && special !== 'shift') modif += 'shift+';
    if (special) { possible[modif + special] = true; }
    else {
      possible[modif + character] = true;
      possible[modif + jQuery.hotkeys.shiftNums[character]] = true;
      if (modif === 'shift+') possible[jQuery.hotkeys.shiftNums[character]] = true;
    }
    return possible;
  }
});
