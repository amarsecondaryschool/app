/* Class routine: admin edits it; teachers see their own periods; parents see only their child's class. */
(function () {
  'use strict';
  var A = window.AMAR, db = A.db, $ = A.$, esc = A.esc, must = A.must, toast = A.toast, state = A.state, V = A.views;
  var RT = {"periods": [["1st", "10:10-11:00"], ["2nd", "11:00-11:45"], ["3rd", "11:55-12:40"], ["4th", "12:40-1:20"], ["5th", "1:50-2:30"], ["6th", "2:30-3:10"], ["7th", "3:20-4:00"]], "rows": {"1": ["English/SC", "Serofero/JO", "Math/PN", "Nepali/Juna", "Science/SC", "Local+GK/JO", "ECA(2,4)/PN\nECA-6/Juna,ECA-(3,5)/SC"], "2": ["Maths/PC", "Nepali/Juna", "Science/Nisha", "Serofero/JO", "English/Nisha\nNepali-4/Juna", "Local+GK/PN\nEnglish-4/Nisha", "ECA-2,S.F.-3,4/JO\nECA-(5,6)/PN"], "3": ["English/Nisha", "Math/PA", "Serofero/SC\nScience-4/PC", "Science/PC\nSerofero-4/SC", "Local+GK/JO", "Nepali/Juna", "Eng-2/SC,ECA-4,6/SC\nECA-3/PN,Maths-5/PA"], "4": ["Science/PA", "English/SC", "Math/PA\nCom(3,4)/JO", "Local/Nisha\nMath(3-4)/PA", "Social/PN", "HPC/PC\nLocal-3/Nisha", "Nepali/BA"], "5": ["English/PN", "Science/RP", "Local/Juna\nCom(5-6)/PC", "Nepali/BA", "HPC/PC\nScience-6/RP", "Math/SD", "Social/Nisha"], "6": ["Science/RP", "Nepali/KS", "Math/SD", "Local/HB\nCom-4/PC", "Social/JG\nCom-6/PC", "English/IL", "HPC/SS"], "7": ["Nepali/BA", "Math/SD", "Social/JG\nCom-3/PC", "English/CU", "HPC/PA\nNepali-4/BA", "Science/RP", "Local/HB\nCom-3/PC"], "8": ["Social/JG", "Nepali/BA", "Science/RP\nCom-2/PC", "Maths/SD", "English/CU", "Local/JG\nCom-3/PC", "HPC/PA\nScience-2/RP"], "9A": ["English/IL\nScience-6/SS", "Social/JG\nEnglish-6/IL", "O.Math/BS", "Nepali/KS", "Science/SS", "Maths/BS", "Computer/MC"], "9B": ["Math/SD", "Science/SS", "Eco./MG", "English/IL", "Social/MG", "Nepali/KS", "Account/MM"], "10": ["Nepali/KS", "Social/TBG", "English/IL", "Science/SS", "O.Math/BS\nEco./TBG", "Com./MC\nAcc./TP", "Math/BS"], "11": ["English/HB", "Social/CU", "HM-Sandip\nB.Studies/TP", "Economics/TBG", "Account/TP", "Nepali/MG", ""], "12": ["Nepali/MG", "HM-Sandip\nB.Studies/TP", "Social/CU", "Account/TP", "English/HB", "Economics/TBG", ""]}, "legend": [["BS", "Buddhiman Sharma"], ["MG", "Mina Ghimire"], ["SS", "Suman Subedi"], ["JG", "Jyoti Gurung"], ["PC", "Pushpak Chapagain"], ["PA", "Prakash Adai"], ["TP", "Tilak Prasad Panday"], ["TBG", "Top Bahadur Gautam"], ["SD", "Shiva Dhungana"], ["BA", "Bhawani Adhikari"], ["PN", "Pratikshya Neupane"], ["KS", "Kul Prasad Sapkota"], ["IL", "Ishwor Lamsal"], ["CU", "Chhabi Upadhyaya"], ["MC", "Manoj Chaudhary"], ["JO", "Jyoti Ojha"], ["HB", "Hari Bhandari"], ["AP", "Arjun Panta"], ["RP", "Ram Poudel"], ["MM", "Mahesh Mahato"], ["SC", ""], ["Juna", ""], ["Nisha", ""]]};
  function br(x) { return esc(x).replace(/\n/g, '<br>'); }
  function opts(a, f) { return a.map(f).join(''); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }

  async function loadGiven() {
    var sch = await A.school(), cls = []; for (var n = 1; n <= 12; n++) cls.push({ school_id: sch.id, name: 'Class ' + n, level: n });
    must(await db.from('classes').upsert(cls, { onConflict: 'school_id,name' }));
    var lk = await A.lookups(true), id = {}; lk.classes.forEach(function (c) { id[c.name] = c.id; });
    must(await db.from('routine_periods').upsert(RT.periods.map(function (p, i) { return { period: i + 1, label: p[0], time_text: p[1] }; })));
    var tch = must(await db.from('teachers').select('id,full_name'));
    must(await db.from('routine_legend').upsert(RT.legend.map(function (l) { if (l[0] === 'SC' && !l[1]) l[1] = 'Sunita Chapagain'; var t = tch.filter(function (x) { return norm(x.full_name) === norm(l[1]); })[0]; return { code: l[0], name: l[1], teacher_id: t ? t.id : null }; })));
    var cells = []; Object.keys(RT.rows).forEach(function (lab) { var m = /^(\d+)([AB])?$/.exec(lab); if (!m || !id['Class ' + m[1]]) return;
      RT.rows[lab].forEach(function (c, i) { cells.push({ class_id: id['Class ' + m[1]], sec: m[2] || '', period: i + 1, cell: c }); }); });
    must(await db.from('routine_cells').upsert(cells, { onConflict: 'class_id,sec,period' }));
  }

  V.classRoutineSettings = async function (el) {
    A.skeleton(el);
    var tab = state.rtTab || 'routine';
    el.innerHTML = '<button class="btn small" id="rbk" style="margin-bottom:10px">← Back to routine</button><div class="seg" style="display:flex">' + [['routine', 'Routine'], ['codes', 'Teacher codes'], ['ct', 'Class teachers']].map(function (b) { return '<button style="flex:1" data-t="' + b[0] + '" class="' + (b[0] === tab ? 'on' : '') + '">' + b[1] + '</button>'; }).join('') + '</div><div id="rb" style="margin-top:12px"></div>';
    el.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { state.rtTab = b.getAttribute('data-t'); V.classRoutineSettings(el); }; });
    $('#rbk', el).onclick = function () { V.classRoutine(el); };
    var box = $('#rb', el);
    try {
      var lk = await A.lookups(true), tch = must(await db.from('teachers').select('id,full_name').order('full_name'));
      if (tab === 'routine') {
        var cells = must(await db.from('routine_cells').select('*')), per = must(await db.from('routine_periods').select('*').order('period'));
        if (!cells.length) { box.innerHTML = '<div class="note">No routine yet. Load the daily routine from your Word file (effective 1st Bhadra 2083). You can edit every period afterwards.</div><button class="btn primary" id="ld" style="width:100%">Load the given routine</button>';
          $('#ld', box).onclick = async function () { this.disabled = true; this.textContent = 'Loading…'; try { await loadGiven(); toast('✓ Routine loaded'); V.classRoutineSettings(el); } catch (e) { toast(A.errText(e), true); } }; return; }
        var keys = []; lk.classes.slice().sort(function (a, b) { return a.level - b.level; }).forEach(function (c) { var secs = {}; cells.forEach(function (x) { if (x.class_id === c.id) secs[x.sec] = 1; }); var s = Object.keys(secs); if (!s.length) s = ['']; s.sort().forEach(function (q) { keys.push({ v: c.id + '|' + q, l: A.nm(c) + (q ? ' – ' + q : '') }); }); });
        box.innerHTML = '<div class="pick"><label>Class</label><select id="rk">' + opts(keys, function (k) { return '<option value="' + k.v + '">' + esc(k.l) + '</option>'; }) + '</select></div><div id="re"></div>';
        var draw = function () { var p = $('#rk', box).value.split('|'), cid = p[0], sec = p[1] || '';
          $('#re', box).innerHTML = opts(per, function (x) { var c = cells.filter(function (y) { return y.class_id === cid && y.sec === sec && y.period === x.period; })[0]; return '<div class="card rtc"><div class="rth"><b>' + esc(x.label) + ' period</b><span>' + esc(x.time_text || '') + '</span></div><textarea rows="2" data-p="' + x.period + '" placeholder="Subject/Teacher code">' + esc(c ? c.cell : '') + '</textarea></div>'; }) + '<button class="btn primary" id="rsv" style="width:100%;margin-top:6px">Save this class routine</button>';
          $('#rsv', box).onclick = async function () { try { var rows = Array.prototype.map.call(box.querySelectorAll('textarea[data-p]'), function (t) { return { class_id: cid, sec: sec, period: +t.getAttribute('data-p'), cell: t.value.trim() }; });
            must(await db.from('routine_cells').upsert(rows, { onConflict: 'class_id,sec,period' })); rows.forEach(function (r) { var o = cells.filter(function (y) { return y.class_id === cid && y.sec === sec && y.period === r.period; })[0]; if (o) o.cell = r.cell; else cells.push(r); }); toast('✓ Saved'); } catch (e) { toast(A.errText(e), true); } }; };
        $('#rk', box).onchange = draw; draw();
      } else if (tab === 'codes') {
        var leg = must(await db.from('routine_legend').select('*').order('code'));
        box.innerHTML = '<div class="note">The routine uses short codes (for example PN, SS). Link each code to the real teacher. Teachers then see their own periods.</div>' + opts(leg, function (l) { return '<div class="card row between"><div><b>' + esc(l.code) + '</b><div class="muted sm">' + esc(l.name || '') + '</div></div><select class="mini-sel" data-c="' + esc(l.code) + '"><option value="">— teacher —</option>' + opts(tch, function (t) { return '<option value="' + t.id + '"' + (l.teacher_id === t.id ? ' selected' : '') + '>' + esc(t.full_name) + '</option>'; }) + '</select></div>'; }) +
          '<div class="row mt"><input id="nc" class="search" placeholder="New code"><button class="btn small" id="ncb">Add</button></div>';
        box.querySelectorAll('select[data-c]').forEach(function (s) { s.onchange = async function () { try { must(await db.from('routine_legend').update({ teacher_id: s.value || null }).eq('code', s.getAttribute('data-c'))); toast('✓ Saved'); } catch (e) { toast(A.errText(e), true); } }; });
        $('#ncb', box).onclick = async function () { var c = $('#nc', box).value.trim(); if (!c) return; try { must(await db.from('routine_legend').upsert({ code: c })); V.classRoutineSettings(el); } catch (e) { toast(A.errText(e), true); } };
      } else {
        var cl = must(await db.from('classes').select('id,name,level,class_teacher_id').order('level'));
        box.innerHTML = '<div class="note">The class teacher is the only teacher who can take attendance of that class.</div>' + opts(cl, function (c) { return '<div class="card row between"><b>' + esc(c.name) + '</b><select class="mini-sel" data-k="' + c.id + '"><option value="">— none —</option>' + opts(tch, function (t) { return '<option value="' + t.id + '"' + (c.class_teacher_id === t.id ? ' selected' : '') + '>' + esc(t.full_name) + '</option>'; }) + '</select></div>'; });
        box.querySelectorAll('select[data-k]').forEach(function (s) { s.onchange = async function () { try { must(await db.from('classes').update({ class_teacher_id: s.value || null }).eq('id', s.getAttribute('data-k'))); toast('✓ Saved'); } catch (e) { toast(A.errText(e), true); } }; });
      }
    } catch (e) { box.innerHTML = '<p class="err">' + esc(A.errText(e)) + '<br>Run 12_routine.sql in Supabase first.</p>'; }
  };

  var BREAKS = [{ after: 2, label: 'Mini Break', time: '11:45–11:55' }, { after: 4, label: 'Tiffin Break', time: '1:20–1:50' }, { after: 6, label: 'Mini Break', time: '3:10–3:20' }];
  var DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  function parseDays(s) { var o = {}; String(s || '').split(',').forEach(function (p) { var m = /^(\d)(?:-(\d))?$/.exec(p.trim()); if (!m) return; for (var i = +m[1]; i <= +(m[2] || m[1]); i++) if (i >= 1 && i <= 6) o[i] = 1; }); return o; }
  function packDays(o) { var a = [], i = 1; while (i <= 6) { if (o[i]) { var j = i; while (o[j + 1]) j++; a.push(j > i ? i + '-' + j : '' + i); i = j + 1; } else i++; } return a.join(','); }
  function fmtDays(s) { var o = parseDays(s), n = Object.keys(o).length; if (!n || n === 6) return ''; return packDays(o).split(',').map(function (x) { var q = x.split('-'); return q.length > 1 ? DAYN[q[0] - 1] + '–' + DAYN[q[1] - 1] : DAYN[q[0] - 1]; }).join(', '); }
  function tcase(x) { return String(x || '').toLowerCase().replace(/(^|\s)\S/g, function (m) { return m.toUpperCase(); }); }
  function splitLine(l) { var d = '', i = l.lastIndexOf('@'); if (i >= 0) { d = l.slice(i + 1).trim(); l = l.slice(0, i); } var j = l.lastIndexOf('/'); return j < 0 ? { s: l.trim(), c: '', d: d } : { s: l.slice(0, j).trim(), c: l.slice(j + 1).trim(), d: d }; }
  function tok(s) { return String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean); }
  function matchTeacher(name, tch) {
    var nt = tok(name), best = null, bs = 0, tie = false; if (!nt.length) return null;
    tch.forEach(function (t) { var tt = tok(t.full_name), sc = 0; nt.forEach(function (w) { if (tt.some(function (x) { return x.slice(0, 4) === w.slice(0, 4); })) sc++; }); if (sc > bs) { bs = sc; best = t; tie = false; } else if (sc === bs && sc > 0) tie = true; });
    if (!best || tie) return null; if (bs >= 2) return best;
    var tt2 = tok(best.full_name), last = nt[nt.length - 1]; return (tt2.some(function (x) { return x.slice(0, 4) === last.slice(0, 4); }) && nt.slice(0, -1).some(function (w) { return tt2.some(function (x) { return x.slice(0, 2) === w.slice(0, 2); }); })) ? best : null;
  }
  async function relink() {   // link routine codes to the real teachers (by name)
    var leg = must(await db.from('routine_legend').select('*')), tch = must(await db.from('teachers').select('id,full_name'));
    for (var i = 0; i < leg.length; i++) { var l = leg[i], nm = l.name || (l.code === 'SC' ? 'Sunita Chapagain' : ''); if (l.teacher_id && l.name) continue; var t = l.teacher_id ? null : matchTeacher(nm, tch);
      if (t || (nm && !l.name)) await db.from('routine_legend').update({ name: nm, teacher_id: l.teacher_id || (t ? t.id : null) }).eq('code', l.code); }
  }
  var SUBMAP = { english: 'English', eng: 'English', maths: 'Mathematics', math: 'Mathematics', mathematics: 'Mathematics', omath: 'Optional Mathematics', optmath: 'Optional Mathematics', optionalmath: 'Optional Mathematics', science: 'Science and Technology', sci: 'Science and Technology', nepali: 'Nepali', social: 'Social Studies', socialstudies: 'Social Studies', serofero: 'Our Surroundings', local: 'Local Subject', 'local+gk': 'Local Subject', localgk: 'Local Subject', hpc: 'Health Physical and Creative Arts', com: 'Computer Science', computer: 'Computer Science', eco: 'Economics', economics: 'Economics', account: 'Accountancy', acc: 'Accountancy', accountancy: 'Accountancy', bstudies: 'Business Studies', businessstudies: 'Business Studies' };
  function mapSub(t) { return SUBMAP[String(t).toLowerCase().replace(/[^a-z+]/g, '')] || null; }
  function classNums(str) { var out = []; String(str).split(',').forEach(function (p) { var m = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(p); if (m) for (var i = +m[1]; i <= +(m[2] || m[1]); i++) out.push(i); }); return out; }
  /* The routine is the main source: it creates every teacher's class+subject assignment and each class's class teacher(s) (1st period) */
  async function syncAll() {
    var lk = await A.lookups(true), cells = must(await db.from('routine_cells').select('*')), leg = must(await db.from('routine_legend').select('*')), subs = {}, byCode = {}, cByLevel = {}, want = {}, ct = {};
    lk.subjects.forEach(function (x) { subs[x.name] = x.id; }); leg.forEach(function (l) { if (l.teacher_id) byCode[l.code] = l.teacher_id; }); lk.classes.forEach(function (c) { cByLevel[c.level] = c.id; });
    cells.forEach(function (c) { c.cell.split('\n').forEach(function (line) { var x = splitLine(line), tid = byCode[x.c]; if (!tid || !x.s) return;
      var m = /^(.*?)\s*[-(]\s*\(?([\d,\- ]+)\)?\s*$/.exec(x.s), base = x.s, targets = [c.class_id];
      if (m) { base = m[1]; targets = classNums(m[2]).map(function (n) { return cByLevel[n]; }).filter(Boolean); } else if (c.period === 1) { (ct[c.class_id] = ct[c.class_id] || {})[tid] = 1; }
      var sn = mapSub(base), sid = sn ? subs[sn] : null; if (!sid) return;
      targets.forEach(function (cid) { want[tid + '|' + cid + '|' + sid] = { teacher_id: tid, class_id: cid, subject_id: sid }; }); }); });
    var wl = Object.keys(want).map(function (k) { return want[k]; }); if (!wl.length && !Object.keys(ct).length) return;
    must(await db.from('teacher_assignments').delete().not('id', 'is', null));
    for (var i = 0; i < wl.length; i += 200) must(await db.from('teacher_assignments').insert(wl.slice(i, i + 200)));
    must(await db.from('class_teachers').delete().not('class_id', 'is', null));
    var cts = []; Object.keys(ct).forEach(function (cid) { Object.keys(ct[cid]).forEach(function (tid) { cts.push({ class_id: cid, teacher_id: tid }); }); }); if (cts.length) must(await db.from('class_teachers').insert(cts));
  }
  function printHtml(per, keys, cellOf, who) {
    var ths = '<th>Class</th>', brk = function (i) { return BREAKS.filter(function (b) { return b.after === i; }); };
    per.forEach(function (p, i) { ths += '<th>' + esc(p.label) + '<br><small>' + esc(p.time_text || '') + '</small></th>'; brk(i + 1).forEach(function (b) { ths += '<th class="bk">' + b.label + '<br><small>' + b.time + '</small></th>'; }); });
    var body = keys.map(function (k, ri) { var tds = '<th>' + esc(k.l) + '</th>'; per.forEach(function (p, i) { var c = cellOf(k, p.period); tds += '<td>' + (c ? c.cell.split('\n').map(function (l) { var x = splitLine(l); return '<b>' + esc(x.s) + '</b>' + (x.c ? ' <i>' + esc(who(x.c)) + '</i>' : '') + (fmtDays(x.d) ? ' <small>(' + fmtDays(x.d) + ')</small>' : ''); }).join('<br>') : '') + '</td>'; brk(i + 1).forEach(function () { tds += ri === 0 ? '<td class="bk" rowspan="' + keys.length + '"></td>' : ''; }); }); return '<tr>' + tds + '</tr>'; }).join('');
    return '<html><head><title>Daily routine</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif}h2,h3{text-align:center;margin:2px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #234;padding:3px;text-align:center;vertical-align:middle}th{background:#1f6fb2;color:#fff}.bk{background:#e9eef4;color:#456;width:18px}th.bk{background:#8aa0b8;color:#fff}td i{color:#1c6fa8;font-style:normal;font-weight:700}small{font-size:8px}</style></head><body><h2>AMAR SECONDARY SCHOOL</h2><h3>DAILY ROUTINE – effective 1st Bhadra 2083</h3><table><tr>' + ths + '</tr>' + body + '</table></body></html>';
  }
  V.classRoutine = async function (el) {
    A.skeleton(el);
    try {
      try { await relink(); } catch (e0) {}
      var lk = await A.lookups(true), cells = must(await db.from('routine_cells').select('*')), per = must(await db.from('routine_periods').select('*').order('period')), leg = must(await db.from('routine_legend').select('*')), tch = must(await db.from('teachers').select('id,full_name').order('full_name'));
      if (!cells.length) { el.innerHTML = '<div class="note">No routine yet. Load the daily routine from your Word file (effective 1st Bhadra 2083). Then tap any box to change the subject, teacher or days.</div><button class="btn primary" id="ld" style="width:100%">Load the given routine</button>';
        $('#ld', el).onclick = async function () { this.disabled = true; this.textContent = 'Loading…'; try { await loadGiven(); await relink(); await syncAll(); toast('✓ Routine loaded'); V.classRoutine(el); } catch (e) { toast(A.errText(e), true); } }; return; }
      var tById = {}; tch.forEach(function (t) { tById[t.id] = t; });
      function legOf(code) { return leg.filter(function (l) { return l.code === code; })[0]; }
      function who(code) { var l = legOf(code), t = l && l.teacher_id ? tById[l.teacher_id] : null; return t ? tcase(t.full_name.split(' ')[0]) : code; }
      function cellOf(k, p) { return cells.filter(function (y) { return y.class_id === k.cid && y.sec === k.sec && y.period === p; })[0]; }
      var keys = []; lk.classes.slice().sort(function (a, b) { return a.level - b.level; }).forEach(function (c) { var q = {}; cells.forEach(function (x) { if (x.class_id === c.id) q[x.sec] = 1; }); Object.keys(q).sort().forEach(function (z) { keys.push({ cid: c.id, sec: z, l: c.name.replace(/^Class\s*/, '') + z }); }); });
      function brk(i) { return BREAKS.filter(function (b) { return b.after === i; }); }
      function draw() {
        var th = '<th class="stk">Class</th>'; per.forEach(function (p, i) { th += '<th>' + esc(p.label) + '<small>' + esc(p.time_text || '') + '</small></th>'; brk(i + 1).forEach(function (b) { th += '<th class="bkh">' + b.label + '<small>' + b.time + '</small></th>'; }); });
        var tb = keys.map(function (k, ri) { var tr = '<th class="stk">' + esc(k.l) + '</th>'; per.forEach(function (p, i) { var c = cellOf(k, p.period);
          tr += '<td data-e="' + k.cid + '|' + k.sec + '|' + p.period + '">' + ((c && c.cell) ? c.cell.split('\n').map(function (l) { var x = splitLine(l); return '<div class="rl"><b>' + esc(x.s) + '</b>' + (x.c ? '<i>' + esc(who(x.c)) + '</i>' : '') + (fmtDays(x.d) ? '<em class="dy">' + fmtDays(x.d) + '</em>' : '') + '</div>'; }).join('') : '<span class="muted">+</span>') + '</td>';
          brk(i + 1).forEach(function (b) { if (ri === 0) tr += '<td class="bkc" rowspan="' + keys.length + '"><span>' + b.label + '</span></td>'; }); }); return '<tr>' + tr + '</tr>'; }).join('');
        el.innerHTML = '<div class="note">Tap a box to choose subject, teacher and days. The 1st-period teacher becomes the class teacher; subjects and teachers here are used across the whole app.</div><div class="row" style="margin-bottom:10px"><button class="btn primary" id="dx" style="flex:1">Download Excel</button><button class="btn" id="dp" style="flex:1">Print / PDF</button></div><div class="rg"><table><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table></div>';
        el.querySelectorAll('td[data-e]').forEach(function (td) { td.onclick = function () { edit(td.getAttribute('data-e')); }; });
        $('#dp', el).onclick = function () { var w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print', true); w.document.write(printHtml(per, keys, cellOf, who)); w.document.close(); setTimeout(function () { w.print(); }, 400); };
        $('#dx', el).onclick = async function () { try { var head = ['Class'], mg = [], fills = []; per.forEach(function (p, i) { head.push(p.label + '\n' + (p.time_text || '')); brk(i + 1).forEach(function (b) { fills.push({ col: head.length, argb: 'FFE9EEF4' }); head.push(b.label + '\n' + b.time); }); });
          var rows = keys.map(function (k) { var r = [k.l]; per.forEach(function (p, i) { var c = cellOf(k, p.period); r.push(c && c.cell ? c.cell.split('\n').map(function (l) { var x = splitLine(l); return x.s + (x.c ? ' / ' + who(x.c) : '') + (fmtDays(x.d) ? ' (' + fmtDays(x.d) + ')' : ''); }).join('\n') : ''); brk(i + 1).forEach(function () { r.push(''); }); }); return r; });
          fills.forEach(function (f) { mg.push({ r1: 1, c1: f.col, r2: keys.length, c2: f.col }); rows[0][f.col] = 'Break'; });
          await A.styledXlsx([{ name: 'Daily Routine', title: 'AMAR SECONDARY SCHOOL – DAILY ROUTINE (effective 1st Bhadra 2083)', rows: [head].concat(rows), head: 1, merges: mg, fills: fills, rowHeight: 48, widths: [8].concat(head.slice(1).map(function (h) { return /Break/.test(h) ? 7 : 26; })), freezeX: 1 }], 'Daily Routine.xlsx'); } catch (e) { toast(A.errText(e), true); } };
      }
      function edit(key) {
        var p = key.split('|'), cid = p[0], sec = p[1], per0 = +p[2], cur = cells.filter(function (y) { return y.class_id === cid && y.sec === sec && y.period === per0; })[0], lines = (cur && cur.cell ? cur.cell.split('\n') : []).map(splitLine);
        while (lines.length < 2) lines.push({ s: '', c: '', d: '' });
        var subj = {}; cells.forEach(function (c) { c.cell.split('\n').forEach(function (l) { var s = splitLine(l).s; if (s && s.length < 18) subj[s] = 1; }); });
        var m = document.createElement('div'); m.className = 'modal';
        m.innerHTML = '<div class="msheet"><h3>Period ' + per0 + '</h3><datalist id="dl">' + Object.keys(subj).sort().map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
          lines.map(function (l, i) { var l0 = legOf(l.c), sel = l0 && l0.teacher_id ? l0.teacher_id : (l.c ? '__c' : ''), dd = l.d ? parseDays(l.d) : { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
            return '<div class="ml"><label>Subject</label><input list="dl" data-s="' + i + '" value="' + esc(l.s) + '" placeholder="e.g. Maths"><label>Teacher</label><select data-t="' + i + '"><option value="">— none —</option>' + (sel === '__c' ? '<option value="__c" selected>Code ' + esc(l.c) + '</option>' : '') + opts(tch, function (t) { return '<option value="' + t.id + '"' + (sel === t.id ? ' selected' : '') + '>' + esc(t.full_name) + '</option>'; }) + '</select><label>Days (if two teachers share this period)</label><div class="days" data-d="' + i + '">' + DAYN.map(function (n, di) { return '<button type="button" class="dchip' + (dd[di + 1] ? ' on' : '') + '" data-n="' + (di + 1) + '">' + n + '</button>'; }).join('') + '</div></div>'; }).join('') +
          '<div class="row" style="margin-top:12px"><button class="btn" id="mc">Cancel</button><button class="btn primary" id="ms" style="flex:1">Save</button></div></div>';
        document.body.appendChild(m); $('#mc', m).onclick = function () { m.remove(); };
        m.querySelectorAll('.dchip').forEach(function (b) { b.onclick = function () { b.classList.toggle('on'); }; });
        $('#ms', m).onclick = async function () { try { var out = [];
          for (var i = 0; i < lines.length; i++) { var sj = $('[data-s="' + i + '"]', m).value.trim(), tv = $('[data-t="' + i + '"]', m).value, code = '', dobj = {};
            m.querySelectorAll('[data-d="' + i + '"] .dchip.on').forEach(function (b) { dobj[b.getAttribute('data-n')] = 1; }); var dstr = Object.keys(dobj).length === 6 || !Object.keys(dobj).length ? '' : packDays(dobj);
            if (tv === '__c') code = lines[i].c; else if (tv) { var l1 = leg.filter(function (l) { return l.teacher_id === tv; })[0]; if (l1) code = l1.code; else { var nm = tById[tv].full_name, ini = nm.split(/\s+/).map(function (w) { return w[0]; }).join('').toUpperCase(), n = 1, cd = ini; while (legOf(cd)) cd = ini + (++n); code = cd; must(await db.from('routine_legend').upsert({ code: code, name: nm, teacher_id: tv })); leg.push({ code: code, name: nm, teacher_id: tv }); } }
            if (sj) out.push(sj + (code ? '/' + code : '') + (dstr ? '@' + dstr : '')); }
          var cell = out.join('\n'); must(await db.from('routine_cells').upsert({ class_id: cid, sec: sec, period: per0, cell: cell }, { onConflict: 'class_id,sec,period' }));
          if (cur) cur.cell = cell; else cells.push({ class_id: cid, sec: sec, period: per0, cell: cell }); m.remove(); await syncAll(); toast('✓ Saved and applied to the whole app'); draw(); } catch (e) { toast(A.errText(e), true); } };
      }
      draw();
    } catch (e) { el.innerHTML = '<p class="err">' + esc(A.errText(e)) + '<br>Run 12_routine.sql and 13_class_teachers.sql in Supabase first.</p>'; }
  };

  function table(per, cells, cid, sec) {
    return '<div class="card rt">' + opts(per, function (x) { var c = cells.filter(function (y) { return y.class_id === cid && y.period === x.period && (!sec || y.sec === '' || y.sec === sec); })[0];
      var br = BREAKS.filter(function (b) { return b.after === x.period; }).map(function (b) { return '<div class="rbk">' + b.label + ' · ' + b.time + '</div>'; }).join('');
      return '<div class="rtr"><div class="rtp"><b>' + esc(x.label) + '</b><span>' + esc(x.time_text || '') + '</span></div><div class="rtt">' + (c && c.cell ? c.cell.split('\n').map(function (l) { var y = splitLine(l); return '<div>' + esc(y.s) + (fmtDays(y.d) ? ' <em class="dy">' + fmtDays(y.d) + '</em>' : '') + '</div>'; }).join('') : '<span class="muted">–</span>') + '</div></div>' + br; }) + '</div>';
  }

  V.myRoutine = async function (el) {
    A.skeleton(el);
    try {
      var role = state.profile.role, per = must(await db.from('routine_periods').select('*').order('period')), cells = must(await db.from('routine_cells').select('*'));
      if (!per.length || !cells.length) { el.innerHTML = '<div class="empty">The routine has not been added yet.</div>'; return; }
      if (role === 'parent') {
        var kids = must(await db.from('students').select('id,full_name,class_id,section_id,classes(name),sections(name)'));
        el.innerHTML = kids.length ? opts(kids, function (k) { return '<h4 class="sec">' + esc(k.full_name) + ' · ' + esc(k.classes ? k.classes.name : '') + '</h4>' + table(per, cells, k.class_id, k.sections ? k.sections.name : ''); }) : '<div class="empty">No child linked.</div>';
      } else {
        var tr = must(await db.from('teachers').select('id').eq('user_id', state.profile.id))[0], leg = tr ? must(await db.from('routine_legend').select('code').eq('teacher_id', tr.id)) : [], lk = await A.lookups(true), cn = {};
        lk.classes.forEach(function (c) { cn[c.id] = c; });
        if (!leg.length) { el.innerHTML = '<div class="empty">Your name is not linked to a routine code yet. Ask the admin (Class routine → Teacher codes).</div>'; return; }
        var res = new RegExp('/\\s*(' + leg.map(function (l) { return l.code.replace(/[^A-Za-z0-9]/g, ''); }).join('|') + ')(?![A-Za-z])', 'i'), html = '';
        per.forEach(function (x) { var rows = []; cells.filter(function (c) { return c.period === x.period; }).forEach(function (c) { var cl = cn[c.class_id]; if (!cl) return; c.cell.split('\n').filter(function (l) { return res.test(l); }).forEach(function (l) { rows.push({ lv: cl.level, t: A.nm(cl) + (c.sec ? ' ' + c.sec : '') + ' — ' + l }); }); });
          rows.sort(function (a, b) { return a.lv - b.lv; });
          html += '<div class="card"><div class="rth"><b>' + esc(x.label) + ' period</b><span>' + esc(x.time_text || '') + '</span></div>' + (rows.length ? rows.map(function (r) { return '<div class="rtt">' + esc(r.t) + '</div>'; }).join('') : '<div class="muted">Free</div>') + '</div>'; });
        el.innerHTML = '<div class="note">Your periods every school day.</div>' + html;
      }
    } catch (e) { el.innerHTML = '<p class="err">' + esc(A.errText(e)) + '</p>'; }
  };
})();
