# JRおでかけネットの区間時刻表から「A駅発 → B駅着」の列車を取り出す（A が B より先に止まる列車だけ）
# 使い方: python3 -I jrw_line.py <日付YYYYMMDD> <A駅> <B駅> <路線表ID> [<路線表ID> ...]
import re, sys, json, urllib.request
date, A, B, ids = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
UA = {"User-Agent": "Mozilla/5.0"}
strip = lambda x: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", x)).strip()
def rows_of(lid):
    s = urllib.request.urlopen(urllib.request.Request(f"https://timetable.jr-odekake.net/line-timetable/{lid}?date={date}", headers=UA), timeout=25).read().decode("utf-8")
    rows = [[strip(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)] for r in re.findall(r"<tr[^>]*>(.*?)</tr>", s, re.S)]
    types = next((r[2:] for r in rows if r and r[0] == "列車種別"), [])
    st, out = None, []
    for r in rows:
        if len(r) < 3 or r[1] not in ("着", "発"): continue
        if r[0]: st = r[0]
        out.append((st, r[1], r[2:]))
    return types, out
tm = lambda v: v if re.fullmatch(r"\d{2}:\d{2}", v or "") else None
res = []
for lid in ids:
    types, rs = rows_of(lid)
    ia = [i for i, (s, k, _) in enumerate(rs) if s == A]; ib = [i for i, (s, k, _) in enumerate(rs) if s == B]
    if not ia or not ib or min(ia) > max(ib): continue
    n = len(rs[0][2])
    for c in range(n):
        dep = next((tm(rs[i][2][c]) for i in ia if rs[i][1] == "発" and tm(rs[i][2][c])), None) or next((tm(rs[i][2][c]) for i in ia if tm(rs[i][2][c])), None)
        arr = next((tm(rs[i][2][c]) for i in ib if rs[i][1] == "着" and tm(rs[i][2][c])), None) or next((tm(rs[i][2][c]) for i in ib if tm(rs[i][2][c])), None)
        if dep and arr and (types[c] if c < len(types) else "") != "特急":
            m = lambda t: int(t[:2]) * 60 + int(t[3:])
            ride = (m(arr) - m(dep)) % 1440
            if 0 < ride < 120: res.append({"dep": dep, "arr": arr, "ride": ride, "type": types[c] if c < len(types) else "", "line": lid})
res = sorted({r["dep"]: r for r in res}.values(), key=lambda r: (int(r["dep"][:2]) + (24 if int(r["dep"][:2]) < 4 else 0), r["dep"]))
print(json.dumps(res, ensure_ascii=False))
