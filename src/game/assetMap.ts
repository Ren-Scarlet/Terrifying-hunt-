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
  /** UI 图标统一 webp：与「部分素材」文件夹逐像素一致，只换容器格式 */
  ui: {
    mission: 'assets/ui/mission.webp',
    missionTarget: 'assets/ui/mission-target.webp',
    escape: 'assets/ui/escape.webp',
    totem: 'assets/ui/totem.webp',
    cabinet: 'assets/ui/cabinet.webp',
    obstacle: 'assets/ui/obstacle.webp',
    darkCell: 'assets/ui/dark-cell.webp',
    bloodPoint: 'assets/ui/blood-point.webp',
    shard: 'assets/ui/shard.webp',
    bonusBrutal: 'assets/ui/bonus-brutal.webp',
    bonusHunt: 'assets/ui/bonus-hunt.webp',
    bonusCunning: 'assets/ui/bonus-cunning.webp',
    crow: 'assets/ui/crow.webp',
    itemBox: 'assets/ui/item-box.webp',
    generator: 'assets/ui/generator.webp',
    toolbox: 'assets/ui/toolbox.webp',
    medkit: 'assets/ui/medkit.webp',
    flashlight: 'assets/ui/flashlight.webp',
    bearTrap: 'assets/ui/bear-trap.webp',
    obsession: 'assets/ui/IconHelp_obsession.webp',
    window: 'assets/ui/window.webp',
    trail: 'assets/ui/trail.webp',
    executionSite: 'assets/ui/特殊处决地点.webp',
    madness: 'assets/ui/神经紊乱2.webp',
    statusInjured: 'assets/ui/重伤.webp', statusBlind: 'assets/ui/障目.webp',
    statusUndetectable: 'assets/ui/无法侦测.webp', statusBlocked: 'assets/ui/无法行动.webp',
    statusDanger: 'assets/ui/危险.webp', statusDeepWound: 'assets/ui/深度伤口.webp',
    statusBleed: 'assets/ui/流血.webp', statusOblivious: 'assets/ui/浑然不觉.webp',
    statusIncurable: 'assets/ui/不治.webp', statusCursed: 'assets/ui/被诅咒.webp',
    statusKill: 'assets/ui/杀戮.webp',
  },
};

/**
 * 卡牌图标与卡名一一对应：每张卡的图标就是「卡名所指的那枚杀手技能」，
 * 文件直接以卡牌 id 命名，不再借用其他卡牌的图案。
 *
 * 对照（卡名 → 图鉴技能，来源 dbdwiki.com 迷雾笔记）：
 *   shuriken 辣手屠夫 → Sloppy Butcher          choke 牢牢紧握 → Iron Grasp
 *   execute 恩赐解脱 → Coup de Grâce            harvest 鲜血回响 → Blood Echo
 *   final_blow 优胜劣汰 → Cull the Weak         break_in 所向无敌 → Brutal Strength
 *   silent_step 静止隐身 → Insidious            sprint 疾速残暴 → Rapid Brutality
 *   clean 折磨路径 → Trail of Torment           night_cover 黑暗启迪 → Darkness Revealed
 *   silence 厄咒：猎手摇篮曲 → Hex: Huntress Lullaby
 *   disguise 黑暗奉献 → Dark Devotion           intimidate 恐惧释放 → Distressing
 *   fear 小丑恐惧症 → Coulrophobia              aim 猎鹿者 → Deerstalker
 *   search 囤积者 → Hoarder                     evacuate 血腥狱长 → Blood Warden
 *   false_lead 鬼祟追杀 → Furtive Chase         bait 鬼鸦谍影 → Spies from the Shadows
 *   mind_control 支配之力 → Dominance           lock_door 死锁 → Deadlock
 *   cut_line 失效开关 → Dead Man's Switch       lure 人肉烧烤 → Barbecue & Chilli
 *   wiretap 护士的呼唤 → A Nurse's Calling      poltergeist 厄咒：闹鬼之地 → Hex: Haunted Ground
 *   blackout 厄咒：直面黑暗 → Hex: Face the Darkness
 *   block_gate 花言巧语 → Bamboozle             ghost_light 致命追踪者 → Lethal Pursuer
 *   false_report 厄咒：惩戒 → Hex: Retribution
 *   unbreakable 不屈不挠 → Unrelenting          hex_huntress 厄咒：猎杀戾气 → Hex: Thrill of the Hunt
 *   hex_noed 厄咒：难逃一死 → Hex: No One Escapes Death
 *   scourge_shrine 天灾钩子：鬼魔神龛 → Scourge Hook: Monstrous Shrine
 *   distressing 恐惧释放 → Distressing          iron_grasp 牢牢紧握 → Iron Grasp
 *   deerstalker 猎鹿者 → Deerstalker            hex_ruin 粉碎希望 → Shattered Hope
 *   bitter_murmur 苦涩低语 → Bitter Murmur      sloppy_butcher 辣手屠夫 → Sloppy Butcher
 *   insidious 静止隐身 → Insidious              myers_eclipse_light 优胜劣汰 → Cull the Weak
 *   myers_last_best 把最好的留在最后 → Save the Best for Last
 *   myers_plaything 戏耍食物 → Play with Your Food
 *   trapper_panic 恐慌降临 → Unnerving Presence  trapper_brutal_strength 所向无敌 → Brutal Strength
 *   trapper_euphoria 欣喜若狂 → Agitation
 *   hell 恶灵地狱 → Whispers（恶灵低语：图鉴中没有同名技能，取名称与效果
 *     ——感知附近逃生者——最接近的官方技能图标替代）
 */
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
