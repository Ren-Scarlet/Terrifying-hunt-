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
