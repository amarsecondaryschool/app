/* Nepali (BS) calendar shown at the top of the Calendar section */
(function () {
  'use strict';
  var A = window.AMAR, db = A.db, $ = A.$, esc = A.esc, V = A.views;
  var NE = ['बैशाख', 'जेठ', 'असार', 'श्रावण', 'भदौ', 'असोज', 'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फागुन', 'चैत'], DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var AM = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var cur = null;
  async function draw(box) {
    var ok = await A.ensureBs();
    if (!ok) { box.innerHTML = '<div class="note">The Nepali calendar needs internet the first time. Please reconnect and open this page again.</div>'; return; }
    var tp = A.bsParts(A.today()); if (!cur) cur = { y: tp.y, m: tp.m };
    var info = A.bsMonthInfo(cur.y, cur.m), ev = []; try { ev = (await db.from('calendar_events').select('*')).data || []; } catch (e) {}
    var cells = ''; for (var i = 0; i < info.wd; i++) cells += '<div class="bc-e"></div>';
    for (var d = 1; d <= info.len; d++) { var ad = A.addDays(info.from, d - 1), wd = (info.wd + d - 1) % 7, isT = cur.y === tp.y && cur.m === tp.m && d === tp.d, has = ev.filter(function (e) { return e.event_date <= ad && ad <= (e.end_date || e.event_date); });
      cells += '<div class="bc-d' + (isT ? ' today' : '') + (wd === 6 ? ' sat' : '') + (has.length ? ' ev' : '') + '"><b>' + d + '</b><small>' + (+ad.slice(8)) + '</small>' + (has.length ? '<i></i>' : '') + '</div>'; }
    var list = ev.filter(function (e) { return e.event_date <= A.addDays(info.from, info.len - 1) && (e.end_date || e.event_date) >= info.from; });
    var a1 = info.from.split('-'), a2 = A.addDays(info.from, info.len - 1).split('-');
    box.innerHTML = '<div class="bc"><div class="bc-h"><button class="bc-n" id="bp">‹</button><div><h3>' + esc(A.BSM[cur.m - 1]) + ' ' + cur.y + '</h3><span>' + NE[cur.m - 1] + ' · ' + AM[+a1[1] - 1] + ' ' + (+a1[2]) + ' – ' + AM[+a2[1] - 1] + ' ' + (+a2[2]) + ', ' + a2[0] + '</span></div><button class="bc-n" id="bn">›</button></div>' +
      '<div class="bc-w">' + DAYS.map(function (x, i) { return '<div' + (i === 6 ? ' class="sat"' : '') + '>' + x + '</div>'; }).join('') + '</div><div class="bc-g">' + cells + '</div>' +
      '<button class="btn small" id="bt" style="margin-top:10px">Today</button>' +
      (list.length ? '<div class="bc-l">' + list.map(function (e) { return '<div><b>' + esc(A.fmtDate(e.event_date)) + '</b> ' + esc(e.title) + '</div>'; }).join('') + '</div>' : '') + '</div>';
    $('#bp', box).onclick = function () { cur.m--; if (cur.m < 1) { cur.m = 12; cur.y--; } draw(box); };
    $('#bn', box).onclick = function () { cur.m++; if (cur.m > 12) { cur.m = 1; cur.y++; } draw(box); };
    $('#bt', box).onclick = function () { cur = null; draw(box); };
  }
  var oc = V.calendar;
  V.calendar = async function (el) {
    el.innerHTML = ''; var box = document.createElement('div'), rest = document.createElement('div'); el.appendChild(box); el.appendChild(rest);
    draw(box).catch(function () {}); return oc ? oc(rest) : null;
  };
})();
