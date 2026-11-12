/* AMAR SECONDARY SCHOOL - app logic.
   Real access control is done by the database (Row Level Security).
   Hiding a button here is only a convenience, never the protection. */
(function () {
  'use strict';

  var SCHOOL = 'AMAR SECONDARY SCHOOL';
  var DOMAIN = 'amar.school';
  var STR = window.AMAR_STRINGS;
  var cfg = window.AMAR_CONFIG || {};
  var configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/YOUR_/.test(cfg.SUPABASE_URL) && window.supabase);
  var db = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  var root = document.getElementById('app');
  var state = { lang: 'en', profile: null, stack: [], timeoutMin: 15, timer: null, child: null, children: [] };
  var signed = {};
  var installEvt = null;
  STR.en.parent_id = 'Parent mobile number'; if (STR.ne) STR.ne.parent_id = 'अभिभावकको मोबाइल नम्बर'; STR.en.parent_phone = 'Parent mobile number (this is the login ID)'; STR.en.more = 'More'; STR.en.marksEntry = 'Marks'; STR.en.results = 'Results'; STR.en.home = STR.en.home || 'Home'; STR.en.grade_sheet = 'Results & Ledger'; STR.en.exams_manage = 'Exams (create / publish)'; STR.en.student_codes = "Child's Student ID (several children: separate with commas)"; STR.en.subject_mgmt = 'Subjects'; STR.en.user_accounts = 'Logins (ID & password)'; if (STR.ne) STR.ne.more = STR.ne.more || 'थप';

  try { state.lang = localStorage.getItem('amar_lang') || 'en'; } catch (e) {}

  /* ---------- helpers ---------- */
  function t(k) { return (STR[state.lang] && STR[state.lang][k]) || STR.en[k] || k; }
  function sub(k) { return (STR[state.lang] && STR[state.lang]['s_' + k]) || STR.en['s_' + k] || ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function toast(msg, bad) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.className = 'toast' + (bad ? ' bad' : ''); el.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.hidden = true; }, 3500);
  }
  function must(res) { if (res.error) throw res.error; return res.data; }
  function errText(e) { return (e && e.message) ? e.message : t('err_generic'); }
  function roleLabel(r) { return t(r + '_login'); }
  function roleTitle(r) { return t(r === 'admin' ? 'card_school' : r === 'teacher' ? 'card_teacher' : 'card_student'); }

  function logo(size) { return '<img src="logo.png" width="' + size + '" height="' + size + '" alt="Amar Secondary School" style="border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);object-fit:cover">'; }

  function langToggle() {
    return '<div class="seg" data-lang-toggle>' +
      '<button data-l="en" class="' + (state.lang === 'en' ? 'on' : '') + '">English</button>' +
      '<button data-l="ne" class="' + (state.lang === 'ne' ? 'on' : '') + '">नेपाली</button></div>';
  }
  function bindLangToggle(el, after) {
    var box = $('[data-lang-toggle]', el);
    if (!box) return;
    box.addEventListener('click', function (e) {
      var l = e.target.getAttribute && e.target.getAttribute('data-l');
      if (l) setLanguage(l, after);
    });
  }
  function setLanguage(l, after) {
    state.lang = l;
    try { localStorage.setItem('amar_lang', l); } catch (e) {}
    if (state.profile) {
      try { localStorage.setItem('amar_lang_' + state.profile.id, l); } catch (e) {}
      db.from('users').update({ language: l }).eq('id', state.profile.id).then(function () {});
    }
    document.documentElement.lang = l === 'ne' ? 'ne' : 'en';
    after();
  }

  /* ---------- photos (private storage, short-lived links) ---------- */
  async function photoSrc(path) {
    var c = signed[path];
    if (c && c.exp > Date.now()) return c.url;
    try {
      var r = await db.storage.from('photos').createSignedUrl(path, 3600);
      if (r.error || !r.data) return '';
      signed[path] = { url: r.data.signedUrl, exp: Date.now() + 3300000 };
      return r.data.signedUrl;
    } catch (e) { return ''; }
  }
  function hydratePhotos(el) {
    el.querySelectorAll('[data-photo]').forEach(function (n) {
      var path = n.getAttribute('data-photo');
      if (!path) return;
      photoSrc(path).then(function (u) {
        if (!u) return;
        n.style.backgroundImage = 'url("' + u + '")';
        var s = n.querySelector('span'); if (s) s.remove();
      });
    });
  }
  function resizeImage(file, max) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('Image error')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { reject(new Error('This file is not an image')); };
      img.src = url;
    });
  }
  async function uploadPhoto(path, file) {
    var blob = await resizeImage(file, 500);
    must(await db.storage.from('photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' }));
    delete signed[path];
  }

  /* ---------- inactivity logout ---------- */
  function touch() {
    clearTimeout(state.timer);
    if (!state.profile) return;
    state.timer = setTimeout(function () { signOut(); }, state.timeoutMin * 60 * 1000);
  }
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, touch, { passive: true }); });

  /* ---------- auth ---------- */
  async function loadProfile(uid, expected) {
    var row = must(await db.from('users').select('id, role, login_id, full_name, full_name_ne, language, is_active').eq('id', uid).maybeSingle());
    if (!row) throw { key: 'err_invalid_login' };
    if (row.is_active !== true) throw { key: 'err_inactive' };
    if (expected && row.role !== expected) throw { key: 'err_wrong_role' };
    state.profile = row;
    var saved = null;
    try { saved = localStorage.getItem('amar_lang_' + uid); } catch (e) {}
    state.lang = saved || row.language || state.lang;
    try {
      var s = await db.from('schools').select('inactivity_timeout_minutes').maybeSingle();
      if (s.data && s.data.inactivity_timeout_minutes) state.timeoutMin = s.data.inactivity_timeout_minutes;
    } catch (e) {}
    if (row.role === 'parent') await loadChildren();
    touch();
  }

  async function signIn(role, loginId, password) {
    if (!configured) throw { key: 'err_not_configured' };
    var email = loginId.trim().toLowerCase() + '@' + DOMAIN;
    var res;
    try { res = await db.auth.signInWithPassword({ email: email, password: password }); }
    catch (e) { throw { key: 'err_network' }; }
    if (res.error) {
      var m = (res.error.message || '').toLowerCase();
      if (m.indexOf('banned') >= 0) throw { key: 'err_inactive' };
      if (m.indexOf('fetch') >= 0 || m.indexOf('network') >= 0) throw { key: 'err_network' };
      throw { key: 'err_invalid_login' };
    }
    try { await loadProfile(res.data.user.id, role); }
    catch (e) { await db.auth.signOut(); throw e.key ? e : { key: 'err_invalid_login' }; }
    db.from('login_history').insert({ user_id: res.data.user.id, success: true, device_info: navigator.userAgent.slice(0, 200) }).then(function () {});
  }

  async function signOut() {
    clearTimeout(state.timer);
    closeMenu();
    try { if (db) await db.auth.signOut(); } catch (e) {}
    state.profile = null; state.stack = []; state.child = null; state.children = [];
    showSelect();
  }

  /* ---------- download page (browser) ---------- */
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; });
  window.addEventListener('appinstalled', function () {
    installEvt = null;
    var m = document.getElementById('dlmsg'); if (m) m.textContent = STR.en.dl_done + '\n' + STR.ne.dl_done;
  });
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function showDownload() {
    root.innerHTML = '<div class="dl"><div>' + logo(130) + '</div><h1>' + SCHOOL + '</h1>' +
      '<button class="btn primary big" id="dlbtn">Download App · एप डाउनलोड</button><p class="muted" id="dlmsg"></p></div>';
    $('#dlbtn').addEventListener('click', function () {
      var msg = $('#dlmsg');
      if (installEvt) {
        installEvt.prompt();
        installEvt.userChoice.then(function (c) {
          installEvt = null;
          if (c && c.outcome === 'accepted') msg.textContent = STR.en.dl_done + '\n' + STR.ne.dl_done;
        });
        return;
      }
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      var k = ios ? 'dl_ios' : 'dl_android';
      msg.textContent = STR.en[k] + '\n\n' + STR.ne[k];
    });
  }

  /* ---------- pre-login screens ---------- */
  function showSplash() {
    root.innerHTML = '<div class="center">' + logo(120) + '<div class="school">' + SCHOOL + '</div></div>';
  }

  function showSelect() {
    var cards = [['teacher', '', 'card_teacher'], ['parent', '', 'card_student'], ['admin', '', 'card_school']];
    var h = '<div class="page"><div class="sel-top"><h2>Amar Secondary School</h2>' + langToggle() + '</div>' +
      '<div class="logocard">' + logo(150) + '<div class="school">' + SCHOOL + '</div></div><div class="rolegrid">';
    cards.forEach(function (c) {
      h += '<button class="rolecard" data-role="' + c[0] + '"><span class="e">' + iconSvg(c[0], c[1]) + '</span>' + esc(t(c[2])) + '</button>';
    });
    h += '</div>';
    if (!configured) h += '<div class="note">' + esc(t('err_not_configured')) + '</div>';
    h += '</div>';
    root.innerHTML = h;
    bindLangToggle(root, showSelect);
    root.querySelectorAll('[data-role]').forEach(function (b) {
      b.addEventListener('click', function () { showLogin(b.getAttribute('data-role')); });
    });
  }

  function showLogin(role) {
    var idKey = role === 'admin' ? 'school_id' : role === 'teacher' ? 'teacher_id' : 'parent_id';
    root.innerHTML = '<div class="appbar"><button class="icon" id="back">←</button><h2>' + esc(roleTitle(role)) + '</h2></div>' +
      '<div class="page"><div class="row" style="justify-content:flex-end">' + langToggle() + '</div>' +
      '<p class="muted">' + esc(t('login_help')) + '</p>' +
      '<form class="form" id="lf" novalidate>' +
      '<label>' + esc(t(idKey)) + '</label><input id="lid" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false">' +
      '<label>' + esc(t('password')) + '</label><input id="lpw" type="password" autocomplete="current-password">' +
      '<p class="err" id="lerr"></p><button class="btn primary" type="submit" id="lbtn">' + esc(t('login')) + '</button></form></div>';
    $('#back').onclick = showSelect;
    bindLangToggle(root, function () { showLogin(role); });
    $('#lf').addEventListener('submit', async function (e) {
      e.preventDefault();
      var id = $('#lid').value, pw = $('#lpw').value, err = $('#lerr'), btn = $('#lbtn');
      err.textContent = '';
      if (!id.trim() || !pw) { err.textContent = t('err_required'); return; }
      btn.disabled = true; btn.textContent = t('loading');
      try { await signIn(role, id, pw); showShell(); }
      catch (ex) { err.textContent = t(ex.key || 'err_generic'); btn.disabled = false; btn.textContent = t('login'); }
    });
  }

  /* ---------- shell: app bar, content, bottom bar ---------- */
  function showShell() {
    state.stack = []; hpush();
    root.innerHTML = '<div class="shell"><div id="appbar"></div><div id="content"></div><nav class="bottom" id="nav"></nav></div>';
    renderChrome(); renderContent();
  }

  function navFor(r) { return r === 'parent' ? [['home'], ['attendance'], ['homework'], ['results'], ['inbox']] : [['home'], ['attendance'], ['marksEntry'], ['homework'], ['notices']]; }

  function renderChrome() {
    var v = state.stack[state.stack.length - 1];
    var left = v ? '<button class="icon" id="back">←</button>' : '<span class="mini">' + logo(36) + '</span>';
    var title = v ? v.title() : roleTitle(state.profile.role);
    $('#appbar').innerHTML = '<div class="appbar">' + left + '<h2>' + esc(title) + '</h2><button class="icon" id="more" aria-label="menu">⋮</button></div>';
    var back = $('#back'); if (back) back.onclick = pop;
    $('#more').onclick = function (e) { e.stopPropagation(); if ($('#menu')) closeMenu(); else openMenu(); };

    var nav = $('#nav');
    var act = state.stack.length ? state.stack[0].navKey : 'home';
    nav.innerHTML = navFor(state.profile.role).map(function (n) {
      return '<button data-n="' + n[0] + '" class="' + (n[0] === act ? 'on' : '') + '"><span class="i">' + iconSvg(n[0], '') + '</span><em>' + esc(t(n[0])) + '</em></button>';
    }).join('');
    nav.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-n');
        closeMenu();
        if (key === 'home') { state.stack = []; }
        else {
          state.stack = [{ navKey: key, title: function () { return t(key); }, render: V(key) }]; hpush();
        }
        renderChrome(); renderContent();
      });
    });
  }

  function openMenu() {
    var m = document.createElement('div'); m.className = 'menu'; m.id = 'menu';
    m.innerHTML = '<div class="mi"><div class="muted sm" style="margin-bottom:6px">' + esc(t('language')) + '</div>' + langToggle() + '</div>' +
      '<div class="mi muted sm">' + esc(state.profile.full_name) + ' · ' + esc(state.profile.login_id) + '</div>' +
      '<button class="mi" id="mpw">' + esc(t('change_password')) + '</button>' +
      '<button class="mi out" id="mlo">' + esc(t('logout')) + '</button>';
    document.body.appendChild(m);
    bindLangToggle(m, function () { closeMenu(); renderChrome(); renderContent(); });
    $('#mpw', m).onclick = function () { closeMenu(); push({ title: function () { return t('change_password'); }, render: V('changePassword') }); };
    $('#mlo', m).onclick = function () { closeMenu(); if (confirm(t('confirm_logout'))) signOut(); };
    setTimeout(function () { document.addEventListener('click', outsideMenu); }, 0);
  }
  function outsideMenu(e) { var m = $('#menu'); if (m && !m.contains(e.target)) closeMenu(); }
  function closeMenu() {
    var m = $('#menu'); if (m) m.remove();
    document.removeEventListener('click', outsideMenu);
  }

  function hpush() { try { history.pushState({ a: 1 }, ''); } catch (e) {} }
  function push(view) { state.stack.push(view); hpush(); renderChrome(); renderContent(); }
  function pop() { if (!state.stack.length) return; state.stack.pop(); lk = null; state.skip = (state.skip || 0) + 1; try { history.back(); } catch (e) { state.skip--; } renderChrome(); renderContent(); }
  window.addEventListener('popstate', function () {
    if (!state.profile) return;
    if (state.skip > 0) { state.skip--; return; }
    if (state.stack.length) { state.stack.pop(); lk = null; closeMenu(); renderChrome(); renderContent(); return; }
    if (Date.now() - (state.exitT || 0) < 2000) return;       // second back press within 2 s: leave the app
    state.exitT = Date.now(); toast('Press back again to exit'); hpush();
  });

  function renderContent() {
    var c = $('#content');
    if (state.stack.length) {
      var v = state.stack[state.stack.length - 1];
      c.innerHTML = '<div class="pad" id="sub"></div>';
      Promise.resolve(v.render($('#sub'))).catch(function (e) { $('#sub').innerHTML = '<p class="err">' + esc(errText(e)) + '</p>'; });
      return;
    }
    c.innerHTML = '<div class="page" id="tab"></div>';
    Promise.resolve(tabHome($('#tab'))).catch(function (e) { $('#tab').innerHTML = '<p class="err">' + esc(errText(e)) + '</p>'; });
  }

  /* ---------- generic UI pieces ---------- */
  function emptyMsg(key) { return '<div class="empty">' + esc(t(key || 'nothing_here')) + '</div>'; }
  function irow(labelKey, val) {
    return val ? '<div class="irow"><b>' + esc(t(labelKey)) + '</b><span>' + esc(val) + '</span></div>' : '';
  }

  /* Form builder.  field = {name,label,type,required,options,dependsOn} */
  function mountForm(el, o) {
    var vals = o.values || {};
    function optsOf(f) { return typeof f.options === 'function' ? f.options(readValues()) : (f.options || []); }
    function optHtml(f, sel) {
      return '<option value=""></option>' + optsOf(f).map(function (op) {
        return '<option value="' + esc(op.value) + '"' + (String(op.value) === String(sel) ? ' selected' : '') + '>' + esc(op.label) + '</option>';
      }).join('');
    }
    function fieldHtml(f) {
      var v = vals[f.name] == null ? '' : vals[f.name];
      var lab = '<label>' + esc(t(f.label)) + (f.required ? ' *' : '') + '</label>';
      if (f.type === 'select') return lab + '<select name="' + f.name + '">' + optHtml(f, v) + '</select>';
      var hint = f.hint ? '<div class="muted sm" style="margin-top:4px">' + esc(t(f.hint)) + '</div>' : '';
      if (f.type === 'textarea') return lab + '<textarea name="' + f.name + '" rows="' + (f.rows || 3) + '">' + esc(v) + '</textarea>' + hint;
      if (f.type === 'file') return lab + '<input name="' + f.name + '" type="file" accept="image/*">';
      return lab + '<input name="' + f.name + '" type="' + (f.type || 'text') + '"' + (f.type === 'number' ? ' step="any" inputmode="decimal"' : '') +
        ' value="' + esc(v) + '" autocomplete="off">' + hint;
    }
    function readValues() {
      var out = {};
      o.fields.forEach(function (f) {
        var inp = el.querySelector('[name="' + f.name + '"]');
        if (f.type === 'file') out[f.name] = inp && inp.files ? (inp.files[0] || null) : null;
        else out[f.name] = inp ? inp.value : (vals[f.name] || '');
      });
      return out;
    }
    el.innerHTML = '<form class="form" novalidate>' + (o.intro || '') + o.fields.map(fieldHtml).join('') +
      '<p class="err" data-err></p><button class="btn primary" type="submit">' + esc(t(o.submitKey || 'save')) + '</button></form>';
    var form = $('form', el);
    form.addEventListener('change', function (e) {
      var name = e.target.getAttribute('name');
      o.fields.forEach(function (f) {
        if (f.dependsOn === name) {
          var sel = el.querySelector('[name="' + f.name + '"]');
          sel.innerHTML = optHtml(f, '');
        }
      });
    });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = $('[data-err]', el), btn = $('button[type=submit]', el), raw = readValues(), out = {};
      err.textContent = '';
      for (var i = 0; i < o.fields.length; i++) {
        var f = o.fields[i];
        if (f.type === 'file') { out[f.name] = raw[f.name]; continue; }
        var v = (raw[f.name] || '').trim();
        if (f.required && !v) { err.textContent = t(f.label) + ': ' + t('err_required'); return; }
        out[f.name] = v === '' ? null : (f.type === 'number' ? Number(v) : v);
      }
      btn.disabled = true;
      try { await o.onSubmit(out); }
      catch (ex) { err.textContent = errText(ex); btn.disabled = false; }
    });
  }

  function downloadCsv(name, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (c) { c = c == null ? '' : String(c); return '"' + c.replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); toast(t('export_done'));
  }

  /* ---------- role home screens ---------- */
  function V(name) { return function (el, a) { var f = AMAR.views[name]; return f ? f(el, a) : placeholder(el); }; }
  // groups: p = people, a = academics, o = operations, d = data & settings
  var ADMIN = [
    { k: 'student_records', i: '', g: 'p', view: viewStudents },
    { k: 'teacher_records', i: '', g: 'p', view: viewTeachers },
    { k: 'parent_info', more: 1, i: '', g: 'p', view: viewParents },
    { k: 'user_accounts', i: '', g: 'p', view: viewAccounts },
    { k: 'class_mgmt', i: '', g: 'a', view: viewClasses },
    { k: 'subject_mgmt', i: '📚', g: 'a', name: 'classSubjects' },
    { k: 'attendance', i: '', g: 'a', name: 'attendance' },
    { k: 'marks_entry', i: '', g: 'a', name: 'marksEntry' },
    { k: 'exams_manage', more: 1, i: '', g: 'a', name: 'exams' },
    { k: 'grade_sheet', i: '', g: 'a', name: 'resultsLedger' },
    { k: 'auto_reports', more: 1, i: '', g: 'a', name: 'reports' },
    { k: 'homework', i: '', g: 'a', name: 'homework' },
    { k: 'exam_routine', more: 1, i: '', g: 'a', name: 'examRoutine' },
    { k: 'class_routine', more: 1, i: '', g: 'a', name: 'timetable' },
    { k: 'fees', i: '', g: 'o', name: 'fees' },
    { k: 'notices', i: '', g: 'o', name: 'notices' },
    { k: 'calendar', i: '', g: 'o', name: 'calendar' },
    { k: 'staff_leave', more: 1, i: '', g: 'o', name: 'leave' },
    { k: 'import_export', i: '', g: 'd', name: 'dataHub' },
    { k: 'settings', i: '⚙', g: 'd', name: 'settings' }
  ];
  var TEACHER = [
    { k: 'my_classes', i: '', view: viewMyClasses },
    { k: 'student_records', i: '', view: function (el) { return viewStudents(el, true); } },
    { k: 'attendance', i: '', name: 'attendance' },
    { k: 'marks_entry', i: '', name: 'marksEntry' },
    { k: 'homework', i: '', name: 'homework' },
    { k: 'class_routine', i: '', name: 'timetable' },
    { k: 'notices', i: '', name: 'notices' },
    { k: 'calendar', more: 1, i: '', name: 'calendar' },
    { k: 'staff_leave', more: 1, i: '', name: 'leave' }
  ];
  var PARENT = [
    { k: 'teachers', i: '', view: viewChildTeachers },
    { k: 'homework', i: '', name: 'homework' },
    { k: 'attendance', i: '', name: 'attendance' },
    { k: 'examination', i: '', name: 'results' },
    { k: 'exam_routine', i: '', name: 'examRoutine' },
    { k: 'account', i: '', name: 'fees' },
    { k: 'calendar', i: '', name: 'calendar' },
    { k: 'timetable', i: '', name: 'timetable' },
    { k: 'inbox', i: '', name: 'inbox' }
  ];
  var GROUPS = { p: ['grp_people', 'g-blue'], a: ['grp_academics', 'g-green'], o: ['grp_operations', 'g-orange'], d: ['grp_data', 'g-purple'], x: ['', 'g-blue'] };
  var PALETTE = ['g-blue', 'g-green', 'g-purple', 'g-orange'];
  function ready(f) { return !!(f.view || (f.name && AMAR.views[f.name])); }

  var ICP = {
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.5 2.5 3.5 5.5"/>',
    cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/>',
    school: '<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M10 21v-6h4v6"/>',
    check: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12.5l3 3 5-6"/>',
    pencil: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    dots: '<circle class="f" cx="5" cy="12" r="1.8"/><circle class="f" cx="12" cy="12" r="1.8"/><circle class="f" cx="19" cy="12" r="1.8"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>',
    award: '<circle cx="12" cy="9" r="5"/><path d="M8.5 13.5L7 21l5-3 5 3-1.5-7.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>'
  };
  var ICK = { home: 'home', marksEntry: 'pencil', results: 'award', student_records: 'users', parent_info: 'users', teacher_records: 'cap', teachers: 'cap', user_accounts: 'key', class_mgmt: 'school', my_classes: 'school', subject_mgmt: 'book', attendance: 'check', marks_entry: 'pencil', exams_manage: 'file', grade_sheet: 'award', auto_reports: 'file', examination: 'file', exam_routine: 'file', homework: 'book', class_routine: 'clock', timetable: 'clock', fees: 'wallet', account: 'wallet', notices: 'bell', inbox: 'mail', calendar: 'calendar', staff_leave: 'calendar', import_export: 'upload', settings: 'gear', more: 'dots', admin: 'school', teacher: 'cap', parent: 'users' };
  function iconSvg(k, fb) { var p = ICP[ICK[k]]; return p ? '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>' : fb; }
  function tileHtml(f, i) {
    var cls = f.g ? GROUPS[f.g][1] : PALETTE[i % 4];
    return '<button class="tile" data-i="' + i + '" data-s="' + esc((t(f.k) + ' ' + sub(f.k)).toLowerCase()) + '">' +
      (ready(f) ? '' : '<span class="badge">' + esc(t('soon')) + '</span>') +
      '<span class="ico ' + cls + '">' + iconSvg(f.k, f.i) + '</span><b>' + esc(t(f.k)) + '</b><small>' + esc(sub(f.k)) + '</small></button>';
  }
  function tiles(list, grouped) {
    if (!grouped) return '<div class="grid">' + list.map(tileHtml).join('') + '</div>';
    var h = '';
    ['p', 'a', 'o', 'd'].forEach(function (g) {
      var items = list.map(function (f, i) { return [f, i]; }).filter(function (x) { return x[0].g === g; });
      if (!items.length) return;
      h += '<h3 class="grp ' + GROUPS[g][1] + '"><i></i>' + esc(t(GROUPS[g][0])) + '</h3><div class="grid">' +
        items.map(function (x) { return tileHtml(x[0], x[1]); }).join('') + '</div>';
    });
    return h;
  }
  function bindTiles(el, list) {
    el.querySelectorAll('.tile').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = list[+b.getAttribute('data-i')];
        push({ title: function () { return t(f.k); }, render: f.view || V(f.name) });
      });
    });
  }
  function bindMenuSearch(el) {
    var q = $('#msearch', el); if (!q) return;
    q.addEventListener('input', function () {
      var v = q.value.trim().toLowerCase();
      el.querySelectorAll('.tile').forEach(function (b) { b.style.display = !v || b.getAttribute('data-s').indexOf(v) >= 0 ? '' : 'none'; });
      el.querySelectorAll('.grp').forEach(function (h) {
        var g = h.nextElementSibling, any = g && Array.prototype.some.call(g.children, function (c) { return c.style.display !== 'none'; });
        h.style.display = g.style.display = any ? '' : 'none';
      });
    });
  }
  function placeholder(el) {
    el.innerHTML = '<div class="empty"><div style="font-size:56px">🛠</div><h3>' + esc(t('not_implemented')) + '</h3><p>' + esc(t('coming_in_phase')) + '</p></div>';
  }
  function viewInbox(el) { return V('inbox')(el); }

  async function count(table, filter) {
    var q = db.from(table).select('*', { count: 'exact', head: true });
    if (filter) q = filter(q);
    var r = await q; if (r.error) throw r.error; return r.count || 0;
  }

  async function tabHome(el) {
    var p = state.profile;
    var full = p.role === 'admin' ? ADMIN : p.role === 'teacher' ? TEACHER : PARENT;
    var rest = full.filter(function (f) { return f.more; }), list = full.filter(function (f) { return !f.more; });
    if (rest.length) list.push({ k: 'more', i: '⋯', view: function (e) { e.innerHTML = tiles(rest, false); bindTiles(e, rest); } });
    var search = '';
    el.innerHTML = '<div id="hdr"></div><div id="info"></div>' + search + '' + tiles(list, false);
    bindTiles(el, list); bindMenuSearch(el);
    var hdr = $('#hdr', el), info = $('#info', el);

    if (p.role === 'admin') {
      hdr.innerHTML = '<div class="hdr"><div class="ph" style="background:#fff">' + logo(80) + '</div>' +
        '<div class="hn">' + esc(p.full_name) + '</div><div class="hl">' + esc(roleLabel('admin')) + ' | ' + esc(t('id_label')) + ': ' + esc(p.login_id) + '</div>' +
        '<div class="hstats" id="st"></div></div>';
      var d = must(await db.rpc('dashboard_stats'));
      $('#st', el).innerHTML =
        '<div><b>' + d.students + '</b><span>' + esc(t('total_students')) + '</span></div>' +
        '<div><b>' + d.teachers + '</b><span>' + esc(t('total_teachers')) + '</span></div>' +
        '<div class="ok"><b>' + d.present_today + '</b><span>' + esc(t('present_today')) + '</span></div>';
      
    } else if (p.role === 'teacher') {
      var tr = must(await db.from('teachers').select('id, teacher_code, full_name, photo_url').eq('user_id', p.id).maybeSingle());
      var rows = tr ? must(await db.from('teacher_assignments').select('id, classes(name), sections(name), subjects(name)').eq('teacher_id', tr.id)) : [];
      hdr.innerHTML = '<div class="hdr"><div class="ph" data-photo="' + esc(tr && tr.photo_url) + '"><span class=\"av\"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg></span></div>' +
        '<div class="hn">' + esc(p.full_name) + '</div><div class="hl">' + esc(t('teacher_id')) + ': ' + esc(p.login_id) + '</div></div>';
      info.innerHTML = '<div class="info"><h3>' + esc(t('assignments')) + '</h3>' +
        (rows.length ? rows.map(function (r) {
          return '<span class="chip">' + esc(r.classes ? r.classes.name : '') + (r.sections ? ' ' + esc(r.sections.name) : '') +
            ' · ' + esc(r.subjects ? r.subjects.name : t('none')) + '</span>';
        }).join('') : emptyMsg()) + '</div>';
      hydratePhotos(el);
    } else {
      var c = currentChild();
      if (!c) { hdr.innerHTML = '<div class="note">' + esc(t('no_child')) + '</div>'; return; }
      var sw = '';
      if (state.children.length > 1) {
        sw = '<select data-child-switch>' + state.children.map(function (x) {
          return '<option value="' + x.id + '"' + (x.id === state.child ? ' selected' : '') + '>' + esc(x.full_name) + '</option>';
        }).join('') + '</select>';
      }
      hdr.innerHTML = '<div class="hdr"><div class="ph" data-photo="' + esc(c.photo_url) + '"><span class=\"av\"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg></span></div>' +
        '<div class="hn">' + esc(c.full_name) + '</div>' +
        '<div class="hl">' + esc(t('class')) + ': ' + esc(c.classes ? c.classes.name : '–') + (c.sections ? ' ' + esc(c.sections.name) : '') +
        (c.roll_no ? ' | ' + esc(t('roll')) + ' ' + esc(c.roll_no) : '') + '</div>' +
        '<div class="hl">' + esc(t('regd_no')) + ' ' + esc(c.student_code) + '</div>' + sw + '</div>';
      info.innerHTML = '<div class="info"><h3>' + esc(t('additional_info')) + '</h3>' +
        irow('guardian', c.guardian_name) + irow('contact_no', c.guardian_phone) + irow('address', c.address) +
        irow('house', c.house) + irow('blood_group_s', c.blood_group) + irow('emis_no', c.emis_no) + irow('dob', c.dob) + '</div>';
      hydratePhotos(el);
      var swEl = $('[data-child-switch]', el);
      if (swEl) swEl.addEventListener('change', function () { state.child = swEl.value; tabHome(el); });
    }
  }

  /* ---------- teacher views ---------- */
  function assignmentsHtml(rows, withDelete) {
    if (!rows.length) return emptyMsg();
    return rows.map(function (r) {
      return '<div class="card row between"><div><h4>' + esc(r.classes ? r.classes.name : '') + (r.sections ? ' – ' + esc(r.sections.name) : '') + '</h4>' +
        '<span class="chip">' + esc(r.subjects ? r.subjects.name : t('none')) + '</span></div>' +
        (withDelete ? '<button class="btn small danger" data-del="' + r.id + '">✕</button>' : '') + '</div>';
    }).join('');
  }
  async function viewMyClasses(el) {
    var tr = must(await db.from('teachers').select('id').eq('user_id', state.profile.id).maybeSingle());
    var rows = tr ? must(await db.from('teacher_assignments').select('id, classes(name), sections(name), subjects(name)').eq('teacher_id', tr.id)) : [];
    el.innerHTML = assignmentsHtml(rows);
  }

  /* ---------- parent views ---------- */
  async function loadChildren() {
    var pr = must(await db.from('parents').select('id').eq('user_id', state.profile.id).maybeSingle());
    state.children = [];
    if (pr) {
      var links = must(await db.from('parent_student_links').select('students(*, classes(name), sections(name))').eq('parent_id', pr.id));
      state.children = links.map(function (l) { return l.students; }).filter(Boolean);
    }
    var keep = state.child && state.children.filter(function (c) { return c.id === state.child; })[0];
    state.child = keep ? keep.id : (state.children[0] ? state.children[0].id : null);
  }
  function currentChild() { return state.children.filter(function (c) { return c.id === state.child; })[0]; }

  async function viewChildTeachers(el) {
    if (!state.child) { el.innerHTML = '<div class="note">' + esc(t('no_child')) + '</div>'; return; }
    var rows = must(await db.rpc('parent_child_teachers', { p_student: state.child }));
    var ne = state.lang === 'ne';
    el.innerHTML = rows.length ? rows.map(function (r) {
      var subj = ne ? (r.subject_name_ne || r.subject_name) : r.subject_name;
      return '<div class="card row"><div class="ph sm" data-photo="' + esc(r.photo_path) + '"><span class=\"av\"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg></span></div><div><h4>' +
        esc(r.teacher_name) + '</h4>' + (subj ? '<span class="chip">' + esc(subj) + '</span>' : '') + '</div></div>';
    }).join('') : emptyMsg();
    hydratePhotos(el);
  }

  /* ---------- admin: classes & sections ---------- */
  async function viewClasses(el) {
    var cls = must(await db.from('classes').select('id, name, name_ne, level').order('level'));
    var secs = must(await db.from('sections').select('id, class_id, name').order('name'));
    var h = '<button class="btn primary" id="addc" style="margin-bottom:12px">＋ ' + esc(t('add_class')) + '</button>';
    if (!cls.length) h += emptyMsg();
    cls.forEach(function (c) {
      var mine = secs.filter(function (s) { return s.class_id === c.id; });
      h += '<div class="card"><div class="row between"><h4>' + esc(c.name) + (c.name_ne ? ' · ' + esc(c.name_ne) : '') + '</h4>' +
        '<button class="btn small" data-sec="' + c.id + '">＋ ' + esc(t('section')) + '</button></div><div>' +
        (mine.length ? mine.map(function (s) { return '<span class="chip">' + esc(s.name) + '</span>'; }).join('') : '<span class="muted">' + esc(t('no_sections')) + '</span>') + '</div></div>';
    });
    el.innerHTML = h;
    $('#addc', el).onclick = function () {
      push({ title: function () { return t('add_class'); }, render: function (e) {
        mountForm(e, { fields: [
          { name: 'name', label: 'class_name', required: true }, { name: 'name_ne', label: 'class_name_ne' },
          { name: 'level', label: 'level', type: 'number', required: true }],
          onSubmit: async function (v) {
            var sch = must(await db.from('schools').select('id').limit(1).maybeSingle());
            must(await db.from('classes').insert({ school_id: sch.id, name: v.name, name_ne: v.name_ne, level: v.level }));
            toast(t('saved')); pop();
          } });
      } });
    };
    el.querySelectorAll('[data-sec]').forEach(function (b) {
      b.onclick = function () {
        var cid = b.getAttribute('data-sec');
        push({ title: function () { return t('add_section'); }, render: function (e) {
          mountForm(e, { fields: [{ name: 'name', label: 'section_name', required: true }],
            onSubmit: async function (v) { must(await db.from('sections').insert({ class_id: cid, name: v.name })); toast(t('saved')); pop(); } });
        } });
      };
    });
  }

  /* ---------- admin: subjects ---------- */
  async function viewSubjects(el) {
    var rows = must(await db.from('subjects').select('id, name, name_ne').order('name'));
    el.innerHTML = '<button class="btn primary" id="adds" style="margin-bottom:12px">＋ ' + esc(t('add_subject')) + '</button>' +
      (rows.length ? rows.map(function (r) { return '<div class="card"><h4>' + esc(r.name) + '</h4><div class="muted">' + esc(r.name_ne || '') + '</div></div>'; }).join('') : emptyMsg());
    $('#adds', el).onclick = function () {
      push({ title: function () { return t('add_subject'); }, render: function (e) {
        mountForm(e, { fields: [{ name: 'name', label: 'subject_name', required: true }, { name: 'name_ne', label: 'subject_name_ne' }],
          onSubmit: async function (v) {
            var sch = must(await db.from('schools').select('id').limit(1).maybeSingle());
            must(await db.from('subjects').insert({ school_id: sch.id, name: v.name, name_ne: v.name_ne }));
            toast(t('saved')); pop();
          } });
      } });
    };
  }

  /* ---------- students (admin: manage / teacher: read only) ---------- */
  async function viewStudents(el, ro) {
    var rows = must(await db.from('students').select('*, classes(name), sections(name)').order('full_name'));
    var cls = must(await db.from('classes').select('id, name').order('level'));
    if (ro) cls = cls.filter(function (c) { return rows.some(function (r) { return r.class_id === c.id; }); });
    el.innerHTML = (ro ? '' : '<div class="row" style="margin-bottom:10px"><button class="btn primary" id="adds" style="flex:1">＋ ' + esc(t('add_student')) + '</button>' +
      '<button class="btn small" id="prom">⬆</button></div>') +
      '<input class="search" id="q" placeholder="' + esc(t('search')) + '">' +
      '<select class="search" id="cf"><option value="">' + esc(t('all')) + ' – ' + esc(t('class')) + '</option>' +
      cls.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') + '</select>' +
      '<select class="search" id="sf"><option value="active">' + esc(t('active')) + '</option><option value="transferred">' + esc(t('transferred')) +
      '</option><option value="archived">' + esc(t('archived')) + '</option><option value="">' + esc(t('status_all')) + '</option></select>' +
      '<div id="list"></div><button class="btn small" id="exp" style="margin-top:8px">' + esc(t('export_csv')) + '</button>';
    var filtered = rows;
    function draw() {
      var q = $('#q', el).value.trim().toLowerCase(), cf = $('#cf', el).value, sf = $('#sf', el).value;
      filtered = rows.filter(function (r) {
        return (!cf || r.class_id === cf) && (!sf || r.status === sf) &&
          (!q || (r.full_name || '').toLowerCase().indexOf(q) >= 0 || (r.full_name_ne || '').indexOf(q) >= 0 || (r.student_code || '').toLowerCase().indexOf(q) >= 0);
      });
      $('#list', el).innerHTML = filtered.length ? filtered.map(function (r) {
        return '<div class="card tap" data-id="' + r.id + '"><h4>' + esc(r.full_name) + (r.full_name_ne ? ' · ' + esc(r.full_name_ne) : '') + '</h4>' +
          '<div class="muted">' + esc(r.student_code) + ' · ' + esc(r.classes ? r.classes.name : '–') + (r.sections ? ' ' + esc(r.sections.name) : '') +
          (r.roll_no ? ' · ' + esc(t('roll')) + ' ' + esc(r.roll_no) : '') + '</div>' +
          '<span class="chip ' + (r.status === 'active' ? 'ok' : 'bad') + '">' + esc(t(r.status)) + '</span></div>';
      }).join('') : emptyMsg('no_results');
      el.querySelectorAll('#list .card').forEach(function (c) {
        c.classList.add('tap');
        c.onclick = function () {
          var r = rows.filter(function (x) { return x.id === c.getAttribute('data-id'); })[0];
          studentProfile(r, ro);
        };
      });
    }
    draw();
    $('#q', el).addEventListener('input', draw); $('#cf', el).addEventListener('change', draw); $('#sf', el).addEventListener('change', draw);
    if (!ro) {
      $('#adds', el).onclick = function () { studentForm(null); };
      $('#prom', el).onclick = promoteView;
    }
    if (!ro) { var da = document.createElement('button'); da.className = 'btn danger'; da.style.cssText = 'width:100%;margin-top:14px'; da.textContent = 'Delete ALL students';
      da.onclick = async function () { if (prompt('This deletes ALL students and their records (marks, attendance, fees). Type DELETE to confirm.') !== 'DELETE') return;
        try { must(await db.from('students').delete().not('id', 'is', null)); toast('All students deleted'); pop(); } catch (e) { toast(errText(e), true); } };
      $('#exp', el).insertAdjacentElement('afterend', da); }
    $('#exp', el).onclick = function () {
      downloadCsv('students.csv', [['Student ID', 'Admission No', 'Name', 'Name (Nepali)', 'Class', 'Section', 'Roll', 'House', 'EMIS', 'Guardian', 'Guardian phone', 'Status']]
        .concat(filtered.map(function (r) { return [r.student_code, r.admission_no, r.full_name, r.full_name_ne, r.classes && r.classes.name, r.sections && r.sections.name, r.roll_no, r.house, r.emis_no, r.guardian_name, r.guardian_phone, r.status]; })));
    };
  }

  /* Full student profile page (teachers see it for their own classes; admin can also edit / delete) */
  function studentProfile(r, ro) {
    push({ title: function () { return r.full_name; }, render: async function (el) {
      var so = []; try { so = must(await db.from('student_optionals').select('slot, subjects(name)').eq('student_id', r.id).order('slot')); } catch (e) {}
      function row(l, v, tel) { return v ? '<div class="irow"><span>' + l + '</span><b>' + (tel ? '<a href="tel:' + esc(v) + '">' + esc(v) + '</a>' : esc(v)) + '</b></div>' : ''; }
      var cl = (r.classes ? r.classes.name : '–') + (r.sections ? ' ' + r.sections.name : '');
      el.innerHTML = '<div class="hdr"><div class="ph" data-photo="' + esc(r.photo_url) + '"><span class=\"av\"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg></span></div><div class="hn">' + esc(r.full_name) + '</div><div class="hl">' + esc(r.full_name_ne || '') + '</div><div class="hl">' + esc(cl) + (r.roll_no ? ' · Roll ' + esc(r.roll_no) : '') + '</div></div>' +
        '<div class="card info">' + row('Student ID', r.student_code) + row('Admission no', r.admission_no) + row('EMIS no', r.emis_no) + row('Gender', r.gender) + row('Date of birth (BS)', r.dob_bs) + row('Date of birth (AD)', r.dob) + row('Blood group', r.blood_group) + row('House', r.house) +
        row('Father', r.father_name) + row('Mother', r.mother_name) + row('Guardian', r.guardian_name) + row('Guardian phone', r.guardian_phone, 1) + row('Emergency phone', r.emergency_phone, 1) + row('Address', r.address) + row('Previous school', r.previous_school) + row('Status', r.status) +
        so.map(function (x) { return row('Optional ' + (x.slot === 1 ? 'I' : 'II'), x.subjects && x.subjects.name); }).join('') + '</div><div id="pa"></div>';
      hydratePhotos(el);
      var acts = ro ? [] : [{ icon: '✏', label: t('edit'), fn: function () { studentForm(r); } }];
      if (AMAR.studentActions) acts = acts.concat(AMAR.studentActions(r, ro));
      var pa = $('#pa', el);
      acts.forEach(function (a) { var b = document.createElement('button'); b.className = 'btn'; b.style.cssText = 'width:100%;margin-top:8px'; b.textContent = a.icon + ' ' + a.label; b.onclick = a.fn; pa.appendChild(b); });
      if (!ro) { var d = document.createElement('button'); d.className = 'btn danger'; d.style.cssText = 'width:100%;margin-top:8px'; d.textContent = 'Delete this student';
        d.onclick = async function () { if (!confirm('Delete ' + r.full_name + ' and all their records? This cannot be undone.')) return; try { must(await db.from('students').delete().eq('id', r.id)); toast('Deleted'); pop(); } catch (e) { toast(errText(e), true); } }; pa.appendChild(d); }
    } });
  }

  function promoteView() {
    push({ title: function () { return t('promote'); }, render: async function (e) {
      var cls = must(await db.from('classes').select('id, name').order('level'));
      var opts = cls.map(function (c) { return { value: c.id, label: c.name }; });
      mountForm(e, {
        intro: '<div class="note">' + esc(t('promote_confirm')) + '</div>',
        fields: [{ name: 'from_class', label: 'from_class', type: 'select', required: true, options: opts },
                 { name: 'to_class', label: 'to_class', type: 'select', required: true, options: opts }],
        submitKey: 'promote',
        onSubmit: async function (v) {
          var n = must(await db.rpc('admin_promote_students', { p_from: v.from_class, p_to: v.to_class }));
          toast(t('promoted_n') + ': ' + n); pop();
        }
      });
    } });
  }

  function studentForm(existing) {
    push({ title: function () { return t(existing ? 'edit_student' : 'add_student'); }, render: async function (e) {
      var cls = must(await db.from('classes').select('id, name').order('level'));
      var secs = must(await db.from('sections').select('id, class_id, name').order('name'));
      var fields = [
        { name: 'photo', label: 'photo', type: 'file' },
        { name: 'student_code', label: 'student_code', required: true }, { name: 'admission_no', label: 'admission_no' },
        { name: 'full_name', label: 'full_name', required: true }, { name: 'full_name_ne', label: 'full_name_ne' },
        { name: 'dob', label: 'dob', type: 'date' },
        { name: 'gender', label: 'gender', type: 'select', options: [{ value: 'male', label: t('male') }, { value: 'female', label: t('female') }, { value: 'other', label: t('other') }] },
        { name: 'blood_group', label: 'blood_group' }, { name: 'address', label: 'address' },
        { name: 'class_id', label: 'class', type: 'select', options: cls.map(function (c) { return { value: c.id, label: c.name }; }) },
        { name: 'section_id', label: 'section', type: 'select', dependsOn: 'class_id', options: function (v) {
          return secs.filter(function (s) { return s.class_id === v.class_id; }).map(function (s) { return { value: s.id, label: s.name }; }); } },
        { name: 'roll_no', label: 'roll_no', type: 'number' }, { name: 'admission_date', label: 'admission_date', type: 'date' },
        { name: 'house', label: 'house' }, { name: 'emis_no', label: 'emis_no' },
        { name: 'previous_school', label: 'previous_school' }, { name: 'guardian_name', label: 'guardian_name' },
        { name: 'guardian_phone', label: 'guardian_phone' }, { name: 'emergency_phone', label: 'emergency_phone' },
        { name: 'status', label: 'status', type: 'select', options: [{ value: 'active', label: t('active') }, { value: 'transferred', label: t('transferred') }, { value: 'archived', label: t('archived') }] }
      ];
      mountForm(e, { fields: fields, values: existing || { status: 'active' }, onSubmit: async function (v) {
        var file = v.photo; delete v.photo;
        if (!v.status) v.status = 'active';
        var id;
        if (existing) { must(await db.from('students').update(v).eq('id', existing.id)); id = existing.id; }
        else { id = must(await db.from('students').insert(v).select('id').single()).id; }
        if (file) {
          try {
            var path = 'students/' + id + '.jpg';
            await uploadPhoto(path, file);
            must(await db.from('students').update({ photo_url: path }).eq('id', id));
          } catch (ex) { toast(t('photo_failed') + ': ' + errText(ex), true); pop(); return; }
        }
        toast(t('saved')); pop();
      } });
    } });
  }

  /* ---------- admin: teachers ---------- */
  async function viewTeachers(el) {
    var rows = must(await db.from('teachers').select('id, user_id, teacher_code, full_name, full_name_ne, phone, address, photo_url').order('full_name'));
    el.innerHTML = '<button class="btn primary" id="addt" style="margin-bottom:12px">＋ ' + esc(t('add_teacher')) + '</button>' +
      (rows.length ? rows.map(function (r) {
        return '<div class="card tap row" data-id="' + r.id + '"><div class="ph sm" data-photo="' + esc(r.photo_url) + '"><span class=\"av\"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg></span></div><div><h4>' +
          esc(r.full_name) + (r.full_name_ne ? ' · ' + esc(r.full_name_ne) : '') + '</h4><div class="muted">' + esc(r.teacher_code) + (r.phone ? ' · ' + esc(r.phone) : '') + '</div></div></div>';
      }).join('') : emptyMsg());
    hydratePhotos(el);
    $('#addt', el).onclick = function () { createAccountView('teacher'); };
    el.querySelectorAll('.card.tap').forEach(function (c) {
      c.onclick = function () { teacherDetail(rows.filter(function (r) { return r.id === c.getAttribute('data-id'); })[0]); };
    });
  }

  /* One login per parent mobile number (taken from the students' guardian phone). Parent signs in with that number + the password the admin sets. */
  function parentsFromStudents() {
    push({ title: function () { return 'Parent logins'; }, render: async function (e) {
      e.innerHTML = '<div class="empty">Loading…</div>';
      var studs = [], from = 0, r;
      do { r = must(await db.from('students').select('student_code,full_name,guardian_name,guardian_phone').eq('status', 'active').range(from, from + 999)); studs = studs.concat(r); from += 1000; } while (r.length === 1000);
      var have = {}; must(await db.from('users').select('login_id').eq('role', 'parent')).forEach(function (x) { have[x.login_id.toLowerCase()] = 1; });
      var by = {}, bad = 0, none = 0;
      studs.forEach(function (s) {
        var p = String(s.guardian_phone || '').replace(/\D/g, '');
        if (!p) { none++; return; } if (p.length < 9 || p.length > 10) { bad++; return; }
        var g = by[p] = by[p] || { phone: p, name: String(s.guardian_name || '').replace(/\s+/g, ' ').trim(), first: s.full_name, codes: [], names: {} }; g.codes.push(s.student_code); g.names[String(s.guardian_name || '').toLowerCase().replace(/\s+/g, ' ').trim() || 'unknown'] = 1;
      });
      var shared = 0; Object.keys(by).forEach(function (p) { if (Object.keys(by[p].names).length > 1) { shared++; delete by[p]; } });   // a number used by different families is not safe for a login
      var fresh = Object.keys(by).filter(function (p) { return !have[p]; }).map(function (p) { return by[p]; });
      e.innerHTML = '<div class="note">Each parent signs in with their <b>mobile number</b> and a <b>password you set here</b>. One number = one login, even with several children.</div>' +
        '<div class="card"><b>' + fresh.length + '</b> new parent logins can be made<br><span class="muted sm">' + (Object.keys(by).length - fresh.length) + ' already exist · ' + none + ' students have no phone number · ' + bad + ' have a wrong number (not 9–10 digits) · ' + shared + ' numbers are shared by different families (skipped for safety)</span></div>' +
        (fresh.length ? '<div class="form"><label>Password for all these parents (min 8 characters). Leave empty to make a different one for each parent.</label><input id="ppw"><button class="btn primary" id="pgo">Create ' + fresh.length + ' parent logins</button></div><div id="pout"></div>' : '');
      var go = $('#pgo', e); if (!go) return;
      go.onclick = async function () {
        var pw = $('#ppw', e).value.trim(); if (pw && pw.length < 8) return toast('Password must be at least 8 characters', true);
        if (!confirm('Create ' + fresh.length + ' parent logins?')) return;
        go.disabled = true; go.textContent = 'Working…';
        var rows = fresh.map(function (g) { return { login_id: g.phone, password: pw || ('Amar' + Math.floor(1000 + Math.random() * 9000)), full_name: g.name || ('Parent of ' + g.first), full_name_ne: '', phone: g.phone, address: '', student_codes: g.codes.join(', ') }; });
        var ok = 0, fails = [], done = [];
        try {
          for (var i = 0; i < rows.length; i += 40) {
            var grp = rows.slice(i, i + 40), res = must(await db.rpc('admin_bulk_create_accounts', { p_role: 'parent', p_rows: grp }));
            res.forEach(function (x) { if (x.ok) { ok++; done.push(grp[x.row - 1]); } else fails.push(grp[x.row - 1].login_id + ': ' + x.error); });
          }
        } catch (ex) { fails.push(errText(ex)); }
        $('#pout', e).innerHTML = '<div class="note ok">✓ ' + ok + ' parent logins created' + (fails.length ? ' · ' + fails.length + ' failed' : '') + '</div>' + fails.slice(0, 20).map(function (f) { return '<div class="card err">' + esc(f) + '</div>'; }).join('') +
          '<button class="btn primary" id="pdl">Download list (mobile number + password)</button>';
        $('#pdl', e).onclick = function () { downloadCsv('parent-logins.csv', [['Mobile number (login)', 'Parent', 'Password', 'Student IDs']].concat(done.map(function (d) { return [d.login_id, d.full_name, d.password, d.student_codes]; }))); };
        go.remove();
      };
    } });
  }

  function createAccountView(role) {
    var nice = { teacher: 'Teacher', parent: 'Parent', admin: 'Admin' }[role];
    var help = { teacher: 'This teacher signs in with the Login ID and Password below.', parent: 'The parent signs in with the Login ID and Password below. Type the child’s Student ID so the parent can see the child.', admin: 'An Admin can manage everything. Give this only to trusted people.' }[role];
    push({ title: function () { return 'New ' + nice + ' login'; }, render: function (e) {
      var fields = [{ name: 'full_name', label: 'full_name', required: true }, { name: 'login_id', label: role === 'parent' ? 'parent_phone' : 'login_id', required: true }, { name: 'password', label: 'new_password', required: true }, { name: 'phone', label: 'phone' }];
      if (role === 'parent') fields.push({ name: 'student_codes', label: 'student_codes' });
      e.innerHTML = '<div class="note"><b>' + nice + '</b> – ' + help + ' Password: at least 8 characters.</div><div id="cf"></div>';
      mountForm($('#cf', e), { fields: fields, onSubmit: async function (v) {
        if (role === 'parent') {
          var r = must(await db.rpc('admin_bulk_create_accounts', { p_role: 'parent', p_rows: [{ login_id: v.login_id, password: v.password, full_name: v.full_name, full_name_ne: '', phone: v.phone || '', address: '', student_codes: v.student_codes || '' }] }));
          if (r && r[0] && !r[0].ok) throw new Error(r[0].error);
        } else {
          must(await db.rpc('admin_create_account', { p_role: role, p_login_id: v.login_id, p_password: v.password, p_full_name: v.full_name, p_full_name_ne: null, p_phone: v.phone || null, p_address: null }));
        }
        toast(t('account_created')); pop();
      } });
    } });
  }

  function teacherDetail(tr) {
    push({ title: function () { return tr.full_name; }, render: async function (el) {
      async function draw() {
        var rows = must(await db.from('teacher_assignments').select('id, classes(name), sections(name), subjects(name)').eq('teacher_id', tr.id));
        el.innerHTML = '<div class="card row"><div class="ph sm" data-photo="' + esc(tr.photo_url) + '"><span class=\"av\"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg></span></div><div style="flex:1"><h4>' + esc(tr.full_name) +
          '</h4><div class="muted">ID: ' + esc(tr.teacher_code) + '</div>' + (tr.phone ? '<div class="muted"><a href="tel:' + esc(tr.phone) + '">' + esc(tr.phone) + '</a></div>' : '') + (tr.address ? '<div class="muted">' + esc(tr.address) + '</div>' : '') + '</div></div>' +
          '<label class="btn small" style="display:inline-block;margin-bottom:12px">' + esc(t('change_photo')) + '<input id="tph" type="file" accept="image/*" hidden></label>' +
          '<h3>' + esc(t('assignments')) + '</h3>' + assignmentsHtml(rows, true) +
          '<button class="btn primary" id="adda" style="margin-top:8px">＋ ' + esc(t('add_assignment')) + '</button><button class="btn danger" id="delt" style="margin-top:8px;width:100%">Delete this teacher</button>';
        hydratePhotos(el);
        $('#tph', el).addEventListener('change', async function (ev) {
          var f = ev.target.files[0]; if (!f) return;
          try {
            var path = 'teachers/' + tr.id + '.jpg';
            await uploadPhoto(path, f);
            must(await db.from('teachers').update({ photo_url: path }).eq('id', tr.id));
            tr.photo_url = path; toast(t('saved')); draw();
          } catch (ex) { toast(errText(ex), true); }
        });
        el.querySelectorAll('[data-del]').forEach(function (b) {
          b.onclick = async function () { try { must(await db.from('teacher_assignments').delete().eq('id', b.getAttribute('data-del'))); draw(); } catch (e) { toast(errText(e), true); } };
        });
        $('#delt', el).onclick = async function () { if (!confirm('Delete teacher ' + tr.full_name + ' and their login? This cannot be undone.')) return;
          try { if (tr.user_id) must(await db.rpc('admin_delete_account', { p_user: tr.user_id })); else must(await db.from('teachers').delete().eq('id', tr.id)); toast('Deleted'); pop(); } catch (e) { toast(errText(e), true); } };
        $('#adda', el).onclick = function () {
          push({ title: function () { return t('add_assignment'); }, render: async function (e) {
            var cls = must(await db.from('classes').select('id, name').order('level'));
            var secs = must(await db.from('sections').select('id, class_id, name').order('name'));
            var subs = must(await db.from('subjects').select('id, name').order('name'));
            mountForm(e, { fields: [
              { name: 'class_id', label: 'class', type: 'select', required: true, options: cls.map(function (c) { return { value: c.id, label: c.name }; }) },
              { name: 'section_id', label: 'section', type: 'select', dependsOn: 'class_id', options: function (v) {
                return secs.filter(function (s) { return s.class_id === v.class_id; }).map(function (s) { return { value: s.id, label: s.name }; }); } },
              { name: 'subject_id', label: 'subject', type: 'select', options: subs.map(function (s) { return { value: s.id, label: s.name }; }) }],
              onSubmit: async function (v) {
                must(await db.from('teacher_assignments').insert({ teacher_id: tr.id, class_id: v.class_id, section_id: v.section_id, subject_id: v.subject_id }));
                toast(t('saved')); pop(); draw();
              } });
          } });
        };
      }
      await draw();
    } });
  }

  /* ---------- admin: parents ---------- */
  async function viewParents(el) {
    var rows = must(await db.from('parents').select('id, parent_code, full_name, phone').order('full_name'));
    el.innerHTML = '<button class="btn primary" id="addp" style="margin-bottom:12px">＋ ' + esc(t('add_parent')) + '</button>' +
      (rows.length ? rows.map(function (r) {
        return '<div class="card tap" data-id="' + r.id + '"><h4>' + esc(r.full_name) + '</h4><div class="muted">' + esc(r.parent_code) + (r.phone ? ' · ' + esc(r.phone) : '') + '</div></div>';
      }).join('') : emptyMsg());
    $('#addp', el).onclick = function () { createAccountView('parent'); };
    el.querySelectorAll('.card.tap').forEach(function (c) {
      c.onclick = function () { parentDetail(rows.filter(function (r) { return r.id === c.getAttribute('data-id'); })[0]); };
    });
  }

  function parentDetail(pr) {
    push({ title: function () { return pr.full_name; }, render: async function (el) {
      async function draw() {
        var links = must(await db.from('parent_student_links').select('student_id, students(full_name, student_code)').eq('parent_id', pr.id));
        el.innerHTML = '<div class="card"><h4>' + esc(pr.full_name) + '</h4><div class="muted">' + esc(pr.parent_code) + '</div></div>' +
          '<h3>' + esc(t('linked_students')) + '</h3>' +
          (links.length ? links.map(function (l) {
            return '<div class="card row between"><div><h4>' + esc(l.students ? l.students.full_name : '') + '</h4><div class="muted">' + esc(l.students ? l.students.student_code : '') + '</div></div>' +
              '<button class="btn small danger" data-un="' + l.student_id + '">' + esc(t('unlink')) + '</button></div>';
          }).join('') : emptyMsg()) +
          '<button class="btn primary" id="lnk" style="margin-top:8px">＋ ' + esc(t('link_student')) + '</button>';
        el.querySelectorAll('[data-un]').forEach(function (b) {
          b.onclick = async function () { try { must(await db.from('parent_student_links').delete().eq('parent_id', pr.id).eq('student_id', b.getAttribute('data-un'))); draw(); } catch (e) { toast(errText(e), true); } };
        });
        $('#lnk', el).onclick = function () {
          push({ title: function () { return t('link_student'); }, render: async function (e) {
            var sts = must(await db.from('students').select('id, full_name, student_code').eq('status', 'active').order('full_name'));
            mountForm(e, { fields: [{ name: 'student_id', label: 'student', type: 'select', required: true,
              options: sts.map(function (s) { return { value: s.id, label: s.full_name + ' (' + s.student_code + ')' }; }) }],
              onSubmit: async function (v) {
                must(await db.from('parent_student_links').insert({ parent_id: pr.id, student_id: v.student_id }));
                toast(t('saved')); pop(); draw();
              } });
          } });
        };
      }
      await draw();
    } });
  }

  /* ---------- admin: user accounts ---------- */
  async function viewAccounts(el) {
    var tab = state.accTab || 'teacher', NAMES = { teacher: 'Teachers', parent: 'Parents', admin: 'Admins' }, ONE = { teacher: 'Teacher', parent: 'Parent', admin: 'Admin' };
    var all = must(await db.from('users').select('id, role, login_id, full_name, is_active').order('full_name'));
    var rows = all.filter(function (r) { return r.role === tab; });
    el.innerHTML = '<div class="seg" id="atabs" style="display:flex">' + ['teacher', 'parent', 'admin'].map(function (r) {
      return '<button style="flex:1" data-r="' + r + '" class="' + (r === tab ? 'on' : '') + '">' + NAMES[r] + ' (' + all.filter(function (x) { return x.role === r; }).length + ')</button>'; }).join('') + '</div>' +
      '<div class="note">Everyone signs in with a <b>Login ID</b> and a <b>Password</b>. Tap the blue button to make a new ' + ONE[tab].toLowerCase() + ' login.</div>' +
      (tab === 'parent' ? '<button class="btn primary" id="apf" style="margin-bottom:10px">Make parent logins from students’ phone numbers</button>' : '') +
      '<button class="btn' + (tab === 'parent' ? '' : ' primary') + '" id="adma" style="margin-bottom:12px">＋ Add one ' + ONE[tab] + ' login</button>' +
      (tab !== 'admin' && rows.length ? '<button class="btn danger" id="dall" style="margin:0 0 12px;width:100%">Delete ALL ' + NAMES[tab].toLowerCase() + ' (' + rows.length + ')</button>' : '') +
      (rows.length ? rows.map(function (r) {
        var me = r.id === state.profile.id;
        return '<div class="card"><div class="row between"><div><h4>' + esc(r.full_name) + '</h4><div class="muted sm">Login ID: <b>' + esc(r.login_id) + '</b></div></div>' +
          '<span class="chip ' + (r.is_active ? 'ok' : 'bad') + '">' + esc(t(r.is_active ? 'active' : 'inactive')) + '</span></div>' +
          '<div class="row" style="margin-top:10px"><button class="btn small" data-rp="' + r.id + '">New password</button>' +
          (me ? '' : '<button class="btn small ' + (r.is_active ? 'danger' : '') + '" data-act="' + r.id + '" data-to="' + (r.is_active ? 0 : 1) + '">' + esc(t(r.is_active ? 'deactivate' : 'activate')) + '</button>') + (me ? '' : '<button class="btn small danger" data-dacc="' + r.id + '">Delete</button>') + '</div></div>';
      }).join('') : '<div class="empty">No ' + NAMES[tab].toLowerCase() + ' yet.</div>');
    el.querySelectorAll('#atabs button').forEach(function (b) { b.onclick = function () { state.accTab = b.getAttribute('data-r'); viewAccounts(el); }; });
    $('#adma', el).onclick = function () { createAccountView(tab); };
    if ($('#dall', el)) $('#dall', el).onclick = async function () { if (prompt('This deletes ALL ' + NAMES[tab].toLowerCase() + ' and their logins. Type DELETE to confirm.') !== 'DELETE') return; try { var n = must(await db.rpc('admin_delete_all_accounts', { p_role: tab })); toast('Deleted ' + n + ' logins'); viewAccounts(el); } catch (e) { toast(errText(e), true); } };
    if ($('#apf', el)) $('#apf', el).onclick = parentsFromStudents;
    el.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = async function () {
        try { must(await db.rpc('admin_set_active', { p_user: b.getAttribute('data-act'), p_active: b.getAttribute('data-to') === '1' })); toast(t('saved')); viewAccounts(el); }
        catch (e) { toast(errText(e), true); }
      };
    });
    el.querySelectorAll('[data-dacc]').forEach(function (b) { b.onclick = async function () { if (!confirm('Delete this login permanently?')) return; try { must(await db.rpc('admin_delete_account', { p_user: b.getAttribute('data-dacc') })); toast('Deleted'); viewAccounts(el); } catch (e) { toast(errText(e), true); } }; });
    el.querySelectorAll('[data-rp]').forEach(function (b) {
      b.onclick = function () {
        var uid = b.getAttribute('data-rp');
        push({ title: function () { return 'New password'; }, render: function (e) {
          mountForm(e, { fields: [{ name: 'password', label: 'new_password', required: true }], onSubmit: async function (v) {
            must(await db.rpc('admin_reset_password', { p_user: uid, p_password: v.password }));
            toast(t('password_reset_done')); pop();
          } });
        } });
      };
    });
  }

  /* ---------- shared helpers for all modules ---------- */
  var lk = null;
  async function lookups(force) {
    if (lk && !force) return lk;
    var r = await Promise.all([
      db.from('classes').select('id,name,name_ne,level').order('level'),
      db.from('sections').select('id,class_id,name').order('name'),
      db.from('subjects').select('id,name,name_ne').order('name')]);
    lk = { classes: must(r[0]), sections: must(r[1]), subjects: must(r[2]) };
    lk.cls = {}; lk.sec = {}; lk.sub = {};
    lk.classes.forEach(function (c) { lk.cls[c.id] = c; });
    lk.sections.forEach(function (c) { lk.sec[c.id] = c; });
    lk.subjects.forEach(function (c) { lk.sub[c.id] = c; });
    if (state.profile && state.profile.role === 'teacher') {   // teachers only see the classes they are assigned to
      var asg = must(await db.from('teacher_assignments').select('class_id')), okc = {}; asg.forEach(function (a) { okc[a.class_id] = 1; });
      lk.classes = lk.classes.filter(function (c) { return okc[c.id]; }); lk.sections = lk.sections.filter(function (c) { return okc[c.class_id]; });
    }
    return lk;
  }
  function nm(row) { return row ? ((state.lang === 'ne' && row.name_ne) ? row.name_ne : row.name) : ''; }
  function today() { return new Date(Date.now() + 345 * 60000).toISOString().slice(0, 10); }
  function addDays(ad, n) { var d = new Date(ad + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function fmtMoney(n) { n = Number(n || 0); return 'Rs ' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

  /* Bikram Sambat (BS) dates: loaded in the background; AD is shown if it is unavailable */
  var bsReady = false;
  function loadBs() {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@remotemerge/nepali-date-converter@1.2.0/dist/ndc-browser.js';
    s.onload = function () { bsReady = typeof window.DateConverter === 'function'; };
    document.head.appendChild(s);
  }
  function bs(ad) {
    if (!bsReady || !ad) return '';
    try {
      var r = new window.DateConverter(String(ad).slice(0, 10)).toBs();
      return r.year + '-' + String(r.month).padStart(2, '0') + '-' + String(r.date).padStart(2, '0');
    } catch (e) { return ''; }
  }
  function fmtDate(ad) { if (!ad) return ''; var b = bs(ad); return String(ad).slice(0, 10) + (b ? ' · ' + b + ' BS' : ''); }

  /* Excel (SheetJS) loaded only when needed. CSV works without it. */
  var xlsxP = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxP) return xlsxP;
    xlsxP = loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js')
      .catch(function () { return loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'); })
      .then(function () { return window.XLSX; })
      .catch(function () { xlsxP = null; throw new Error(t('xlsx_load_failed')); });
    return xlsxP;
  }

  /* Bottom action sheet */
  function closeSheet() { var d = document.getElementById('sheet'); if (d) d.remove(); }
  function sheet(title, acts) {
    closeSheet();
    var d = document.createElement('div'); d.className = 'sheet-bg'; d.id = 'sheet';
    d.innerHTML = '<div class="sheet"><div class="grab"></div><h3>' + esc(title) + '</h3>' +
      acts.map(function (a, i) { return '<button class="sbtn" data-i="' + i + '"><span>' + a.icon + '</span>' + esc(a.label) + '</button>'; }).join('') +
      '<button class="sbtn cancel">' + esc(t('cancel')) + '</button></div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) {
      if (e.target === d || e.target.classList.contains('cancel')) return closeSheet();
      var b = e.target.closest('.sbtn');
      if (b && b.getAttribute('data-i') !== null) { var a = acts[+b.getAttribute('data-i')]; closeSheet(); a.fn(); }
    });
  }

  /* Print / Save-as-PDF view (uses the phone's own print dialog -> "Save as PDF") */
  function printable(title, html) {
    push({ title: function () { return title; }, render: function (el) {
      el.innerHTML = '<div class="noprint" style="margin-bottom:12px"><button class="btn primary" id="pbtn">' + esc(t('print_save_pdf')) + '</button>' +
        '<p class="muted sm">' + esc(t('print_hint')) + '</p></div><div class="printable">' + html + '</div>';
      $('#pbtn', el).onclick = function () { window.print(); };
      hydratePhotos(el);
    } });
  }

  /* Schools row (name, address, phone, principal) for report cards and receipts */
  var schoolCache = null;
  async function school() {
    if (schoolCache) return schoolCache;
    schoolCache = must(await db.from('schools').select('*').limit(1).maybeSingle()) || {};
    return schoolCache;
  }

  var AMAR = window.AMAR = {
    db: db, state: state, t: t, sub: sub, esc: esc, $: $, toast: toast, must: must, errText: errText, push: push, pop: pop,
    mountForm: mountForm, emptyMsg: emptyMsg, placeholder: placeholder, logo: logo, photoSrc: photoSrc, hydratePhotos: hydratePhotos,
    uploadPhoto: uploadPhoto, downloadCsv: downloadCsv, count: count, roleLabel: roleLabel, signOut: signOut,
    currentChild: currentChild, lookups: lookups, nm: nm, today: today, addDays: addDays, fmtMoney: fmtMoney, fmtDate: fmtDate, bs: bs,
    loadXlsx: loadXlsx, sheet: sheet, printable: printable, school: school, irow: irow, V: V,
    rerender: function () { renderChrome(); renderContent(); },
    dropSchool: function () { schoolCache = null; },
    views: {}, SCHOOL: SCHOOL
  };

  /* ---------- start ---------- */
  async function start() {
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
    // In a normal browser tab, show ONLY the download page.
    // Add ?app=1 to the address to open the app inside the browser (for testing).
    loadBs();
    var testMode = /[?&]app=1/.test(location.search);
    if (!isStandalone() && !testMode) { showDownload(); return; }

    showSplash();
    await new Promise(function (r) { setTimeout(r, 900); });
    document.documentElement.lang = state.lang === 'ne' ? 'ne' : 'en';
    if (configured) {
      try {
        var s = await db.auth.getSession();
        if (s.data && s.data.session) { await loadProfile(s.data.session.user.id); showShell(); return; }
      } catch (e) { try { await db.auth.signOut(); } catch (x) {} }
    }
    showSelect();
  }
  start();
})();
