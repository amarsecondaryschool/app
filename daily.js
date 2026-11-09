/* Daily school operations: attendance, homework, notices, timetable, exam routine,
   calendar, staff leave, inbox, settings. Registers its screens on AMAR.views. */
(function () {
  'use strict';
  var A = window.AMAR, t = A.t, esc = A.esc, db = A.db, $ = A.$, must = A.must, toast = A.toast, state = A.state, V = A.views;

  /* ---------- shared helpers (also used by the other module files) ---------- */
  async function fetchAll(make) {
    var out = [], from = 0, step = 1000;
    for (;;) {
      var r = await make(from, from + step - 1);
      if (r.error) throw r.error;
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < step) break;
      from += step;
    }
    return out;
  }
  function ck(c) { return c.class_id + '|' + (c.section_id || ''); }
  async function myTeacher() {
    return must(await db.from('teachers').select('id, full_name, teacher_code').eq('user_id', state.profile.id).maybeSingle());
  }
  /* The (class, section) pairs this person may work with */
  async function classChoices() {
    var lk = await A.lookups(), role = state.profile.role, res = [], seen = {};
    function add(cid, sid) {
      var c = lk.cls[cid]; if (!c) return;
      var key = cid + '|' + (sid || ''); if (seen[key]) return; seen[key] = 1;
      res.push({ class_id: cid, section_id: sid || null, level: c.level, label: A.nm(c) + (sid && lk.sec[sid] ? ' – ' + lk.sec[sid].name : '') });
    }
    if (role === 'admin') {
      lk.classes.forEach(function (c) {
        var secs = lk.sections.filter(function (s) { return s.class_id === c.id; });
        if (!secs.length) add(c.id, null); else secs.forEach(function (s) { add(c.id, s.id); });
      });
    } else if (role === 'teacher') {
      var tr = await myTeacher();
      var rows = tr ? must(await db.from('teacher_assignments').select('class_id, section_id').eq('teacher_id', tr.id)) : [];
      rows.forEach(function (r) {
        if (r.section_id) add(r.class_id, r.section_id);
        else {
          var secs = lk.sections.filter(function (s) { return s.class_id === r.class_id; });
          if (!secs.length) add(r.class_id, null); else secs.forEach(function (s) { add(r.class_id, s.id); });
        }
      });
    }
    res.sort(function (a, b) { return a.level - b.level || a.label.localeCompare(b.label); });
    return res;
  }
  async function teacherSubjectsFor(classId) {      // subjects this teacher teaches in a class
    var tr = await myTeacher(); if (!tr) return [];
    var rows = must(await db.from('teacher_assignments').select('subject_id').eq('teacher_id', tr.id).eq('class_id', classId));
    var lk = await A.lookups(), ids = {};
    rows.forEach(function (r) { if (r.subject_id) ids[r.subject_id] = 1; });
    return lk.subjects.filter(function (s) { return ids[s.id]; });
  }
  async function studentsOf(choice) {
    var q = db.from('students').select('id, full_name, full_name_ne, roll_no, photo_url, student_code, class_id, section_id')
      .eq('class_id', choice.class_id).eq('status', 'active');
    if (choice.section_id) q = q.eq('section_id', choice.section_id);
    var rows = must(await q);
    rows.sort(function (a, b) { return (a.roll_no == null ? 1e9 : a.roll_no) - (b.roll_no == null ? 1e9 : b.roll_no) || a.full_name.localeCompare(b.full_name); });
    return rows;
  }
  function choiceSelect(id, choices, selKey) {
    return '<select id="' + id + '" class="search">' + choices.map(function (c) {
      return '<option value="' + esc(ck(c)) + '"' + (ck(c) === selKey ? ' selected' : '') + '>' + esc(c.label) + '</option>';
    }).join('') + '</select>';
  }
  function choiceOf(choices, key) { return choices.filter(function (c) { return ck(c) === key; })[0] || choices[0]; }
  function sname(s) { return esc(s.full_name) + (s.full_name_ne ? ' <span class="muted xs">· ' + esc(s.full_name_ne) + '</span>' : ''); }
  function tabs(el, list, start) {
    el.innerHTML = '<div class="tabs">' + list.map(function (x, i) { return '<button data-k="' + i + '">' + esc(t(x.label)) + '</button>'; }).join('') + '</div><div id="tabbox"></div>';
    function go(i) {
      el.querySelectorAll('.tabs button').forEach(function (b, j) { b.classList.toggle('on', i === j); });
      var box = $('#tabbox', el); box.innerHTML = '<div class="skel"></div><div class="skel"></div>';
      Promise.resolve(list[i].render(box)).catch(function (e) { box.innerHTML = '<p class="err">' + esc(A.errText(e)) + '</p>'; });
    }
    el.querySelectorAll('.tabs button').forEach(function (b) { b.onclick = function () { go(+b.getAttribute('data-k')); }; });
    go(start || 0);
  }
  function skeleton(el) { el.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'; }
  function dayName(i) { return t('day_' + i); }
  function weekday(ad) { return new Date(ad + 'T00:00:00Z').getUTCDay(); }
  function isNetErr(e) { return !navigator.onLine || /fetch|network|failed to|load failed/i.test((e && e.message) || ''); }
  function statusChip(s) {
    var cls = s === 'present' ? 'ok' : s === 'absent' ? 'bad' : s === 'late' ? 'warn' : 'info';
    return '<span class="chip ' + cls + '">' + esc(t('st_' + s)) + '</span>';
  }
  A.fetchAll = fetchAll; A.classChoices = classChoices; A.studentsOf = studentsOf; A.tabs = tabs; A.skeleton = skeleton;
  A.choiceSelect = choiceSelect; A.choiceOf = choiceOf; A.ck = ck; A.myTeacher = myTeacher; A.sname = sname;
  A.teacherSubjectsFor = teacherSubjectsFor; A.dayName = dayName; A.weekday = weekday;
  A.asOptions = function (rows, labelFn) { return rows.map(function (r) { return { value: r.id, label: labelFn ? labelFn(r) : r.name }; }); };

  /* =========================================================
     ATTENDANCE
     ========================================================= */
  var QKEY = function () { return 'amar_att_queue_' + state.profile.id; };
  function queueGet() { try { return JSON.parse(localStorage.getItem(QKEY()) || '[]'); } catch (e) { return []; } }
  function queueSet(q) { try { localStorage.setItem(QKEY(), JSON.stringify(q)); } catch (e) {} }
  async function flushQueue() {
    var q = queueGet(); if (!q.length || !navigator.onLine) return 0;
    try {
      must(await db.from('attendance').upsert(q, { onConflict: 'student_id,att_date,session' }));
      queueSet([]); return q.length;
    } catch (e) { if (!isNetErr(e)) { queueSet([]); toast(A.errText(e), true); } return 0; }
  }
  window.addEventListener('online', function () {
    if (state.profile && state.profile.role !== 'parent') flushQueue().then(function (n) { if (n) toast(t('synced_n') + ': ' + n); });
  });

  V.attendance = async function (el) {
    var role = state.profile.role;
    if (role === 'parent') return attParent(el);
    var list = [{ label: 'att_mark', render: attMark }, { label: 'att_reports', render: attReports }];
    if (role === 'admin') list.push({ label: 'att_staff', render: attStaff });
    tabs(el, list);
  };

  async function attMark(box) {
    var choices = await classChoices();
    if (!choices.length) { box.innerHTML = A.emptyMsg('no_classes_assigned'); return; }
    var role = state.profile.role, tod = A.today(), selKey = ck(choices[0]), date = tod;
    box.innerHTML = '<div id="qbar"></div><div class="filters">' + choiceSelect('ac', choices, selKey) +
      '<input type="date" id="ad" class="search" value="' + date + '" max="' + tod + '"' + (role === 'teacher' ? ' min="' + A.addDays(tod, -3) + '"' : '') + '>' +
      '</div><div id="adl"></div>';
    var cur = {}, rows = [];
    function qbar() {
      var n = queueGet().length;
      $('#qbar', box).innerHTML = n ? '<div class="note">⏳ ' + esc(t('pending_sync')) + ': ' + n + ' <button class="btn small" id="syncnow" style="margin-left:8px">' + esc(t('sync_now')) + '</button></div>' : '';
      var b = $('#syncnow', box); if (b) b.onclick = async function () { var k = await flushQueue(); toast(k ? t('synced_n') + ': ' + k : t('err_network'), !k); qbar(); };
    }
    async function load() {
      var ch = choiceOf(choices, $('#ac', box).value); date = $('#ad', box).value || tod;
      if (role === 'teacher' && (date > tod || date < A.addDays(tod, -3))) { $('#adl', box).innerHTML = '<div class="note">' + esc(t('att_window')) + '</div>'; return; }
      skeleton($('#adl', box));
      rows = await studentsOf(ch);
      cur = {};
      if (rows.length) {
        var ex = must(await db.from('attendance').select('student_id, status').eq('att_date', date).eq('session', 'day').in('student_id', rows.map(function (r) { return r.id; })));
        ex.forEach(function (x) { cur[x.student_id] = x.status; });
      }
      queueGet().forEach(function (q) { if (q.att_date === date && cur[q.student_id] !== undefined || q.att_date === date) cur[q.student_id] = q.status; });
      draw();
    }
    function draw() {
      var sum = { present: 0, absent: 0, late: 0, leave: 0 }; rows.forEach(function (r) { if (cur[r.id]) sum[cur[r.id]]++; });
      var dd = $('#adl', box);
      dd.innerHTML = '<div class="muted sm mb">' + esc(A.fmtDate(date)) + ' · ' + esc(dayName(weekday(date))) + '</div>' +
        '<div class="stat3" style="grid-template-columns:repeat(4,1fr)"><div class="sbox ok"><b>' + sum.present + '</b><span>' + esc(t('st_present')) + '</span></div><div class="sbox bad"><b>' + sum.absent +
        '</b><span>' + esc(t('st_absent')) + '</span></div><div class="sbox warn"><b>' + sum.late + '</b><span>' + esc(t('st_late')) + '</span></div><div class="sbox"><b>' + sum.leave + '</b><span>' + esc(t('st_leave')) + '</span></div></div>' +
        (rows.length ? '<div class="row mb"><button class="btn small" id="allp">✔ ' + esc(t('mark_all_present')) + '</button></div>' : '') +
        rows.map(function (r) {
          var c = cur[r.id];
          return '<div class="stu" data-id="' + r.id + '"><div class="nm"><h4>' + (r.roll_no ? r.roll_no + '. ' : '') + esc(r.full_name) + '</h4><span class="muted xs">' + esc(r.student_code) + '</span></div>' +
            '<div class="pl"><button class="p' + (c === 'present' ? ' on' : '') + '" data-s="present">P</button><button class="a' + (c === 'absent' ? ' on' : '') + '" data-s="absent">A</button>' +
            '<button class="l' + (c === 'late' ? ' on' : '') + '" data-s="late">L</button><button class="v' + (c === 'leave' ? ' on' : '') + '" data-s="leave">Lv</button></div></div>';
        }).join('') + (rows.length ? '<button class="btn primary mt" id="asave">💾 ' + esc(t('save')) + '</button>' : A.emptyMsg('no_results'));
      dd.querySelectorAll('.stu .pl button').forEach(function (b) {
        b.onclick = function () {
          var id = b.closest('.stu').getAttribute('data-id'), s = b.getAttribute('data-s');
          cur[id] = cur[id] === s ? undefined : s; draw();
        };
      });
      var ap = $('#allp', dd); if (ap) ap.onclick = function () { rows.forEach(function (r) { cur[r.id] = 'present'; }); draw(); };
      var sv = $('#asave', dd); if (sv) sv.onclick = save;
    }
    async function save() {
      var payload = rows.filter(function (r) { return cur[r.id]; }).map(function (r) { return { student_id: r.id, att_date: date, session: 'day', status: cur[r.id] }; });
      if (!payload.length) { toast(t('nothing_to_save'), true); return; }
      var btn = $('#asave', box); btn.disabled = true;
      try {
        must(await db.from('attendance').upsert(payload, { onConflict: 'student_id,att_date,session' }));
        toast('✓ ' + t('saved') + ' (' + payload.length + ')');
      } catch (e) {
        if (isNetErr(e)) {
          var q = queueGet().filter(function (x) { return !(x.att_date === date && payload.some(function (p) { return p.student_id === x.student_id; })); });
          queueSet(q.concat(payload)); toast('⏳ ' + t('saved_offline'));
        } else toast(A.errText(e), true);
      }
      btn.disabled = false; qbar();
    }
    $('#ac', box).onchange = load; $('#ad', box).onchange = load;
    qbar(); flushQueue().then(function (n) { if (n) { toast(t('synced_n') + ': ' + n); qbar(); } });
    await load();
  }

  /* month view for one student (parent, or admin/teacher history) */
  async function attMonthView(el, stu) {
    var month = A.today().slice(0, 7);
    function shift(m, d) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + d; var dt = new Date(Date.UTC(y, mo, 1)); return dt.toISOString().slice(0, 7); }
    async function draw() {
      skeleton(el);
      var from = month + '-01', to = month + '-31';
      var rows = must(await db.from('attendance').select('att_date, status').eq('student_id', stu.id).gte('att_date', from).lte('att_date', to).order('att_date', { ascending: false }));
      var c = { present: 0, absent: 0, late: 0, leave: 0 }; rows.forEach(function (r) { c[r.status]++; });
      var tot = rows.length, pct = tot ? Math.round((c.present + c.late) / tot * 100) : 0;
      el.innerHTML = '<div class="card row between"><button class="icon" id="pm">‹</button><div style="text-align:center"><h4>' + esc(month) + '</h4><div class="muted xs">' + esc(stu.full_name) + '</div></div><button class="icon" id="nm">›</button></div>' +
        '<div class="stat3" style="grid-template-columns:repeat(4,1fr)"><div class="sbox ok"><b>' + c.present + '</b><span>' + esc(t('st_present')) + '</span></div><div class="sbox bad"><b>' + c.absent +
        '</b><span>' + esc(t('st_absent')) + '</span></div><div class="sbox warn"><b>' + c.late + '</b><span>' + esc(t('st_late')) + '</span></div><div class="sbox"><b>' + c.leave + '</b><span>' + esc(t('st_leave')) + '</span></div></div>' +
        '<div class="card"><div class="row between"><b>' + esc(t('attendance_pct')) + '</b><b>' + pct + '%</b></div><div class="bar-bg" style="margin-top:8px"><div class="bar-fg" style="width:' + pct + '%"></div></div></div>' +
        (rows.length ? rows.map(function (r) {
          return '<div class="card row between"><div><b>' + esc(A.fmtDate(r.att_date)) + '</b><div class="muted xs">' + esc(dayName(weekday(r.att_date))) + '</div></div>' + statusChip(r.status) + '</div>';
        }).join('') : A.emptyMsg());
      $('#pm', el).onclick = function () { month = shift(month, -1); draw(); };
      $('#nm', el).onclick = function () { month = shift(month, 1); draw(); };
    }
    await draw();
  }
  async function attParent(el) {
    var c = A.currentChild();
    if (!c) { el.innerHTML = '<div class="note">' + esc(t('no_child')) + '</div>'; return; }
    await attMonthView(el, c);
  }
  V.attendanceHistory = function (el, stu) { return attMonthView(el, stu); };

  async function attReports(box) {
    var choices = await classChoices();
    if (!choices.length) { box.innerHTML = A.emptyMsg('no_classes_assigned'); return; }
    var month = A.today().slice(0, 7);
    box.innerHTML = '<div class="filters">' + choiceSelect('rc', choices, ck(choices[0])) + '<input type="month" id="rm" class="search" value="' + month + '"></div><div id="rbody"></div>';
    async function run() {
      var ch = choiceOf(choices, $('#rc', box).value), m = $('#rm', box).value || month, body = $('#rbody', box);
      skeleton(body);
      var studs = await studentsOf(ch);
      if (!studs.length) { body.innerHTML = A.emptyMsg('no_results'); return; }
      var ids = studs.map(function (s) { return s.id; });
      var rows = await fetchAll(function (a, b) {
        return db.from('attendance').select('student_id, att_date, status').in('student_id', ids).gte('att_date', m + '-01').lte('att_date', m + '-31').range(a, b);
      });
      var by = {}; studs.forEach(function (s) { by[s.id] = { present: 0, absent: 0, late: 0, leave: 0 }; });
      var daily = {}; rows.forEach(function (r) { by[r.student_id][r.status]++; daily[r.att_date] = daily[r.att_date] || { present: 0, absent: 0, late: 0, leave: 0 }; daily[r.att_date][r.status]++; });
      var tp = 0, tt = 0;
      var trs = studs.map(function (s) {
        var c = by[s.id], tot = c.present + c.absent + c.late + c.leave, pc = tot ? Math.round((c.present + c.late) / tot * 100) : null;
        tp += c.present + c.late; tt += tot;
        return '<tr data-id="' + s.id + '"><td>' + esc(s.full_name) + '</td><td>' + c.present + '</td><td>' + c.absent + '</td><td>' + c.late + '</td><td>' + c.leave + '</td><td><b>' + (pc === null ? '–' : pc + '%') + '</b></td></tr>';
      }).join('');
      var cpct = tt ? Math.round(tp / tt * 100) : 0, tod = A.today(), dd = daily[tod];
      body.innerHTML = '<div class="card"><div class="row between"><b>' + esc(t('class_attendance_pct')) + '</b><b>' + cpct + '%</b></div><div class="bar-bg" style="margin-top:8px"><div class="bar-fg" style="width:' + cpct + '%"></div></div></div>' +
        (dd ? '<div class="card"><b>' + esc(t('daily_report')) + ' · ' + esc(tod) + '</b><div>' + ['present', 'absent', 'late', 'leave'].map(function (k) { return statusChip(k).replace('</span>', ': ' + dd[k] + '</span>'); }).join('') + '</div></div>' : '') +
        '<div class="scroll-x"><table class="tbl"><tr><th>' + esc(t('student')) + '</th><th>P</th><th>A</th><th>L</th><th>Lv</th><th>%</th></tr>' + trs + '</table></div>' +
        '<button class="btn small mt" id="rexp">⬇ ' + esc(t('export_csv')) + '</button>';
      body.querySelectorAll('tr[data-id]').forEach(function (tr) {
        tr.style.cursor = 'pointer';
        tr.onclick = function () { var s = studs.filter(function (x) { return x.id === tr.getAttribute('data-id'); })[0]; A.push({ title: function () { return s.full_name; }, render: function (e) { return attMonthView(e, s); } }); };
      });
      $('#rexp', body).onclick = function () {
        A.downloadCsv('attendance-' + m + '.csv', [['Student ID', 'Name', 'Present', 'Absent', 'Late', 'Leave', 'Percent']].concat(studs.map(function (s) {
          var c = by[s.id], tot = c.present + c.absent + c.late + c.leave; return [s.student_code, s.full_name, c.present, c.absent, c.late, c.leave, tot ? Math.round((c.present + c.late) / tot * 100) : ''];
        })));
      };
      if (state.profile.role === 'admin') {          // school-wide, class by class
        var lk = await A.lookups();
        var all = await fetchAll(function (a, b) { return db.from('attendance').select('class_id, status').gte('att_date', m + '-01').lte('att_date', m + '-31').range(a, b); });
        var g = {}; all.forEach(function (r) { g[r.class_id] = g[r.class_id] || [0, 0]; g[r.class_id][1]++; if (r.status === 'present' || r.status === 'late') g[r.class_id][0]++; });
        body.innerHTML += '<h3 class="mt">' + esc(t('classwise_pct')) + '</h3>' + (Object.keys(g).length ? lk.classes.filter(function (c) { return g[c.id]; }).map(function (c) {
          var p = Math.round(g[c.id][0] / g[c.id][1] * 100);
          return '<div class="card"><div class="row between"><b>' + esc(A.nm(c)) + '</b><b>' + p + '%</b></div><div class="bar-bg" style="margin-top:6px"><div class="bar-fg" style="width:' + p + '%"></div></div></div>';
        }).join('') : A.emptyMsg());
      }
    }
    $('#rc', box).onchange = run; $('#rm', box).onchange = run;
    await run();
  }

  async function attStaff(box) {
    var tod = A.today();
    box.innerHTML = '<input type="date" id="sd" class="search" value="' + tod + '" max="' + tod + '"><div id="sl"></div>';
    var teachers = must(await db.from('teachers').select('id, full_name, teacher_code').eq('status', 'active').order('full_name')), cur = {};
    async function load() {
      var d = $('#sd', box).value || tod; skeleton($('#sl', box));
      var ex = must(await db.from('teacher_attendance').select('teacher_id, status').eq('att_date', d));
      cur = {}; ex.forEach(function (x) { cur[x.teacher_id] = x.status; }); draw(d);
    }
    function draw(d) {
      var sl = $('#sl', box);
      sl.innerHTML = teachers.length ? teachers.map(function (r) {
        var c = cur[r.id];
        return '<div class="stu" data-id="' + r.id + '"><div class="nm"><h4>' + esc(r.full_name) + '</h4><span class="muted xs">' + esc(r.teacher_code) + '</span></div><div class="pl">' +
          '<button class="p' + (c === 'present' ? ' on' : '') + '" data-s="present">P</button><button class="a' + (c === 'absent' ? ' on' : '') + '" data-s="absent">A</button>' +
          '<button class="l' + (c === 'late' ? ' on' : '') + '" data-s="late">L</button><button class="v' + (c === 'leave' ? ' on' : '') + '" data-s="leave">Lv</button></div></div>';
      }).join('') + '<button class="btn primary mt" id="ssave">💾 ' + esc(t('save')) + '</button>' : A.emptyMsg();
      sl.querySelectorAll('.pl button').forEach(function (b) { b.onclick = function () { var id = b.closest('.stu').getAttribute('data-id'), s = b.getAttribute('data-s'); cur[id] = cur[id] === s ? undefined : s; draw(d); }; });
      var sv = $('#ssave', sl); if (sv) sv.onclick = async function () {
        var p = teachers.filter(function (r) { return cur[r.id]; }).map(function (r) { return { teacher_id: r.id, att_date: d, status: cur[r.id] }; });
        if (!p.length) return;
        try { must(await db.from('teacher_attendance').upsert(p, { onConflict: 'teacher_id,att_date' })); toast('✓ ' + t('saved')); } catch (e) { toast(A.errText(e), true); }
      };
    }
    $('#sd', box).onchange = load; await load();
  }

  /* =========================================================
     HOMEWORK
     ========================================================= */
  async function fileUrl(path) {
    var r = await db.storage.from('files').createSignedUrl(path, 3600);
    if (r.error) throw r.error; return r.data.signedUrl;
  }
  function hwCard(h, lk, extra) {
    var overdue = h.due_date && h.due_date < A.today();
    return '<div class="card" data-id="' + h.id + '"><div class="row between"><h4>' + esc(h.title) + '</h4>' + (h.subjects ? '<span class="chip info">' + esc(A.nm(h.subjects)) + '</span>' : '') + '</div>' +
      (h.description ? '<p style="margin:6px 0">' + esc(h.description) + '</p>' : '') +
      '<div class="muted xs">' + (h.classes ? esc(A.nm(h.classes)) + (h.sections ? ' ' + esc(h.sections.name) : '') + ' · ' : '') + esc(t('due')) + ': ' + esc(A.fmtDate(h.due_date) || '–') +
      (overdue ? ' <span class="chip bad">' + esc(t('overdue')) + '</span>' : '') + '</div>' + (extra || '') + '</div>';
  }
  V.homework = async function (el) {
    var role = state.profile.role, lk = await A.lookups();
    var sel = 'id, title, description, due_date, attachment_path, created_by, class_id, section_id, classes(name,name_ne), sections(name), subjects(name,name_ne)';
    if (role === 'parent') {
      var c = A.currentChild(); if (!c) { el.innerHTML = '<div class="note">' + esc(t('no_child')) + '</div>'; return; }
      skeleton(el);
      var rows = must(await db.from('homework').select(sel).eq('class_id', c.class_id).order('due_date', { ascending: false }).limit(60))
        .filter(function (h) { return !h.section_id || h.section_id === c.section_id; });
      var st = must(await db.from('homework_status').select('homework_id, done').eq('student_id', c.id)), done = {};
      st.forEach(function (s) { done[s.homework_id] = s.done; });
      el.innerHTML = rows.length ? rows.map(function (h) {
        return hwCard(h, lk, '<div class="row mt">' + (h.attachment_path ? '<button class="btn small ghost" data-att="' + esc(h.attachment_path) + '">📎 ' + esc(t('attachment')) + '</button>' : '') +
          '<button class="btn small ' + (done[h.id] ? 'green' : '') + '" data-done="' + h.id + '">' + (done[h.id] ? '✓ ' + esc(t('done')) : esc(t('mark_done'))) + '</button></div>');
      }).join('') : A.emptyMsg();
      el.querySelectorAll('[data-att]').forEach(function (b) { b.onclick = async function () { try { window.open(await fileUrl(b.getAttribute('data-att')), '_blank'); } catch (e) { toast(A.errText(e), true); } }; });
      el.querySelectorAll('[data-done]').forEach(function (b) {
        b.onclick = async function () {
          var id = b.getAttribute('data-done'), nv = !done[id];
          try { must(await db.from('homework_status').upsert({ homework_id: id, student_id: c.id, done: nv, updated_at: new Date().toISOString() }, { onConflict: 'homework_id,student_id' })); done[id] = nv; V.homework(el); }
          catch (e) { toast(A.errText(e), true); }
        };
      });
      return;
    }
    skeleton(el);
    async function draw() {
      var rows = must(await db.from('homework').select(sel).order('due_date', { ascending: false }).limit(80));
      el.innerHTML = '<button class="btn primary mb" id="hadd">＋ ' + esc(t('add_homework')) + '</button>' + (rows.length ? rows.map(function (h) { return hwCard(h, lk, ''); }).join('') : A.emptyMsg());
      $('#hadd', el).onclick = function () { hwForm(draw); };
      el.querySelectorAll('.card[data-id]').forEach(function (cd) {
        cd.classList.add('tap');
        cd.onclick = function () {
          var h = rows.filter(function (x) { return x.id === cd.getAttribute('data-id'); })[0], acts = [];
          if (h.attachment_path) acts.push({ icon: '📎', label: t('attachment'), fn: async function () { try { window.open(await fileUrl(h.attachment_path), '_blank'); } catch (e) { toast(A.errText(e), true); } } });
          acts.push({ icon: '📊', label: t('completion'), fn: async function () {
            var r = must(await db.from('homework_status').select('student_id, done').eq('homework_id', h.id)), n = r.filter(function (x) { return x.done; }).length;
            var tot = must(await db.from('students').select('id', { count: 'exact', head: true }).eq('class_id', h.class_id).eq('status', 'active'));
            toast(t('completion') + ': ' + n);
          } });
          if (role === 'admin' || h.created_by === state.profile.id) acts.push({ icon: '🗑️', label: t('delete'), fn: async function () {
            if (!confirm(t('confirm_delete'))) return;
            try { must(await db.from('homework').delete().eq('id', h.id)); draw(); } catch (e) { toast(A.errText(e), true); }
          } });
          A.sheet(h.title, acts);
        };
      });
    }
    await draw();
  };
  async function hwForm(after) {
    var choices = await classChoices(), lk = await A.lookups(), role = state.profile.role;
    var subjCache = {};
    A.push({ title: function () { return t('add_homework'); }, render: async function (e) {
      if (!choices.length) { e.innerHTML = A.emptyMsg('no_classes_assigned'); return; }
      var first = choices[0];
      async function subjOptions(classId) {
        if (role === 'admin') return lk.subjects.map(function (s) { return { value: s.id, label: A.nm(s) }; });
        if (!subjCache[classId]) subjCache[classId] = await teacherSubjectsFor(classId);
        return subjCache[classId].map(function (s) { return { value: s.id, label: A.nm(s) }; });
      }
      var subjOpts = await subjOptions(first.class_id);
      A.mountForm(e, { fields: [
        { name: 'choice', label: 'class', type: 'select', required: true, options: choices.map(function (c) { return { value: ck(c), label: c.label }; }) },
        { name: 'subject_id', label: 'subject', type: 'select', dependsOn: 'choice', options: function (v) { var ch = choiceOf(choices, v.choice || ck(first)); return subjCache[ch.class_id] ? subjCache[ch.class_id].map(function (s) { return { value: s.id, label: A.nm(s) }; }) : subjOpts; } },
        { name: 'title', label: 'title', required: true }, { name: 'description', label: 'description', type: 'textarea' },
        { name: 'due_date', label: 'due_date', type: 'date' }, { name: 'file', label: 'attachment', type: 'file', hint: 'attach_hint' }],
        values: { choice: ck(first), due_date: A.addDays(A.today(), 1) },
        onSubmit: async function (v) {
          var ch = choiceOf(choices, v.choice), path = null;
          if (v.file) {
            if (v.file.size > 5 * 1024 * 1024) throw new Error(t('file_too_big'));
            path = 'homework/' + Date.now() + '-' + v.file.name.replace(/[^A-Za-z0-9._-]/g, '_');
            must(await db.storage.from('files').upload(path, v.file, { upsert: false }));
          }
          must(await db.from('homework').insert({ class_id: ch.class_id, section_id: ch.section_id, subject_id: v.subject_id, title: v.title, description: v.description, due_date: v.due_date, attachment_path: path }));
          toast(t('saved')); A.pop(); after();
        } });
      // load the teacher's subjects for the first class when the class changes (admin has all subjects)
      var sel = e.querySelector('[name="choice"]');
      sel.addEventListener('change', async function () {
        var ch = choiceOf(choices, sel.value), opts = await subjOptions(ch.class_id), ss = e.querySelector('[name="subject_id"]');
        ss.innerHTML = '<option value=""></option>' + opts.map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('');
      });
    } });
  }

  /* =========================================================
     NOTICES
     ========================================================= */
  V.notices = async function (el) {
    var role = state.profile.role, lk = await A.lookups(); skeleton(el);
    async function draw() {
      var rows = must(await db.from('notices').select('id, title, body, audience, class_id, important, created_by, created_at').order('created_at', { ascending: false }).limit(80));
      var canAdd = role === 'admin' || role === 'teacher';
      el.innerHTML = (canAdd ? '<button class="btn primary mb" id="nadd">＋ ' + esc(t('add_notice')) + '</button>' : '') + (rows.length ? rows.map(function (n) {
        return '<div class="card tap" data-id="' + n.id + '"><div class="row between"><h4>' + (n.important ? '⚠️ ' : '') + esc(n.title) + '</h4></div>' +
          '<div class="muted xs">' + esc(A.fmtDate(n.created_at)) + '</div><div><span class="chip">' + esc(t('aud_' + n.audience)) + '</span>' + (n.class_id && lk.cls[n.class_id] ? '<span class="chip info">' + esc(A.nm(lk.cls[n.class_id])) + '</span>' : '') +
          (n.important ? '<span class="chip warn">' + esc(t('important')) + '</span>' : '') + '</div><p class="nbody" style="display:none;margin:8px 0 0;white-space:pre-wrap">' + esc(n.body || '') + '</p></div>';
      }).join('') : A.emptyMsg());
      if (canAdd) $('#nadd', el).onclick = function () { noticeForm(draw); };
      el.querySelectorAll('.card.tap').forEach(function (c) {
        c.onclick = function () {
          var n = rows.filter(function (x) { return x.id === c.getAttribute('data-id'); })[0], b = c.querySelector('.nbody');
          if (canAdd && (role === 'admin' || n.created_by === state.profile.id)) {
            A.sheet(n.title, [{ icon: '👁️', label: t('read'), fn: function () { b.style.display = b.style.display === 'none' ? 'block' : 'none'; } },
              { icon: '🗑️', label: t('delete'), fn: async function () { if (!confirm(t('confirm_delete'))) return; try { must(await db.from('notices').delete().eq('id', n.id)); draw(); } catch (e) { toast(A.errText(e), true); } } }]);
          } else b.style.display = b.style.display === 'none' ? 'block' : 'none';
        };
      });
    }
    await draw();
  };
  async function noticeForm(after) {
    var role = state.profile.role, lk = await A.lookups(), choices = role === 'teacher' ? await classChoices() : [];
    A.push({ title: function () { return t('add_notice'); }, render: function (e) {
      var classOpts = role === 'teacher'
        ? Object.keys(choices.reduce(function (o, c) { o[c.class_id] = 1; return o; }, {})).map(function (id) { return { value: id, label: A.nm(lk.cls[id]) }; })
        : lk.classes.map(function (c) { return { value: c.id, label: A.nm(c) }; });
      var fields = [{ name: 'title', label: 'title', required: true }, { name: 'body', label: 'description', type: 'textarea', rows: 5 }];
      if (role === 'admin') fields.push({ name: 'audience', label: 'audience', type: 'select', required: true, options: [{ value: 'all', label: t('aud_all') }, { value: 'teachers', label: t('aud_teachers') }, { value: 'parents', label: t('aud_parents') }] });
      fields.push({ name: 'class_id', label: role === 'teacher' ? 'class' : 'class_optional', type: 'select', required: role === 'teacher', options: classOpts });
      fields.push({ name: 'important', label: 'important', type: 'select', options: [{ value: 'yes', label: t('yes') }, { value: 'no', label: t('no') }] });
      A.mountForm(e, { fields: fields, values: { audience: 'all', important: 'no' }, onSubmit: async function (v) {
        must(await db.from('notices').insert({ title: v.title, body: v.body, audience: role === 'teacher' ? 'parents' : v.audience, class_id: v.class_id, important: v.important === 'yes' }));
        toast(t('saved')); A.pop(); after();
      } });
    } });
  }

  /* =========================================================
     TIMETABLE
     ========================================================= */
  V.timetable = async function (el) {
    var role = state.profile.role, lk = await A.lookups();
    var sel = 'id, day, period, start_time, end_time, room, class_id, section_id, subject_id, teacher_id, subjects(name,name_ne), teachers(full_name)';
    var tod = weekday(A.today()); if (tod > 5) tod = 0;
    function slotHtml(s, showClass) {
      return '<div class="card" data-id="' + s.id + '"><div class="row between"><div><h4>' + esc(t('period')) + ' ' + s.period + ' · ' + esc(s.subjects ? A.nm(s.subjects) : '–') + '</h4>' +
        '<div class="muted xs">' + esc((s.start_time || '').slice(0, 5)) + (s.end_time ? ' – ' + esc(s.end_time.slice(0, 5)) : '') + (s.room ? ' · ' + esc(t('room')) + ' ' + esc(s.room) : '') + '</div></div></div>' +
        (s.teachers ? '<span class="chip">' + esc(s.teachers.full_name) + '</span>' : '') +
        (showClass && lk.cls[s.class_id] ? '<span class="chip info">' + esc(A.nm(lk.cls[s.class_id])) + (s.section_id && lk.sec[s.section_id] ? ' ' + esc(lk.sec[s.section_id].name) : '') + '</span>' : '') + '</div>';
    }
    function dayTabs(rows, box, renderRow) {
      var d = tod;
      function draw() {
        box.innerHTML = '<div class="tabs">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<button data-d="' + i + '" class="' + (i === d ? 'on' : '') + '">' + esc(dayName(i)) + '</button>'; }).join('') + '</div>' +
          (function () { var r = rows.filter(function (x) { return x.day === d; }).sort(function (a, b) { return a.period - b.period; }); return r.length ? r.map(renderRow).join('') : A.emptyMsg('no_periods'); })();
        box.querySelectorAll('.tabs button').forEach(function (b) { b.onclick = function () { d = +b.getAttribute('data-d'); draw(); }; });
        if (box.afterDraw) box.afterDraw();
      }
      draw();
    }
    skeleton(el);
    if (role === 'parent') {
      var c = A.currentChild(); if (!c) { el.innerHTML = '<div class="note">' + esc(t('no_child')) + '</div>'; return; }
      var rows = must(await db.from('timetable').select(sel).eq('class_id', c.class_id)).filter(function (s) { return !s.section_id || s.section_id === c.section_id; });
      el.innerHTML = '<div id="dt"></div>'; dayTabs(rows, $('#dt', el), function (s) { return slotHtml(s, false); }); return;
    }
    if (role === 'teacher') {
      var tr = await myTeacher(); var mine = tr ? must(await db.from('timetable').select(sel).eq('teacher_id', tr.id)) : [];
      el.innerHTML = '<div id="dt"></div>'; dayTabs(mine, $('#dt', el), function (s) { return slotHtml(s, true); }); return;
    }
    var choices = await classChoices();
    if (!choices.length) { el.innerHTML = A.emptyMsg('no_classes_assigned'); return; }
    var teachers = must(await db.from('teachers').select('id, full_name').eq('status', 'active').order('full_name'));
    el.innerHTML = choiceSelect('tc', choices, ck(choices[0])) + '<button class="btn primary mb" id="tadd">＋ ' + esc(t('add_period')) + '</button><div id="dt"></div>';
    var rowsA = [];
    async function load() {
      var ch = choiceOf(choices, $('#tc', el).value);
      var q = db.from('timetable').select(sel).eq('class_id', ch.class_id);
      rowsA = must(await q).filter(function (s) { return !s.section_id || s.section_id === ch.section_id; });
      var box = $('#dt', el);
      box.afterDraw = function () {
        box.querySelectorAll('.card[data-id]').forEach(function (cd) {
          cd.classList.add('tap'); cd.onclick = function () {
            var s = rowsA.filter(function (x) { return x.id === cd.getAttribute('data-id'); })[0];
            A.sheet(t('period') + ' ' + s.period, [{ icon: '✏️', label: t('edit'), fn: function () { slotForm(ch, s); } },
              { icon: '🗑️', label: t('delete'), fn: async function () { if (!confirm(t('confirm_delete'))) return; try { must(await db.from('timetable').delete().eq('id', s.id)); load(); } catch (e) { toast(A.errText(e), true); } } }]);
          };
        });
      };
      dayTabs(rowsA, box, function (s) { return slotHtml(s, false); });
    }
    function slotForm(ch, s) {
      A.push({ title: function () { return t(s ? 'edit' : 'add_period'); }, render: function (e) {
        A.mountForm(e, { fields: [
          { name: 'day', label: 'day', type: 'select', required: true, options: [0, 1, 2, 3, 4, 5, 6].map(function (i) { return { value: i, label: dayName(i) }; }) },
          { name: 'period', label: 'period', type: 'number', required: true }, { name: 'start_time', label: 'start_time', type: 'time' }, { name: 'end_time', label: 'end_time', type: 'time' },
          { name: 'subject_id', label: 'subject', type: 'select', options: lk.subjects.map(function (x) { return { value: x.id, label: A.nm(x) }; }) },
          { name: 'teacher_id', label: 'teacher', type: 'select', options: teachers.map(function (x) { return { value: x.id, label: x.full_name }; }) }, { name: 'room', label: 'room' }],
          values: s ? { day: s.day, period: s.period, start_time: (s.start_time || '').slice(0, 5), end_time: (s.end_time || '').slice(0, 5), subject_id: s.subject_id, teacher_id: s.teacher_id, room: s.room } : { day: tod },
          onSubmit: async function (v) {
            var rec = { class_id: ch.class_id, section_id: ch.section_id, day: Number(v.day), period: Math.round(v.period), start_time: v.start_time, end_time: v.end_time, subject_id: v.subject_id, teacher_id: v.teacher_id, room: v.room };
            if (s) must(await db.from('timetable').update(rec).eq('id', s.id)); else must(await db.from('timetable').insert(rec));
            toast(t('saved')); A.pop();
          } });
      } });
    }
    $('#tc', el).onchange = load; $('#tadd', el).onclick = function () { slotForm(choiceOf(choices, $('#tc', el).value), null); };
    await load();
  };

  /* =========================================================
     EXAM ROUTINE (dates come from the exam subject setup)
     ========================================================= */
  V.examRoutine = async function (el) {
    var role = state.profile.role, lk = await A.lookups(), classId, section;
    skeleton(el);
    async function show(classId) {
      var rows = must(await db.from('exam_subjects').select('exam_date, start_time, subject_id, exams(name, name_ne, start_date, end_date)').eq('class_id', classId).not('exam_date', 'is', null).order('exam_date'));
      rows = rows.filter(function (r) { return r.exam_date >= A.addDays(A.today(), -1); });
      var body = $('#erb', el);
      var by = {}; rows.forEach(function (r) { var k = r.exams ? A.nm(r.exams) : '?'; (by[k] = by[k] || []).push(r); });
      body.innerHTML = Object.keys(by).length ? Object.keys(by).map(function (k) {
        return '<h3 class="grp g-orange"><i></i>' + esc(k) + '</h3>' + by[k].map(function (r) {
          return '<div class="card cal-day k-exam"><div class="d"><b>' + esc(r.exam_date.slice(8)) + '</b>' + esc(dayName(weekday(r.exam_date)).slice(0, 3)) + '</div><div><h4>' + esc(lk.sub[r.subject_id] ? A.nm(lk.sub[r.subject_id]) : '') + '</h4><div class="muted xs">' + esc(A.fmtDate(r.exam_date)) + (r.start_time ? ' · ' + esc(r.start_time.slice(0, 5)) : '') + '</div></div></div>';
        }).join('');
      }).join('') : A.emptyMsg('no_exam_dates');
    }
    if (role === 'parent') {
      var c = A.currentChild(); if (!c) { el.innerHTML = '<div class="note">' + esc(t('no_child')) + '</div>'; return; }
      el.innerHTML = '<div id="erb"></div>'; await show(c.class_id); return;
    }
    var choices = await classChoices(); if (!choices.length) { el.innerHTML = A.emptyMsg('no_classes_assigned'); return; }
    var seen = {}, cls = choices.filter(function (c) { if (seen[c.class_id]) return false; seen[c.class_id] = 1; return true; });
    el.innerHTML = '<select id="ec" class="search">' + cls.map(function (c) { return '<option value="' + c.class_id + '">' + esc(A.nm(lk.cls[c.class_id])) + '</option>'; }).join('') + '</select><div id="erb"></div>';
    $('#ec', el).onchange = function () { show($('#ec', el).value); }; await show(cls[0].class_id);
  };

  /* =========================================================
     CALENDAR
     ========================================================= */
  var KIND_ICON = { public_holiday: '🎌', school_holiday: '🏖️', exam: '📝', event: '🎉', meeting: '👥' };
  V.calendar = async function (el) {
    var role = state.profile.role, mode = 'upcoming'; skeleton(el);
    async function draw() {
      var rows = must(await db.from('calendar_events').select('*').order('event_date')), tod = A.today();
      var list = rows.filter(function (e) { var end = e.end_date || e.event_date; return mode === 'all' || (mode === 'upcoming' ? end >= tod : end < tod); });
      if (mode === 'past') list.reverse();
      var html = '<div class="tabs">' + ['upcoming', 'past', 'all'].map(function (m) { return '<button data-m="' + m + '" class="' + (m === mode ? 'on' : '') + '">' + esc(t('cal_' + m)) + '</button>'; }).join('') + '</div>' +
        (role === 'admin' ? '<button class="btn primary mb" id="cadd">＋ ' + esc(t('add_event')) + '</button>' : '');
      var lastMonth = '';
      list.forEach(function (e) {
        var m = e.event_date.slice(0, 7);
        if (m !== lastMonth) { html += '<h3 class="grp g-blue"><i></i>' + esc(m) + '</h3>'; lastMonth = m; }
        html += '<div class="card tap cal-day k-' + e.kind + '" data-id="' + e.id + '"><div class="d"><b>' + esc(e.event_date.slice(8)) + '</b>' + esc(dayName(weekday(e.event_date)).slice(0, 3)) + '</div><div style="flex:1"><h4>' + KIND_ICON[e.kind] + ' ' +
          esc(state.lang === 'ne' && e.title_ne ? e.title_ne : e.title) + '</h4><div class="muted xs">' + esc(A.fmtDate(e.event_date)) + (e.end_date ? ' → ' + esc(A.fmtDate(e.end_date)) : '') + '</div>' +
          '<span class="chip">' + esc(t('ev_' + e.kind)) + '</span>' + (e.notes ? '<div class="muted sm">' + esc(e.notes) + '</div>' : '') + '</div></div>';
      });
      if (!list.length) html += A.emptyMsg();
      el.innerHTML = html;
      el.querySelectorAll('.tabs button').forEach(function (b) { b.onclick = function () { mode = b.getAttribute('data-m'); draw(); }; });
      if (role === 'admin') {
        $('#cadd', el).onclick = function () { evForm(null); };
        el.querySelectorAll('.card.tap').forEach(function (c) {
          c.onclick = function () {
            var e = rows.filter(function (x) { return x.id === c.getAttribute('data-id'); })[0];
            A.sheet(e.title, [{ icon: '✏️', label: t('edit'), fn: function () { evForm(e); } },
              { icon: '🗑️', label: t('delete'), fn: async function () { if (!confirm(t('confirm_delete'))) return; try { must(await db.from('calendar_events').delete().eq('id', e.id)); draw(); } catch (x) { toast(A.errText(x), true); } } }]);
          };
        });
      }
    }
    function evForm(e0) {
      A.push({ title: function () { return t(e0 ? 'edit' : 'add_event'); }, render: function (e) {
        A.mountForm(e, { fields: [{ name: 'title', label: 'title', required: true }, { name: 'title_ne', label: 'title_ne' },
          { name: 'event_date', label: 'event_date', type: 'date', required: true }, { name: 'end_date', label: 'end_date', type: 'date' },
          { name: 'kind', label: 'kind', type: 'select', required: true, options: ['public_holiday', 'school_holiday', 'exam', 'event', 'meeting'].map(function (k) { return { value: k, label: t('ev_' + k) }; }) },
          { name: 'notes', label: 'notes', type: 'textarea' }], values: e0 || { kind: 'event', event_date: A.today() },
          onSubmit: async function (v) {
            if (v.end_date && v.end_date < v.event_date) throw new Error(t('err_dates'));
            if (e0) must(await db.from('calendar_events').update(v).eq('id', e0.id)); else must(await db.from('calendar_events').insert(v));
            toast(t('saved')); A.pop(); draw();
          } });
      } });
    }
    await draw();
  };

  /* =========================================================
     STAFF LEAVE
     ========================================================= */
  function leaveChip(s) { return '<span class="chip ' + (s === 'approved' ? 'ok' : s === 'rejected' ? 'bad' : 'warn') + '">' + esc(t('lv_' + s)) + '</span>'; }
  V.leave = async function (el) {
    var role = state.profile.role; skeleton(el);
    if (role === 'teacher') {
      var tr = await myTeacher();
      async function draw() {
        var rows = tr ? must(await db.from('leave_applications').select('*').eq('teacher_id', tr.id).order('from_date', { ascending: false })) : [];
        el.innerHTML = '<button class="btn primary mb" id="ladd">＋ ' + esc(t('apply_leave')) + '</button>' + (rows.length ? rows.map(function (r) {
          return '<div class="card"><div class="row between"><h4>' + esc(r.from_date) + ' → ' + esc(r.to_date) + '</h4>' + leaveChip(r.status) + '</div><div class="muted sm">' + esc(r.reason || '') + '</div></div>';
        }).join('') : A.emptyMsg());
        $('#ladd', el).onclick = function () {
          A.push({ title: function () { return t('apply_leave'); }, render: function (e) {
            A.mountForm(e, { fields: [{ name: 'from_date', label: 'from_date', type: 'date', required: true }, { name: 'to_date', label: 'to_date', type: 'date', required: true }, { name: 'reason', label: 'reason', type: 'textarea', required: true }],
              values: { from_date: A.today(), to_date: A.today() }, onSubmit: async function (v) {
                if (v.to_date < v.from_date) throw new Error(t('err_dates'));
                must(await db.from('leave_applications').insert({ teacher_id: tr.id, from_date: v.from_date, to_date: v.to_date, reason: v.reason }));
                toast(t('saved')); A.pop(); draw();
              } });
          } });
        };
      }
      await draw(); return;
    }
    var mode = 'pending';
    async function drawA() {
      var rows = must(await db.from('leave_applications').select('*, teachers(full_name)').order('created_at', { ascending: false }).limit(100));
      var list = rows.filter(function (r) { return mode === 'all' || r.status === 'pending'; });
      el.innerHTML = '<div class="tabs">' + ['pending', 'all'].map(function (m) { return '<button data-m="' + m + '" class="' + (m === mode ? 'on' : '') + '">' + esc(t('lv_' + m)) + '</button>'; }).join('') + '</div>' + (list.length ? list.map(function (r) {
        return '<div class="card"><div class="row between"><h4>' + esc(r.teachers ? r.teachers.full_name : '') + '</h4>' + leaveChip(r.status) + '</div><div class="muted xs">' + esc(r.from_date) + ' → ' + esc(r.to_date) + '</div><div class="sm">' + esc(r.reason || '') + '</div>' +
          (r.status === 'pending' ? '<div class="row mt"><button class="btn small green" data-a="' + r.id + '" data-s="approved">✓ ' + esc(t('approve')) + '</button><button class="btn small danger" data-a="' + r.id + '" data-s="rejected">✕ ' + esc(t('reject')) + '</button></div>' : '') + '</div>';
      }).join('') : A.emptyMsg());
      el.querySelectorAll('.tabs button').forEach(function (b) { b.onclick = function () { mode = b.getAttribute('data-m'); drawA(); }; });
      el.querySelectorAll('[data-a]').forEach(function (b) {
        b.onclick = async function () { try { must(await db.from('leave_applications').update({ status: b.getAttribute('data-s') }).eq('id', b.getAttribute('data-a'))); toast(t('saved')); drawA(); } catch (e) { toast(A.errText(e), true); } };
      });
    }
    await drawA();
  };

  /* =========================================================
     INBOX (in-app notification centre, built from live data)
     ========================================================= */
  V.inbox = async function (el) {
    var role = state.profile.role, items = [], tod = A.today(), since = A.addDays(tod, -30); skeleton(el);
    async function add(fn) { try { await fn(); } catch (e) {} }
    var notes = must(await db.from('notices').select('title, important, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(15));
    notes.forEach(function (n) { items.push({ d: n.created_at.slice(0, 10), icon: n.important ? '⚠️' : '📢', title: n.title, kind: t('notices') }); });
    var evs = must(await db.from('calendar_events').select('title, title_ne, event_date, kind').gte('event_date', tod).lte('event_date', A.addDays(tod, 14)).order('event_date'));
    evs.forEach(function (e) { items.push({ d: e.event_date, icon: KIND_ICON[e.kind], title: (state.lang === 'ne' && e.title_ne ? e.title_ne : e.title), kind: t('upcoming') }); });
    if (role === 'parent') {
      var c = A.currentChild();
      if (c) {
        await add(async function () {
          must(await db.from('attendance').select('att_date').eq('student_id', c.id).eq('status', 'absent').gte('att_date', A.addDays(tod, -14))).forEach(function (a) { items.push({ d: a.att_date, icon: '🚫', title: t('absent_notice').replace('{name}', c.full_name), kind: t('attendance') }); });
          must(await db.from('homework').select('title, created_at, class_id').eq('class_id', c.class_id).gte('created_at', A.addDays(tod, -14))).forEach(function (h) { items.push({ d: h.created_at.slice(0, 10), icon: '📓', title: h.title, kind: t('new_homework') }); });
          must(await db.from('report_cards').select('published_at, exams(name, name_ne)').eq('student_id', c.id).gte('published_at', A.addDays(tod, -60))).forEach(function (r) { items.push({ d: r.published_at.slice(0, 10), icon: '🏅', title: (r.exams ? A.nm(r.exams) : '') + ' — ' + t('result_published'), kind: t('examination') }); });
          var fi = must(await db.from('fee_items').select('amount, due_date, title').eq('student_id', c.id)), pay = must(await db.from('payments').select('amount').eq('student_id', c.id));
          var due = fi.reduce(function (s, x) { return s + Number(x.amount); }, 0) - pay.reduce(function (s, x) { return s + Number(x.amount); }, 0);
          if (due > 0) items.push({ d: tod, icon: '💰', title: t('fee_due_msg') + ': ' + A.fmtMoney(due), kind: t('account') });
        });
      }
    } else if (role === 'teacher') {
      await add(async function () {
        var tr = await A.myTeacher();
        if (tr) must(await db.from('leave_applications').select('from_date, to_date, status, decided_at').eq('teacher_id', tr.id).neq('status', 'pending').gte('decided_at', since)).forEach(function (l) { items.push({ d: l.decided_at.slice(0, 10), icon: l.status === 'approved' ? '✅' : '❌', title: t('staff_leave') + ': ' + t('lv_' + l.status) + ' (' + l.from_date + ')', kind: t('staff_leave') }); });
      });
    } else {
      await add(async function () {
        var pend = await A.count('leave_applications', function (q) { return q.eq('status', 'pending'); });
        if (pend) items.push({ d: tod, icon: '🏖️', title: t('pending_leaves') + ': ' + pend, kind: t('staff_leave') });
        var sub = await A.count('marks', function (q) { return q.eq('status', 'submitted'); });
        if (sub) items.push({ d: tod, icon: '📝', title: t('marks_awaiting') + ': ' + sub, kind: t('marks_entry') });
      });
    }
    items.sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    el.innerHTML = items.length ? items.map(function (i) {
      return '<div class="card row"><div class="ico g-blue" style="width:46px;height:46px;font-size:22px;border-radius:14px;flex:0 0 46px">' + i.icon + '</div><div style="flex:1;min-width:0"><h4>' + esc(i.title) + '</h4><div class="muted xs">' + esc(i.kind) + ' · ' + esc(A.fmtDate(i.d)) + '</div></div></div>';
    }).join('') : '<div class="empty"><div style="font-size:56px">🔔</div>' + esc(t('no_notifications')) + '</div>';
  };

  /* =========================================================
     SETTINGS (admin) + CHANGE PASSWORD (everyone)
     ========================================================= */
  V.settings = async function (el) {
    var sch = await A.school();
    el.innerHTML = '<div class="card"><h4>' + esc(t('school_fixed')) + '</h4><div class="muted">' + A.SCHOOL + '</div></div>' +
      '<div class="tabs"><button class="on">' + esc(t('school_profile')) + '</button></div><div id="sform"></div>' +
      '<button class="btn mb" id="grbtn">🏅 ' + esc(t('grading_rules')) + '</button><button class="btn mb" id="pwbtn">🔒 ' + esc(t('change_password')) + '</button><div class="card"><h4>' + esc(t('backup_title')) + '</h4><p class="muted sm">' + esc(t('backup_text')) + '</p><button class="btn small" id="bkbtn">📥 ' + esc(t('import_export')) + '</button></div>';
    A.mountForm($('#sform', el), { fields: [{ name: 'address', label: 'address' }, { name: 'phone', label: 'phone' }, { name: 'email', label: 'email' }, { name: 'principal_name', label: 'principal_name' },
      { name: 'inactivity_timeout_minutes', label: 'timeout_info', type: 'number' }], values: sch, onSubmit: async function (v) {
        if (v.inactivity_timeout_minutes !== null && (v.inactivity_timeout_minutes < 1 || v.inactivity_timeout_minutes > 240)) throw new Error('1 - 240');
        must(await db.from('schools').update({ address: v.address, phone: v.phone, email: v.email, principal_name: v.principal_name, inactivity_timeout_minutes: v.inactivity_timeout_minutes || 15 }).eq('id', sch.id));
        A.dropSchool(); state.timeoutMin = v.inactivity_timeout_minutes || 15; toast(t('saved')); $('#sform', el).querySelector('button[type=submit]').disabled = false;
      } });
    $('#grbtn', el).onclick = function () { A.push({ title: function () { return t('grading_rules'); }, render: A.V('gradingRules') }); };
    $('#pwbtn', el).onclick = function () { A.push({ title: function () { return t('change_password'); }, render: V.changePassword }); };
    $('#bkbtn', el).onclick = function () { A.push({ title: function () { return t('import_export'); }, render: A.V('dataHub') }); };
  };
  V.changePassword = function (el) {
    A.mountForm(el, { fields: [{ name: 'p1', label: 'new_password', type: 'password', required: true }, { name: 'p2', label: 'confirm_password', type: 'password', required: true }],
      onSubmit: async function (v) {
        if (v.p1 !== v.p2) throw new Error(t('err_pw_match'));
        if (v.p1.length < 8) throw new Error(t('err_pw_len'));
        var r = await db.auth.updateUser({ password: v.p1 }); if (r.error) throw r.error;
        toast(t('password_reset_done')); A.pop();
      } });
  };
})();
