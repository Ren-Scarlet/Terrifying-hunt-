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
/** 道具箱初始可领取次数。 */
export const ITEM_BOX_CHARGES = 3;
export const ITEM_BOX_COUNT = 2;

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
