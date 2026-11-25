import type { RoomId } from './types';

/** NPC 能逃出这栋房子的地方 */
export const ESCAPE_ROOMS: RoomId[] = ['garden'];

/** 每回合基础行动点。 */
export const BASE_AP = 4;
/** 砸掉场地设施的行动点成本。 */
export const SABOTAGE_COST = 1;
/** 道具箱初始可领取次数。 */
export const ITEM_BOX_CHARGES = 3;
/** 发电机被破坏后的停机回合数。 */
export const GENERATOR_JAM_TURNS = 2;
export const ITEM_BOX_COUNT = 2;
export const GENERATOR_MIN = 1;
export const GENERATOR_MAX = 2;
