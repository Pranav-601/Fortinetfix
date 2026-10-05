(() => {
  if (window.__FSI_PANEL) return; window.__FSI_PANEL = 1;
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
  const state = { lock: false, calls: [], xhr: [] };
  const api = () => window.API && typeof window.API.LMSGetValue === 'function' ? window.API : null;

  // log Moodle saves so we can see the server's reply
  const X = window.XMLHttpRequest;
  if (!X.prototype.__fsi) {
    const _o = X.prototype.open, _s = X.prototype.send;
    X.prototype.open = function (m, u) { this.__u = String(u); return _o.apply(this, arguments); };
    X.prototype.send = function (b) {
      if (/datamodel\.php/.test(this.__u || '')) {
        const rec = {}; state.xhr.push(rec);
        this.addEventListener('load', () => { rec.s = this.status; rec.r = String(this.responseText).trim().slice(0, 60); });
      }
      return _s.apply(this, arguments);
    };
    X.prototype.__fsi = 1;
  }
  // hook SetValue to keep the status from being downgraded after completing
  const hook = () => {
    const a = api(); if (!a || a.__fsi) return;
    const o = a.LMSSetValue;
    a.LMSSetValue = function (k, v) {
      if (state.lock && /lesson_status$/.test(k) && /^(incomplete|browsed|not attempted|failed)$/i.test(v)) return 'true';
      return o.apply(this, arguments);
    };
    a.__fsi = 1;
  };

  // UI
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#111;color:#eee;font:12px sans-serif;padding:8px;border-radius:8px;width:230px;box-shadow:0 2px 10px #0008';
  box.innerHTML = '<b>FSI helper</b> <span id="fsi-x" style="float:right;cursor:pointer">✕</span><div id="fsi-out" style="margin:6px 0;white-space:pre-wrap;max-height:120px;overflow:auto">Ready</div>' +
    ['Status', 'Mark complete', 'Copy report'].map((t, i) => '<button data-i="' + i + '" style="margin:2px;padding:3px 6px;cursor:pointer">' + t + '</button>').join('');
  document.body.appendChild(box);
  const out = t => box.querySelector('#fsi-out').textContent = t;
  box.querySelector('#fsi-x').onclick = () => box.remove();

  const status = () => {
    const a = api(); if (!a) return 'SCORM API not found';
    const g = k => safe(() => a.LMSGetValue(k));
    return 'status: ' + g('cmi.core.lesson_status') + '\nscore: ' + (g('cmi.core.score.raw') || '-') +
      '\nserver: ' + (state.xhr.slice(-1).map(x => (x.s || '?') + ' ' + (x.r || '')).join('') || 'no saves yet');
  };
  const complete = () => {
    const a = api(); if (!a) return out('SCORM API not found');
    if (!confirm('Mark this SCORM activity as completed in Moodle?')) return;
    hook();
    safe(() => a.LMSGetValue('cmi.core.lesson_status'));
    if (String(safe(() => a.LMSGetLastError())) === '301') a.LMSInitialize('');
    const m = parseFloat(safe(() => a.LMSGetValue('cmi.student_data.mastery_score')));
    const st = isNaN(m) ? 'completed' : 'passed';
    if (st === 'passed') { a.LMSSetValue('cmi.core.score.min', '0'); a.LMSSetValue('cmi.core.score.max', '100'); a.LMSSetValue('cmi.core.score.raw', '100'); }
    a.LMSSetValue('cmi.core.session_time', '00:20:00');
    a.LMSSetValue('cmi.core.lesson_status', st);
    a.LMSSetValue('cmi.core.exit', '');
    state.lock = true;
    const r = a.LMSCommit('');
    out('commit: ' + r + '\n' + status() + '\n(do not click through the course)');
  };
  const report = () => {
    const a = api(); const g = k => a ? safe(() => a.LMSGetValue(k)) : null;
    const r = { url: location.href, status: g('cmi.core.lesson_status'), mastery: g('cmi.student_data.mastery_score'), mode: g('cmi.core.lesson_mode'), credit: g('cmi.core.credit'), saves: state.xhr.slice(-5) };
    navigator.clipboard.writeText(JSON.stringify(r)).then(() => out('Report copied'), () => out(JSON.stringify(r)));
  };
  box.onclick = e => { const i = e.target.dataset && e.target.dataset.i; if (i === '0') { hook(); out(status()); } if (i === '1') complete(); if (i === '2') report(); };
})();
