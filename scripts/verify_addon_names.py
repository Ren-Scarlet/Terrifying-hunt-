"""核对配件名与图鉴（dbdwiki / 迷雾笔记）官方中文名是否一致。

用法（需要网络）：
    python scripts/verify_addon_names.py

只读取 src/game/data/accessories.ts 与图鉴数据，不修改任何文件。
发现不一致会以非零码退出，并打印「配件 id / 当前名称 / 官方中文名」。
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

BASE = "https://dbdwiki.com"
ROOT = Path(__file__).resolve().parent.parent
ACCESSORIES = ROOT / "src" / "game" / "data" / "accessories.ts"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    site = fetch_json(f"{BASE}/data/dbd/killer-addons.site.json")
    by_en = {}
    for module in site.get("modules", []):
        for addon in module.get("addons", []):
            name_en = ((addon.get("source") or {}).get("name_en") or "").strip().lower()
            if name_en:
                by_en[name_en] = addon.get("title", "")

    src = ACCESSORIES.read_text(encoding="utf-8")
    rows = []
    for match in re.finditer(r"id:\s*'([^']+)'\s*,\s*\n\s*name:\s*'([^']+)'", src):
        tail = src[match.end():match.end() + 1200]
        skill = re.search(r"sourceSkill:\s*(['\"])(.*?)\1", tail)
        rows.append((match.group(1), match.group(2), skill.group(2) if skill else ""))

    bad = []
    unknown = []
    for addon_id, name, skill in rows:
        official = by_en.get(skill.strip().lower())
        if official is None:
            unknown.append((addon_id, name, skill))
        elif official != name:
            bad.append((addon_id, name, skill, official))

    for addon_id, name, skill, official in bad:
        print(f"[不一致] {addon_id}: 配件名「{name}」 但 {skill} 的官方中文名是「{official}」")
    for addon_id, name, skill in unknown:
        print(f"[无条目] {addon_id}: {skill} 在图鉴里没有对应中文名（可能是自定义配件）")

    print(f"\n共 {len(rows)} 件配件：不一致 {len(bad)}，无官方条目 {len(unknown)}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
