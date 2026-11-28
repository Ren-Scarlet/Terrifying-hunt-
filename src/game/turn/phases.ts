/**
 * 回合结束时的三个阶段：打电话兑现、翻篱笆逃生、目击者报警。
 *
 * 与 npc/ai/turn.ts 的分工：那边是"每个幸存者做什么"，
 * 这里是"这回合结束时世界怎么结算"。只通过 NpcHost 调引擎写服务。
 */
import { SURVIVOR_MAP } from '../survivors';
import type { GameState } from '../types';
import { phoneWorks, workingPhones } from '../world/phones';
import { isLocked, npcPeople as npcs, peopleInRoom } from '../world/roomState';
import type { NpcHost } from '../npc/ai/host';
import { alarmSuppressed, wantsToLeave } from '../npc/ai/predicates';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
/** 打电话的人真的把消息送出去了吗 */
export function callPhase(host: NpcHost, state: GameState): void {
  if (!workingPhones(state).length) return;
  if (alarmSuppressed(state)) return;
  npcs(state)
    .filter((p) => p.hp > 0 && phoneWorks(state, p.room) && /电话|求救/.test(p.activity))
    .forEach((person) => host.finishCall(state, person, '电话'));
}

/**
 * 已经在逃生点的人真的跑掉了吗
 *
 * 只要人站在逃生点、并且确实在慌（警觉够高或已经开始翻篱笆），就当他开始翻篱笆。
 */
export function escapePhase(host: NpcHost, state: GameState): void {
  if (state.escapeRooms.length !== 2) return;
  for (const person of [...npcs(state)]) {
    if (person.hp <= 0) continue;
    if (!state.escapeRooms.includes(person.room)) {
      person.escapeProgress = 0;
      continue;
    }
    if (!wantsToLeave(state, person)) continue;
    // 逃生点本身的房门被封锁时，NPC 不能穿过房门离开。
    if (isLocked(state, person.room)) {
      person.activity = '逃生点房门被封锁，无法离开';
      person.escapeProgress = 0;
      continue;
    }
    // 站到后院就等于决定要走了，后面决策别再把他劝回去
    if (state.exitBlockedTurns > 0) {
      person.activity = '逃生点被封锁，暂时无法离开';
      host.log(state, `${person.name} 抵达逃生点，但出口被封锁了。`);
      continue;
    }
    if (person.escapeProgress < 1) {
      person.escapeProgress = 1;
      person.activity = '正在翻越逃生点';
      host.log(state, `！${person.name} 已抵达逃生点，下回合就会逃出去。`);
      continue;
    }
    state.people = state.people.filter((p) => p.id !== person.id);
    state.escaped += 1;
    host.addAlarm(state, 10);
    host.log(state, `${person.name} 成功逃离。`);
    if (person.marked) {
      host.log(state, `任务目标 ${person.name} 已经逃离，契约立即失败。`);
      state.resultReason = `任务目标 ${person.name} 成功逃离猎场。`;
      host.finish(state, 'failed');
      return;
    }

    // 有人跑掉，剩下的人胆子会变大
    npcs(state).forEach((p) => {
      p.alert = clamp(p.alert + 12, 0, 100);
    });

    // 每逃一个人都在结算里扣 15 分；直到最后一个幸存者也翻出篱笆，契约才作废。
    // 不再用「逃够 N 个就立刻输」的硬阈值——那会让幸存者的个人目标失去博弈空间。
    const remainingHumans = state.people.filter((p) => p.role !== 'police').length;
    if (remainingHumans === 0 && state.escaped > 0) {
      state.resultReason = `最后一名幸存者也成功逃离，房子里再没有活人（逃走 ${state.escaped} 人）。`;
      host.finish(state, state.missionPrimaryCompleted ? 'win' : 'failed');
    }
  }
}
