"""核对卡牌名与图鉴（dbdwiki / 迷雾笔记）官方中文名是否一致。

用法（需要网络）：
    python scripts/verify_card_names.py

它只读取 src/game/data/cards.ts 与图鉴数据，不修改任何文件。
发现不一致会以非零码退出，并打印「卡 id / 当前卡名 / 官方中文名」。
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

BASE = "https://dbdwiki.com"
ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "src" / "game" / "data" / "cards.ts"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    manifest = fetch_json(f"{BASE}/data/dbd/perk-icons.manifest.json")
    site = fetch_json(f"{BASE}/data/dbd/perks.site.json")
    zh = {
        (p.get("icon") or {}).get("slug"): p.get("title", "")
        for p in site.get("perks", [])
        if (p.get("icon") or {}).get("slug")
    }
    by_en = {
        (e.get("name_en") or "").strip().lower(): e.get("slug")
        for e in manifest["icons"].values()
        if e.get("side") == "killer" and e.get("name_en")
    }

    src = CARDS.read_text(encoding="utf-8")
    rows = []
    for m in re.finditer(r"id:\s*'([^']+)'\s*,\s*\n\s*name:\s*'([^']+)'", src):
        tail = src[m.end():m.end() + 1500]
        sk = re.search(r"sourceSkill:\s*(['\"])(.*?)\1", tail)
        rows.append((m.group(1), m.group(2), sk.group(2) if sk else ""))

    bad = []
    unknown = []
    for cid, name, skill in rows:
        slug = by_en.get(skill.strip().lower())
        official = zh.get(slug) if slug else None
        if official is None:
            unknown.append((cid, name, skill))
        elif official != name:
            bad.append((cid, name, skill, official))

    for cid, name, skill, official in bad:
        print(f"[不一致] {cid}: 卡名「{name}」 但 {skill} 的官方中文名是「{official}」")
    for cid, name, skill in unknown:
        print(f"[无条目] {cid}: {skill} 在图鉴里没有对应中文名（可能是自定义卡）")

    print(f"\n共 {len(rows)} 张卡：不一致 {len(bad)}，无官方条目 {len(unknown)}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
