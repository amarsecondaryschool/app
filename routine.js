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
    must(await db.from('routine_legend').upsert(RT.legend.map(function (l) { var t = tch.filter(function (x) { return norm(x.full_name) === norm(l[1]); })[0]; return { code: l[0], name: l[1], teacher_id: t ? t.id : null }; })));
    var cells = []; Object.keys(RT.rows).forEach(function (lab) { var m = /^(\d+)([AB])?$/.exec(lab); if (!m || !id['Class ' + m[1]]) return;
      RT.rows[lab].forEach(function (c, i) { cells.push({ class_id: id['Class ' + m[1]], sec: m[2] || '', period: i + 1, cell: c }); }); });
    must(await db.from('routine_cells').upsert(cells, { onConflict: 'class_id,sec,period' }));
  }

  V.classRoutine = async function (el) {
    A.skeleton(el);
    var tab = state.rtTab || 'routine';
    el.innerHTML = '<div class="seg" style="display:flex">' + [['routine', 'Routine'], ['codes', 'Teacher codes'], ['ct', 'Class teachers']].map(function (b) { return '<button style="flex:1" data-t="' + b[0] + '" class="' + (b[0] === tab ? 'on' : '') + '">' + b[1] + '</button>'; }).join('') + '</div><div id="rb" style="margin-top:12px"></div>';
    el.querySelectorAll('[data-t]').forEach(function (b) { b.onclick = function () { state.rtTab = b.getAttribute('data-t'); V.classRoutine(el); }; });
    var box = $('#rb', el);
    try {
      var lk = await A.lookups(true), tch = must(await db.from('teachers').select('id,full_name').order('full_name'));
      if (tab === 'routine') {
        var cells = must(await db.from('routine_cells').select('*')), per = must(await db.from('routine_periods').select('*').order('period'));
        if (!cells.length) { box.innerHTML = '<div class="note">No routine yet. Load the daily routine from your Word file (effective 1st Bhadra 2083). You can edit every period afterwards.</div><button class="btn primary" id="ld" style="width:100%">Load the given routine</button>';
          $('#ld', box).onclick = async function () { this.disabled = true; this.textContent = 'Loading…'; try { await loadGiven(); toast('✓ Routine loaded'); V.classRoutine(el); } catch (e) { toast(A.errText(e), true); } }; return; }
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
        $('#ncb', box).onclick = async function () { var c = $('#nc', box).value.trim(); if (!c) return; try { must(await db.from('routine_legend').upsert({ code: c })); V.classRoutine(el); } catch (e) { toast(A.errText(e), true); } };
      } else {
        var cl = must(await db.from('classes').select('id,name,level,class_teacher_id').order('level'));
        box.innerHTML = '<div class="note">The class teacher is the only teacher who can take attendance of that class.</div>' + opts(cl, function (c) { return '<div class="card row between"><b>' + esc(c.name) + '</b><select class="mini-sel" data-k="' + c.id + '"><option value="">— none —</option>' + opts(tch, function (t) { return '<option value="' + t.id + '"' + (c.class_teacher_id === t.id ? ' selected' : '') + '>' + esc(t.full_name) + '</option>'; }) + '</select></div>'; });
        box.querySelectorAll('select[data-k]').forEach(function (s) { s.onchange = async function () { try { must(await db.from('classes').update({ class_teacher_id: s.value || null }).eq('id', s.getAttribute('data-k'))); toast('✓ Saved'); } catch (e) { toast(A.errText(e), true); } }; });
      }
    } catch (e) { box.innerHTML = '<p class="err">' + esc(A.errText(e)) + '<br>Run 12_routine.sql in Supabase first.</p>'; }
  };

  function table(per, cells, cid, sec) {
    return '<div class="card rt">' + opts(per, function (x) { var c = cells.filter(function (y) { return y.class_id === cid && y.period === x.period && (!sec || y.sec === '' || y.sec === sec); })[0];
      return '<div class="rtr"><div class="rtp"><b>' + esc(x.label) + '</b><span>' + esc(x.time_text || '') + '</span></div><div class="rtt">' + (c && c.cell ? br(c.cell) : '<span class="muted">–</span>') + '</div></div>'; }) + '</div>';
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
