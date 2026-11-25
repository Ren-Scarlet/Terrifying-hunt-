import type { Op } from './effect';

export type EffectFieldType = 'num' | 'who' | 'dest' | 'flag' | 'sabotage' | 'text';
export interface EffectOpMeta {
  label: string;
  fields: ReadonlyArray<readonly [string, EffectFieldType]>;
}

export const WHO_OPTIONS = [
  ['victim', '当前目标'], ['lowestHpHere', '房间内血最少'], ['highestAlert', '全场最警觉'],
  ['targetsHere', '房间内所有目标'], ['civilsHere', '房间内所有平民'], ['allHere', '房间内所有人'],
  ['markedAny', '全场标记目标'], ['allAny', '全场所有人'], ['fleeing', '正在逃跑的人'],
  ['downedHere', '当前房间倒地的人'], ['downedAny', '全场倒地的人'], ['injuredAny', '全场受伤的人'],
  ['bloodSacrifice', '本局血祭品'], ['randomAny', '全场随机一人'], ['unawareNearby', '相邻房间未察觉者'],
] as const;

export const DEST_OPTIONS = [
  ['here', '当前房间'], ['adjacent', '相邻房间'], ['far', '最远房间'], ['exit', '车库'],
  ['garden', '后院'], ['attic', '阁楼'], ['nursery', '儿童房'], ['bedroom', '卧室'],
  ['study', '书房'], ['storage', '储藏室'], ['hall', '大厅'], ['corridor', '走廊'],
  ['kitchen', '厨房'], ['basement', '地下室'], ['laundry', '洗衣房'], ['garage', '车库'],
  ['dining', '餐厅'], ['bathroom', '浴室'], ['conservatory', '温室'],
] as const;

export const FLAG_OPTIONS = [
  ['phoneCut', '剪断电话'], ['wiretap', '窃听'], ['poltergeist', '灵异'],
  ['policeBlocked', '警察停步'], ['noAlarm', '目击无效'], ['exitBlocked', '封锁逃生点'],
  ['clearBarricade', '拆除堵门'], ['freeMove', '无视相邻'], ['possessReady', '附身就绪'],
] as const;

export const SABOTAGE_OPTIONS = [
  ['phone', '电话线'], ['radio', '无线电'], ['exit', '后院门'], ['lights', '电闸'],
] as const;

/** DSL 指令的编辑器描述集中维护，避免新增指令时 UI 字段配置散落。 */
export const EFFECT_OPS: Record<Op['op'], EffectOpMeta> = {
  damage: { label: '伤害', fields: [['who', 'who'], ['amount', 'num'], ['maxHp', 'num']] },
  down: { label: '击倒', fields: [['who', 'who']] },
  execute: { label: '处决', fields: [['who', 'who']] },
  kill: { label: '即死', fields: [['who', 'who']] },
  wanted: { label: '暴露度', fields: [['amount', 'num']] },
  wantedHalf: { label: '暴露度减半', fields: [] },
  alert: { label: '警觉', fields: [['who', 'who'], ['amount', 'num']] },
  block: { label: '定身', fields: [['who', 'who'], ['turns', 'num']] },
  pin: { label: '钉住', fields: [['who', 'who']] },
  move: { label: '强制移动', fields: [['who', 'who'], ['to', 'dest']] },
  teleportPlayer: { label: '自己移动', fields: [['to', 'dest']] },
  lockRoom: { label: '锁房间', fields: [['room', 'dest'], ['turns', 'num']] },
  scout: { label: '侦查', fields: [['to', 'dest'], ['turns', 'num']] },
  pulse: { label: '感知（全场人影）', fields: [] },
  search: { label: '搜索', fields: [] },
  track: { label: '追踪', fields: [['who', 'who'], ['turns', 'num']] },
  lure: { label: '制造噪声', fields: [['to', 'dest'], ['count', 'num']] },
  alarm: { label: '暴露度', fields: [['amount', 'num']] },
  sabotage: { label: '破坏设施', fields: [['key', 'sabotage']] },
  draw: { label: '抽牌', fields: [['amount', 'num']] },
  energy: { label: '行动点', fields: [['amount', 'num']] },
  steps: { label: '行动点（原步数）', fields: [['amount', 'num']] },
  stun: { label: '玩家眩晕', fields: [['amount', 'num']] },
  evidence: { label: '证据', fields: [['amount', 'num']] },
  discount: { label: '费用减免', fields: [['amount', 'num']] },
  bonusDamage: { label: '攻击加成', fields: [['amount', 'num']] },
  arrestThreshold: { label: '逮捕阈值', fields: [['amount', 'num']] },
  reveal: { label: '暴露', fields: [] },
  heal: { label: '治疗', fields: [['who', 'who'], ['amount', 'num']] },
  rescue: { label: '救援', fields: [['who', 'who']] },
  bleed: { label: '流血', fields: [['who', 'who'], ['amount', 'num']] },
  stalk: { label: '尾随', fields: [['amount', 'num']] },
  silenceAlarm: { label: '封锁报警', fields: [['turns', 'num']] },
  ambush: { label: '伏击（进门不惊动）', fields: [] },
  pursue: { label: '追击（贴到身后）', fields: [['who', 'who'], ['distance', 'num']] },
  flag: { label: '开关', fields: [['key', 'flag'], ['value', 'num']] },
  log: { label: '日志', fields: [['text', 'text']] },
  if: { label: '条件分支', fields: [] },
};
