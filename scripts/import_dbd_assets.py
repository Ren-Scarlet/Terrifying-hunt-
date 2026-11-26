"""Import killer perk icons and killer power assets from dbdwiki.com.

Run from the project root:
    python scripts/import_dbd_assets.py

每一张卡牌对应一个杀手技能图标：图标 = 卡名所指的那枚技能（共 44 张，
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
    # ---- 攻击 ----
    "shuriken": "sloppy_butcher",            # 辣手屠夫
    "choke": "iron_grasp",                   # 牢牢紧握
    "execute": "coup_de_grâce",              # 恩赐解脱
    "harvest": "blood_echo",                 # 鲜血回响
    "final_blow": "cull_the_weak",           # 优胜劣汰
    "break_in": "brutal_strength",           # 所向无敌
    # ---- 技能 ----
    "silent_step": "insidious",              # 静止隐身
    "sprint": "rapid_brutality",             # 疾速残暴
    "clean": "trail_of_torment",             # 折磨路径
    "night_cover": "darkness_revealed",      # 黑暗启迪
    "silence": "hex_huntress_lullaby",       # 厄咒：猎手摇篮曲
    "disguise": "dark_devotion",             # 黑暗奉献
    "intimidate": "distressing",             # 恐惧释放
    "fear": "coulrophobia",                  # 小丑恐惧症
    "aim": "deerstalker",                    # 猎鹿者
    "evacuate": "blood_warden",              # 血腥狱长
    "search": "hoarder",                     # 囤积者
    # ---- 战术 ----
    "false_lead": "furtive_chase",           # 鬼祟追杀
    "lock_door": "deadlock",                 # 死锁
    "bait": "spies_from_the_shadows",        # 鬼鸦谍影
    "mind_control": "dominance",             # 支配之力
    # ---- 布局 ----
    "cut_line": "dead_mans_switch",          # 失效开关
    "lure": "barbecue_and_chilli",           # 人肉烧烤
    "wiretap": "a_nurses_calling",           # 护士的呼唤
    "poltergeist": "hex_haunted_ground",     # 厄咒：闹鬼之地
    "blackout": "hex_face_the_darkness",     # 厄咒：直面黑暗
    "block_gate": "bamboozle",               # 花言巧语
    "ghost_light": "lethal_pursuer",         # 致命追踪者
    "false_report": "hex_retribution",       # 厄咒：惩戒
    # ---- 新版初始卡池 ----
    "unbreakable": "unrelenting",                    # 不屈不挠
    "hex_huntress": "hex_thrill_of_the_hunt",        # 厄咒：猎杀戾气
    "hex_noed": "hex_no_one_escapes_death",          # 厄咒：难逃一死
    "scourge_shrine": "scourge_hook_monstrous_shrine",  # 天灾钩子：鬼魔神龛
    "distressing": "distressing",                    # 恐惧释放
    "hell": "whispers",                              # 恶灵地狱（图鉴无同名技能，
                                                     # 取「恶灵低语」Whispers 替代：
                                                     # 同为感知附近逃生者）
    "iron_grasp": "iron_grasp",                      # 牢牢紧握
    "deerstalker": "deerstalker",                    # 猎鹿者
    "hex_ruin": "shattered_hope",                    # 粉碎希望
    "bitter_murmur": "bitter_murmur",                # 苦涩低语
    "sloppy_butcher": "sloppy_butcher",              # 辣手屠夫
    "insidious": "insidious",                        # 静止隐身
    # ---- 迈尔斯专属 ----
    "myers_eclipse_light": "cull_the_weak",          # 湮灭之光（Dying Light，
                                                     # 图鉴中该图标归入 Cull the Weak）
    "myers_last_best": "save_the_best_for_last",     # 把最好的留在最后
    "myers_plaything": "play_with_your_food",        # 戏耍食物
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
