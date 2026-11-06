// のりば ウィジェット（iPhone の無料アプリ「Scriptable」用）
// 使い方：
//  1. のりば の「ウィジェット・バックアップ」→「設定をコピー」を押す
//  2. 下の DATA = の後ろの {} を、コピーした文字に置き換える
//  3. Scriptable にこのスクリプトを保存し、ホーム画面かロック画面に Scriptable のウィジェットを置いて、このスクリプトを選ぶ
//  4. ウィジェットの Parameter に「梅田」など行き先の名前を入れると、その経路で表示します（空なら自動）
const DATA = {};
const APP_URL = ""; // のりば を公開したURL（入れておくと、ウィジェットを押したときに開きます）

const pad = n => String(n).padStart(2, "0");
const hm = d => pad(d.getHours()) + ":" + pad(d.getMinutes());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMin = (d, m) => new Date(d.getTime() + m * 60000);

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
const z2h = s => String(s || "").replace(/[０-９：]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
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
function classesToday(now) {
  const svc = serviceDate(now); if (dayType(svc) === "holiday") return [];
  const ps = parsePeriods(DATA.periods), list = (DATA.classes || {})[svc.getDay()] || [];
  return ps.map((p, i) => ({ p: i + 1, name: list[i] || "", start: addMin(svc, p.s), end: addMin(svc, p.e) })).filter(c => c.name);
}
function legTimes(leg, day) { const wd = parseTimes(leg.wd), we = parseTimes(leg.we); return dayType(day) === "weekday" ? wd : (we.length ? we : wd); }
function chainFull(r, dep1, day) {
  let t = addMin(dep1, +r.legs[0].ride || 0);
  for (let i = 1; i < r.legs.length; i++) {
    const ready = addMin(t, +r.legs[i - 1].xfer || 0);
    const c = legTimes(r.legs[i], day).map(m => addMin(day, m)).concat(legTimes(r.legs[i], addDays(day, 1)).map(m => addMin(addDays(day, 1), m))).find(d => d >= ready);
    if (!c) return null; t = addMin(c, +r.legs[i].ride || 0);
  }
  return { leave: addMin(dep1, -(+r.home || 0)), dep1, arrive: addMin(t, +r.last || 0) };
}
function plan(r, now) {
  const svc = serviceDate(now), cands = [];
  [svc, addDays(svc, 1)].forEach(day => legTimes(r.legs[0], day).forEach(m => cands.push({ dep: addMin(day, m), day })));
  const plans = cands.filter(c => addMin(c.dep, -(+r.home || 0)) >= addMin(now, -0.2)).slice(0, 80).map(c => chainFull(r, c.dep, c.day)).filter(Boolean);
  if (!plans.length) return null;
  let tg = null;
  if (r.target === "class") { const c = classesToday(now).find(c => c.start > now); if (c) tg = { time: c.start, label: c.p + "限 " + c.name }; }
  else if (/^\d{1,2}:\d{2}$/.test(r.target || "")) { const [h, m] = r.target.split(":").map(Number); const t = addMin(svc, h * 60 + m); if (t > now) tg = { time: t, label: r.target + "着" }; }
  if (!tg) return { s: "info", p: plans[0], tg };
  const dl = addMin(tg.time, -(+r.buffer || 0)), ok = plans.filter(p => p.arrive <= dl);
  if (ok.length) { const p = ok[ok.length - 1], m = (p.leave - now) / 60000; return { s: m >= 10 ? "go" : m >= 3 ? "soon" : "now", p, tg }; }
  const late = Math.ceil((plans[0].arrive - tg.time) / 60000);
  return { s: late <= 0 ? "now" : "late", p: plans[0], tg, late };
}

const COLORS = { go: ["#0f7b5f", "#ffffff"], soon: ["#e3a400", "#14213d"], now: ["#d9600b", "#ffffff"], late: ["#c8102e", "#ffffff"], info: ["#14213d", "#ffffff"] };
const LABEL = { go: "余裕あり", soon: "そろそろ", now: "今すぐ出発", late: "遅刻の危険", info: "次の電車" };

async function build() {
  const now = new Date(), fam = config.widgetFamily || "medium";
  const w = new ListWidget();
  if (APP_URL) w.url = APP_URL;
  const routes = DATA.routes || [];
  if (!routes.length) { w.addText("のりば：DATA に設定を貼ってください"); return w; }
  const param = (args.widgetParameter || "").trim();
  let r = routes.find(x => param && x.name === param);
  if (!r) { const ci = routes.find(x => x.target === "class" && (x.legs || []).length); r = ci && classesToday(now).some(c => c.start > now) ? ci : (routes.find(x => x.target !== "class" && (x.legs || []).length) || routes[0]); }
  // 同じ行き先に行き方が複数あれば、いちばん良いものを選ぶ
  const alts = routes.filter(x => x.name === r.name && (x.legs || []).length).map(x => ({ x, P: plan(x, now) })).filter(a => a.P);
  alts.sort((a, b) => {
    const ok = q => q.P.tg && q.P.s !== "late";
    if (a.P.tg || b.P.tg) { if (ok(a) !== ok(b)) return ok(a) ? -1 : 1; return ok(a) ? b.P.p.leave - a.P.p.leave : a.P.p.arrive - b.P.p.arrive; }
    return (a.P.p.arrive - b.P.p.arrive) || (b.P.p.leave - a.P.p.leave);
  });
  if (alts.length) r = alts[0].x;
  const P = alts.length ? alts[0].P : plan(r, now);
  if (!P) { w.addText(r.name + "：今日の電車はもうありません"); w.refreshAfterDate = addMin(now, 60); return w; }
  const [bg, fg] = COLORS[P.s];
  const isAcc = fam.startsWith("accessory");
  if (!isAcc) w.backgroundColor = new Color(bg);
  const col = isAcc ? Color.white() : new Color(fg);
  const T = (s, size, bold) => { const t = w.addText(s); t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size); t.textColor = col; t.lineLimit = 1; t.minimumScaleFactor = 0.6; return t; };
  const timer = (d, size) => { const t = w.addDate(d); t.applyTimerStyle(); t.font = Font.boldMonospacedSystemFont(size); t.textColor = col; t.lineLimit = 1; return t; };

  if (fam === "accessoryInline") {
    T(`${r.name} ${hm(P.p.leave)}に出発・${LABEL[P.s]}`, 12, true);
  } else if (fam === "accessoryCircular") {
    T(LABEL[P.s].slice(0, 2), 10, true); T(hm(P.p.leave), 13, true);
  } else if (fam === "accessoryRectangular") {
    T(`${LABEL[P.s]}・${r.name}`, 12, true);
    timer(P.p.leave, 20);
    T(`${hm(P.p.leave)}出発→${hm(P.p.arrive)}着` + (P.late ? ` ${P.late}分遅刻` : ""), 11);
  } else {
    T(`${LABEL[P.s]}　${r.name}` + (P.tg ? `・${P.tg.label}` : ""), 13, true);
    T("家を出るまで", 11);
    timer(P.p.leave, fam === "small" ? 30 : 36);
    T(`${hm(P.p.leave)} 出発 → ${hm(P.p.dep1)} ${r.legs[0].from}発 → ${hm(P.p.arrive)} 着` + (alts.length > 1 ? `（${r.via || r.legs.map(l => l.line).join("→")}）` : ""), 11);
    if (P.late) T(`いちばん早くても ${P.late}分の遅刻`, 11, true);
    if (fam !== "small" && DATA.place) {
      try {
        const u = `https://api.open-meteo.com/v1/forecast?latitude=${DATA.place.lat}&longitude=${DATA.place.lon}&current=temperature_2m,apparent_temperature&timezone=Asia%2FTokyo`;
        const j = await new Request(u).loadJSON();
        T(`${DATA.place.name} 体感 ${Math.round(j.current.apparent_temperature)}℃（気温 ${Math.round(j.current.temperature_2m)}℃）`, 11);
      } catch (e) { }
    }
  }
  // 出発時刻をすぎたら次の計画に切り替わるよう、こまめに更新をお願いする（実際の間隔は iOS が決めます）
  const next = new Date(Math.min(+P.p.leave + 30000, +now + 15 * 60000));
  w.refreshAfterDate = next > now ? next : addMin(now, 5);
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget); else await widget.presentMedium();
Script.complete();
