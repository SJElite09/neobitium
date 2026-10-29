/* Neobitium site script.
   No cookies, no local storage, no tracking. It makes no network requests of its own: the
   booking form is sent by the browser itself, in a new tab, only when you press Send. (The one
   third-party script on the site is Cloudflare Turnstile, the bot check, which only the booking
   page loads.)
   It runs the menu button, the package builder and booking form checks, the before/after
   sliders, the header shadow, the scroll animations and the smooth mouse-wheel scrolling
   (the animations are skipped if your device asks for reduced motion). */
(function () {
  'use strict';

  var doc = document;
  doc.documentElement.classList.add('js');

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function gbp(n) { return '£' + n; }

  /* ---------- Always start a new page at the top ----------
     Some phone browsers keep the old scroll position when you follow a link. Back/forward
     and reloads still restore where you were, and #jump links still go to their section. */
  try {
    var navEntry = performance.getEntriesByType('navigation')[0];
    var navType = navEntry ? navEntry.type : 'navigate';
    if (navType === 'navigate' && !location.hash) {
      if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } else if ('scrollRestoration' in history) {
      history.scrollRestoration = 'auto';
    }
  } catch (err) { /* fine: the browser's own behaviour is used */ }
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted && !location.hash) { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
  });

  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (err) { reduce = false; }

  /* ---------- Menu button (small screens only) ---------- */
  var toggle = $('.nav-toggle');
  var nav = $('#site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('is-open', !open);
    });
    /* On a phone the menu link's underline is drawn when you tap it. Let that finish, then change
       page. The menu stays open until the new page replaces it, so the line stays visible. */
    var leaving = false;
    var menuMode = function () {
      try {
        return window.getComputedStyle(toggle).display !== 'none' || window.matchMedia('(hover: none)').matches;
      } catch (err) { return false; }
    };
    $$('a', nav).forEach(function (a) {
      a.addEventListener('click', function (e) {
        var plain = !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey &&
          !a.classList.contains('btn') && a.getAttribute('aria-current') !== 'page' &&
          (!a.target || a.target === '_self') && a.origin === location.origin && !a.hash;
        if (plain && !reduce && menuMode()) {
          e.preventDefault();
          if (leaving) { return; }
          leaving = true;
          a.classList.add('is-leaving');
          window.setTimeout(function () { location.href = a.href; }, 220);
          return;
        }
        toggle.setAttribute('aria-expanded', 'false');
        nav.classList.remove('is-open');
      });
    });
    // Coming back with the Back button can show the old page from memory: reset it.
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) { return; }
      leaving = false;
      $$('a.is-leaving', nav).forEach(function (a) { a.classList.remove('is-leaving'); });
      toggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('is-open');
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        toggle.setAttribute('aria-expanded', 'false');
        nav.classList.remove('is-open');
        toggle.focus();
      }
    });
  }

  /* ---------- Header shadow once the page has scrolled ---------- */
  var header = $('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 4); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Scroll reveal ---------- */
  if (!reduce && 'IntersectionObserver' in window) {
    var targets = $$('.section-head, .page-head > *, .rows > li, .price-list > li, .steps > li, .grid-2 > div, .feature, ' +
      '.case-head, .case-text > div, .shot, .callout, .service, .faq details, .contact-details, .contact-form-col > *, ' +
      '.note, .notes, .legal > *, .prose > p');
    var seen = [];
    targets = targets.filter(function (el) {
      // Skip anything inside the hero (it has its own entrance) or already handled
      return !el.closest('.hero') && seen.indexOf(el) === -1 && seen.push(el);
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
        } else if (en.boundingClientRect.top > 0) {
          // It has slid out of the bottom edge (you scrolled back up): fade it out so it can fade in again.
          en.target.classList.remove('in');
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: [0, 0.05] });
    var vh = window.innerHeight || doc.documentElement.clientHeight;
    targets.forEach(function (el) {
      var parent = el.parentElement;
      var idx = parent ? Array.prototype.indexOf.call(parent.children, el) : 0;
      el.style.setProperty('--d', Math.min(idx, 5) * 70 + 'ms');
      // Anything already on screen as the page opens is left exactly as it is. Hiding it and then
      // fading it back in is what made pages look like they loaded twice. Only blocks further
      // down, which can't be seen yet, wait to fade in as you scroll to them.
      if (el.getBoundingClientRect().top < vh) { return; }
      el.classList.add('reveal');
      io.observe(el);
    });
  }


  /* ---------- Smooth mouse-wheel scrolling ----------
     Each wheel tick moves a target position, and the page eases towards it, so scrolling glides
     instead of jumping. Keyboard, scrollbar, touch, pinch-zoom and jump links are left alone. */
  var fine = false;
  try { fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (err) { fine = false; }
  if (!reduce && fine) {
    var root = doc.scrollingElement || doc.documentElement;
    var target = window.scrollY, current = window.scrollY, raf = 0, last = 0;
    var maxScroll = function () { return Math.max(0, root.scrollHeight - window.innerHeight); };
    var clamp = function (v) { return Math.max(0, Math.min(maxScroll(), v)); };
    var stop = function () {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      target = current = window.scrollY;
    };
    var frame = function (t) {
      var dt = Math.min(64, t - last);
      last = t;
      current += (target - current) * (1 - Math.exp(-dt / 110));
      if (Math.abs(target - current) < 0.5) { current = target; raf = 0; } else { raf = requestAnimationFrame(frame); }
      window.scrollTo({ top: current, left: 0, behavior: 'instant' });
    };
    var scrollsInside = function (el, dy) {
      while (el && el !== doc.body && el !== root) {
        if (el.nodeType === 1) {
          var oy = window.getComputedStyle(el).overflowY;
          if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
            if (dy < 0 && el.scrollTop > 0) { return true; }
            if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) { return true; }
          }
        }
        el = el.parentNode;
      }
      return false;
    };
    window.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.defaultPrevented || e.deltaY === 0) { return; }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { return; }
      if (scrollsInside(e.target, e.deltaY)) { return; }
      e.preventDefault();
      var dy = e.deltaMode === 1 ? e.deltaY * 40 : (e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY);
      if (!raf) { target = current = window.scrollY; }
      target = clamp(target + dy);
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }, { passive: false });
    ['keydown', 'pointerdown', 'touchstart', 'hashchange'].forEach(function (ev) {
      window.addEventListener(ev, stop, { passive: true });
    });
    window.addEventListener('scroll', function () { if (!raf) { target = current = window.scrollY; } }, { passive: true });
    window.addEventListener('resize', stop);
  }

  /* ---------- Before/after sliders ---------- */
  $$('[data-compare]').forEach(function (c) {
    var r = $('.cmp-range', c);
    var touched = false;
    function set(v) {
      c.style.setProperty('--pos', v + '%');
      if (v < 14) { c.setAttribute('data-low', ''); } else { c.removeAttribute('data-low'); }
      if (v > 86) { c.setAttribute('data-high', ''); } else { c.removeAttribute('data-high'); }
      r.setAttribute('aria-valuetext', Math.round(v) + '% before, ' + Math.round(100 - v) + '% after');
    }
    r.addEventListener('input', function () { touched = true; set(+r.value); });   // keyboard and screen readers
    set(50);
    // Mouse, finger and pen: drag anywhere on the picture. Up and down still scroll the page.
    var dragging = false;
    function moveTo(e) {
      var box = c.getBoundingClientRect();
      var v = Math.max(0, Math.min(100, (e.clientX - box.left) / box.width * 100));
      r.value = v;
      set(v);
    }
    c.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) { return; }
      dragging = true;
      touched = true;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      moveTo(e);
    });
    c.addEventListener('pointermove', function (e) { if (dragging) { moveTo(e); } });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
      c.addEventListener(ev, function () { dragging = false; });
    });
    if (!reduce && 'IntersectionObserver' in window) {
      // A short sweep the first time it scrolls into view, so people see that it moves.
      var sweep = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) { return; }
        sweep.disconnect();
        var start = performance.now();
        (function tick(t) {
          if (touched) { return; }
          var k = Math.min(1, (t - start) / 1100);
          var v = 92 - 42 * (1 - Math.pow(1 - k, 3));
          r.value = v;
          set(v);
          if (k < 1) { requestAnimationFrame(tick); }
        })(start);
      }, { threshold: 0.6 });
      sweep.observe(c);
    }
  });

  /* ---------- FAQ: answers slide open and closed ---------- */
  $$('.faq details').forEach(function (d) {
    var sum = $('summary', d);
    var box = $('.answer', d);
    if (!sum || !box) { return; }
    var anim = null;
    var run = function (opening) {
      if (anim) { anim.cancel(); anim = null; }
      var cs = window.getComputedStyle(box);
      var from = box.getBoundingClientRect().height;
      var pad = parseFloat(cs.paddingBottom) || 0;
      if (opening) { d.open = true; }
      box.style.overflow = 'hidden';
      var full = box.scrollHeight;
      var start = opening ? { height: '0px', paddingBottom: '0px', opacity: 0 } : { height: from + 'px', paddingBottom: pad + 'px', opacity: 1 };
      var end = opening ? { height: full + 'px', paddingBottom: pad + 'px', opacity: 1 } : { height: '0px', paddingBottom: '0px', opacity: 0 };
      d.classList.toggle('is-closing', !opening);
      anim = box.animate([start, end], { duration: 320, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
      var done = function () {
        anim = null;
        box.style.overflow = '';
        d.classList.remove('is-closing');
        if (!opening) { d.open = false; }
      };
      anim.onfinish = done;
      anim.oncancel = function () { box.style.overflow = ''; };
    };
    sum.addEventListener('click', function (e) {
      if (reduce || !box.animate) { return; }   // plain open/close
      e.preventDefault();
      var closing = d.open && !d.classList.contains('is-closing');
      run(!closing);
    });
  });

  /* ---------- Package builder and booking form ---------- */
  var form = $('#pkg-form');
  var P = null;
  var state = { mode: 'pick', picked: {} };

  if (form) {
    var dataEl = $('#pricing-data');
    try { P = JSON.parse(dataEl.textContent); } catch (err) { P = null; }
  }

  function isIncluded(id) { return P.full.includes.indexOf(id) > -1; }
  function findItem(id) {
    for (var i = 0; i < P.items.length; i++) { if (P.items[i].id === id) { return P.items[i]; } }
    return null;
  }

  function calc() {
    var res = { total: 0, lines: [], parts: false, text: '', empty: false };
    if (!P) { return res; }
    if (state.mode === 'full') {
      res.total += P.full.price;
      res.lines.push({ label: 'Go Full Neobitium', price: gbp(P.full.price) });
    }
    P.items.forEach(function (it) {
      if (state.mode === 'full' && isIncluded(it.id)) { return; }
      if (!state.picked[it.id]) { return; }
      res.total += it.price;
      if (it.parts) { res.parts = true; }
      res.lines.push({ label: it.label, price: gbp(it.price) + (it.parts ? ' + parts' : '') });
    });
    if (res.lines.length === 0) {
      res.empty = true;
      res.text = gbp(0);
    } else {
      res.text = gbp(res.total);
    }
    return res;
  }

  var lastText = null;
  function renderEstimate() {
    var res = calc();
    var total = $('#est-total');
    var list = $('#est-lines');
    var notes = $('#est-notes');
    if (!total) { return res; }
    total.textContent = res.text;
    if (lastText !== null && lastText !== res.text && !reduce) {
      total.classList.remove('bump');
      void total.offsetWidth;
      total.classList.add('bump');
    }
    lastText = res.text;
    list.textContent = '';
    res.lines.forEach(function (l) {
      var li = doc.createElement('li');
      var a = doc.createElement('span');
      a.textContent = l.label;
      var b = doc.createElement('span');
      b.className = 'price';
      b.textContent = l.price;
      li.appendChild(a);
      li.appendChild(b);
      list.appendChild(li);
    });
    var bits = [];
    if (res.empty) {
      bits.push('Nothing chosen yet.');
    } else {
      if (res.parts) { bits.push('Parts are extra. I tell you what they cost before I buy anything.'); }
      bits.push('You pay when you book, and I confirm everything by email.');
    }
    notes.textContent = bits.join(' ');
    var sumField = $('#package-summary');
    var totField = $('#total-gbp');
    if (sumField) { sumField.value = res.lines.map(function (l) { return l.label; }).join(' + '); }
    if (totField) { totField.value = res.empty ? '' : String(res.total); }
    return res;
  }

  function syncMode() {
    $$('input[name="svc"]', form).forEach(function (cb) {
      var id = cb.getAttribute('data-id');
      var it = findItem(id);
      var row = cb.closest('.opt');
      var lockNote = $('.lock-note', row);
      var needNote = $('.need-note', row);
      var locked = state.mode === 'full' && isIncluded(id);
      var needsMissing = state.mode === 'pick' && it.needs && !state.picked[it.needs];
      if (lockNote) { lockNote.hidden = true; }
      if (needNote) { needNote.hidden = true; }
      row.classList.remove('is-locked');
      if (locked) {
        cb.checked = true;
        cb.disabled = true;
        row.classList.add('is-locked');
        if (lockNote) { lockNote.hidden = false; }
      } else if (needsMissing) {
        state.picked[id] = false;
        cb.checked = false;
        cb.disabled = true;
        if (needNote) { needNote.hidden = false; }
      } else {
        cb.disabled = false;
        cb.checked = !!state.picked[id];
      }
    });
    renderEstimate();
  }

  /* ----- Booking form: checks before sending, with clear error messages ----- */
  if (form) {
    form.noValidate = true;   // we show our own messages (without JavaScript the browser's own checks apply)
    var summaryEl = $('#err-summary');
    var testNote = $('#test-note');
    var connected = form.getAttribute('data-connected') === 'true';
    var sendBtns = $$('#send-btn, #send-btn-2');
    var shown = [];

    /* Model and year: three drop-downs are joined into the single "mac_model" value the booking
       system already expects, e.g. "MacBook Pro (13-inch, Mid 2009)". */
    var typeSel = $('#mac_type'), sizeSel = $('#mac_size'), periodSel = $('#mac_period'), yearSel = $('#mac_year'), modelHid = $('#mac-model');
    var noSize = [];
    try { noSize = JSON.parse(sizeSel.getAttribute('data-nosize') || '[]'); } catch (err) { noSize = []; }
    var syncModel = function () {
      if (!typeSel || !sizeSel || !modelHid) { return; }
      var skip = noSize.indexOf(typeSel.value) > -1;
      if (skip) { sizeSel.value = ''; }
      sizeSel.disabled = skip;
      sizeSel.required = !skip;
      var when = [periodSel.value, yearSel.value].filter(Boolean).join(' ');
      var inner = [skip ? '' : sizeSel.value, when].filter(Boolean).join(', ');
      var kind = typeSel.value && typeSel.value !== 'Other or not sure' ? typeSel.value : 'Mac';
      modelHid.value = inner ? kind + ' (' + inner + ')' : '';
    };
    [typeSel, sizeSel, periodSel, yearSel].forEach(function (s) { if (s) { s.addEventListener('change', syncModel); } });
    syncModel();

    var fieldId = function (el) {
      if (!el.id) { el.id = 'fld-' + el.name; }
      return el.id;
    };
    var errId = function (el) {
      return el.type === 'radio' || el.type === 'checkbox' ? 'e-' + el.name : 'e-' + (el.id || el.name);
    };
    var isBad = function (el) {
      if (el.disabled) { return false; }
      if (el.type === 'text' || el.tagName === 'TEXTAREA') {
        if (el.required && el.value.trim() === '') { return true; }
      }
      return !el.checkValidity();
    };
    var setError = function (els, msg) {
      var box = $('#' + errId(els[0]));
      els.forEach(function (el) { el.setAttribute('aria-invalid', 'true'); });
      if (box) { box.textContent = msg; box.hidden = false; }
    };
    var clearError = function (els) {
      var box = $('#' + errId(els[0]));
      els.forEach(function (el) { el.removeAttribute('aria-invalid'); });
      if (box) { box.textContent = ''; box.hidden = true; }
    };
    var renderSummary = function () {
      if (!summaryEl) { return; }
      if (shown.length === 0) { summaryEl.hidden = true; summaryEl.textContent = ''; return; }
      summaryEl.textContent = '';
      var h = doc.createElement('h2');
      h.textContent = shown.length === 1 ? 'There is 1 thing to fix' : 'There are ' + shown.length + ' things to fix';
      var ul = doc.createElement('ul');
      shown.forEach(function (it) {
        var li = doc.createElement('li');
        var a = doc.createElement('a');
        a.href = '#' + it.id;
        a.textContent = it.msg;
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var t = doc.getElementById(it.id);
          if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); }
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      summaryEl.appendChild(h);
      summaryEl.appendChild(ul);
      summaryEl.hidden = false;
    };
    var validate = function () {
      var found = [];
      var seenNames = {};
      $$('[required]', form).forEach(function (el) {
        if (el.type === 'radio') {
          if (seenNames[el.name]) { return; }
          seenNames[el.name] = true;
        }
        var group = el.type === 'radio' ? $$('input[name="' + el.name + '"]', form) : [el];
        if (isBad(el)) {
          var msg = el.getAttribute('data-err') || 'Please check this';
          setError(group, msg);
          found.push({ id: fieldId(group[0]), msg: msg });
        } else {
          clearError(group);
        }
      });
      // The bot check has to be done before sending (the booking system checks it again).
      var tsBox = $('#turnstile-box');
      var tsErr = $('#e-turnstile');
      if (tsBox && connected) {
        var tok = $('input[name="cf-turnstile-response"]', form);
        if (!tok || !tok.value) {
          var tm = 'Please complete the check that you\'re not a bot';
          if (tsErr) { tsErr.textContent = tm; tsErr.hidden = false; }
          found.push({ id: 'turnstile-box', msg: tm });
        } else if (tsErr) {
          tsErr.textContent = '';
          tsErr.hidden = true;
        }
      }
      // In "pick" mode, the Mac software upgrade has to be chosen (the others are add-ons to it).
      var svcBox = $('#e-svc');
      var macBox = $('#svc-mac');
      var modeEl = $('input[name="mode"]:checked', form);
      if (svcBox && macBox) {
        if (modeEl && modeEl.value === 'pick' && !macBox.checked) {
          var m = 'Choose the Mac software upgrade, or Go Full Neobitium';
          svcBox.textContent = m;
          svcBox.hidden = false;
          found.unshift({ id: 'svc-mac', msg: m });
        } else {
          svcBox.textContent = '';
          svcBox.hidden = true;
        }
      }
      return found;
    };
    form.addEventListener('submit', function (e) {
      var hp = $('input[name="company_website"]', form);
      if (hp && hp.value) {   // a robot filled the hidden field: pretend it worked
        e.preventDefault();
        location.href = form.getAttribute('data-thanks') || 'index.html';
        return;
      }
      syncModel();
      if (testNote) { testNote.hidden = true; }
      var sentNote = $('#sent-note');
      if (sentNote) { sentNote.hidden = true; }
      shown = validate();
      if (shown.length) {
        e.preventDefault();
        renderSummary();
        if (summaryEl) { summaryEl.focus(); summaryEl.scrollIntoView({ block: 'start' }); }
        return;
      }
      renderSummary();
      if (P) { renderEstimate(); }
      if (!connected) {
        e.preventDefault();
        if (testNote) { testNote.hidden = false; testNote.scrollIntoView({ block: 'center' }); }
        return;
      }
      sendBtns.forEach(function (b) { b.disabled = true; b.textContent = 'Sending...'; });
      // The reply opens in a new tab (the form has target="_blank"), so this page stays here. A bit later,
      // switch the buttons back on and get a fresh bot check (each one can only be used once), so
      // that if the other tab shows a problem, they can come back, fix it and send again.
      window.setTimeout(function () {
        sendBtns.forEach(function (b) { b.disabled = false; b.textContent = 'Send booking request'; });
        try { if (window.turnstile && $('#turnstile-box')) { window.turnstile.reset(); } } catch (err) { /* fine */ }
        var sent = $('#sent-note');
        if (sent) { sent.hidden = false; sent.scrollIntoView({ block: 'center' }); }
      }, 2000);
    });
    // Called by the bot check when it passes: clear its error message.
    window.neoVerified = function () {
      var eb = $('#e-turnstile');
      if (eb) { eb.textContent = ''; eb.hidden = true; }
      shown = shown.filter(function (it) { return it.id !== 'turnstile-box'; });
      renderSummary();
    };
    window.neoExpired = function () { /* the next press of Send asks for it again */ };
    var recheck = function (e) {
      var el = e.target;
      if (!el || !el.hasAttribute || el.getAttribute('aria-invalid') !== 'true') { return; }
      var group = el.type === 'radio' ? $$('input[name="' + el.name + '"]', form) : [el];
      if (!isBad(el)) {
        clearError(group);
        var id = fieldId(group[0]);
        shown = shown.filter(function (it) { return it.id !== id; });
        renderSummary();
      }
    };
    form.addEventListener('input', recheck);
    form.addEventListener('change', function (e) {
      recheck(e);
      // Ticking the upgrade (or choosing Go Full) clears the "choose a service" message.
      var svcBox = $('#e-svc');
      if (svcBox && !svcBox.hidden) {
        var macBox = $('#svc-mac');
        var modeEl = $('input[name="mode"]:checked', form);
        if ((macBox && macBox.checked) || (modeEl && modeEl.value === 'full')) {
          svcBox.hidden = true;
          shown = shown.filter(function (it) { return it.id !== 'svc-mac'; });
          renderSummary();
        }
      }
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) {
        sendBtns.forEach(function (b) { b.disabled = false; b.textContent = 'Send booking request'; });
      }
    });
  }

  if (form && P) {
    $$('input[name="mode"]', form).forEach(function (r) {
      r.addEventListener('change', function () {
        if (r.checked) { state.mode = r.value; syncMode(); }
      });
    });
    $$('input[name="svc"]', form).forEach(function (cb) {
      cb.addEventListener('change', function () {
        state.picked[cb.getAttribute('data-id')] = cb.checked;
        syncMode();
      });
    });
    if (location.hash === '#full') {
      var fullRadio = $('#mode-full');
      if (fullRadio) { fullRadio.checked = true; state.mode = 'full'; }
    }
    syncMode();
  }
})();
