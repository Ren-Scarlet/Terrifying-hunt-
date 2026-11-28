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
    .filter((p) => p.intent === 'call' && p.hp > 0 && phoneWorks(state, p.room))
    .forEach((person) => host.finishCall(state, person, '电话'));
}

/**
 * 已经在逃生点的人真的跑掉了吗
 *
 * 注意这里不能只看 intent === 'escape'：fleeAway() 会把 intent 写成 'flee'，
 * 一个被追到后院的人如果只算「逃跑中」，后院反而成了绝对安全区——玩家把人
 * 逼到院子里却什么都不会发生。所以只要人站在逃生点、并且确实在慌（逃跑中
 * 或者警觉够高），就当他开始翻篱笆。
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
    // 站到后院就等于决定要走了，后面 actByArchetype 别再把他劝回去
    person.intent = 'escape';
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

export function witnessPhase(host: NpcHost, state: GameState): void {
  if (alarmSuppressed(state)) {
    host.log(state, '目击者保持沉默。');
    return;
  }
  const witnesses = peopleInRoom(state, state.playerRoom).filter(
    (p) => p.role !== 'police' && p.hp > 0 && !p.hidden,
  );
  if (!witnesses.length) return;

  // 完全没察觉的人（还没注意到你、也没在盯着门口）不会记住你的脸。
  // 想安静地做事，就得先让屋里的人背对你。
  const aware = witnesses.filter((p) => p.alert >= 25 || p.intent !== 'idle');
  if (!aware.length) {
    host.log(state, '屋里的人背对着你，什么也没看见。');
    return;
  }

  const alarmWitness = aware.find((p) => SURVIVOR_MAP[p.id]?.threat === 'alarm');
  const spiritualSees = aware.some((p) => SURVIVOR_MAP[p.id]?.threat === 'spiritual');
  if (spiritualSees) host.log(state, '灵异感知者看穿了你的伪装，任何隐匿都失效。');

  const witness = alarmWitness ?? aware[0];
  const base = alarmWitness ? 3 : 2;
  // 递增递减：已经被报过一次警，再说一遍没那么值钱了
  const dulled = Math.max(1, base - Math.floor(state.wanted / 3));
  const gain = host.witnessWanted(state, dulled);
  host.addWanted(state, gain);
  host.addAlarm(state, 4);
  state.lastCrimeRoom = state.playerRoom;
  host.log(state, `${witness.name} 目击了你，暴露度 +${gain}${alarmWitness ? '（报警者）' : ''}。`);
  if (alarmWitness) host.log(state, `${witness.name} 直接报出了这间房，警察正在赶来。`);
}
