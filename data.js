/* Import / Export hub (Excel .xlsx and CSV). Admin only. Uses importer.js for all checking. */
(function () {
  'use strict';
  var A = window.AMAR, t = A.t, esc = A.esc, db = A.db, $ = A.$, must = A.must, toast = A.toast, V = A.views, I = window.AmarImport;

  var IMPORTS = ['students', 'teachers', 'parents', 'classes', 'subjects', 'assignments', 'fees', 'library', 'events', 'attendance', 'marks'];
  var EXPORTS = ['students', 'teachers', 'parents', 'classes', 'subjects', 'assignments', 'attendance', 'marks', 'fees', 'payments', 'library', 'events', 'grades'];

  function chunk(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function stamp() { return A.today(); }

  /* ---------- read a file into a 2-D table ---------- */
  async function readFile(file) {
    if (file.size > 8 * 1024 * 1024) throw new Error(t('file_too_big'));
    if (/\.csv$|\.txt$|\.tsv$/i.test(file.name)) return I.parseCsv(await file.text());
    var X = await A.loadXlsx(), wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    var ws = wb.Sheets[wb.SheetNames[0]];
    return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }
  async function saveTable(name, rows) {           // xlsx if available, otherwise CSV
    try {
      var X = await A.loadXlsx(), wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), 'Data'); X.writeFile(wb, name + '.xlsx'); toast(t('export_done'));
    } catch (e) { A.downloadCsv(name + '.csv', rows); }
  }

  /* ---------- context used to check references ---------- */
  async function buildCtx() {
    var lk = await A.lookups(), ctx = { classes: {}, sections: {}, subjects: {}, studentCodes: {}, studentClass: {}, teacherCodes: {}, exams: {}, examSubjects: {} };
    lk.classes.forEach(function (c) { ctx.classes[c.name.toLowerCase()] = { id: c.id, name: c.name }; });
    lk.sections.forEach(function (s) { ctx.sections[s.class_id + '|' + s.name.toLowerCase()] = { id: s.id }; });
    lk.subjects.forEach(function (s) { ctx.subjects[s.name.toLowerCase()] = { id: s.id }; });
    (await A.fetchAll(function (a, b) { return db.from('students').select('id, student_code, class_id').range(a, b); })).forEach(function (s) { ctx.studentCodes[s.student_code.toLowerCase()] = s.id; ctx.studentClass[s.id] = s.class_id; });
    must(await db.from('teachers').select('id, teacher_code')).forEach(function (x) { ctx.teacherCodes[x.teacher_code.toLowerCase()] = x.id; });
    must(await db.from('exams').select('id, name')).forEach(function (x) { ctx.exams[x.name.toLowerCase()] = { id: x.id }; });
    must(await db.from('exam_subjects').select('*')).forEach(function (x) { ctx.examSubjects[x.exam_id + '|' + x.class_id + '|' + x.subject_id] = x; });
    return ctx;
  }

  /* ---------- commit ---------- */
  async function commit(entity, recs, progress) {
    var ok = 0, fails = [], sch = await A.school(), done = 0;
    function tick(n) { done += n; progress(done, recs.length); }
    if (entity === 'teachers' || entity === 'parents') {
      var role = entity === 'teachers' ? 'teacher' : 'parent', groups = chunk(recs, 40);
      for (var g = 0; g < groups.length; g++) {
        var res = must(await db.rpc('admin_bulk_create_accounts', { p_role: role, p_rows: groups[g] }));
        res.forEach(function (r) { if (r.ok) ok++; else fails.push({ id: groups[g][r.row - 1].login_id, error: r.error }); }); tick(groups[g].length);
      }
      return { ok: ok, fails: fails };
    }
    if (entity === 'classes') {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        try {
          var c = must(await db.from('classes').upsert({ school_id: sch.id, name: r.name, name_ne: r.name_ne, level: r.level }, { onConflict: 'school_id,name' }).select().single());
          if (r.sections && r.sections.length) must(await db.from('sections').upsert(r.sections.map(function (n) { return { class_id: c.id, name: n }; }), { onConflict: 'class_id,name', ignoreDuplicates: true }));
          ok++;
        } catch (e) { fails.push({ id: r.name, error: A.errText(e) }); } tick(1);
      }
      return { ok: ok, fails: fails };
    }
    if (entity === 'subjects') {
      for (var j = 0; j < recs.length; j++) {
        try { must(await db.from('subjects').upsert({ school_id: sch.id, name: recs[j].name, name_ne: recs[j].name_ne, code: recs[j].code || null }, { onConflict: 'school_id,name' })); ok++; } catch (e) { fails.push({ id: recs[j].name, error: A.errText(e) }); } tick(1);
      }
      return { ok: ok, fails: fails };
    }
    var cfg = {
      students: { table: 'students', conflict: 'student_code' }, assignments: { table: 'teacher_assignments', conflict: 'teacher_id,class_id,section_id,subject_id', ignore: true },
      library: { table: 'library_books' }, fees: { table: 'fee_items' }, events: { table: 'calendar_events' },
      attendance: { table: 'attendance', conflict: 'student_id,att_date,session', map: function (r) { return Object.assign({ session: 'day' }, r); } },
      marks: { table: 'marks', conflict: 'exam_id,student_id,subject_id' }
    }[entity];
    var batches = chunk(recs.map(cfg.map || function (x) { return x; }), 200);
    for (var k = 0; k < batches.length; k++) {
      try {
        var q = cfg.conflict ? db.from(cfg.table).upsert(batches[k], { onConflict: cfg.conflict, ignoreDuplicates: !!cfg.ignore }) : db.from(cfg.table).insert(batches[k]);
        must(await q); ok += batches[k].length;
      } catch (e) {                                    // batch failed: retry row by row so one bad row does not hide the rest
        for (var m = 0; m < batches[k].length; m++) {
          try { must(await (cfg.conflict ? db.from(cfg.table).upsert(batches[k][m], { onConflict: cfg.conflict, ignoreDuplicates: !!cfg.ignore }) : db.from(cfg.table).insert(batches[k][m]))); ok++; }
          catch (e2) { fails.push({ id: '#' + (k * 200 + m + 1), error: A.errText(e2) }); }
        }
      }
      tick(batches[k].length);
    }
    return { ok: ok, fails: fails };
  }

  /* ---------- export data sets (never passwords) ---------- */
  var EXP = {
    students: async function () {
      var lk = await A.lookups(), rows = await A.fetchAll(function (a, b) { return db.from('students').select('*').order('full_name').range(a, b); });
      return [['student_code', 'admission_no', 'full_name', 'full_name_ne', 'class', 'section', 'roll_no', 'dob', 'gender', 'blood_group', 'address', 'admission_date', 'guardian_name', 'guardian_phone', 'emergency_phone', 'house', 'emis_no', 'status']]
        .concat(rows.map(function (r) { return [r.student_code, r.admission_no, r.full_name, r.full_name_ne, lk.cls[r.class_id] ? lk.cls[r.class_id].name : '', lk.sec[r.section_id] ? lk.sec[r.section_id].name : '', r.roll_no, r.dob, r.gender, r.blood_group, r.address, r.admission_date, r.guardian_name, r.guardian_phone, r.emergency_phone, r.house, r.emis_no, r.status]; }));
    },
    teachers: async function () { var r = must(await db.from('teachers').select('*').order('full_name')); return [['login_id', 'full_name', 'full_name_ne', 'phone', 'address', 'status']].concat(r.map(function (x) { return [x.teacher_code, x.full_name, x.full_name_ne, x.phone, x.address, x.status]; })); },
    parents: async function () {
      var r = must(await db.from('parents').select('parent_code, full_name, phone, parent_student_links(students(student_code))').order('full_name'));
      return [['login_id', 'full_name', 'phone', 'student_codes']].concat(r.map(function (x) { return [x.parent_code, x.full_name, x.phone, (x.parent_student_links || []).map(function (l) { return l.students && l.students.student_code; }).filter(Boolean).join(', ')]; }));
    },
    classes: async function () { var lk = await A.lookups(); return [['name', 'name_ne', 'level', 'sections']].concat(lk.classes.map(function (c) { return [c.name, c.name_ne, c.level, lk.sections.filter(function (s) { return s.class_id === c.id; }).map(function (s) { return s.name; }).join(', ')]; })); },
    subjects: async function () { var lk = await A.lookups(); return [['name', 'name_ne', 'code']].concat(lk.subjects.map(function (s) { return [s.name, s.name_ne, s.code]; })); },
    assignments: async function () {
      var lk = await A.lookups(), r = await A.fetchAll(function (a, b) { return db.from('teacher_assignments').select('class_id, section_id, subject_id, teachers(teacher_code)').range(a, b); });
      return [['teacher_id', 'class', 'section', 'subject']].concat(r.map(function (x) { return [x.teachers ? x.teachers.teacher_code : '', lk.cls[x.class_id] ? lk.cls[x.class_id].name : '', lk.sec[x.section_id] ? lk.sec[x.section_id].name : '', lk.sub[x.subject_id] ? lk.sub[x.subject_id].name : '']; }));
    },
    attendance: async function (o) {
      var r = await A.fetchAll(function (a, b) { return db.from('attendance').select('att_date, status, students(student_code, full_name)').gte('att_date', o.from).lte('att_date', o.to).order('att_date').range(a, b); });
      return [['student_code', 'name', 'date', 'status']].concat(r.map(function (x) { return [x.students ? x.students.student_code : '', x.students ? x.students.full_name : '', x.att_date, x.status]; }));
    },
    marks: async function () {
      var lk = await A.lookups(), r = await A.fetchAll(function (a, b) { return db.from('marks').select('theory, practical, internal, is_absent, status, exams(name), subject_id, students(student_code, full_name, class_id)').range(a, b); });
      return [['exam', 'class', 'subject', 'student_code', 'name', 'theory', 'practical', 'internal', 'absent', 'status']].concat(r.map(function (x) { var s = x.students || {}; return [x.exams ? x.exams.name : '', lk.cls[s.class_id] ? lk.cls[s.class_id].name : '', lk.sub[x.subject_id] ? lk.sub[x.subject_id].name : '', s.student_code, s.full_name, x.theory, x.practical, x.internal, x.is_absent ? 'yes' : '', x.status]; }));
    },
    fees: async function () { var r = await A.fetchAll(function (a, b) { return db.from('fee_items').select('title, category, amount, due_date, students(student_code, full_name)').range(a, b); }); return [['student_code', 'name', 'title', 'category', 'amount', 'due_date']].concat(r.map(function (x) { return [x.students ? x.students.student_code : '', x.students ? x.students.full_name : '', x.title, x.category, x.amount, x.due_date]; })); },
    payments: async function () { var r = await A.fetchAll(function (a, b) { return db.from('payments').select('receipt_no, amount, paid_on, method, note, students(student_code, full_name)').order('paid_on').range(a, b); }); return [['receipt_no', 'student_code', 'name', 'amount', 'date', 'method', 'note']].concat(r.map(function (x) { return [x.receipt_no, x.students ? x.students.student_code : '', x.students ? x.students.full_name : '', x.amount, x.paid_on, x.method, x.note]; })); },
    library: async function () { var r = must(await db.from('library_books').select('*').order('title')); return [['title', 'author', 'isbn', 'copies']].concat(r.map(function (x) { return [x.title, x.author, x.isbn, x.copies]; })); },
    events: async function () { var r = must(await db.from('calendar_events').select('*').order('event_date')); return [['title', 'title_ne', 'event_date', 'end_date', 'kind', 'notes']].concat(r.map(function (x) { return [x.title, x.title_ne, x.event_date, x.end_date, x.kind, x.notes]; })); },
    grades: async function () {
      var r = await A.fetchAll(function (a, b) { return db.from('report_cards').select('snapshot').range(a, b); });
      return [['exam', 'class', 'student_code', 'name', 'percentage', 'gpa', 'grade', 'result', 'rank']].concat(r.map(function (x) { var s = x.snapshot; return [s.exam.name, s.student.class, s.student.code, s.student.name, s.res.percentage, s.res.gpa_valid ? s.res.gpa : '', s.res.gpa_valid ? s.res.overall_grade : 'NG', s.res.result, s.rank || '']; }));
    }
  };

  V.dataHub = function (el) { A.tabs(el, [{ label: 'dh_import', render: importTab }, { label: 'dh_export', render: exportTab }]); };

  /* IEMIS files list classes as 8, 9, ECD/PPC: create any missing class automatically */
  async function ensureClasses(rows) {
    var ci = (rows[0] || []).findIndex(function (h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, '') === 'class'; });
    if (ci < 0) return;
    var names = {}; rows.slice(1).forEach(function (r) { var v = String(r[ci] == null ? '' : r[ci]).trim(); if (v) names[/^\d+$/.test(v) ? 'Class ' + v : v] = 1; });
    var sch = await A.school(), have = {};
    (await A.lookups()).classes.forEach(function (c) { have[c.name.toLowerCase()] = 1; });
    var add = Object.keys(names).filter(function (n) { return !have[n.toLowerCase()]; }).map(function (n) { var m = n.match(/\d+/); return { school_id: sch.id, name: n, level: m ? +m[0] : 0 }; });
    if (add.length) must(await db.from('classes').upsert(add, { onConflict: 'school_id,name' }));
    await A.lookups(true);   // refresh the cached class list so the new classes are found
  }

  async function importTab(box) {
    box.innerHTML = '<div class="note">' + esc(t('dh_import_note')) + '</div><select id="ie" class="search">' + IMPORTS.map(function (k) { return '<option value="' + k + '">' + esc(t('ent_' + k)) + '</option>'; }).join('') + '</select>' +
      '<div class="row mb"><button class="btn small" id="itpl">⬇ ' + esc(t('dh_template')) + '</button></div><div id="icols" class="muted xs mb"></div>' +
      '<label class="upl">📂 ' + esc(t('dh_choose_file')) + '<input type="file" id="ifile" accept=".xlsx,.xls,.csv,.txt,.tsv" style="display:none"></label><div id="ires"></div>';
    function cols() { var e = I.ENTITIES[$('#ie', box).value]; $('#icols', box).innerHTML = esc(t('dh_columns')) + ': ' + e.columns.map(function (c) { return '<code>' + esc(c.key) + (c.req ? '*' : '') + '</code>'; }).join(' '); $('#ires', box).innerHTML = ''; }
    $('#ie', box).onchange = cols; cols();
    $('#itpl', box).onclick = function () { saveTable('template-' + $('#ie', box).value, I.template($('#ie', box).value)); };
    $('#ifile', box).onchange = async function (ev) {
      var f = ev.target.files[0]; if (!f) return; var out = $('#ires', box); A.skeleton(out);
      try {
        var entity = $('#ie', box).value, rows = await readFile(f), ctx = (entity === 'students' ? await ensureClasses(rows) : 0, await buildCtx()), r = I.validate(entity, rows, ctx);
        if (r.empty) { out.innerHTML = '<p class="err">' + esc(t('dh_empty')) + '</p>'; return; }
        if (r.missing.length) { out.innerHTML = '<p class="err">' + esc(t('dh_missing_cols')) + ': ' + esc(r.missing.join(', ')) + '</p>'; return; }
        var good = r.items.filter(function (i) { return i.ok; }), bad = r.items.filter(function (i) { return !i.ok; });
        out.innerHTML = '<div class="stat3"><div class="sbox"><b>' + r.items.length + '</b><span>' + esc(t('dh_rows')) + '</span></div><div class="sbox ok"><b>' + good.length + '</b><span>' + esc(t('dh_valid')) + '</span></div><div class="sbox ' + (bad.length ? 'bad' : '') + '"><b>' + bad.length + '</b><span>' + esc(t('dh_errors')) + '</span></div></div>' +
          (r.unknown.length ? '<div class="note">' + esc(t('dh_ignored')) + ': ' + esc(r.unknown.join(', ')) + '</div>' : '') +
          (bad.length ? '<h4>' + esc(t('dh_error_rows')) + '</h4>' + bad.slice(0, 100).map(function (b) { return '<div class="card"><b>' + esc(t('dh_row')) + ' ' + b.n + '</b> <span class="err">' + esc(b.error) + '</span></div>'; }).join('') + (bad.length > 100 ? '<p class="muted">… +' + (bad.length - 100) + '</p>' : '') + '<button class="btn small mb" id="ierr">⬇ ' + esc(t('dh_download_errors')) + '</button>' : '') +
          (good.length ? '<button class="btn primary mt" id="icommit">✔ ' + esc(t('dh_import_n')) + ' ' + good.length + '</button><div class="bar-bg" style="margin-top:10px;display:none" id="ipb"><div class="bar-fg" id="ipf" style="width:0"></div></div><div id="iout"></div>' : '');
        var eb = $('#ierr', out); if (eb) eb.onclick = function () { saveTable('import-errors', [['row', 'error']].concat(bad.map(function (b) { return [b.n, b.error]; }))); };
        var cb = $('#icommit', out); if (cb) cb.onclick = async function () {
          if (!confirm(t('dh_confirm') + ' ' + good.length)) return;
          cb.disabled = true; $('#ipb', out).style.display = 'block';
          try {
            var res = await commit(entity, good.map(function (g) { return g.rec; }), function (d, n) { $('#ipf', out).style.width = Math.round(d / n * 100) + '%'; });
            A.dropSchool && 0; $('#iout', out).innerHTML = '<div class="note ok">✓ ' + esc(t('dh_done')) + ': ' + res.ok + (res.fails.length ? ' · ' + esc(t('dh_failed')) + ': ' + res.fails.length : '') + '</div>' +
              res.fails.slice(0, 50).map(function (x) { return '<div class="card"><b>' + esc(x.id) + '</b> <span class="err">' + esc(x.error) + '</span></div>'; }).join('');
            if (entity === 'teachers' || entity === 'parents') {
              var bad2 = {}; res.fails.forEach(function (x) { bad2[x.id] = 1; });
              var logins = good.map(function (g) { return g.rec; }).filter(function (r) { return !bad2[r.login_id]; }).map(function (r) { return [r.login_id, r.full_name, r.password]; });
              var lb = document.createElement('button'); lb.className = 'btn primary mt'; lb.textContent = '⬇ Download login list (ID + password)';
              lb.onclick = function () { saveTable(entity + '-logins', [['Login ID', 'Name', 'Password']].concat(logins)); };
              $('#iout', out).appendChild(lb);
            }
          } catch (e) { $('#iout', out).innerHTML = '<p class="err">' + esc(A.errText(e)) + '</p>'; cb.disabled = false; }
        };
      } catch (e) { out.innerHTML = '<p class="err">' + esc(A.errText(e)) + '</p>'; }
      ev.target.value = '';
    };
  }

  async function exportTab(box) {
    box.innerHTML = '<div class="note">' + esc(t('dh_export_note')) + '</div><div class="row mb"><label class="muted sm">' + esc(t('from_date')) + ' <input type="date" id="xf" value="' + A.addDays(A.today(), -30) + '"></label><label class="muted sm">' + esc(t('to_date')) + ' <input type="date" id="xt" value="' + A.today() + '"></label></div>' +
      '<div class="grid2">' + EXPORTS.map(function (k) { return '<button class="btn" data-x="' + k + '">⬇ ' + esc(t('ent_' + k)) + '</button>'; }).join('') + '</div><button class="btn primary mt" id="xall">📦 ' + esc(t('dh_full_backup')) + '</button><div id="xmsg" class="muted sm mt"></div>';
    function opts() { return { from: $('#xf', box).value, to: $('#xt', box).value }; }
    box.querySelectorAll('[data-x]').forEach(function (b) {
      b.onclick = async function () { b.disabled = true; try { await saveTable(b.getAttribute('data-x') + '-' + stamp(), await EXP[b.getAttribute('data-x')](opts())); } catch (e) { toast(A.errText(e), true); } b.disabled = false; };
    });
    $('#xall', box).onclick = async function () {
      var btn = $('#xall', box); btn.disabled = true;
      try {
        var X = await A.loadXlsx(), wb = X.utils.book_new(), names = EXPORTS.filter(function (k) { return k !== 'attendance'; }).concat(['attendance']);
        for (var i = 0; i < names.length; i++) { $('#xmsg', box).textContent = names[i] + '…'; X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(await EXP[names[i]](names[i] === 'attendance' ? { from: '2000-01-01', to: '2999-12-31' } : opts())), names[i]); }
        X.writeFile(wb, 'amar-school-backup-' + stamp() + '.xlsx'); $('#xmsg', box).textContent = '✓ ' + t('export_done');
      } catch (e) { toast(A.errText(e), true); $('#xmsg', box).textContent = ''; }
      btn.disabled = false;
    };
  }
})();
