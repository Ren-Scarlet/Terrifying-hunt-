"""Import killer perk icons and killer power assets from dbdwiki.com.

Run from the project root:
    python scripts/import_dbd_assets.py
"""

import json
import urllib.request
from pathlib import Path

from PIL import Image

BASE = "https://dbdwiki.com"
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "assets" / "dbd"
TEMP = ROOT / ".dbd-cache"

PERK_MAP = {
    "shuriken": "brutal_strength",
    "choke": "iron_grasp",
    "silent_step": "insidious",
    "false_lead": "furtive_chase",
    "sprint": "lethal_pursuer",
    "lock_door": "bamboozle",
    "execute": "coup_de_grâce",
    "intimidate": "distressing",
    "disguise": "dark_devotion",
    "bait": "barbecue_and_chilli",
    "clean": "darkness_revealed",
    "night_cover": "a_nurses_calling",
    "harvest": "blood_echo",
    "break_in": "brutal_strength",
    "silence": "hex_huntress_lullaby",
    "fear": "coulrophobia",
    "aim": "deerstalker",
    "evacuate": "blood_warden",
    "mind_control": "forced_penance",
    "final_blow": "coup_de_grâce",
    "search": "hoarder",
}

POWER_OWNERS = [
    "设陷者", "幽灵", "护士", "女猎手", "鬼面", "迈克尔·迈尔斯",
    "贞子", "梦魇", "食人魔", "处刑者", "魔王", "医生",
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

    by_slug = {v.get("slug"): k for k, v in perk_manifest["icons"].items() if v.get("side") == "killer"}
    for card_id, slug in PERK_MAP.items():
        key = by_slug.get(slug)
        if not key:
            print(f"[warn] missing perk slug: {slug}")
            continue
        pos = perk_manifest["icons"][key]["position_2x"]
        crop_sprite(perk_sheet, pos).save(PUBLIC / "perks" / f"{card_id}.png")

    # 只导入图标。src/game/killers.ts 为手写的原创机制数据，脚本不再覆盖它。
    for owner in POWER_OWNERS:
        module = next((m for m in addons["modules"] if m.get("owner") == owner and m.get("power")), None)
        if not module:
            print(f"[warn] missing killer module: {owner}")
            continue
        icon_key = module["power"].get("iconKey")
        entry = loadout_manifest["icons"].get(icon_key)
        if entry:
            pos = entry["position_2x"]
            crop_sprite(loadout_sheet, pos).save(PUBLIC / "powers" / f"{owner}.png")
        else:
            print(f"[warn] missing power icon for: {owner}")

    for rarity in RARITIES:
        fetch_file(f"{BASE}/assets/rarities/addon-{rarity}.webp", PUBLIC / "rarity" / f"addon-{rarity}.webp")
    fetch_file(f"{BASE}/assets/rarities/perk-very-rare.webp", PUBLIC / "rarity" / "perk-very-rare.webp")

    print(f"Imported {len(PERK_MAP)} perk icons, {len(POWER_OWNERS)} powers, {len(RARITIES) + 1} rarity backgrounds.")


if __name__ == "__main__":
    main()
