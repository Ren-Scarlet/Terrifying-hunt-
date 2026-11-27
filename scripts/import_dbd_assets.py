"""Import killer perk icons and killer power assets from dbdwiki.com.

Run from the project root:
    python scripts/import_dbd_assets.py

每一张卡牌对应一个杀手技能图标：图标 = 卡名所指的那枚技能（共 18 张，
同名的两张卡共用同一枚图鉴图标，例如「牢牢紧握」的 choke 与 iron_grasp）。
映射关系以 dbdwiki 的 perk-icons.manifest.json 为准，中文名以 perks.site.json
为基准做核对，脚本结束时会打印一张 "卡牌 id → 技能中文名（所属杀手）" 的
对照表，便于核对。
"""

import json
import urllib.request
from pathlib import Path

from PIL import Image

BASE = "https://dbdwiki.com"
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "assets" / "dbd"
TEMP = ROOT / ".dbd-cache"

# 卡牌 id -> 图鉴技能 slug。顺序与 src/game/data/cards.ts 保持一致，
# 中文名与卡名逐字对应；个别卡没有同名技能，取效果最接近的官方技能并注明。
CARD_PERKS = {
    # ---- 新版初始卡池 ----
    "unbreakable": "unrelenting",                    # 不屈不挠
    "hex_huntress": "hex_thrill_of_the_hunt",        # 厄咒：猎杀戾气
    "hex_noed": "hex_no_one_escapes_death",          # 厄咒：难逃一死
    "scourge_shrine": "scourge_hook_monstrous_shrine",  # 天灾钩子：鬼魔神龛
    "distressing": "distressing",                    # 恐惧释放
    "hell": "whispers",                              # 恶灵低语（图鉴技能名 Whispers，
                                                     # 效果同为感知附近逃生者）
    "iron_grasp": "iron_grasp",                      # 牢牢紧握
    "deerstalker": "deerstalker",                    # 猎鹿者
    "hex_ruin": "shattered_hope",                    # 粉碎希望
    "bitter_murmur": "bitter_murmur",                # 苦涩低语
    "sloppy_butcher": "sloppy_butcher",              # 辣手屠夫
    "insidious": "insidious",                        # 静止隐身
    # ---- 迈尔斯专属 ----
    "myers_eclipse_light": "cull_the_weak",          # 优胜劣汰
    "myers_last_best": "save_the_best_for_last",     # 把最好的留在最后
    "myers_plaything": "play_with_your_food",        # 玩弄食物
    # ---- 设陷者专属 ----
    "trapper_panic": "unnerving_presence",           # 恐慌降临
    "trapper_brutal_strength": "brutal_strength",    # 所向无敌
    "trapper_euphoria": "agitation",                 # 欣喜若狂
}

POWER_OWNERS = [
    "设陷者", "幽灵", "护士", "女猎手", "鬼面", "迈克尔·迈尔斯",
    "贞子", "梦魇", "食人魔", "处刑者", "魔王", "医生", "门徒",
]
RARITIES = ["common", "uncommon", "rare", "very-rare", "visceral"]


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_file(url: str, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r, open(path, "wb") as f:
        f.write(r.read())


def crop_sprite(sheet: Image.Image, pos: dict) -> Image.Image:
    x, y = int(pos["x"]), int(pos["y"])
    w, h = int(pos["width"]), int(pos["height"])
    return sheet.crop((x, y, x + w, y + h))


def main():
    TEMP.mkdir(parents=True, exist_ok=True)
    for d in ["perks", "powers", "rarity"]:
        (PUBLIC / d).mkdir(parents=True, exist_ok=True)

    perk_manifest = fetch_json(f"{BASE}/data/dbd/perk-icons.manifest.json")
    loadout_manifest = fetch_json(f"{BASE}/data/dbd/loadout-icons.manifest.json")
    addons = fetch_json(f"{BASE}/data/dbd/killer-addons.site.json")
    # 技能中文名（卡名核对基准）
    site_perks = fetch_json(f"{BASE}/data/dbd/perks.site.json")["perks"]
    zh_by_slug = {
        p["icon"].get("slug"): p.get("title", "")
        for p in site_perks
        if p.get("icon", {}).get("slug")
    }

    perk_sheet_path = TEMP / "perk-killer@2x.webp"
    loadout_sheet_path = TEMP / "killer-loadout@2x.webp"
    fetch_file(f"{BASE}/assets/perks/perk-killer@2x.webp", perk_sheet_path)
    fetch_file(f"{BASE}/assets/loadout/killer-loadout@2x.webp", loadout_sheet_path)

    perk_sheet = Image.open(perk_sheet_path).convert("RGBA")
    loadout_sheet = Image.open(loadout_sheet_path).convert("RGBA")

    by_slug = {
        v.get("slug"): k
        for k, v in perk_manifest["icons"].items()
        if v.get("side") == "killer"
    }

    table = []
    missing = []
    for card_id, slug in CARD_PERKS.items():
        key = by_slug.get(slug)
        if not key:
            missing.append(slug)
            print(f"[warn] missing perk slug: {slug}")
            continue
        entry = perk_manifest["icons"][key]
        crop_sprite(perk_sheet, entry["position_2x"]).save(PUBLIC / "perks" / f"{card_id}.png")
        table.append((card_id, zh_by_slug.get(slug) or entry.get("name_en", slug), entry.get("character_en", "")))

    # 只导入图标。src/game/killers.ts 为手写的原创机制数据，脚本不再覆盖它。
    for owner in POWER_OWNERS:
        module = next((m for m in addons["modules"] if m.get("owner") == owner and m.get("power")), None)
        if not module:
            print(f"[warn] missing killer module: {owner}")
            continue
        icon_key = module["power"].get("iconKey")
        entry = loadout_manifest["icons"].get(icon_key)
        if entry:
            crop_sprite(loadout_sheet, entry["position_2x"]).save(PUBLIC / "powers" / f"{owner}.png")
        else:
            print(f"[warn] missing power icon for: {owner}")

    for rarity in RARITIES:
        fetch_file(f"{BASE}/assets/rarities/addon-{rarity}.webp", PUBLIC / "rarity" / f"addon-{rarity}.webp")
    fetch_file(f"{BASE}/assets/rarities/perk-very-rare.webp", PUBLIC / "rarity" / "perk-very-rare.webp")

    print(f"\nImported {len(table)} perk icons, {len(POWER_OWNERS)} powers, {len(RARITIES) + 1} rarity backgrounds.")
    print("\n| 卡牌 id | 卡名（图鉴技能中文名） | 所属杀手 |")
    print("| --- | --- | --- |")
    for card_id, name, character in table:
        print(f"| `{card_id}` | {name} | {character or '通用'} |")
    if missing:
        print(f"\n[error] {len(missing)} 个 slug 未命中: {', '.join(missing)}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
