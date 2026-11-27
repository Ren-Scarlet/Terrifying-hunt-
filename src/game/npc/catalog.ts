import type { Archetype, Health, NpcGoal, NpcIntent, RoomId, SiteItemKind, SurvivorItem } from '../types';

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
  routine: '按自己的习惯活动',
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

export interface NpcRoutineProfile {
  label: string;
  hint: string;
  activity: string;
  rooms: RoomId[];
}

/** 每种行为类型都有一条稳定但可被打断的日常路线。 */
export const ROUTINE_PROFILE: Record<Archetype, NpcRoutineProfile> = {
  alert: {
    label: '例行巡查',
    hint: '习惯沿着大厅、书房与地下室检查门窗和通讯设备。',
    activity: '检查门窗与通讯设备',
    rooms: ['hall', 'study', 'basement'],
  },
  defiant: {
    label: '防身巡查',
    hint: '习惯在厨房、车库与前厅附近寻找能防身的工具。',
    activity: '检查可用的防身工具',
    rooms: ['kitchen', 'garage', 'foyer'],
  },
  caller: {
    label: '通讯检查',
    hint: '经常查看书房和大厅电话；通讯异常时会寻找地下室无线电。',
    activity: '检查电话与通讯设备',
    rooms: ['study', 'hall', 'basement'],
  },
  rescuer: {
    label: '照看同伴',
    hint: '常在餐厅、厨房和大厅附近留意同伴的状态。',
    activity: '留意同伴的动静',
    rooms: ['dining', 'kitchen', 'hall'],
  },
  hider: {
    label: '寻找藏身处',
    hint: '偏爱卧室、储物间和阁楼等安静、便于藏身的地方。',
    activity: '寻找安静的藏身位置',
    rooms: ['bedroom', 'storage', 'attic'],
  },
  brave: {
    label: '武器巡查',
    hint: '常去厨房、车库和大厅，留意武器与可防守的位置。',
    activity: '检查武器与防守位置',
    rooms: ['kitchen', 'garage', 'hall'],
  },
  kiter: {
    label: '绕行巡查',
    hint: '喜欢经过花园、阳台和前厅，避开拥挤路线。',
    activity: '绕开人群观察周围',
    rooms: ['garden', 'balcony', 'foyer'],
  },
};

export const ARCH_DESC: Record<Archetype, string> = {
  alert: '警觉逐渐升高；先观察和确认危险，达到高度警戒后才会逃跑并呼救。',
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

