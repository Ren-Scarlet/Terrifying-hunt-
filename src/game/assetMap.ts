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
  cards: Object.keys(CARD_MAP).reduce(
    (acc, id) => {
      acc[id] = `assets/dbd/perks/${id}.png`;
      return acc;
    },
    {} as Record<string, string>,
  ),
  characters: {
    'target-0': 'assets/characters/target-0.png',
    'target-1': 'assets/characters/target-1.png',
    'target-2': 'assets/characters/target-2.png',
    'target-3': 'assets/characters/target-3.png',
    'civilian-0': 'assets/characters/civilian-0.png',
    'civilian-1': 'assets/characters/civilian-1.png',
    'civilian-2': 'assets/characters/civilian-2.png',
    'civilian-3': 'assets/characters/civilian-3.png',
    'police-0': 'assets/characters/police-0.png',
    player: 'assets/characters/player.png',
  },
  ui: {
    energy: 'assets/ui/energy.png',
    wanted: 'assets/ui/wanted.png',
    police: 'assets/ui/police.png',
    evidence: 'assets/ui/evidence.png',
    cardBack: 'assets/ui/card-back.png',
  },
};

export function cardImage(defId: string): string | undefined {
  return ASSET_PATHS.cards[defId];
}

export function characterImage(id: string): string | undefined {
  if (SURVIVOR_MAP[id]) return survivorPortrait(id);
  return ASSET_PATHS.characters[id];
}
