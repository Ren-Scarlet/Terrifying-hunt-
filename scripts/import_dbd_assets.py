"""Import killer perk icons and killer power assets from dbdwiki.com.

Run from the project root:
    python scripts/import_dbd_assets.py

每一张卡牌对应一个唯一的杀手技能图标（共 29 张，互不重复）。
映射关系以 dbdwiki 的 perk-icons.manifest.json 为准，脚本结束时会打印一张
"卡牌 id → 技能英文名（所属杀手）" 的对照表，便于核对。
"""

import json
import urllib.request
from pathlib import Path

from PIL import Image

BASE = "https://dbdwiki.com"
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "assets" / "dbd"
TEMP = ROOT / ".dbd-cache"

# 卡牌 id -> 图鉴技能 slug。顺序与 src/game/cards.ts 保持一致。
CARD_PERKS = {
    # ---- 攻击 ----
    "shuriken": "sloppy_butcher",          # Sloppy Butcher
    "choke": "iron_grasp",                 # Iron Grasp
    "execute": "coup_de_grâce",            # Coup de Grâce
    "harvest": "blood_echo",               # Blood Echo
    "final_blow": "cull_the_weak",         # Cull the Weak
    "break_in": "brutal_strength",         # Brutal Strength
    # ---- 技能 ----
    "silent_step": "insidious",            # Insidious
    "sprint": "rapid_brutality",           # Rapid Brutality
    "clean": "trail_of_torment",           # Trail of Torment
    "night_cover": "darkness_revealed",    # Darkness Revealed
    "silence": "hex_huntress_lullaby",     # Hex: Huntress Lullaby
    "disguise": "dark_devotion",           # Dark Devotion
    "intimidate": "distressing",           # Distressing
    "fear": "coulrophobia",                # Coulrophobia
    "aim": "deerstalker",                  # Deerstalker
    "evacuate": "blood_warden",            # Blood Warden
    "search": "hoarder",                   # Hoarder
    # ---- 战术 ----
    "false_lead": "furtive_chase",         # Furtive Chase
    "lock_door": "deadlock",               # Deadlock
    "bait": "spies_from_the_shadows",      # Spies from the Shadows
    "mind_control": "dominance",           # Dominance
    # ---- 布局 ----
    "cut_line": "dead_mans_switch",        # Dead Man's Switch
    "lure": "barbecue_and_chilli",         # Barbecue & Chilli
    "wiretap": "a_nurses_calling",         # A Nurse's Calling
    "poltergeist": "hex_haunted_ground",   # Hex: Haunted Ground
    "blackout": "hex_face_the_darkness",   # Hex: Face the Darkness
    "block_gate": "bamboozle",             # Bamboozle
    "ghost_light": "lethal_pursuer",       # Lethal Pursuer
    "false_report": "hex_retribution",     # Hex: Retribution
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
        table.append((card_id, entry.get("name_en", slug), entry.get("character_en", "")))

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
    print("\n| 卡牌 id | 原技能 | 所属杀手 |")
    print("| --- | --- | --- |")
    for card_id, name, character in table:
        print(f"| `{card_id}` | {name} | {character or '通用'} |")
    if missing:
        print(f"\n[error] {len(missing)} 个 slug 未命中: {', '.join(missing)}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
