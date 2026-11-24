/**
 * 杀手名称、力量名称与图标来自图鉴站，仅作视觉与命名原型。
 * 下方 mechanic（游戏内效果）为本作原创，且全部在 engine.ts 中实际结算。
 * 新增杀手：在 KILLERS 追加一项，并在 engine.ts 的对应钩子补上 mechanic.id 分支即可。
 */

export type KillerSchool = 'supernatural' | 'grounded';

export interface KillerMechanic {
  id:
    | 'stalker'
    | 'trapper'
    | 'wraith'
    | 'nurse'
    | 'huntress'
    | 'nightfall'
    | 'curse'
    | 'dream'
    | 'butcher'
    | 'torture'
    | 'rift'
    | 'shock';
  name: string;
  short: string;
  detail: string[];
}

export interface KillerProfile {
  owner: string;
  title: string;
  icon: string;
  /** 灵异系或现实系，决定技能组的表现方式 */
  school: KillerSchool;
  portrait?: string;
  sourceNote: string;
  mechanic: KillerMechanic;
}

export const KILLERS: KillerProfile[] = [
  {
    owner: '设陷者',
    title: '捕兽夹',
    icon: 'assets/dbd/powers/设陷者.png',
    school: 'grounded',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'trapper',
      name: '封门设陷',
      short: '每回合首次移动时，你刚离开的房间会被封锁 1 回合，警察无法进入。',
      detail: [
        '你把捕兽夹卡在门框内侧，然后不紧不慢地走向下一个房间。',
        '警察可以追上你的脚步，但推不开那扇被机关顶住的门。',
      ],
    },
  },
  {
    owner: '幽灵',
    title: '骷髅丧钟',
    icon: 'assets/dbd/powers/幽灵.png',
    school: 'supernatural',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'wraith',
      name: '穿墙逐影',
      short: '每回合首次移动无视相邻限制；这次移动不会惊动目击者。',
      detail: [
        '钟声响起的一瞬，你从墙的另一侧走出来。',
        '没有人看清你从哪里来，也就没有人对着空气尖叫。',
      ],
    },
  },
  {
    owner: '护士',
    title: '斯宾塞的濒死之息',
    icon: 'assets/dbd/powers/护士.png',
    school: 'supernatural',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'nurse',
      name: '瞬步闪现',
      short: '每回合额外获得 1 点移动步数（基础 2 步变为 3 步）。',
      detail: [
        '你不必沿着走廊走。地板在脚下缩短，下一秒你已经站在门口。',
        '更快的脚步意味着更多时间挑选房间，也意味着更多机会撞上不该看的人。',
      ],
    },
  },
  {
    owner: '女猎手',
    title: '狩猎飞斧',
    icon: 'assets/dbd/powers/女猎手.png',
    school: 'grounded',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'huntress',
      name: '蓄力飞斧',
      short: '每回合首次攻击额外造成 1 点伤害。',
      detail: [
        '你花半秒瞄准，然后让斧头替你走完剩下的距离。',
        '第一击总是最准的；之后你得重新找准角度。',
      ],
    },
  },
  {
    owner: '鬼面',
    title: '夜幕',
    icon: 'assets/dbd/powers/鬼面.png',
    school: 'grounded',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'nightfall',
      name: '夜幕潜行',
      short: '每回合首次目击不会增加通缉值；警察逮捕阈值从 4 提高到 6。',
      detail: [
        '他们看见的只是一个模糊的轮廓，转身就说服自己那只是衣架。',
        '即便警察和你站在同一个房间，他也需要更确凿的理由才会拔枪。',
      ],
    },
  },
  {
    owner: '迈克尔·迈尔斯',
    title: '恶魔附身',
    icon: 'assets/dbd/powers/迈克尔·迈尔斯.png',
    school: 'grounded',
    portrait: 'assets/characters/michael-myers.webp',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'stalker',
      name: '无声尾随',
      short: '本回合首次击杀不增加通缉值；若整回合没有击杀，回合结束时通缉值 -1。',
      detail: [
        '你跟着他走过三个房间，他始终没有回头。',
        '耐心是有回报的：第一刀落下时，没人听见，也没人知道该往哪里跑。',
      ],
    },
  },
  {
    owner: '贞子',
    title: '怨灵',
    icon: 'assets/dbd/powers/贞子.png',
    school: 'supernatural',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'curse',
      name: '诅咒蔓延',
      short: '每次击杀后，相邻房间中的所有目标额外失去 1 点生命；诅咒无视组队护佑。',
      detail: [
        '屏幕雪花一闪，她就已经站在房间中央。',
        '恐惧会顺着电话线爬向隔壁，那里的人还没听见尖叫就已经开始流血。',
      ],
    },
  },
  {
    owner: '梦魇',
    title: '梦魇之爪',
    icon: 'assets/dbd/powers/梦魇.png',
    school: 'supernatural',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'dream',
      name: '梦中追猎',
      short: '每回合首次移动后额外获得 1 点步数，该步数只在本回合有效。',
      detail: [
        '走廊在你眼里变成了一条不断折叠的路。',
        '你踏进一步，醒来时已经在第三步的位置。',
      ],
    },
  },
  {
    owner: '食人魔',
    title: "电锯",
    icon: 'assets/dbd/powers/食人魔.png',
    school: 'grounded',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'butcher',
      name: '狂暴冲撞',
      short: '每回合首次攻击伤害 +2，但该次攻击会让通缉值 +1。',
      detail: [
        '他不喊话，也不警告。引擎声就是唯一的预告。',
        '动静太大了——每一刀都会有人在事后拼出你的轮廓。',
      ],
    },
  },
  {
    owner: '处刑者',
    title: '送葬者',
    icon: 'assets/dbd/powers/处刑者.png',
    school: 'supernatural',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'torture',
      name: '锁链拷问',
      short: '攻击后仍存活的目标会被钉在原地，下一回合无法随领路人逃离。',
      detail: [
        '锁链穿过墙壁，另一端握在你手里。',
        '他们可以尖叫，可以挣扎，但走不了。',
      ],
    },
  },
  {
    owner: '魔王',
    title: '撕裂边界',
    icon: 'assets/dbd/powers/魔王.png',
    school: 'supernatural',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'rift',
      name: '裂界突袭',
      short: '每回合首次移动无视相邻限制且不会触发目击。',
      detail: [
        '墙面上裂开一道只属于你的门。',
        '穿过它的人不会留下脚步声，也不会被任何人记住。',
      ],
    },
  },
  {
    owner: '医生',
    title: '电击治疗',
    icon: 'assets/dbd/powers/医生.png',
    school: 'grounded',
    sourceNote: '图标与力量名称取自图鉴站；以下机制为本作原创。',
    mechanic: {
      id: 'shock',
      name: '强制治疗',
      short: '每回合首次目击不会报警，但电流留下的痕迹会让通缉值 +1。',
      detail: [
        '他们会突然安静下来，服从得不像自己。',
        '一切看起来都像医疗事故——只是没有医生会承认来过。',
      ],
    },
  },
];

export const KILLER_MAP: Record<string, KillerProfile> = KILLERS.reduce(
  (acc, killer) => {
    acc[killer.owner] = killer;
    return acc;
  },
  {} as Record<string, KillerProfile>,
);
