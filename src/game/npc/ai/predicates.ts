/**
 * 幸存者 AI 的只读判定。
 *
 * 这些函数只回答「他会不会 / 能不能」，不产生行动、不改状态、不记日志。
 * 引擎和新的 AI 共用同一份判定，避免「界面说的」和「AI 做的」两套标准。
 */
import { roomDistance } from '../../navigation';
import { perceptionRadius } from '../../world/perception';
import { OBSTACLE_ROOMS } from '../../rooms';
import { hasEffect } from '../../accessoryEffects';
import type { GameState, Person, RoomId } from '../../types';

/** 站在后院的人至少要有这么高的警觉，才会想到翻篱笆（否则只是路过） */
export const ESCAPE_ALERT_MIN = 35;

/**
 * 恐惧档位：恐惧不再只是数字，而是决定 NPC 这一回合会不会「失去理智」。
 *   0–29  冷静：维持日常，会报警、找武器、救助同伴
 *   30–59 不安：开始结伴、避开黑暗，遇袭先逃
 *   60–84 恐惧：只想离你远一点，不再尝试报警/找武器
 *   85+   崩溃：原地发抖或尖叫乱跑，彻底失去目的
 */
const FEAR_UNEASY = 30;
const FEAR_AFRAID = 60;
const FEAR_BROKEN = 85;

export type FearBand = 'calm' | 'uneasy' | 'afraid' | 'broken';

export function fearBand(person: Person): FearBand {
  if (person.fear >= FEAR_BROKEN) return 'broken';
  if (person.fear >= FEAR_AFRAID) return 'afraid';
  if (person.fear >= FEAR_UNEASY) return 'uneasy';
  return 'calm';
}

/** 恐惧是否已经达到某一档：让调用方不必知道具体阈值 */
export function fearAtLeast(person: Person, band: FearBand): boolean {
  if (band === 'broken') return person.fear >= FEAR_BROKEN;
  if (band === 'afraid') return person.fear >= FEAR_AFRAID;
  if (band === 'uneasy') return person.fear >= FEAR_UNEASY;
  return true;
}

/** 报警被压制：本回合静默，或还没到解除回合 */
export function alarmSuppressed(state: GameState): boolean {
  return state.noAlarmTurn || state.turn < state.alarmSilencedUntilTurn;
}

/** 玩家处于「不会被看见」的状态：报警被压制或静止隐身 */
export function playerIsHidden(state: GameState): boolean {
  return state.sadakoHidden
    || (state.possessed && hasEffect(state, 'possessEnter', 'undetectable'))
    || alarmSuppressed(state)
    || state.stealthActions > 0;
}

/** 玩家当前的被察觉半径（0 潜行 / 1 同屋 / 2 隔一格） */
export function effectiveFearRadius(state: GameState): number {
  if (state.sadakoHidden || (state.possessed && hasEffect(state, 'possessEnter', 'undetectable'))) return 0;
  return perceptionRadius(state);
}

/** 本回合是否处于「伏击」状态：推门进去也不会惊动任何人 */
export function ambushActive(state: GameState): boolean {
  return state.ambushTurn === state.turn;
}

/**
 * 潜行移动：移动时不额外制造声响（但仍会留下脚印）。
 * 用确定性哈希而不是随机，保证同一次行动重放结果一致。
 */
export function isQuietMove(state: GameState, person: Person): boolean {
  if (!person.sneaky) return false;
  const seed =
    (state.trailClock * 31 + person.id.length * 17 + state.turn * 7 + person.room.length * 13) % 100;
  return seed < 45;
}

/** 站在逃生点、且已经决定了要走的人，才会真的翻篱笆 */
export function wantsToLeave(state: GameState, person: Person): boolean {
  if (!state.escapeRooms.length || !state.escapeRooms.includes(person.room)) return false;
  return person.alert >= ESCAPE_ALERT_MIN || person.escapeProgress > 0;
}

/** 只有原始就有木板的房间才能再放一块；同一个房间不能重复封 */
export function canPlaceBarricade(state: GameState, person: Person): boolean {
  return !state.possessed && OBSTACLE_ROOMS.includes(person.room) &&
    !state.clearedObstacles.includes(person.room) &&
    !state.barricades.includes(person.room);
}

/**
 * 电话线路承担跨区域求救协调。
 * 线路正常时，幸存者能远程得知倒地同伴的位置；剪断后只能响应 3 格内的呼救。
 */
export function canCoordinateRescue(state: GameState, fromRoom: RoomId, downedRoom: RoomId): boolean {
  if (!state.phoneCut) return true;
  const range = 3;
  return roomDistance(fromRoom, downedRoom) <= range;
}
