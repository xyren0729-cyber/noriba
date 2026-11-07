# JR西日本（近畿）の運行情報から、のりばで使う路線の遅れ・運転見合わせを traffic.json に書く
# 使い方: python3 -I tools/jrw_traffic.py traffic.json
#   {"at": 取得時刻, "lines": {路線キー: {"text", "cause"}}}（遅れがなければ lines は空）
#   変わったときだけファイルを書き換える（遅れが続いている間は時刻も更新する）
import json, sys, urllib.request, datetime
path = sys.argv[1]
KEYS = {"osakahigashi", "kyoto", "gakkentoshi", "tozai", "osakaloop", "kobesanyo"}
req = urllib.request.Request("https://www.train-guide.westjr.co.jp/api/v3/area_kinki_trafficinfo.json", headers={"User-Agent": "Mozilla/5.0"})
t = json.load(urllib.request.urlopen(req, timeout=20))
lines = {}
for k, v in (t.get("lines") or {}).items():
    if k not in KEYS: continue
    v = v if isinstance(v, dict) else {"text": str(v)}
    text = v.get("status") or v.get("text") or v.get("title") or ""
    if isinstance(text, dict): text = text.get("text") or json.dumps(text, ensure_ascii=False)
    lines[k] = {"text": str(text)[:80] or "遅れ・運転見合わせの情報", "cause": str(v.get("cause") or "")[:40]}
try: old = json.load(open(path))
except Exception: old = {}
if lines or old.get("lines"):
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
    json.dump({"at": now.isoformat(timespec="minutes"), "lines": lines}, open(path, "w"), ensure_ascii=False)
elif not old:
    json.dump({"at": None, "lines": {}}, open(path, "w"), ensure_ascii=False)
print(json.dumps(sorted(lines)))
