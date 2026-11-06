# 気象庁の全国の予報から「明日」（引数 today なら今日）の分をまとめる。
# 出力：all.json（配布版用・全国）と forecast.json（自分専用版用・大阪）を指定フォルダに書く
import json, sys, urllib.request, datetime, os
out_dir = sys.argv[1]; which = sys.argv[2] if len(sys.argv) > 2 else "tomorrow"
get = lambda u: json.load(urllib.request.urlopen(u, timeout=20))
jst = datetime.timezone(datetime.timedelta(hours=9))
ds = (datetime.datetime.now(jst).date() + datetime.timedelta(days=0 if which == "today" else 1)).isoformat()
offices = get("https://www.jma.go.jp/bosai/common/const/area.json")["offices"]
res, failed = {}, []
for code, info in offices.items():
    try:
        d = get(f"https://www.jma.go.jp/bosai/forecast/data/forecast/{code}.json")
        ts = d[0]["timeSeries"]
        wx = ts[0]["areas"]; pp = ts[1]["areas"]; tp = ts[2]["areas"]
        def day_vals(series, ar, key):
            return [(t, v) for t, v in zip(series["timeDefines"], ar.get(key, []))]
        week = {}
        try:
            w = d[1]["timeSeries"][1]
            for ar in w["areas"]:
                week[ar["area"]["code"]] = {t[:10]: (lo, hi) for t, lo, hi in zip(w["timeDefines"], ar["tempsMin"], ar["tempsMax"])}
        except Exception:
            pass
        pts = []
        for i, ar in enumerate(tp):
            temps = {t[11:13]: int(v) for t, v in day_vals(ts[2], ar, "temps") if t.startswith(ds) and v != ""}
            mn, mx = temps.get("00"), temps.get("09")
            lo, hi = week.get(ar["area"]["code"], {}).get(ds, ("", ""))
            if mn is None and lo: mn = int(lo)
            if mx is None and hi: mx = int(hi)
            if mx is not None and mn is None: mn = mx - 7
            if mn is not None and mx is None: mx = mn + 7
            if mx is None: continue
            wa = wx[i] if len(wx) == len(tp) else wx[0]
            pa = pp[i] if len(pp) == len(tp) else pp[0]
            weather = next((v for t, v in day_vals(ts[0], wa, "weathers") if t.startswith(ds)), "").replace("　", " ")
            pops = [int(v) for t, v in day_vals(ts[1], pa, "pops") if t.startswith(ds) and v != "" and 6 <= int(t[11:13]) <= 18]
            pts.append({"code": ar["area"]["code"], "name": ar["area"]["name"], "min": mn, "max": mx, "weather": weather, "pop": max(pops) if pops else 0})
        if pts: res[code] = {"name": info["name"], "points": pts}
        else: failed.append(code)
    except Exception as e:
        failed.append(code)
at = datetime.datetime.now(jst).isoformat(timespec="minutes")
os.makedirs(out_dir, exist_ok=True)
json.dump({"date": ds, "at": at, "source": "気象庁", "offices": res}, open(os.path.join(out_dir, "all.json"), "w"), ensure_ascii=False)
osaka = next((p for p in res.get("270000", {}).get("points", []) if p["code"] == "62078"), None)
hourly = []
try:  # 地域時系列予報：3時間ごとの気温と天気（大阪）
    vp = get("https://www.jma.go.jp/bosai/jmatile/data/wdist/VPFD/270000.json")
    wxs = {t["dateTime"][:16]: w for t, w in zip(vp["areaTimeSeries"]["timeDefines"], vp["areaTimeSeries"]["weather"])}
    nxt = (datetime.date.fromisoformat(ds) + datetime.timedelta(days=1)).isoformat()
    for t, v in zip(vp["pointTimeSeries"]["timeDefines"], vp["pointTimeSeries"]["temperature"]):
        dt = t["dateTime"][:16]
        if v == "" or v is None: continue
        if dt.startswith(ds): hourly.append({"h": int(dt[11:13]), "temp": int(v), "weather": wxs.get(dt, "")})
        elif dt == nxt + "T00:00": hourly.append({"h": 24, "temp": int(v), "weather": wxs.get(dt, "")})
except Exception:
    hourly = []
if osaka:
    json.dump({"date": ds, "place": "大阪", "weather": osaka["weather"], "min": osaka["min"], "max": osaka["max"], "pop": osaka["pop"], "hourly": hourly, "source": "気象庁", "at": at},
              open(os.path.join(out_dir, "forecast.json"), "w"), ensure_ascii=False)
print(f"date={ds} offices={len(res)} failed={len(failed)} {failed[:10]} osaka={'ok' if osaka else 'missing'} hourly={len(hourly)} size={os.path.getsize(os.path.join(out_dir,'all.json'))}")
