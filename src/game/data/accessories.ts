import type { AccessoryDef, AccessoryRarity } from '../types';

/**
 * ============================================================================
 *  力量配件数据库
 * ============================================================================
 *
 *  每位杀手 3 件专属配件，开局最多带 2 件，带入即永久消耗。
 *  名称与图标取自图鉴（dbdwiki / 迷雾笔记）；机制按本作简化，
 *  数值全部走 `mods`，由 src/game/modifiers.ts 统一汇总后交给引擎，
 *  不允许在界面或单张卡里另写一套数值。
 *
 *  图标：scripts/import_dbd_assets.py 的 ADDON_ICONS 按 id 从图集裁切，
 *  路径 public/assets/dbd/addons/<id>.png。
 */

export const ACCESSORY_SLOTS = 2;

/** 稀有度 → 中文名，与图鉴一致。 */
export const ACCESSORY_RARITY_LABEL: Record<AccessoryRarity, string> = {
  common: '普通',
  uncommon: '精良',
  rare: '稀有',
  'very-rare': '非常稀有',
  visceral: '非凡',
};

/** 血点补货价：越稀有越贵，让「消耗血点升级角色」有明确投入。 */
export const ACCESSORY_PRICE: Record<AccessoryRarity, number> = {
  common: 20,
  uncommon: 30,
  rare: 45,
  'very-rare': 65,
  visceral: 90,
};

export function accessoryPrice(rarity: AccessoryRarity): number {
  return ACCESSORY_PRICE[rarity];
}

export const ACCESSORIES: AccessoryDef[] = [
  /* ------------------------------------------------------------------ */
  /* 设陷者 · 捕兽夹                                                     */
  /* ------------------------------------------------------------------ */
  {
    id: 'trapper_bag',
    name: '设陷者腰包',
    owner: '设陷者',
    rarity: 'rare',
    desc: '开局额外携带 1 个捕兽夹。',
    sourceSkill: 'Trapper Bag',
    sourceText: '比赛开始时额外携带1个捕兽夹；捕兽夹携带上限增加1。',
    mods: [{ key: 'trapCount', value: 1 }],
  },
  {
    id: 'rusted_jaws',
    name: '生锈夹齿',
    owner: '设陷者',
    rarity: 'rare',
    desc: '踩中捕兽夹的人额外受到 1 点伤害。',
    sourceSkill: 'Rusted Jaws',
    sourceText: '踩中捕兽夹的逃生者受到重伤状态影响70秒。',
    mods: [{ key: 'trapDamage', value: 1 }],
  },
  {
    id: 'honing_stone',
    name: '打磨石',
    owner: '设陷者',
    rarity: 'very-rare',
    desc: '被捕兽夹咬住的人额外被困 1 回合。',
    sourceSkill: 'Honing Stone',
    sourceText: '自行挣脱捕兽夹的逃生者会直接陷入濒死状态。',
    mods: [{ key: 'trapHold', value: 1 }],
  },

  /* ------------------------------------------------------------------ */
  /* 护士 · 斯宾塞的濒死之息                                              */
  /* ------------------------------------------------------------------ */
  {
    id: 'campbells_last_breath',
    name: '坎贝尔神父的濒死之息',
    owner: '护士',
    rarity: 'very-rare',
    desc: '闪现距离 +1 间房。',
    sourceSkill: "Campbell's Last Breath",
    sourceText: '完整蓄力闪现后可以立刻朝当前方向再次完整蓄力闪现一次。',
    mods: [{ key: 'blinkRange', value: 1 }],
  },
  {
    id: 'dull_bracelet',
    name: '灰暗手镯',
    owner: '护士',
    rarity: 'uncommon',
    desc: '结算血点 +30%，但所有能力冷却 +1 回合。',
    sourceSkill: 'Dull Bracelet',
    sourceText: '闪现最大距离减少20%；精准闪现得分事件增加100%血点。',
    mods: [{ key: 'bloodPointPct', value: 30 }, { key: 'cooldown', value: 1 }],
  },
  {
    id: 'torn_bookmark',
    name: '书签碎片',
    owner: '护士',
    rarity: 'visceral',
    desc: '所有能力冷却 -1 回合。',
    sourceSkill: 'Torn Bookmark',
    sourceText: '闪现可用次数增加1；闪现恢复时间增加30%。',
    mods: [{ key: 'cooldown', value: -1 }],
  },

  /* ------------------------------------------------------------------ */
  /* 女猎手 · 狩猎飞斧                                                    */
  /* ------------------------------------------------------------------ */
  {
    id: 'infantry_belt',
    name: '多功能腰带',
    owner: '女猎手',
    rarity: 'very-rare',
    desc: '开局飞斧 +1，补充上限 +1。',
    sourceSkill: 'Infantry Belt',
    sourceText: '飞斧命中后获得3%急速状态，持续5秒。',
    mods: [{ key: 'hatchetCount', value: 1 }],
  },
  {
    id: 'iridescent_head',
    name: '荧虹斧刃',
    owner: '女猎手',
    rarity: 'visceral',
    desc: '飞斧伤害 +1。',
    sourceSkill: 'Iridescent Head',
    sourceText: '飞斧命中健康逃生者会使其立刻陷入濒死状态；飞斧携带上限变为1。',
    mods: [{ key: 'hatchetDamage', value: 1 }],
  },
  {
    id: 'soldiers_puttee',
    name: '士兵绑腿',
    owner: '女猎手',
    rarity: 'visceral',
    desc: '每回合行动点 +1，但开局少带 1 把飞斧。',
    sourceSkill: "Soldier's Puttee",
    sourceText: '飞斧耗尽时，移动速度变为4.6米/秒。',
    mods: [{ key: 'ap', value: 1 }, { key: 'hatchetCount', value: -1 }],
  },

  /* ------------------------------------------------------------------ */
  /* 迈克尔·迈尔斯 · 恶魔附身                                             */
  /* ------------------------------------------------------------------ */
  {
    id: 'scratched_mirror',
    name: '划痕镜子',
    owner: '迈克尔·迈尔斯',
    rarity: 'visceral',
    desc: '尾随值获取 +30%。',
    sourceSkill: 'Scratched Mirror',
    sourceText: '尾随期间显示附近32米范围内逃生者的气场；无法离开尾随者模式。',
    mods: [{ key: 'stalkGain', value: 30 }],
  },
  {
    id: 'judiths_tombstone',
    name: '茱蒂丝的墓碑',
    owner: '迈克尔·迈尔斯',
    rarity: 'visceral',
    desc: '恶魔附身每次行动少消耗 5 点尾随值。',
    sourceSkill: "Judith's Tombstone",
    sourceText: '恶魔化身模式下钩住逃生者会重置持续时间；持续时间上限为40秒。',
    mods: [{ key: 'possessCost', value: -5 }],
  },
  {
    id: 'judiths_journal',
    name: '茱蒂丝的日志',
    owner: '迈克尔·迈尔斯',
    rarity: 'rare',
    desc: '尾随值获取 +40%，但开局警报 +6。',
    sourceSkill: "Judith's Journal",
    sourceText: '尾随血祭品时，尾随值累积速率增加40%。',
    mods: [{ key: 'stalkGain', value: 40 }, { key: 'startAlarm', value: 6 }],
  },

  /* ------------------------------------------------------------------ */
  /* 贞子 · 恐惧洪流                                                    */
  /* ------------------------------------------------------------------ */
  {
    id: 'sadako_tape',
    name: '诅咒录像带',
    owner: '贞子',
    rarity: 'very-rare',
    desc: '结算血点 +20%。',
    sourceSkill: 'Cursed Videotape',
    sourceText: '录像带的诅咒传播得更快。',
    mods: [{ key: 'bloodPointPct', value: 20 }],
  },
  {
    id: 'sadako_well',
    name: '古井水',
    owner: '贞子',
    rarity: 'rare',
    desc: '能力冷却 -1 回合。',
    sourceSkill: 'Well Water',
    sourceText: '井水让怨念更快重新聚拢。',
    mods: [{ key: 'cooldown', value: -1 }],
  },
  {
    id: 'sadako_tv',
    name: '雪花电视',
    owner: '贞子',
    rarity: 'uncommon',
    desc: '结算血点 +10%，但能力冷却 +1 回合。',
    sourceSkill: 'Static Television',
    sourceText: '雪花屏让猎场更容易记住她的脸。',
    mods: [{ key: 'bloodPointPct', value: 10 }, { key: 'cooldown', value: 1 }],
  },
  {
    id: 'ghost_mirror',
    name: '裂纹镜片',
    owner: '鬼面',
    rarity: 'very-rare',
    desc: '结算血点 +20%。',
    sourceSkill: 'Cracked Mirror',
    sourceText: '夜幕中的观察更加精准。',
    mods: [{ key: 'bloodPointPct', value: 20 }],
  },
  {
    id: 'ghost_knife',
    name: '旧猎刀',
    owner: '鬼面',
    rarity: 'rare',
    desc: '能力冷却 -1 回合。',
    sourceSkill: 'Old Hunting Knife',
    sourceText: '猎刀让夜幕收得更快。',
    mods: [{ key: 'cooldown', value: -1 }],
  },
  {
    id: 'ghost_cloak',
    name: '夜行披风',
    owner: '鬼面',
    rarity: 'uncommon',
    desc: '结算血点 +10%。',
    sourceSkill: 'Night Cloak',
    sourceText: '披风让他在黑暗里更从容。',
    mods: [{ key: 'bloodPointPct', value: 10 }],
  },
];

export const ACCESSORY_MAP: Record<string, AccessoryDef> = Object.fromEntries(
  ACCESSORIES.map((item) => [item.id, item]),
);

/** 某位杀手能带进猎场的全部配件。 */
export function accessoriesForKiller(owner: string): AccessoryDef[] {
  return ACCESSORIES.filter((item) => item.owner === owner);
}

/** 初始库存：每位杀手每件各 1 个，足够配上两个槽位试一次。 */
export function starterAccessoryStock(): Record<string, number> {
  return Object.fromEntries(ACCESSORIES.map((item) => [item.id, 1]));
}
