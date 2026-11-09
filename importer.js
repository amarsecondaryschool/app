/* Bulk import logic (pure functions: no screen, no database).
   Reads a table (from CSV or Excel), matches columns by name, checks every row
   and produces ready-to-save records plus a clear error for each bad row. */
(function (root) {
  'use strict';

  /* ---------- CSV ---------- */
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '';
    var delim = ',';
    if ((first.match(/\t/g) || []).length > (first.match(/,/g) || []).length) delim = '\t';
    else if ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) delim = ';';
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = ''; rows.push(row); row = [];
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  /* ---------- value helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function validYmd(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  /* returns {v:'YYYY-MM-DD'|null} or {err:true} */
  function normDate(v) {
    if (v === '' || v === null || v === undefined) return { v: null };
    if (v instanceof Date) return { v: v.toISOString().slice(0, 10) };
    if (typeof v === 'number') {                       // Excel serial date
      if (v < 1 || v > 80000) return { err: true };
      return { v: new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10) };
    }
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(s))) {
      return validYmd(+m[1], +m[2], +m[3]) ? { v: m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) } : { err: true };
    }
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(s))) {   // day first
      return validYmd(+m[3], +m[2], +m[1]) ? { v: m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]) } : { err: true };
    }
    return { err: true };
  }
  function normNum(v) {
    if (v === '' || v === null || v === undefined) return { v: null };
    var n = Number(String(v).replace(/,/g, '').trim());
    return isFinite(n) ? { v: n } : { err: true };
  }
  function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function key(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function lc(s) { return txt(s).toLowerCase(); }
  function yes(v) { return /^(y|yes|true|1|absent|ab|x|अनुपस्थित)$/i.test(txt(v)); }

  var GENDER = { male: 'male', m: 'male', boy: 'male', 'पुरुष': 'male', female: 'female', f: 'female', girl: 'female', 'महिला': 'female', other: 'other', o: 'other', 'अन्य': 'other' };
  var STATUS = { present: 'present', p: 'present', absent: 'absent', a: 'absent', late: 'late', l: 'late', leave: 'leave', lv: 'leave' };
  var STU_STATUS = { active: 'active', transferred: 'transferred', archived: 'archived' };
  var FEE_CAT = { admission: 1, tuition: 1, exam: 1, transport: 1, other: 1 };
  var EVT = { public_holiday: 1, school_holiday: 1, exam: 1, event: 1, meeting: 1 };

  /* ---------- entity definitions ----------
     columns: key (our name), aliases (other accepted header names), req, ex (example for template)
     check(raw, ctx, add) -> record or throws Error(message)
     ctx: { classes:{lcname:{id}}, sections:{classId|lcname:{id}}, subjects:{lcname:{id}}, studentCodes:{lccode:id},
            teacherCodes:{lccode:id}, exams:{lcname:{id}}, examSubjects:{exam|class|subject: row}, seen:{} } */
  function need(raw, k, label) { var v = txt(raw[k]); if (!v) throw new Error((label || k) + ' is required'); return v; }
  function dateOf(raw, k, req) {
    var r = normDate(raw[k]);
    if (r.err) throw new Error(k + ': use YYYY-MM-DD (e.g. 2026-11-09)');
    if (req && !r.v) throw new Error(k + ' is required');
    return r.v;
  }
  function numOf(raw, k, req, min) {
    var r = normNum(raw[k]);
    if (r.err) throw new Error(k + ' must be a number');
    if (r.v === null) { if (req) throw new Error(k + ' is required'); return null; }
    if (min !== undefined && r.v < min) throw new Error(k + ' must be at least ' + min);
    return r.v;
  }
  function dup(ctx, scope, id) {
    var k = scope + '|' + id; ctx.seen = ctx.seen || {};
    if (ctx.seen[k]) throw new Error('Duplicate in this file: ' + id);
    ctx.seen[k] = 1;
  }
  function findClass(ctx, name, req) {
    var n = lc(name); if (!n) { if (req) throw new Error('class is required'); return null; }
    var c = ctx.classes[n]; if (!c) throw new Error('Class "' + txt(name) + '" does not exist (add it first)'); return c;
  }
  function findSection(ctx, cls, name) {
    var n = lc(name); if (!n) return null;
    if (!cls) throw new Error('section needs a class');
    var s = ctx.sections[cls.id + '|' + n]; if (!s) throw new Error('Section "' + txt(name) + '" does not exist in ' + cls.name); return s;
  }
  function studentId(ctx, code) {
    var id = ctx.studentCodes[lc(code)]; if (!id) throw new Error('Student ID "' + txt(code) + '" not found'); return id;
  }

  var ENTITIES = {
    students: {
      columns: [
        { key: 'student_code', aliases: ['studentid', 'id', 'regno', 'regdno', 'registrationno', 'studentiemisid', 'iemisid'], req: 1, ex: 'ST001' },
        { key: 'admission_no', aliases: ['admissionnumber', 'admissionno'], ex: 'AD-101' },
        { key: 'full_name', aliases: ['name', 'studentname', 'fullnameenglish'], req: 1, ex: 'Sita Sharma' },
        { key: 'full_name_ne', aliases: ['nameneplai', 'fullnamenepali', 'nepaliname', 'studentnameinnepali'], ex: 'सीता शर्मा' },
        { key: 'dob', aliases: ['dateofbirth', 'birthdate'], ex: '2012-03-04' },
        { key: 'gender', aliases: ['sex'], ex: 'female' },
        { key: 'blood_group', aliases: ['bloodgroup', 'blood'], ex: 'A+' },
        { key: 'address', aliases: ['permanentaddress'], ex: 'Kathmandu' },
        { key: 'father_name', aliases: ['fathername'], ex: 'Hari Sharma' },
        { key: 'mother_name', aliases: ['mothername'], ex: 'Gita Sharma' },
        { key: 'is_transferred', aliases: ['istransferred'], ex: 'No' },
        { key: 'class', aliases: ['classname', 'grade'], ex: 'Class 8' },
        { key: 'section', ex: 'A' },
        { key: 'roll_no', aliases: ['roll', 'rollno', 'rollnumber'], ex: '7' },
        { key: 'admission_date', aliases: ['admissiondate'], ex: '2020-04-14' },
        { key: 'previous_school', aliases: ['previousschool'] },
        { key: 'guardian_name', aliases: ['guardian', 'parentname'], ex: 'Ram Sharma' },
        { key: 'guardian_phone', aliases: ['guardiancontact', 'guardiancontactnumber', 'contact', 'contactno', 'phone'], ex: '9800000000' },
        { key: 'emergency_phone', aliases: ['emergencycontact'] },
        { key: 'house', ex: 'BLUE - SAGARMATHA' },
        { key: 'emis_no', aliases: ['emis', 'emisno'] },
        { key: 'status', ex: 'active' }
      ],
      check: function (r, ctx) {
        var code = need(r, 'student_code', 'Student ID'); dup(ctx, 'stu', lc(code));
        var cn = txt(r['class']); if (/^\d+$/.test(cn)) cn = 'Class ' + cn;
        var cls = findClass(ctx, cn, false), sec = findSection(ctx, cls, r.section);
        var dobRaw = txt(r.dob), dobBs = null, dobAd = null, yr = parseInt(dobRaw.slice(0, 4), 10);
        if (yr > 2030) dobBs = dobRaw.slice(0, 10); else dobAd = dateOf(r, 'dob');
        var g = txt(r.gender) ? GENDER[lc(r.gender)] : null;
        if (txt(r.gender) && !g) throw new Error('gender must be male, female or other');
        var st = txt(r.status) ? STU_STATUS[lc(r.status)] : (yes(r.is_transferred) ? 'transferred' : 'active');
        if (!st) throw new Error('status must be active, transferred or archived');
        return { student_code: code, admission_no: txt(r.admission_no) || null, full_name: need(r, 'full_name', 'Name').replace(/\s+/g, ' '),
          full_name_ne: txt(r.full_name_ne) || null, dob: dobAd, dob_bs: dobBs, father_name: txt(r.father_name).replace(/\s+/g, ' ') || null, mother_name: txt(r.mother_name).replace(/\s+/g, ' ') || null, gender: g, blood_group: txt(r.blood_group) || null,
          address: txt(r.address) || null, class_id: cls ? cls.id : null, section_id: sec ? sec.id : null,
          roll_no: numOf(r, 'roll_no', false, 0), admission_date: dateOf(r, 'admission_date'), previous_school: txt(r.previous_school) || null,
          guardian_name: txt(r.guardian_name) || null, guardian_phone: txt(r.guardian_phone) || null,
          emergency_phone: txt(r.emergency_phone) || null, house: txt(r.house) || null, emis_no: txt(r.emis_no) || (/^\d{10,}$/.test(code) ? code : null), status: st };
      }
    },
    teachers: {
      columns: [
        { key: 'login_id', aliases: ['teacherid', 'id', 'teachercode'], ex: 'TCH001' },
        { key: 'password', ex: 'ChangeMe123' },
        { key: 'full_name', aliases: ['name', 'teachername'], req: 1, ex: 'Hari Prasad' },
        { key: 'full_name_ne', aliases: ['nameneplai', 'nepaliname'], ex: 'हरि प्रसाद' },
        { key: 'phone', aliases: ['contact', 'mobile', 'contactnumber'], ex: '9800000001' },
        { key: 'address', ex: 'Lalitpur' }
      ],
      check: function (r, ctx) {
        var id = txt(r.login_id);
        if (!id) {                                  // auto-generate TCH001, TCH002 ... skipping used ones
          ctx.tseq = ctx.tseq || 0;
          do { ctx.tseq++; id = 'TCH' + String(ctx.tseq).padStart(3, '0'); } while ((ctx.teacherCodes && ctx.teacherCodes[lc(id)]) || (ctx.seen && ctx.seen['tch|' + lc(id)]));
        }
        dup(ctx, 'tch', lc(id));
        if (!/^[A-Za-z0-9._-]{3,30}$/.test(id)) throw new Error('ID must be 3-30 letters/numbers (. - _ allowed)');
        var pw = txt(r.password) || ('Amar' + String(Math.floor(1000 + Math.random() * 9000)));
        if (pw.length < 8) throw new Error('password must be at least 8 characters');
        return { login_id: id, password: pw, full_name: need(r, 'full_name', 'Name').replace(/\s+/g, ' '), full_name_ne: txt(r.full_name_ne),
                 phone: txt(r.phone), address: txt(r.address), student_codes: '' };
      }
    },
    parents: {
      columns: [
        { key: 'login_id', aliases: ['parentid', 'id'], req: 1, ex: 'PAR001' },
        { key: 'password', req: 1, ex: 'ChangeMe123' },
        { key: 'full_name', aliases: ['name', 'parentname'], req: 1, ex: 'Ram Sharma' },
        { key: 'phone', aliases: ['contact', 'mobile'], ex: '9800000000' },
        { key: 'student_codes', aliases: ['students', 'studentid', 'children', 'childid'], ex: 'ST001, ST002' }
      ],
      check: function (r, ctx) {
        var id = need(r, 'login_id', 'Parent ID'); dup(ctx, 'par', lc(id));
        if (!/^[A-Za-z0-9._-]{3,30}$/.test(id)) throw new Error('ID must be 3-30 letters/numbers (. - _ allowed)');
        var pw = txt(r.password); if (pw.length < 8) throw new Error('password must be at least 8 characters');
        var codes = txt(r.student_codes).split(/[,;]/).map(txt).filter(Boolean);
        codes.forEach(function (c) { studentId(ctx, c); });
        return { login_id: id, password: pw, full_name: need(r, 'full_name', 'Name'), full_name_ne: '', phone: txt(r.phone),
                 address: '', student_codes: codes.join(',') };
      }
    },
    classes: {
      columns: [
        { key: 'name', aliases: ['class', 'classname'], req: 1, ex: 'Class 8' },
        { key: 'name_ne', aliases: ['nepaliname'], ex: 'कक्षा ८' },
        { key: 'level', aliases: ['order', 'number'], req: 1, ex: '8' },
        { key: 'sections', aliases: ['section'], ex: 'A, B' }
      ],
      check: function (r, ctx) {
        var name = need(r, 'name', 'Class name'); dup(ctx, 'cls', lc(name));
        var lvl = numOf(r, 'level', true, 0);
        return { name: name, name_ne: txt(r.name_ne) || null, level: Math.round(lvl),
                 sections: txt(r.sections).split(/[,;]/).map(txt).filter(Boolean) };
      }
    },
    subjects: {
      columns: [
        { key: 'name', aliases: ['subject', 'subjectname'], req: 1, ex: 'Mathematics' },
        { key: 'name_ne', aliases: ['nepaliname'], ex: 'गणित' }
      ],
      check: function (r, ctx) {
        var name = need(r, 'name', 'Subject name'); dup(ctx, 'sub', lc(name));
        return { name: name, name_ne: txt(r.name_ne) || null };
      }
    },
    assignments: {
      columns: [
        { key: 'teacher_id', aliases: ['teachercode', 'teacher', 'id'], req: 1, ex: 'TCH001' },
        { key: 'class', aliases: ['classname'], req: 1, ex: 'Class 8' },
        { key: 'section', ex: 'A' },
        { key: 'subject', aliases: ['subjectname'], req: 1, ex: 'Mathematics' }
      ],
      check: function (r, ctx) {
        var tid = ctx.teacherCodes[lc(need(r, 'teacher_id', 'Teacher ID'))]; if (!tid) throw new Error('Teacher ID "' + txt(r.teacher_id) + '" not found');
        var cls = findClass(ctx, r['class'], true), sec = findSection(ctx, cls, r.section);
        var sub = ctx.subjects[lc(need(r, 'subject', 'Subject'))]; if (!sub) throw new Error('Subject "' + txt(r.subject) + '" does not exist');
        return { teacher_id: tid, class_id: cls.id, section_id: sec ? sec.id : null, subject_id: sub.id };
      }
    },
    library: {
      columns: [
        { key: 'title', aliases: ['book', 'bookname'], req: 1, ex: 'Atlas of Nepal' },
        { key: 'author', ex: 'S. Rai' },
        { key: 'isbn', ex: '9780000000000' },
        { key: 'copies', aliases: ['quantity', 'qty'], ex: '3' }
      ],
      check: function (r) {
        var c = numOf(r, 'copies', false, 1);
        return { title: need(r, 'title'), author: txt(r.author) || null, isbn: txt(r.isbn) || null, copies: c === null ? 1 : Math.round(c) };
      }
    },
    fees: {
      columns: [
        { key: 'student_code', aliases: ['studentid', 'id'], req: 1, ex: 'ST001' },
        { key: 'title', aliases: ['fee', 'feename', 'description'], req: 1, ex: 'Tuition - Kartik' },
        { key: 'category', ex: 'tuition' },
        { key: 'amount', req: 1, ex: '1500' },
        { key: 'due_date', aliases: ['duedate', 'due'], ex: '2026-11-30' }
      ],
      check: function (r, ctx) {
        var sid = studentId(ctx, need(r, 'student_code', 'Student ID'));
        var cat = txt(r.category) ? lc(r.category) : 'tuition';
        if (!FEE_CAT[cat]) throw new Error('category must be admission, tuition, exam, transport or other');
        return { student_id: sid, title: need(r, 'title'), category: cat, amount: numOf(r, 'amount', true, 0), due_date: dateOf(r, 'due_date') };
      }
    },
    events: {
      columns: [
        { key: 'title', aliases: ['event', 'name'], req: 1, ex: 'Dashain holiday' },
        { key: 'title_ne', aliases: ['nepalititle'], ex: 'दशैँ बिदा' },
        { key: 'event_date', aliases: ['date', 'start', 'startdate'], req: 1, ex: '2026-10-20' },
        { key: 'end_date', aliases: ['enddate', 'end'], ex: '2026-10-29' },
        { key: 'kind', aliases: ['type'], ex: 'public_holiday' },
        { key: 'notes' }
      ],
      check: function (r) {
        var kind = txt(r.kind) ? lc(r.kind).replace(/[ -]/g, '_') : 'event';
        if (!EVT[kind]) throw new Error('kind must be public_holiday, school_holiday, exam, event or meeting');
        var s = dateOf(r, 'event_date', true), e = dateOf(r, 'end_date');
        if (e && e < s) throw new Error('end_date is before event_date');
        return { title: need(r, 'title'), title_ne: txt(r.title_ne) || null, event_date: s, end_date: e, kind: kind, notes: txt(r.notes) || null };
      }
    },
    attendance: {
      columns: [
        { key: 'student_code', aliases: ['studentid', 'id'], req: 1, ex: 'ST001' },
        { key: 'date', aliases: ['attdate', 'attendancedate'], req: 1, ex: '2026-11-09' },
        { key: 'status', req: 1, ex: 'present' }
      ],
      check: function (r, ctx) {
        var sid = studentId(ctx, need(r, 'student_code', 'Student ID'));
        var d = dateOf(r, 'date', true), st = STATUS[lc(need(r, 'status'))];
        if (!st) throw new Error('status must be present, absent, late or leave');
        dup(ctx, 'att', sid + d);
        return { student_id: sid, att_date: d, status: st };
      }
    },
    marks: {
      columns: [
        { key: 'exam', aliases: ['examname'], req: 1, ex: 'First Terminal' },
        { key: 'class', aliases: ['classname'], req: 1, ex: 'Class 8' },
        { key: 'subject', aliases: ['subjectname'], req: 1, ex: 'Mathematics' },
        { key: 'student_code', aliases: ['studentid', 'id'], req: 1, ex: 'ST001' },
        { key: 'theory', ex: '62' },
        { key: 'practical', ex: '20' },
        { key: 'internal', ex: '' },
        { key: 'absent', ex: '' }
      ],
      check: function (r, ctx) {
        var ex = ctx.exams[lc(need(r, 'exam', 'Exam'))]; if (!ex) throw new Error('Exam "' + txt(r.exam) + '" does not exist');
        var cls = findClass(ctx, r['class'], true), sub = ctx.subjects[lc(need(r, 'subject', 'Subject'))];
        if (!sub) throw new Error('Subject "' + txt(r.subject) + '" does not exist');
        var sid = studentId(ctx, need(r, 'student_code', 'Student ID'));
        var es = ctx.examSubjects[ex.id + '|' + cls.id + '|' + sub.id];
        if (!es) throw new Error('This subject is not set up for ' + cls.name + ' in this exam');
        var stuClass = ctx.studentClass && ctx.studentClass[sid];
        if (stuClass && stuClass !== cls.id) throw new Error('Student is not in ' + cls.name);
        dup(ctx, 'mk', ex.id + sub.id + sid);
        var absent = yes(r.absent);
        var th = numOf(r, 'theory', false, 0), pr = numOf(r, 'practical', false, 0), inn = numOf(r, 'internal', false, 0);
        if (!absent) {
          if (th === null && pr === null && inn === null) throw new Error('enter marks, or mark absent');
          if (th !== null && th > Number(es.theory_marks)) throw new Error('theory is above ' + es.theory_marks);
          if (pr !== null && pr > Number(es.practical_marks)) throw new Error('practical is above ' + es.practical_marks);
          if (inn !== null && inn > Number(es.internal_marks)) throw new Error('internal is above ' + es.internal_marks);
        }
        return { exam_id: ex.id, student_id: sid, subject_id: sub.id, theory: absent ? null : th, practical: absent ? null : pr,
                 internal: absent ? null : inn, is_absent: absent, status: 'submitted' };
      }
    }
  };

  /* header row -> column map. Returns {map:{colIndex:key}, missing:[required keys not found], unknown:[headers ignored]} */
  function mapHeaders(headerRow, entity) {
    var byKey = {}, map = {}, unknown = [];
    entity.columns.forEach(function (c) {
      byKey[key(c.key)] = c.key;
      (c.aliases || []).forEach(function (a) { if (!byKey[key(a)]) byKey[key(a)] = c.key; });
    });
    var used = {};
    headerRow.forEach(function (h, i) {
      var k = byKey[key(h)];
      if (k && !used[k]) { map[i] = k; used[k] = 1; } else if (txt(h)) unknown.push(txt(h));
    });
    var missing = entity.columns.filter(function (c) { return c.req && !used[c.key]; }).map(function (c) { return c.key; });
    return { map: map, missing: missing, unknown: unknown };
  }

  /* rows2d: [[header...],[row...],...]  ->  [{n, ok, error, rec}] */
  function validate(entityName, rows2d, ctx) {
    var ent = ENTITIES[entityName];
    if (!ent) throw new Error('Unknown import type');
    if (!rows2d.length) return { items: [], missing: [], unknown: [], empty: true };
    var h = mapHeaders(rows2d[0], ent);
    if (h.missing.length) return { items: [], missing: h.missing, unknown: h.unknown };
    ctx.seen = {};
    var items = [];
    for (var i = 1; i < rows2d.length; i++) {
      var raw = {}, any = false;
      Object.keys(h.map).forEach(function (ci) { var v = rows2d[i][ci]; raw[h.map[ci]] = v; if (txt(v) !== '') any = true; });
      if (!any) continue;
      try { items.push({ n: i + 1, ok: true, rec: ent.check(raw, ctx) }); }
      catch (e) { items.push({ n: i + 1, ok: false, error: e.message, raw: raw }); }
    }
    return { items: items, missing: [], unknown: h.unknown };
  }

  function template(entityName) {
    var ent = ENTITIES[entityName];
    return [ent.columns.map(function (c) { return c.key; }), ent.columns.map(function (c) { return c.ex === undefined ? '' : c.ex; })];
  }

  var api = { parseCsv: parseCsv, normDate: normDate, normNum: normNum, mapHeaders: mapHeaders, validate: validate,
              template: template, ENTITIES: ENTITIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AmarImport = api;
})(typeof window !== 'undefined' ? window : this);
