import { CARD_MAP } from './cards';
import { SURVIVOR_MAP, survivorPortrait } from './survivors';

export const PERK_RARITY_BG = 'assets/dbd/rarity/perk-very-rare.webp';
export const POWER_RARITY_BG = 'assets/dbd/rarity/addon-common.webp';

export interface AssetPaths {
  cards: Record<string, string>;
  characters: Record<string, string>;
  ui: Record<string, string>;
}

export const ASSET_PATHS: AssetPaths = {
  /** 一卡一图标：文件的 basename 与卡牌 id 相同 */
  cards: Object.keys(CARD_MAP).reduce(
    (acc, id) => {
      acc[id] = `assets/dbd/perks/${id}.png`;
      return acc;
    },
    {} as Record<string, string>,
  ),
  characters: {
    /** 警员借用「大卫·塔普」警探的肖像 */
    'police-0': 'assets/characters/portraits/S12_DavidTapp_Portrait.webp',
    player: 'assets/characters/killers/迈尔斯.webp',
  },
  ui: {
    mission: 'assets/ui/mission.png',
    missionTarget: 'assets/ui/mission-target.png',
    escape: 'assets/ui/escape.png',
    totem: 'assets/ui/totem.png',
    cabinet: 'assets/ui/cabinet.png',
    obstacle: 'assets/ui/obstacle.png',
    darkCell: 'assets/ui/dark-cell.png',
    bloodPoint: 'assets/ui/blood-point.png',
    shard: 'assets/ui/shard.png',
    bonusBrutal: 'assets/ui/bonus-brutal.png',
    bonusHunt: 'assets/ui/bonus-hunt.png',
    bonusCunning: 'assets/ui/bonus-cunning.png',
    crow: 'assets/ui/crow.webp',
    itemBox: 'assets/ui/item-box.webp',
    generator: 'assets/ui/generator.webp',
  },
};

export function cardImage(defId: string): string | undefined {
  return ASSET_PATHS.cards[defId];
}

export function characterImage(id: string): string | undefined {
  if (SURVIVOR_MAP[id]) return survivorPortrait(id);
  return ASSET_PATHS.characters[id];
}

export function uiIcon(name: keyof AssetPaths['ui']): string {
  return ASSET_PATHS.ui[name];
}
