import type { Archetype, Health, NpcGoal, NpcIntent, SiteItemKind, SurvivorItem } from '../types';

/** 幸存者从道具箱翻出来的东西：这些都是「选择」，不是写死的全局规则 */
export const SURVIVOR_ITEM_LABEL: Record<SurvivorItem, string> = {
  medkit: '医疗包',
  toolbox: '工具箱',
  flare: '信号弹',
  key: '后门钥匙',
  weapon: '防身武器',
  smoke: '烟雾弹',
  flashlight: '手电筒',
};

export const SITE_ITEM_LABEL: Record<SiteItemKind, string> = {
  itemBox: '道具箱',
  generator: '发电机',
};

export const INTENT_LABEL: Record<NpcIntent, string> = {
  idle: '做自己的事',
  wary: '起疑',
  flee: '逃跑中',
  barricade: '正在堵门',
  call: '正在打电话',
  hide: '躲起来了',
  escape: '翻篱笆',
  stunned: '动不了',
  heal: '正在治疗',
  rescue: '正在救援',
  work: '在忙团队的事',
};

export const GOAL_LABEL: Record<NpcGoal, string> = {
  phone: '想打电话报警',
  exit: '想从后院逃走',
  hide: '想找个地方躲起来',
  gather: '想把人聚起来',
  weapon: '想找东西反抗',
  panic: '只想活下去',
  help: '想救同伴',
  objective: '在修电闸 / 凑钥匙',
  key: '在找后门钥匙',
  supply: '想去道具箱找点能用的',
  generator: '想去把发电机修好',
};

export const ARCH_LABEL: Record<Archetype, string> = {
  alert: '警觉型',
  defiant: '反抗型',
  caller: '求救型',
  rescuer: '救援型',
  hider: '躲藏型',
  brave: '英勇型',
  kiter: '拉扯型',
};

export const ARCH_DESC: Record<Archetype, string> = {
  alert: '一发现你就跑，边跑边喊，把消息传给隔壁房间。',
  defiant: '会推家具堵门，会去厨房拿刀——你进门时可能被反击掉步数。',
  caller: '摸向书房或大厅的电话；电话断了会去地下室用无线电。',
  rescuer: '优先治疗受伤、拉起倒地的同伴，是处决最大的障碍。',
  hider: '钻进柜子或床底，不搜出来就找不到，也打不到。',
  brave: '先去厨房拿武器，再把人聚起来，会正面挡你的路。',
  kiter: '不跟你硬碰：绕远路、抹脚印、丢烟雾弹，专门把追逐拖长，让你很难贴到他。',
};

export const HEALTH_LABEL: Record<Health, string> = {
  healthy: '健康',
  injured: '受伤',
  downed: '倒地',
};

