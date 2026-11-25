/**
 * 布局牌的原始设计记录。已迁移到 cards.ts 与 engine.ts，
 * 现在它们与别的卡牌一样在行动阶段打出，不设独立开局阶段。
 */

export interface SetupCardDef {
  id: string;
  name: string;
  cost: number;
  desc: string;
  flavor: string;
  school: 'grounded' | 'supernatural' | 'neutral';
}

export const SETUP_CARDS: SetupCardDef[] = [
  {
    id: 'cut_line',
    name: '剪断电话线',
    cost: 1,
    desc: '本局所有报警造成的通缉值增长 -1。',
    flavor: '沉默从一根线开始。',
    school: 'grounded',
  },
  {
    id: 'wiretap',
    name: '安装窃听',
    cost: 1,
    desc: '每回合开始时，日志会显示警察下一步的目的地。',
    flavor: '他们说话的时候，你已经在听了。',
    school: 'grounded',
  },
  {
    id: 'lure',
    name: '引开注意',
    cost: 1,
    desc: '标记目标开局被吸引到一个远离出口的房间。',
    flavor: '一声脆响，就够了。',
    school: 'grounded',
  },
  {
    id: 'poltergeist',
    name: '灵异事件',
    cost: 1,
    desc: '本局目击造成的通缉值再 -1（可与剪断电话线叠加）。',
    flavor: '家具自己移动时，没人顾得上门口。',
    school: 'supernatural',
  },
  {
    id: 'blackout',
    name: '拉闸断电',
    cost: 2,
    desc: '第一回合所有目击完全无效。',
    flavor: '黑暗是最好的共犯。',
    school: 'grounded',
  },
  {
    id: 'block_gate',
    name: '封住后院',
    cost: 2,
    desc: '警察第一回合不会移动。',
    flavor: '他们被一扇不该锁的门挡住了。',
    school: 'grounded',
  },
  {
    id: 'ghost_light',
    name: '鬼火引路',
    cost: 1,
    desc: '行动阶段第一回合额外获得 1 点步数。',
    flavor: '跟着光走的人，不会回头看。',
    school: 'supernatural',
  },
  {
    id: 'false_report',
    name: '虚假报案',
    cost: 2,
    desc: '本局警察的逮捕阈值提高 1。',
    flavor: '给他们一份错误的档案，他们会照着查。',
    school: 'grounded',
  },
];

export const SETUP_MAP: Record<string, SetupCardDef> = SETUP_CARDS.reduce(
  (acc, card) => {
    acc[card.id] = card;
    return acc;
  },
  {} as Record<string, SetupCardDef>,
);
