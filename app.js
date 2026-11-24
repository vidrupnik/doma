/* DOMA – družinska aplikacija za opravila */
'use strict';

// ---------- Nastavitve ----------
const MEMBERS = [
  { name: 'Vid', ico: '🧑' },
  { name: 'Eva', ico: '👧' },
  { name: 'Mami', ico: '👩' },
  { name: 'Oči', ico: '👨' },
];
const N = MEMBERS.length;
// Dnevna opravila (vsak dan): kdo jih dela, si izberete v zavihku Plan
const DAILY = [
  { id: 'pes', name: 'Sprehod Zuma (popoldne)', ico: '🐶', xp: 25, due: '19:00' },
  { id: 'posoda', name: 'Posoda (pomivanje, stroj)', ico: '🍽️', xp: 25, due: '21:00' },
];
// Tedenska opravila (rok nedelja 20:00; twice = dvakrat na teden, prvič do srede 20:00)
const WEEKLY = [
  { id: 'sesanje', name: 'Tla: sesanje', ico: '🧹', xp: 35 },
  { id: 'tla', name: 'Tla: pomivanje', ico: '🧽', xp: 35 },
  { id: 'kopalnica', name: 'Kopalnica, WC: čiščenje', ico: '🚿', xp: 60 },
  { id: 'smeti', name: 'Smeti', ico: '🗑️', xp: 20, twice: true },
  { id: 'pranje', name: 'Perilo: pranje', ico: '👕', xp: 30, twice: true },
  { id: 'zlaganje', name: 'Perilo: zlaganje, likanje', ico: '👔', xp: 40, twice: true },
];
const LATE = 0.25;   // zamuda: −25 % XP
const MISSED = 0.5;  // neopravljeno 24 h po roku: kazen −50 % XP opravila
const ANCHOR = new Date(2026, 10, 23); // ponedeljek, začetek rotacije
const CATS = ['Dovoz', 'Hiša', 'Vrt', 'Avto', 'Drugo'];

// ---------- Pomožne ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const DAY = 864e5;
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayIdx = (d) => Math.round((dayStart(d) - ANCHOR) / DAY);
const weekIdx = (d) => Math.floor(dayIdx(d) / 7);
const fromDayIdx = (i) => new Date(ANCHOR.getFullYear(), ANCHOR.getMonth(), ANCHOR.getDate() + i);
const mod = (a, n) => ((a % n) + n) % n;
const DNI = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];
const fmtDue = (t) => {
  const d = new Date(t), now = new Date();
  const hm = d.toTimeString().slice(0, 5);
  if (dayIdx(d) === dayIdx(now)) return 'danes ' + hm;
  if (dayIdx(d) === dayIdx(now) + 1) return 'jutri ' + hm;
  return DNI[d.getDay()] + ' ' + d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + hm;
};
const member = (n) => MEMBERS.find((m) => m.name === n) || { name: n, ico: '🙂' };

// ---------- Shramba (lokalno ali Supabase) ----------
const CFG = window.DOMA_CONFIG || {};
const REMOTE = !!(CFG.supabaseUrl && CFG.supabaseKey);
const Store = {
  items: {},
  lastSync: '',
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem('doma-items') || '{}');
      this.items = raw.items || {};
      this.lastSync = raw.lastSync || '';
    } catch (e) { this.items = {}; }
  },
  save() {
    try { localStorage.setItem('doma-items', JSON.stringify({ items: this.items, lastSync: this.lastSync })); } catch (e) { toast('Ni prostora za shranjevanje'); }
  },
  list(kind) { return Object.values(this.items).filter((i) => i.kind === kind && !i.data.deleted); },
  get(id) { const i = this.items[id]; return i && !i.data.deleted ? i : null; },
  async put(id, kind, data) {
    this.items[id] = { id, kind, data };
    this.save();
    render();
    if (REMOTE) {
      try {
        await api('items', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id, kind, data }) });
      } catch (e) { this.pending(id); toast('Ni shranjeno v skupno bazo: ' + (this.lastError || 'brez povezave')); }
    }
  },
  async del(id) { const i = this.items[id]; if (i) await this.put(id, i.kind, { ...i.data, deleted: true }); },
  pending(id) {
    const p = new Set(JSON.parse(localStorage.getItem('doma-pending') || '[]')); p.add(id);
    localStorage.setItem('doma-pending', JSON.stringify([...p]));
  },
  async sync() {
    if (!REMOTE) return;
    try {
      // najprej pošlji, kar ni šlo skozi
      const pend = JSON.parse(localStorage.getItem('doma-pending') || '[]');
      if (pend.length) {
        const rows = pend.map((id) => this.items[id]).filter(Boolean);
        await api('items', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
        localStorage.removeItem('doma-pending');
      }
      // potem prenesi samo spremembe od zadnjič (malo podatkov)
      const q = 'items?select=id,kind,data,updated_at&order=updated_at.asc' + (this.lastSync ? '&updated_at=gt.' + encodeURIComponent(this.lastSync) : '');
      const res = await api(q);
      const rows = await res.json();
      for (const r of rows) { this.items[r.id] = { id: r.id, kind: r.kind, data: r.data }; this.lastSync = r.updated_at; }
      this.save();
      if (rows.length) render();
    } catch (e) { render(); }
  },
};
function api(path, opt = {}) {
  return fetch(CFG.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, {
    ...opt,
    headers: {
      apikey: CFG.supabaseKey,
      // novi ključi (sb_publishable_...) gredo samo v glavo apikey, stari (JWT) tudi v Authorization
      ...(CFG.supabaseKey.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + CFG.supabaseKey }),
      'Content-Type': 'application/json', ...(opt.headers || {}),
    },
  }).then(async (r) => {
    if (!r.ok) { const t = await r.text().catch(() => ''); Store.lastError = r.status + ' ' + t.slice(0, 200); throw new Error(Store.lastError); }
    Store.lastError = ''; return r;
  }, (e) => { Store.lastError = 'omrežje: ' + e.message; throw e; });
}

// ---------- Razpored ----------
// Vsak si sam izbere opravila (zavihek Plan). Kar ostane prosto, se samodejno dodeli
// tistemu, ki ima ta teden najmanj točk (dnevna opravila isti dan ob 12:00, tedenska v sredo ob 20:00).
let planCache = {};
const PLAN_START = 2; // sreda 25. 11. 2026: od tu naprej velja izbiranje in kazni
const startDay = () => Math.max(PLAN_START, Store.get('start') ? Store.get('start').data.day : dayIdx(new Date()));
function weekPlan(w) {
  if (planCache[w]) return planCache[w];
  const slots = [];
  for (let k = 0; k < 7; k++) {
    const d = w * 7 + k, date = fromDayIdx(d);
    for (const c of DAILY) {
      const [h, m] = c.due.split(':');
      slots.push({ id: c.id + '@' + d, def: c, day: d, daily: true, week: w,
        due: new Date(date.getFullYear(), date.getMonth(), date.getDate(), +h, +m).getTime(),
        autoAt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0).getTime() });
    }
  }
  const sun = fromDayIdx(w * 7 + 6), wed = fromDayIdx(w * 7 + 2);
  const mon = fromDayIdx(w * 7);
  WEEKLY.forEach((c) => {
    // prvi termin (do srede) za dvakrat-tedenska; v prvem tednu aplikacije ga izpustimo
    if (c.twice && w > 0) slots.push({ id: c.id + 'a#' + w, def: c, week: w, day: w * 7 + 2, half: 1,
      due: new Date(wed.getFullYear(), wed.getMonth(), wed.getDate(), 20, 0).getTime(), autoAt: new Date(mon.getFullYear(), mon.getMonth(), mon.getDate(), 12, 0).getTime() });
    slots.push({ id: c.id + '#' + w, def: c, week: w, day: w * 7 + 6, half: c.twice ? 2 : 0,
      due: new Date(sun.getFullYear(), sun.getMonth(), sun.getDate(), 20, 0).getTime(), autoAt: new Date(wed.getFullYear(), wed.getMonth(), wed.getDate(), 20, 0).getTime() });
  });
  const claims = {};
  for (const s of slots) { const c = Store.get('c:' + s.id); if (c) claims[s.id] = c.data; }
  const now = Date.now(), start = startDay();
  const autos = [];
  for (const s of slots) {
    if (claims[s.id]) { s.who = claims[s.id].who; s.claimed = true; continue; }
    if (s.day < start || now < s.autoAt) { s.who = null; continue; }
    // samodejno: najmanj točk ta teden (upoštevamo izbire pred tem trenutkom + prejšnje samodejne)
    // obremenitev = število opravil (glavno) + točke (pri enakem številu)
    const load = {}; MEMBERS.forEach((m) => (load[m.name] = 0));
    for (const o of slots) if (claims[o.id] && claims[o.id].at < s.autoAt && load[claims[o.id].who] != null) load[claims[o.id].who] += 1000 + o.def.xp;
    for (const a of autos) load[a.who] += 1000 + a.def.xp;
    const order = MEMBERS.map((m, i) => MEMBERS[mod(i + w + s.day, N)].name);
    s.who = order.reduce((b, n) => (load[n] < load[b] ? n : b), order[0]);
    s.auto = true; autos.push(s);
  }
  return (planCache[w] = slots);
}
function chores(fromDay, toDay) {
  const out = [];
  for (let w = Math.floor(fromDay / 7); w <= Math.floor(toDay / 7); w++)
    for (const s of weekPlan(w)) if (!s.daily || (s.day >= fromDay && s.day <= toDay)) out.push(s);
  return out;
}
function projectTask(p) {
  return { id: 'p:' + p.id, def: { name: p.data.title, ico: '🏗️', xp: +p.data.xp || 100 }, who: p.data.owner, due: p.data.due ? new Date(p.data.due + 'T20:00').getTime() : Infinity, project: p };
}
function taskById(id) {
  if (id.startsWith('p:')) { const p = Store.get(id.slice(2)); return p && projectTask(p); }
  const m = id.match(/^(.+)([@#])(-?\d+)$/);
  if (!m) return null;
  const n = +m[3];
  return weekPlan(m[2] === '@' ? Math.floor(n / 7) : n).find((t) => t.id === id);
}

// ---------- Točke ----------
function ratingsFor(doneId) { return Store.list('rate').filter((r) => r.data.done === doneId); }
function scoreDone(d) {
  const t = taskById(d.id);
  if (!t) return { xp: 0 };
  const rs = ratingsFor(d.id);
  const avg = rs.length ? rs.reduce((a, r) => a + r.data.stars, 0) / rs.length : null;
  let mult = avg == null ? 1 : 0.5 + avg * 0.15; // 5★ = 125 %, 3★ = 95 %, 1★ = 65 %
  const late = d.data.at > t.due;
  const takeover = t.who && d.data.by !== t.who;
  if (late) mult *= 1 - LATE;
  if (takeover) mult *= 1.2;
  return { xp: Math.round(t.def.xp * mult), avg, n: rs.length, late, takeover, task: t };
}
function stats() {
  const s = {};
  MEMBERS.forEach((m) => (s[m.name] = { xp: 0, week: 0, spent: 0, pen: 0, zuma: 0, five: 0, take: 0, proj: 0, done: 0 }));
  const wk = weekIdx(new Date());
  for (const d of Store.list('done')) {
    const p = s[d.data.by]; if (!p) continue;
    const sc = scoreDone(d);
    p.xp += sc.xp; p.done++;
    if (weekIdx(new Date(d.data.at)) === wk) p.week += sc.xp;
    if (d.id.startsWith('pes')) p.zuma++;
    if (sc.avg === 5) p.five++;
    if (sc.takeover) p.take++;
    if (d.id.startsWith('p:')) p.proj++;
  }
  // kazni za neopravljeno (24 h po roku)
  const now = Date.now(), start = startDay();
  for (let w = Math.floor(start / 7); w <= wk; w++)
    for (const t of weekPlan(w)) if (t.who && t.day >= start && now > t.due + DAY && !Store.get(t.id) && s[t.who]) {
      const pen = Math.round(t.def.xp * MISSED);
      s[t.who].xp -= pen; s[t.who].pen += pen; if (w === wk) s[t.who].week -= pen;
    }
  for (const r of Store.list('reward')) for (const c of r.data.claims || []) if (!r.data.group && s[c.by]) s[c.by].spent += +r.data.cost;
  return s;
}
const level = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
const lvlXp = (l) => 50 * (l - 1) ** 2;
function badges(p) {
  const b = [];
  if (p.zuma >= 10) b.push('🐕 Zumov prijatelj');
  if (p.five >= 5) b.push('⭐ Perfekcionist');
  if (p.take >= 3) b.push('🦸 Rešitelj');
  if (p.proj >= 1) b.push('🏗️ Graditelj');
  if (p.done >= 50) b.push('💪 Neustavljiv');
  return b;
}

// ---------- Stanje UI ----------
let me = localStorage.getItem('doma-me');
let tab = 'moje';
let shopFilter = 'manjka';

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 2200);
}
function toRate() {
  if (!me) return [];
  const cutoff = Date.now() - 7 * DAY;
  return Store.list('done').filter((d) => d.data.by !== me && d.data.at > cutoff && !Store.get(d.id + '|' + me)).sort((a, b) => b.data.at - a.data.at);
}

// ---------- Izris ----------
function render() {
  planCache = {};
  const app = $('#app');
  if (!me) {
    app.innerHTML = `<main><h1 style="margin-top:40px">DOMA 🏠</h1><p class="s">Kdo si? (izbereš samo enkrat na tem telefonu)</p>
      <div class="users">${MEMBERS.map((m) => `<button data-act="me" data-v="${m.name}"><b>${m.ico}</b>${m.name}</button>`).join('')}</div></main>`;
    return;
  }
  const s = stats()[me];
  const lv = level(s.xp), pct = ((s.xp - lvlXp(lv)) / (lvlXp(lv + 1) - lvlXp(lv))) * 100;
  const nRate = toRate().length;
  const views = { moje: viewMine, plan: viewPlan, ocene: viewRate, projekti: viewProjects, nakupi: viewShop, nagrade: viewRewards };
  app.innerHTML = `
  <header><div style="font-size:34px">${member(me).ico}</div>
    <div class="who"><h1>${esc(me)}</h1><small>${s.xp} XP · še ${lvlXp(lv + 1) - s.xp} do nivoja ${lv + 1}</small><div class="bar"><i style="width:${pct}%"></i></div></div>
    <span class="lvl">Nv. ${lv}</span></header>
  <main>${views[tab]()}</main>
  <nav>${[['moje', '✅', 'Opravila'], ['plan', '📅', 'Plan'], ['ocene', '⭐', 'Ocene'], ['projekti', '🏗️', 'Projekti'], ['nakupi', '🛒', 'Nakupi'], ['nagrade', '🏆', 'Nagrade']]
    .map(([k, i, l]) => `<button data-act="tab" data-v="${k}" class="${tab === k ? 'on' : ''}"><b>${i}</b>${l}${k === 'ocene' && nRate ? `<span class="badge">${nRate}</span>` : ''}</button>`).join('')}</nav>`;
}

function taskCard(t, mine) {
  const d = Store.get(t.id);
  const late = !d && Date.now() > t.due;
  let right;
  if (d) {
    const sc = scoreDone(d);
    right = `<div class="done" style="text-align:right">✔ ${d.data.by === t.who ? '' : esc(d.data.by) + '<br>'}<small>${sc.xp} XP${sc.n ? ' · ' + sc.avg.toFixed(1) + '★' : ''}</small>${d.data.by === me ? `<br><button class="ghost" data-act="undo" data-v="${t.id}">↩ Razveljavi</button>` : ''}</div>`;
  } else if (!t.who && !t.project) {
    right = `<button data-act="claim1" data-v="${t.id}" class="sec">Vzamem</button>`;
  } else {
    right = `<button data-act="complete" data-v="${t.id}" class="${mine ? '' : 'sec'}">${mine ? 'Opravljeno' : 'Prevzemi'}</button>`;
  }
  return `<div class="card row ${d ? 'mut' : ''}"><div class="ico">${t.def.ico}</div>
    <div class="grow"><div class="t">${esc(t.def.name)}</div>
    <div class="s ${late ? 'late' : ''}">${mine ? '' : (t.who ? member(t.who).ico + ' ' + esc(t.who) : 'prosto') + ' · '}${late ? 'zamuda! ' : 'do '}${fmtDue(t.due)} · ${t.def.xp} XP${late && !t.project ? ` · <b>−${Math.round(t.def.xp * MISSED)} XP</b> če ni narejeno v 24 h` : ''}</div></div>${right}</div>`;
}

function viewMine() {
  const today = dayIdx(new Date());
  const all = chores(today - 6, today + 1);
  const wk = weekIdx(new Date());
  const isCurrent = (t) => (t.daily ? t.day === today : t.week === wk);
  const start = startDay();
  const overdue = all.filter((t) => t.who === me && !Store.get(t.id) && t.due < Date.now() && !isCurrent(t) && t.day >= start);
  const mine = all.filter((t) => t.who === me && isCurrent(t));
  const myProj = Store.list('project').filter((p) => p.data.owner === me && !Store.get('p:' + p.id)).map(projectTask);
  const tomorrow = all.filter((t) => t.who === me && t.daily && t.day === today + 1);
  const others = all.filter((t) => t.who !== me && isCurrent(t) && t.day >= start).sort((a, b) => a.due - b.due);
  const free = chores(today, today + 7).filter((t) => !t.who && t.day >= start).length;
  const doneCnt = mine.filter((t) => Store.get(t.id)).length;
  return `
    ${free ? `<div class="card row" data-act="tab" data-v="plan" style="cursor:pointer"><div class="ico">📅</div><div class="grow"><div class="t">${free} prostih opravil</div><div class="s">Izberi si, kaj boš delal in kdaj imaš Zuma</div></div><b>›</b></div>` : ''}
    ${overdue.length ? `<h2 class="late">Zamujeno</h2>${overdue.map((t) => taskCard(t, true)).join('')}` : ''}
    <h2>Moje danes in ta teden · ${doneCnt}/${mine.length}</h2>
    ${mine.length ? mine.sort((a, b) => a.due - b.due).map((t) => taskCard(t, true)).join('') : '<div class="card s">Danes nimaš dodeljenih opravil 🎉</div>'}
    ${myProj.length ? `<h2>Moji projekti</h2>${myProj.map((t) => taskCard(t, true)).join('')}` : ''}
    ${tomorrow.length ? `<h2>Jutri</h2>${tomorrow.map((t) => `<div class="card row mut"><div class="ico">${t.def.ico}</div><div class="grow">${esc(t.def.name)}</div></div>`).join('')}` : ''}
    <h2>Ostali (prevzem tujega +20 % XP)</h2>${others.map((t) => taskCard(t, false)).join('')}`;
}

let planWeek = 0;
function viewPlan() {
  const w = weekIdx(new Date()) + planWeek, start = startDay();
  const slots = weekPlan(w).filter((t) => t.day >= start || !t.daily);
  const cnt = {}; MEMBERS.forEach((m) => (cnt[m.name] = 0));
  slots.forEach((t) => { if (t.who && cnt[t.who] != null) cnt[t.who]++; });
  const quota = Math.ceil(slots.length / N);
  const chip = (t) => {
    const d = Store.get(t.id);
    if (d) return `<span class="pill" style="background:none;color:var(--ok)">✔ ${esc(d.data.by)}</span>`;
    if (!t.who) return `<button class="sec" data-act="claim1" data-v="${t.id}" style="padding:6px 10px">Vzamem</button>`;
    if (t.who === me && t.claimed) return `<button data-act="release" data-v="${t.id}" style="padding:6px 10px">${member(me).ico} Jaz ✕</button>`;
    return `<span class="pill">${member(t.who).ico} ${esc(t.who)}${t.auto ? ' ⚙' : ''}</span>`;
  };
  const days = [...new Set(slots.filter((t) => t.daily).map((t) => t.day))];
  const mon = fromDayIdx(w * 7);
  return `<div class="seg"><button data-act="pweek" data-v="0" class="${planWeek === 0 ? '' : 'sec'}">Ta teden</button><button data-act="pweek" data-v="1" class="${planWeek === 1 ? '' : 'sec'}">Naslednji teden</button></div>
    <div class="card"><div class="s" style="margin-bottom:6px">Vsak izbere <b>${quota} opravil</b> (skupaj ${slots.length}) (teden od ${mon.getDate()}. ${mon.getMonth() + 1}.)</div>
    ${MEMBERS.map((m) => `<div class="row" style="gap:8px;margin:4px 0"><span style="width:70px">${m.ico} ${esc(m.name)}</span><div class="bar grow" style="margin:0"><i style="width:${Math.min(100, (cnt[m.name] / quota) * 100)}%"></i></div><span class="s" style="width:56px;text-align:right">${cnt[m.name]} / ${quota}</span></div>`).join('')}</div>
    <h2>Tedenska opravila</h2>
    ${slots.filter((t) => !t.daily).sort((a, b) => a.due - b.due).map((t) => `<div class="card row" style="padding:10px 14px"><div class="ico">${t.def.ico}</div><div class="grow"><div class="t">${esc(t.def.name)}${t.half ? ` <span class="pill">${t.half}. krat</span>` : ''}</div><div class="s">do ${fmtDue(t.due)} · ${t.def.xp} XP</div></div>${chip(t)}</div>`).join('')}
    <h2>Vsak dan: 🐶 Zum (popoldne) in 🍽️ posoda</h2>
    ${days.map((d) => { const dt = fromDayIdx(d); const [pes, pos] = DAILY.map((c) => slots.find((t) => t.id === c.id + '@' + d));
      return `<div class="card" style="padding:10px 14px"><div class="t" style="margin-bottom:6px">${DNI[dt.getDay()]} ${dt.getDate()}. ${dt.getMonth() + 1}.${d === dayIdx(new Date()) ? ' · danes' : ''}</div>
        <div class="row" style="justify-content:space-between"><span>🐶 ${chip(pes)}</span><span>🍽️ ${chip(pos)}</span></div></div>`; }).join('')}
    <p class="s">Vsak lahko izbere največ toliko opravil, kot je njegov delež. Kar ostane prosto, se samodejno (⚙) dodeli tistemu z najmanj opravili: dnevna opravila isti dan ob 12:00, tedenska v sredo ob 20:00. Svojo izbiro lahko sprostiš s ✕, dokler ni opravljeno.</p>`;
}

function viewRate() {
  const list = toRate();
  const mineRated = Store.list('done').filter((d) => d.data.by === me).sort((a, b) => b.data.at - a.data.at).slice(0, 5);
  return `<h2>Oceni opravljeno delo</h2>
    ${list.length ? list.map((d) => {
      const t = taskById(d.id); if (!t) return '';
      return `<div class="card"><div class="row"><div class="ico">${t.def.ico}</div><div class="grow"><div class="t">${esc(t.def.name)}</div>
        <div class="s">${member(d.data.by).ico} ${esc(d.data.by)} · ${fmtDue(d.data.at)}${d.data.at > t.due ? ' · <span class="late">z zamudo</span>' : ''}</div></div></div>
        ${d.data.note ? `<p class="s">"${esc(d.data.note)}"</p>` : ''}
        ${d.data.photo ? `<img class="big" src="${d.data.photo}" alt="">` : ''}
        <div class="stars" data-done="${d.id}">${[1, 2, 3, 4, 5].map((n) => `<button data-act="star" data-v="${n}">★</button>`).join('')}</div>
        <input placeholder="Komentar (obvezen pri oceni pod 3)" data-cmt="${d.id}">
        <button data-act="rate" data-v="${d.id}" style="width:100%">Oddaj oceno</button></div>`;
    }).join('') : '<div class="card s">Vse je ocenjeno 👌</div>'}
    <h2>Moje zadnje ocene</h2>
    ${mineRated.map((d) => {
      const sc = scoreDone(d); const rs = ratingsFor(d.id);
      return `<div class="card"><div class="row"><div class="ico">${sc.task?.def.ico || ''}</div><div class="grow"><div class="t">${esc(sc.task?.def.name)}</div>
        <div class="s">${sc.n ? sc.avg.toFixed(1) + '★ (' + sc.n + ')' : 'še čaka na oceno'} · ${sc.xp} XP${sc.late ? ' · zamuda −30 %' : ''}${sc.takeover ? ' · prevzem +20 %' : ''}</div>
        ${rs.filter((r) => r.data.comment).map((r) => `<div class="s">💬 ${esc(r.data.by)}: ${esc(r.data.comment)}</div>`).join('')}</div></div></div>`;
    }).join('') || '<div class="card s">Še nič.</div>'}`;
}

function viewProjects() {
  const ps = Store.list('project').sort((a, b) => (a.data.due || '9') > (b.data.due || '9') ? 1 : -1);
  const open = ps.filter((p) => !Store.get('p:' + p.id)), done = ps.filter((p) => Store.get('p:' + p.id));
  const byCat = {};
  open.forEach((p) => (byCat[p.data.cat] = byCat[p.data.cat] || []).push(p));
  const card = (p) => {
    const d = Store.get('p:' + p.id);
    let act = '';
    if (d) act = `<span class="done">✔ ${esc(d.data.by)}</span>`;
    else if (!p.data.owner) act = `<button data-act="take" data-v="${p.id}">Prevzamem</button>`;
    else if (p.data.owner === me) act = `<button data-act="complete" data-v="p:${p.id}">Končano</button>`;
    else act = `<span class="s">${member(p.data.owner).ico} ${esc(p.data.owner)}</span>`;
    return `<div class="card"><div class="row"><div class="grow"><div class="t">${esc(p.data.title)}</div>
      <div class="s">${p.data.xp} XP${p.data.due ? ' · do ' + fmtDue(new Date(p.data.due + 'T20:00')) : ''}</div>
      ${p.data.desc ? `<div class="s">${esc(p.data.desc)}</div>` : ''}</div>${act}</div>
      ${!d && (p.data.owner === me || p.data.createdBy === me) ? `<div style="text-align:right">${p.data.owner === me ? `<button class="ghost" data-act="untake" data-v="${p.id}">Odstopim</button>` : ''}<button class="ghost" data-act="delproj" data-v="${p.id}">Izbriši</button></div>` : ''}</div>`;
  };
  return `${Object.keys(byCat).length ? Object.entries(byCat).map(([c, l]) => `<h2>${esc(c)}</h2>${l.map(card).join('')}`).join('') : '<h2>Projekti</h2><div class="card s">Ni odprtih projektov. Dodaj prvega s +.</div>'}
    ${done.length ? `<h2>Končani</h2>${done.slice(-5).map(card).join('')}` : ''}
    <button class="fab" data-act="newproj">+</button>`;
}

function viewShop() {
  const all = Store.list('shop');
  const list = all.filter((i) => (shopFilter === 'manjka' ? !i.data.bought : i.data.bought)).sort((a, b) => (b.data.at || 0) - (a.data.at || 0));
  return `<h2>Nakupi</h2><div class="seg"><button data-act="shopf" data-v="manjka" class="${shopFilter === 'manjka' ? '' : 'sec'}">Manjka (${all.filter((i) => !i.data.bought).length})</button>
    <button data-act="shopf" data-v="kupljeno" class="${shopFilter === 'kupljeno' ? '' : 'sec'}">Kupljeno</button></div>
    ${list.map((i) => `<div class="card row ${i.data.bought ? 'mut' : ''}">${i.data.photo ? `<img class="ph" src="${i.data.photo}" alt="" data-act="zoom" data-v="${i.id}">` : '<div class="ico">🛍️</div>'}
      <div class="grow"><div class="t">${esc(i.data.name)}</div><div class="s">${esc(i.data.by)}${i.data.bought ? ' · kupil/a ' + esc(i.data.boughtBy) : ''}</div>
      ${i.data.link ? `<a class="s" href="${esc(i.data.link)}" target="_blank" rel="noopener">🔗 Odpri trgovino</a>` : ''}</div>
      ${i.data.bought ? `<button class="ghost" data-act="delshop" data-v="${i.id}">🗑</button>` : `<button data-act="bought" data-v="${i.id}">Kupljeno</button>`}</div>`).join('') || '<div class="card s">Seznam je prazen.</div>'}
    <button class="fab" data-act="newshop">+</button>`;
}

function viewRewards() {
  const st = stats();
  const rws = Store.list('reward');
  const family = (since) => Store.list('done').filter((d) => d.data.at >= since).reduce((a, d) => a + scoreDone(d).xp, 0);
  const avail = st[me].xp - st[me].spent;
  const lb = MEMBERS.map((m) => ({ ...m, ...st[m.name] })).sort((a, b) => b.week - a.week);
  return `<h2>Lestvica tega tedna</h2>
    <div class="card lb">${lb.map((m, i) => `<div class="row" style="padding:6px 0"><span class="n">${['🥇', '🥈', '🥉', '4.'][i]}</span><span class="grow"><b>${m.ico} ${esc(m.name)}</b> <span class="s">nv. ${level(m.xp)}</span><br><span class="s">${badges(m).join(' · ')}</span></span><b>${m.week} XP</b></div>`).join('')}</div>
    <h2>Skupinske nagrade</h2>
    ${rws.filter((r) => r.data.group).map((r) => {
      const last = (r.data.claims || []).slice(-1)[0];
      const since = last ? last.at : r.data.created;
      const have = family(since), pct = Math.min(100, (have / r.data.cost) * 100);
      return `<div class="card"><div class="row"><div class="ico">🎉</div><div class="grow"><div class="t">${esc(r.data.title)}</div><div class="s">${have} / ${r.data.cost} XP skupaj</div><div class="bar"><i style="width:${pct}%"></i></div></div>
        ${have >= r.data.cost ? `<button data-act="claim" data-v="${r.id}">Unovči</button>` : ''}</div>
        ${(r.data.claims || []).length ? `<div class="s">Unovčeno ${r.data.claims.length}×</div>` : ''}</div>`;
    }).join('') || '<div class="card s">Še ni skupinskih nagrad.</div>'}
    <h2>Moje nagrade · na voljo ${avail} XP</h2>
    ${rws.filter((r) => !r.data.group).map((r) => `<div class="card row"><div class="ico">🎁</div><div class="grow"><div class="t">${esc(r.data.title)}</div><div class="s">${r.data.cost} XP${(r.data.claims || []).length ? ' · unovčili: ' + r.data.claims.map((c) => esc(c.by)).join(', ') : ''}</div></div>
      <button data-act="claim" data-v="${r.id}" ${avail < r.data.cost ? 'disabled' : ''}>Unovči</button><button class="ghost" data-act="delreward" data-v="${r.id}">🗑</button></div>`).join('') || '<div class="card s">Še ni nagrad.</div>'}
    <button class="sec" data-act="newreward" style="width:100%;margin-top:6px">+ Dodaj nagrado</button>
    <h2>Pravila točk</h2><div class="card s">Ocena ostalih: 5★ = 125 %, 4★ = 110 %, 3★ = 95 %, 1★ = 65 % osnovnih XP. Zamuda −25 %. Neopravljeno 24 h po roku: kazen −50 % XP opravila. Prevzem tujega opravila +20 %. Osebne nagrade porabijo tvoje XP, nivo pa ostane.</div>
    <button class="ghost" data-act="logout" style="width:100%;margin-top:12px">Zamenjaj osebo (${esc(me)})</button>
    <p class="s" style="text-align:center">v5 · ${REMOTE ? (Store.lastError ? '⚠️ Napaka baze: ' + esc(Store.lastError) : '☁️ Povezano s skupno bazo') : '📱 Lokalni način (podatki samo na tem telefonu)'}</p>`;
}

// ---------- Dialogi ----------
function dialog(html, onSubmit) {
  const dl = document.createElement('dialog');
  dl.innerHTML = `<form method="dialog">${html}<div class="row" style="margin-top:8px"><button type="button" class="sec grow" data-close>Prekliči</button><button class="grow" value="ok">Shrani</button></div></form>`;
  document.body.appendChild(dl);
  dl.querySelector('[data-close]').onclick = () => dl.close();
  dl.addEventListener('close', async () => {
    if (dl.returnValue === 'ok') await onSubmit(dl.querySelector('form'));
    dl.remove();
  });
  dl.showModal();
  return dl;
}
function photoInput(name) {
  return `<label>Fotografija (neobvezno)</label><input type="file" accept="image/*" name="${name}">`;
}
// Pomanjša sliko na max 640 px in JPEG ~60 % (približno 30–60 KB)
function compress(file, max = 640) {
  return new Promise((res) => {
    if (!file) return res(null);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => res(null);
    img.src = URL.createObjectURL(file);
  });
}

// ---------- Akcije ----------
const actions = {
  me: (v) => { me = v; localStorage.setItem('doma-me', v); render(); },
  logout: () => { me = null; localStorage.removeItem('doma-me'); render(); },
  tab: (v) => { tab = v; render(); scrollTo(0, 0); },
  shopf: (v) => { shopFilter = v; render(); },
  complete: (id) => {
    const t = taskById(id);
    dialog(`<h3>${t.def.ico} ${esc(t.def.name)}</h3>${t.who && t.who !== me ? `<p class="s">Prevzemaš opravilo od ${esc(t.who)} (+20 % XP).</p>` : ''}
      <label>Opomba (neobvezno)</label><input name="note" placeholder="npr. zamenjal sem tudi brisače">${photoInput('photo')}
      <p class="s">Ostali bodo ocenili tvoje delo.</p>`, async (f) => {
      const photo = await compress(f.photo.files[0]);
      await Store.put(id, 'done', { by: me, at: Date.now(), note: f.note.value.trim(), photo });
      toast('Bravo! +' + t.def.xp + ' XP (čaka na oceno)');
    });
  },
  pweek: (v) => { planWeek = +v; render(); },
  claim1: async (id) => {
    const t = taskById(id); if (!t) return;
    const slots = weekPlan(t.week);
    const quota = Math.ceil(slots.length / N), mine = slots.filter((x) => x.who === me).length;
    if (mine >= quota) return toast(`Ta teden imaš že ${quota} opravil. Ostalo izberejo drugi ali se dodeli samodejno.`); await Store.put('c:' + id, 'claim', { who: me, at: Date.now() }); toast('Vzel si opravilo ✔'); },
  release: async (id) => { await Store.del('c:' + id); },
  undo: async (id) => {
    if (!confirm('Vrnem opravilo nazaj na neopravljeno? Ocene se izbrišejo.')) return;
    for (const r of ratingsFor(id)) await Store.del(r.id);
    await Store.del(id);
    toast('Vrnjeno na neopravljeno');
  },
  star: (v, el) => {
    const box = el.parentElement; box.dataset.val = v;
    [...box.children].forEach((b, i) => b.classList.toggle('on', i < v));
  },
  rate: async (id) => {
    const box = document.querySelector(`.stars[data-done="${id}"]`);
    const stars = +box.dataset.val;
    const comment = document.querySelector(`[data-cmt="${id}"]`).value.trim();
    if (!stars) return toast('Izberi zvezdice');
    if (stars < 3 && !comment) return toast('Pri oceni pod 3 napiši zakaj');
    await Store.put(id + '|' + me, 'rate', { done: id, by: me, stars, comment, at: Date.now() });
    toast('Hvala za oceno!');
  },
  newproj: () => dialog(`<h3>Nov projekt</h3><label>Naziv</label><input name="title" required placeholder="npr. Odpeljati odvečen material">
      <label>Kategorija</label><select name="cat">${CATS.map((c) => `<option>${c}</option>`).join('')}</select>
      <label>Opis</label><input name="desc"><label>XP</label><input name="xp" type="number" value="150" min="10" step="10">
      <label>Rok (neobvezno)</label><input name="due" type="date">`, async (f) => {
      if (!f.title.value.trim()) return;
      await Store.put(uid(), 'project', { title: f.title.value.trim(), cat: f.cat.value, desc: f.desc.value.trim(), xp: +f.xp.value || 100, due: f.due.value, owner: null, createdBy: me });
    }),
  take: async (id) => { const p = Store.get(id); await Store.put(id, 'project', { ...p.data, owner: me }); toast('Projekt je tvoj 💪'); },
  untake: async (id) => { const p = Store.get(id); await Store.put(id, 'project', { ...p.data, owner: null }); },
  delproj: (id) => { if (confirm('Izbrišem projekt?')) Store.del(id); },
  newshop: () => dialog(`<h3>Kaj manjka?</h3><label>Izdelek</label><input name="name" required placeholder="npr. Šampon Nivea 400 ml">
      <label>Povezava do trgovine (neobvezno)</label><input name="link" type="url" placeholder="https://...">${photoInput('photo')}`, async (f) => {
      if (!f.name.value.trim()) return;
      const photo = await compress(f.photo.files[0], 480);
      await Store.put(uid(), 'shop', { name: f.name.value.trim(), link: f.link.value.trim(), photo, by: me, at: Date.now(), bought: false });
    }),
  bought: async (id) => { const i = Store.get(id); await Store.put(id, 'shop', { ...i.data, bought: true, boughtBy: me, boughtAt: Date.now() }); toast('Odkljukano ✔'); },
  delshop: (id) => Store.del(id),
  zoom: (id) => { const i = Store.get(id); const dl = document.createElement('dialog'); dl.innerHTML = `<img class="big" src="${i.data.photo}"><button style="width:100%;margin-top:8px">Zapri</button>`; document.body.appendChild(dl); dl.querySelector('button').onclick = () => { dl.close(); dl.remove(); }; dl.showModal(); },
  newreward: () => dialog(`<h3>Nova nagrada</h3><label>Naziv</label><input name="title" required placeholder="npr. Izbereš večerjo / Družinski izlet">
      <label>Vrsta</label><select name="group"><option value="0">Osebna (porabi tvoje XP)</option><option value="1">Skupinska (skupni XP družine)</option></select>
      <label>Cena v XP</label><input name="cost" type="number" value="300" min="10" step="10">`, async (f) => {
      if (!f.title.value.trim()) return;
      await Store.put(uid(), 'reward', { title: f.title.value.trim(), group: f.group.value === '1', cost: +f.cost.value || 100, created: Date.now(), claims: [] });
    }),
  delreward: (id) => { if (confirm('Izbrišem nagrado?')) Store.del(id); },
  claim: async (id) => {
    const r = Store.get(id);
    if (!confirm(`Unovčim "${r.data.title}"?`)) return;
    await Store.put(id, 'reward', { ...r.data, claims: [...(r.data.claims || []), { by: me, at: Date.now() }] });
    toast('🎉 Uživaj!');
  },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el.dataset.v, el); }
});

// ---------- Zagon ----------
// Nagrade (dodajo se tudi v skupno bazo, če jih še ni)
const REWARDS = [
  ['r-film', 'Ti izbereš film za družinski večer 🎬', false, 150],
  ['r-joker', 'Joker: nekdo drug naredi eno tvoje opravilo 🃏', false, 250],
  ['r-vecerja', 'Izbereš večerjo', false, 300],
  ['r-zajtrk', 'Zajtrk v posteljo ☕', false, 350],
  ['r-prost', 'Cel dan brez opravil 😴', false, 450],
  ['r-kino', 'Kino + kokice 🍿', false, 550],
  ['r-avto', 'Avto za cel vikend 🚗', false, 650],
  ['r-opravilo', 'Teden brez enega opravila', false, 800],
  ['r-spotify', 'Mesec Spotify / Netflix plačan 🎧', false, 900],
  ['r-sushi', 'Kosilo v restavraciji po izbiri 🍣', false, 1000],
  ['r-lepota', 'Frizer / manikura / masaža (do 25 €) 💅', false, 1200],
  ['r-bon', 'Bon 30 € za trgovino po izbiri 🛍️', false, 1500],
  ['r-pica', 'Družinska pica večer 🍕', true, 2000],
  ['r-bowling', 'Bowling ali escape room 🎳', true, 3500],
  ['r-izlet', 'Družinski izlet', true, 6000],
  ['r-terme', 'Dan v termah 🏖️', true, 9000],
];
function seedRewards() {
  if (!me && REMOTE && !Store.lastSync) return;
  for (const [id, title, group, cost] of REWARDS)
    if (!Store.items[id]) Store.put(id, 'reward', { title, group, cost, created: Date.now(), claims: [] });
}
function seed() {
  if (localStorage.getItem('doma-seeded') || Store.list('reward').length) return;
  localStorage.setItem('doma-seeded', '1');
  if (REMOTE) return; // pri skupni bazi začetne podatke doda SQL skripta
  Store.put('r-vecerja', 'reward', { title: 'Izbereš večerjo', group: false, cost: 300, created: Date.now(), claims: [] });
  Store.put('r-opravilo', 'reward', { title: 'Teden brez enega opravila', group: false, cost: 800, created: Date.now(), claims: [] });
  Store.put('r-pica', 'reward', { title: 'Družinska pica večer 🍕', group: true, cost: 2000, created: Date.now(), claims: [] });
  Store.put('r-izlet', 'reward', { title: 'Družinski izlet', group: true, cost: 6000, created: Date.now(), claims: [] });
  Store.put('pr-1', 'project', { title: 'Odpeljati odvečen material', cat: 'Dovoz', desc: '', xp: 200, due: '', owner: null, createdBy: 'Vid' });
  Store.put('pr-2', 'project', { title: 'Priprava za nadstrešek', cat: 'Dovoz', desc: '', xp: 300, due: '', owner: null, createdBy: 'Vid' });
}
Store.load();
seed();
render();
// zapomni si dan začetka, da ne kaže "zamujenih" opravil izpred uporabe aplikacije
Store.sync().then(() => { if (!REMOTE || Store.lastSync) seedRewards(); if (!Store.get('start')) Store.put('start', 'meta', { day: dayIdx(new Date()) }); });
setInterval(() => { if (!document.hidden) Store.sync(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { Store.sync(); render(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
