import type { RoomId } from './types';

/** NPC 能逃出这栋房子的地方 */
export const ESCAPE_ROOMS: RoomId[] = ['garden'];

/** 幸存者生命：4 点健康，降至 2 点时受伤，降至 0 点时击倒。 */
export const SURVIVOR_MAX_HP = 4;
export const SURVIVOR_INJURED_HP = 2;

/** 每回合基础行动点。 */
export const BASE_AP = 4;
/** 砸掉场地设施的行动点成本。 */
export const SABOTAGE_COST = 1;

/** 恶魔附身的持续回合数。 */
export const POSSESS_TURNS = 3;

/**
 * 一个人一回合最多能跑几间屋（含被砍后夺路而逃的那两步）。
 * 玩家一回合 4 点行动点，这个数字必须比它能走的格数小，否则永远追不上；
 * 但它也不能太小，否则「警觉就跑得很远」只是一句台词。
 */
export const REACT_MOVE_CAP = 3;

/** 倒地后撑不过这么多回合就会自动流血而死 */
export const BLEEDOUT_TURNS = 4;

/** 暴露度上限：到 100 直接判负（实体杀手被捕，灵异鬼怪被驱散） */
export const ALARM_MAX = 100;

/** 手牌上限；超过时必须由玩家选择弃牌。 */
export const HAND_LIMIT = 6;

/** 杀戮值激活阈值：满值后每回合多 2 行动点，由玩家自己决定怎么走 */
export const FRENZY_THRESHOLD = 50;
/** 满值给的额外行动点：不替玩家走第二步，只把「能多走」交到他手里 */
export const FRENZY_AP_BONUS = 2;

/** 鬼面「夜幕」每回合累积的监视值 */
export const WATCH_GAIN = 34;

/** 搜索 / 查看各自消耗的行动点 */
export const SEARCH_COST = 1;
export const LOOK_COST = 1;

/** 挥刀消耗的行动点：唯一的伤害来源，不能免费 */
export const ATTACK_COST = 1;

/** 特殊处决不再依赖评分门槛。 */

/** 被砍伤后当场夺路而逃的步数：一刀下去，他会连着跑两间屋 */
export const PANIC_HOPS_ON_HIT = 2;
