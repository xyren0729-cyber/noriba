// のりば ウィジェット（iPhone の無料アプリ「Scriptable」用）
// はじめて使うとき：
//  1. のりば の「設定」→「ウィジェット・バックアップ」→「ウィジェット用スクリプトをコピー」
//  2. Scriptable で新しいスクリプトを作り、名前を「のりば」にして貼り付ける
//  3. ホーム画面かロック画面に Scriptable のウィジェットを置き、Script に「のりば」を選ぶ
//     （Parameter に「梅田」など行き先の名前を入れると、その行き先に固定できます。空なら自動）
// 設定を変えたとき：
//  のりば の「ウィジェットに送る」を押すと、設定がコピーされて Scriptable が開き、このスクリプトが自動で読み込みます。
// このスクリプトは、出発の10分前と5分前に通知し、JR西日本の遅れも直接確認します。
const DATA = {};
const APP_URL = ""; // のりば のURL（入れておくと、ウィジェットを押したときに開きます）

const pad = n => String(n).padStart(2, "0");
const hm = d => pad(d.getHours()) + ":" + pad(d.getMinutes());
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMin = (d, m) => new Date(d.getTime() + m * 60000);
const WD = ["日", "月", "火", "水", "木", "金", "土"];

/* ---------- 設定：「ウィジェットに送る」で受け取ったものを優先 ---------- */
const fm = FileManager.local(), FILE = fm.joinPath(fm.documentsDirectory(), "noriba.json");
let D = DATA, received = false;
if (!config.runsInWidget) {
  try {
    const t = Pasteboard.paste();
    if (t && t.trim().startsWith("{")) { const o = JSON.parse(t); if (o.routes) { fm.writeString(FILE, t); received = true; } }
  } catch (e) { }
}
try { if (fm.fileExists(FILE)) D = JSON.parse(fm.readString(FILE)); } catch (e) { }

/* ---------- 祝日・ダイヤ ---------- */
function nthMon(y, m, n) { const f = new Date(y, m, 1).getDay(); return 1 + ((8 - f) % 7) + (n - 1) * 7; }
function baseHoliday(d) {
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate(), k = y - 1980;
  const sp = Math.floor(20.8431 + 0.242194 * k - Math.floor(k / 4)), au = Math.floor(23.2488 + 0.242194 * k - Math.floor(k / 4));
  const fixed = { 0: [1], 1: [11, 23], 3: [29], 4: [3, 4, 5], 7: [11], 10: [3, 23] };
  return (fixed[m] || []).includes(day) || (m === 2 && day === sp) || (m === 8 && day === au)
    || (m === 0 && day === nthMon(y, 0, 2)) || (m === 6 && day === nthMon(y, 6, 3)) || (m === 8 && day === nthMon(y, 8, 3)) || (m === 9 && day === nthMon(y, 9, 2));
}
function isHoliday(d) {
  if (baseHoliday(d)) return true;
  if (d.getDay() !== 0) { let p = addDays(d, -1); while (baseHoliday(p)) { if (p.getDay() === 0) return true; p = addDays(p, -1); } }
  return d.getDay() !== 0 && baseHoliday(addDays(d, -1)) && baseHoliday(addDays(d, 1));
}
function dayType(d) {
  const ye = (d.getMonth() === 11 && d.getDate() >= 31) || (d.getMonth() === 0 && d.getDate() <= 3);
  if (d.getDay() === 0 || isHoliday(d) || ye) return "holiday";
  return d.getDay() === 6 ? "saturday" : "weekday";
}
const serviceDate = now => { const d = new Date(now); if (d.getHours() < 4) d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d; };
const z2h = s => String(s || "").replace(/[０-９：／]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
function parseTimes(text) {
  const out = new Set();
  z2h(text).split(/\n/).forEach(l => {
    const add = (h, m) => { if (h >= 0 && h < 30 && m >= 0 && m < 60) out.add((h < 4 ? h + 24 : h) * 60 + m); };
    if (/\d{1,2}:\d{2}/.test(l)) { [...l.matchAll(/(\d{1,2}):(\d{2})/g)].forEach(x => add(+x[1], +x[2])); return; }
    const n = l.match(/\d+/g); if (!n) return;
    if (n.every(x => x.length >= 3)) { n.forEach(x => add(+x.slice(0, -2), +x.slice(-2))); return; }
    const h = +n[0]; n.slice(1).forEach(x => { if (x.length <= 2) add(h, +x); });
  });
  return [...out].sort((a, b) => a - b);
}
function parsePeriods(text) {
  const out = []; z2h(text).split(/\n/).forEach(l => { const m = l.match(/(\d{1,2}):(\d{2})\s*[-〜~～]\s*(\d{1,2}):(\d{2})/); if (m) out.push({ s: +m[1] * 60 + +m[2], e: +m[3] * 60 + +m[4] }); });
  return out;
}
/* 学年暦（ページと同じ書き方） */
function calFor(day) {
  const now = new Date(), key = ymd(day); let hit = null;
  z2h(D.cal).split(/\n/).forEach(l => {
    const m = l.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\s*[-〜~～]\s*(\d{1,2})\/(\d{1,2}))?\s*(.*)$/); if (!m) return;
    const yOf = mo => { let y = now.getFullYear(); if (mo < now.getMonth() + 1 - 6) y++; else if (mo > now.getMonth() + 1 + 6) y--; return y; };
    const a = new Date(yOf(+m[1]), +m[1] - 1, +m[2]); let b = m[3] ? new Date(yOf(+m[3]), +m[3] - 1, +m[4]) : a; if (b < a) b = new Date(b.getFullYear() + 1, b.getMonth(), b.getDate());
    if (day < a || day > b) return;
    const rest = m[5] || "", wm = rest.match(/([日月火水木金土])曜/);
    hit = { off: /休み|休暇|授業なし|休校/.test(rest) && !/休講/.test(rest), wd: wm ? WD.indexOf(wm[1]) : null, cancel: /休講/.test(rest) ? [...rest.matchAll(/(\d)限/g)].map(x => +x[1]) : [] };
  });
  return hit;
}
function classesToday(now) {
  const svc = serviceDate(now), c = calFor(svc);
  if (c && c.off) return [];
  if (dayType(svc) === "holiday" && !(c && c.wd != null)) return [];
  const wd = c && c.wd != null ? c.wd : svc.getDay();
  const ps = parsePeriods(D.periods), list = (D.classes || {})[wd] || [];
  return ps.map((p, i) => ({ p: i + 1, name: list[i] || "", start: addMin(svc, p.s), end: addMin(svc, p.e) })).filter(x => x.name && !(c && c.cancel.includes(x.p)));
}

/* ---------- 遅延（JR西日本の運行情報） ---------- */
const LINEKEY = [[/おおさか東/, "osakahigashi"], [/JR京都線/, "kyoto"], [/学研都市/, "gakkentoshi"], [/東西線/, "tozai"], [/環状/, "osakaloop"], [/JR神戸線/, "kobesanyo"]];
const LINENAME = { osakahigashi: "おおさか東線", kyoto: "JR京都線", gakkentoshi: "学研都市線", tozai: "JR東西線", osakaloop: "大阪環状線", kobesanyo: "JR神戸線" };
let TRAFFIC = {};
const delayedLines = r => { const s = new Set(); (r.legs || []).forEach(L => LINEKEY.forEach(([re, k]) => { if (re.test(L.line || "") && TRAFFIC[k]) s.add(k); })); return [...s]; };

/* ---------- 経路の計算（ページと同じ） ---------- */
function legTimes(leg, day) { const wd = parseTimes(leg.wd), we = parseTimes(leg.we); return dayType(day) === "weekday" ? wd : (we.length ? we : wd); }
function rideOf(L, dep) {
  const sd = serviceDate(dep), m = Math.round((dep - sd) / 60000), k = dayType(sd) === "weekday" ? "wd" : "we";
  const R = L.rides && (L.rides[k] || L.rides.wd); const v = R && R[m]; return v != null ? +v : (+L.ride || 0);
}
function chainFull(r, dep1, day) {
  let t = addMin(dep1, rideOf(r.legs[0], dep1));
  for (let i = 1; i < r.legs.length; i++) {
    const ready = addMin(t, +r.legs[i - 1].xfer || 0);
    const c = legTimes(r.legs[i], day).map(m => addMin(day, m)).concat(legTimes(r.legs[i], addDays(day, 1)).map(m => addMin(addDays(day, 1), m))).find(d => d >= ready);
    if (!c) return null; t = addMin(c, rideOf(r.legs[i], c));
  }
  return { leave: addMin(dep1, -(+r.home || 0)), dep1, arrive: addMin(t, +r.last || 0) };
}
function plan(r, now) {
  const svc = serviceDate(now), cands = [];
  [svc, addDays(svc, 1)].forEach(day => legTimes(r.legs[0], day).forEach(m => cands.push({ dep: addMin(day, m), day })));
  let from = addMin(now, -0.2);
  if (r.kind === "back") { const cs = classesToday(now); if (cs.length && cs[cs.length - 1].end > from) from = cs[cs.length - 1].end; }
  const plans = cands.filter(c => addMin(c.dep, -(+r.home || 0)) >= from).slice(0, 80).map(c => chainFull(r, c.dep, c.day)).filter(Boolean);
  if (!plans.length) return null;
  let tg = null;
  if (r.target === "class") { const c = classesToday(now).find(c => c.start > now); if (c) tg = { time: c.start, label: c.p + "限 " + c.name }; }
  else if (/^\d{1,2}:\d{2}$/.test(r.target || "")) { const [h, m] = r.target.split(":").map(Number); const t = addMin(svc, h * 60 + m); if (t > now) tg = { time: t, label: r.target + "着" }; }
  if (!tg) return { s: "info", p: plans[0], tg };
  const extra = delayedLines(r).length ? 10 : 0;
  const dl = addMin(tg.time, -((+r.buffer || 0) + extra)), ok = plans.filter(p => p.arrive <= dl);
  if (ok.length) { const p = ok[ok.length - 1], m = (p.leave - now) / 60000; return { s: m >= 10 ? "go" : m >= 3 ? "soon" : "now", p, tg }; }
  const late = Math.ceil((plans[0].arrive - tg.time) / 60000);
  return { s: late <= 0 ? "now" : "late", p: plans[0], tg, late };
}
function autoRoute(routes, now) {
  const cs = classesToday(now), back = routes.find(x => x.kind === "back" && (x.legs || []).length);
  if (cs.length && back) { const last = cs[cs.length - 1]; if (now >= addMin(last.end, -20) && now <= addMin(last.end, 300)) return back; }
  const ci = routes.find(x => x.target === "class" && x.kind !== "back" && (x.legs || []).length);
  if (ci && cs.some(c => c.start > now)) return ci;
  return routes.find(x => x.target !== "class" && x.kind !== "back" && (x.legs || []).length) || ci || routes[0];
}

const COLORS = { go: ["#0f7b5f", "#ffffff"], soon: ["#e3a400", "#14213d"], now: ["#d9600b", "#ffffff"], late: ["#c8102e", "#ffffff"], info: ["#14213d", "#ffffff"] };
const LABEL = { go: "余裕あり", soon: "そろそろ", now: "今すぐ出発", late: "遅刻の危険", info: "次の電車" };

async function build() {
  const now = new Date(), fam = config.widgetFamily || "medium";
  const w = new ListWidget();
  if (APP_URL) w.url = APP_URL;
  const routes = D.routes || [];
  if (!routes.length) { w.addText("のりば：設定がありません。のりば の「ウィジェットに送る」を押してください"); return { w }; }
  try {
    const j = await new Request("https://www.train-guide.westjr.co.jp/api/v3/area_kinki_trafficinfo.json").loadJSON();
    TRAFFIC = (j && j.lines) || {};
  } catch (e) { TRAFFIC = {}; }
  const param = (args.widgetParameter || "").trim();
  let r = routes.find(x => param && x.name === param) || autoRoute(routes, now);
  // 同じ行き先に行き方が複数あれば、いちばん良いものを選ぶ（遅れている路線は15分不利）
  const pen = x => delayedLines(x).length ? 15 * 60000 : 0;
  const alts = routes.filter(x => x.name === r.name && (x.legs || []).length).map(x => ({ x, P: plan(x, now) })).filter(a => a.P);
  // 予備の行き方（例：阪急）は、ほかが遅れているか間に合わないときだけ使う
  const tier = q => (q.P.tg && q.P.s === "late") || delayedLines(q.x).length ? 2 : q.x.spare ? 1 : 0;
  alts.sort((a, b) => {
    const ok = q => !!(q.P.tg && q.P.s !== "late");
    if (tier(a) !== tier(b)) return tier(a) - tier(b);
    if (a.P.tg || b.P.tg) { if (ok(a) !== ok(b)) return ok(a) ? -1 : 1; return ok(a) ? (b.P.p.leave - pen(b.x)) - (a.P.p.leave - pen(a.x)) : (+a.P.p.arrive + pen(a.x)) - (+b.P.p.arrive + pen(b.x)); }
    return (+a.P.p.arrive + pen(a.x) - b.P.p.arrive - pen(b.x)) || (b.P.p.leave - a.P.p.leave); // 時刻は数にしてから足す
  });
  if (alts.length) r = alts[0].x;
  const P = alts.length ? alts[0].P : plan(r, now);
  if (!P) { w.addText(r.name + "：今日の電車はもうありません"); w.refreshAfterDate = addMin(now, 60); return { w }; }
  const back = r.kind === "back", org = r.origin || "家";
  const label = P.s === "info" && back ? "帰り" : LABEL[P.s];
  const [bg, fg] = COLORS[P.s];
  const isAcc = fam.startsWith("accessory");
  if (!isAcc) w.backgroundColor = new Color(bg);
  const col = isAcc ? Color.white() : new Color(fg);
  const T = (s, size, bold) => { const t = w.addText(s); t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size); t.textColor = col; t.lineLimit = 1; t.minimumScaleFactor = 0.6; return t; };
  const timer = (d, size) => { const t = w.addDate(d); t.applyTimerStyle(); t.font = Font.boldMonospacedSystemFont(size); t.textColor = col; t.lineLimit = 1; return t; };
  const dl = [...new Set(routes.filter(x => x.name === r.name).flatMap(delayedLines))].map(k => LINENAME[k]);

  if (fam === "accessoryInline") {
    T(`${back ? "帰り" : r.name} ${hm(P.p.leave)}に出発・${label}${dl.length ? "・遅れあり" : ""}`, 12, true);
  } else if (fam === "accessoryCircular") {
    T(label.slice(0, 2), 10, true); T(hm(P.p.leave), 13, true);
  } else if (fam === "accessoryRectangular") {
    T(`${label}・${back ? "帰り" : r.name}${dl.length ? "・遅れあり" : ""}`, 12, true);
    timer(P.p.leave, 20);
    T(`${hm(P.p.leave)}出発→${hm(P.p.arrive)}着` + (P.late ? ` ${P.late}分遅刻` : ""), 11);
  } else {
    T(`${label}　${back ? "家へ" : r.name}` + (P.tg ? `・${P.tg.label}` : ""), 13, true);
    T(`${org}を出るまで`, 11);
    timer(P.p.leave, fam === "small" ? 30 : 36);
    T(`${hm(P.p.leave)} 出発 → ${hm(P.p.dep1)} ${r.legs[0].from}発 → ${hm(P.p.arrive)} 着` + (alts.length > 1 ? `（${r.via || r.legs.map(l => l.line).join("→")}）` : ""), 11);
    if (P.late) T(`いちばん早くても ${P.late}分の遅刻`, 11, true);
    if (dl.length) T(`遅れ：${dl.join("・")}（遅れのない行き方を優先）`, 11, true);
    else if (fam !== "small" && D.place) {
      try {
        const u = `https://api.open-meteo.com/v1/forecast?latitude=${D.place.lat}&longitude=${D.place.lon}&current=temperature_2m&timezone=Asia%2FTokyo`;
        const j = await new Request(u).loadJSON();
        T(`${D.place.name} 気温 ${Math.round(j.current.temperature_2m)}℃`, 11);
      } catch (e) { }
    }
  }
  // 出発時刻をすぎたら次の計画に切り替わるよう、こまめに更新をお願いする（実際の間隔は iOS が決めます）
  const next = new Date(Math.min(+P.p.leave + 30000, +now + 10 * 60000));
  w.refreshAfterDate = next > now ? next : addMin(now, 5);
  return { w, P, r, org };
}

/* 出発の10分前・5分前に通知（3時間以内の予定だけ）。同じ通知は上書きする */
async function scheduleNotices(P, r, org) {
  if (!P || D.notify === false) return;
  const ids = ["noriba-10", "noriba-5"];
  try { Notification.removePending(ids); } catch (e) { }
  const now = new Date();
  if (P.p.leave - now > 3 * 3600000) return;
  for (const [id, m] of [[ids[0], 10], [ids[1], 5]]) {
    const at = addMin(P.p.leave, -m);
    if (at <= now) continue;
    const n = new Notification();
    n.identifier = id;
    n.title = `あと${m}分で${org}を出る時間です`;
    n.body = `${hm(P.p.leave)} に出発 → ${hm(P.p.dep1)} ${r.legs[0].from}発（${r.via || r.name}）`;
    if (APP_URL) n.openURL = APP_URL;
    n.setTriggerDate(at);
    await n.schedule();
  }
}

const res = await build();
await scheduleNotices(res.P, res.r, res.org);
if (config.runsInWidget) Script.setWidget(res.w);
else {
  if (received) { const a = new Alert(); a.title = "のりば"; a.message = "設定を受け取りました。ウィジェットに反映されます。"; a.addAction("OK"); await a.present(); }
  await res.w.presentMedium();
}
Script.complete();
