/**
 * 幸存者的生死线：受伤、倒地、死亡、搬运、救援、治疗。
 *
 * 这是"谁还活着"的唯一入口——所有伤害与死亡都必须走这里，
 * 否则击杀数、目击、暴露度、连杀统计会各算各的。
 */
import { PANIC_HOPS_ON_HIT, SURVIVOR_INJURED_HP, SURVIVOR_MAX_HP } from '../constants';
import { getExecutionMethod, createExecutionScene, type ExecutionMethodId } from '../execution';
import { modifierValue } from '../modifiers';
import { roomDistance } from '../navigation';
import { ROOM_MAP } from '../rooms';
import { BLOOD, awardBlood, markBloodEvent } from '../bloodpoints';
import type { GameState, Person } from '../types';
import { npcPeople as npcs, isRoomLit } from '../world/roomState';
import type { NpcHost } from './ai/host';
import { fearBand } from './ai/predicates';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
export function killPerson(host: NpcHost, state: GameState, person: Person): void {
  if (state.carryPersonId === person.id) state.carryPersonId = null;
  if (!state.people.some((p) => p.id === person.id)) return;
  const directWitnesses = person.role === 'police'
    ? 0
    : host.npcWitnessEvent(state, person.room, 'murder', person.id);
  state.people = state.people.filter((p) => p.id !== person.id);
  state.pinnedPeople = state.pinnedPeople.filter((id) => id !== person.id);
  if (state.bitterMurmurReady && person.role !== 'police') {
    state.bitterMurmurReady = false;
    const remaining = state.people.filter((p) => p.role !== 'police' && p.hp > 0 && !p.hidden);
    remaining.forEach((other) => { other.revealedActions = Math.max(other.revealedActions ?? 0, 4); });
    host.log(state, remaining.length
      ? `苦涩低语：${person.name}倒下的回声传遍猎场，另外 ${remaining.length} 名人类的气场显现。`
      : '苦涩低语：最后的回声沉入空屋。');
  }
  state.kills += 1;
  if (person.role !== 'police') state.survivorKills += 1;
  // 同一回合的第二个及之后的击杀算「连杀」，鼓励用控制/范围效果制造连锁。
  const comboIndex = person.role !== 'police' ? state.killsThisTurn : 0;
  state.killsThisTurn += 1;
  if (person.marked) state.markedKilled += 1;
  state.lastCrimeRoom = state.playerRoom;

  // 只有被看见的击杀才会推高暴露度。悄悄做掉的、屋子里没人的，
  // 外面只知道「又少了一个人」——那是暴露度该管的事，不是暴露度。
  const seenBy = npcs(state).filter(
    (p) => p.room === person.room && p.hp > 0 && !p.hidden && p.alert >= 25,
  );
  if (directWitnesses > 0 || seenBy.length) {
    host.addWanted(state, person.role === 'target' ? 2 : 1);
  } else {
    host.log(state, '屋里没有人看见这一幕。');
  }
  if (person.role !== 'police') {
    awardBlood(state, 'brutal', `击杀 ${person.name}`, BLOOD.kill, { key: `kill:${person.id}`, limit: 1 });
    if (directWitnesses === 0 && seenBy.length === 0) {
      awardBlood(state, 'cunning', `无声猎杀 · ${person.name}`, BLOOD.stealthKill, { key: `kill:stealth:${person.id}`, limit: 1 });
      markBloodEvent(state, 'kill:stealth');
    }
    if (comboIndex >= 1) {
      const comboValue = Math.min(BLOOD.comboMax, BLOOD.comboBase + (comboIndex - 1) * BLOOD.comboStep);
      awardBlood(state, 'brutal', `连环击杀 · 第 ${comboIndex + 1} 人`, comboValue, { key: `kill:combo:${person.id}`, limit: 1 });
      markBloodEvent(state, 'kill:combo');
    }
    if (person.highValue) {
      awardBlood(state, 'brutal', `高价值目标 · ${person.name}`, BLOOD.highValueKill, { key: `kill:high-value:${person.id}`, limit: 1 });
    }
    if (state.alarm >= 90) markBloodEvent(state, 'kill:high-alarm');
    if (state.powerUsedThisAction) {
      awardBlood(state, 'brutal', `专属能力击杀 · ${person.name}`, BLOOD.signatureKill, { key: `kill:signature:${person.id}`, limit: 1 });
    }
    if (person.escapeProgress > 0 || (state.emergencyActive && state.escapeRooms.includes(person.room))) {
      awardBlood(state, 'control', `阻止逃离 · ${person.name}`, BLOOD.preventInteraction, { key: `escape:${person.id}`, limit: 1 });
      markBloodEvent(state, 'escape:prevented');
    }
    if (!isRoomLit(state, person.room)) {
      awardBlood(state, 'cunning', `黑暗中击杀 · ${person.name}`, BLOOD.environmentKill, { key: `kill:dark:${person.id}`, limit: 1 });
      markBloodEvent(state, 'kill:dark');
    }
  }
  host.log(
    state,
    `你杀死了${person.marked ? '标记目标' : person.role === 'police' ? '警察' : '平民'} ${person.name}。`,
  );

  // 尸体迟早会被发现：整栋房子的警觉跟着抬起来，恐慌会传染。
  let stirred = 0;
  npcs(state).forEach((other) => {
    // 尸体不会让整栋房子瞬间获知消息；只有同屋或相邻房间的人先察觉。
    const discoveryRadius = state.mapId === 'lampkin' ? 2 : 1;
    if (other.hp > 0 && !other.hidden && roomDistance(other.room, person.room) <= discoveryRadius) {
      const nearby = other.room === person.room;
      other.fear = clamp(other.fear + (nearby ? 38 : 18), 0, 100);
      other.alert = clamp(other.alert + (nearby ? 20 : 10), 0, 100);
      stirred += 1;
    }
  });
  // 没人闻到血腥味就不该抬警报：空屋里悄悄处决只留极少痕迹。
  if (stirred > 0) {
    host.addAlarm(state, 6);
    host.log(state, '血腥味顺着地板缝散开，房子里的人开始不安地走动。');
  }
}

/** 受到伤害：只能推进一档，倒地的人再挨一下才会死 */
export function damagePerson(host: NpcHost, state: GameState, person: Person, amount: number, options: { affectFear?: boolean; forceFlee?: boolean } = {}): void {
  const { affectFear = true, forceFlee = false } = options;
  if (!state.people.some((p) => p.id === person.id)) return;
  let dmg = Math.max(0, amount + state.bonusDamage);
  state.bonusDamage = 0;
  if (dmg <= 0) return;
  if ((person.statusEffects?.danger ?? 0) > 0 && person.hp > 0) {
    person.statusEffects!.danger = 0;
    person.hp = 0;
    person.downedTurns = 0;
    person.activity = '受到攻击，危险状态触发并立即倒地';
    person.alert = 100;
    host.log(state, `${person.name} 处于危险状态，受到攻击后立即倒地！`);
    host.addAlarm(state, 4);
    host.npcWitnessEvent(state, person.room, 'attack', person.id);
    return;
  }
  // 见血就清醒：杀戮值一脚踩空
  state.frenzy = 0;

  const before = person.hp;
  if (affectFear) {
    // 配件「命中恐惧」在这里统一加；基础值仍然只有一套。
    person.fear = clamp(person.fear + Math.max(28, dmg * 24) + modifierValue(state, 'fearOnHit'), 0, 100);
    if (person.fear >= 100) dmg = Math.max(dmg, before);
  }
  person.hidden = false;
  person.blockedTurns = 0;

  if (before <= 0) {
    // 对倒地目标造成伤害即为补刀；普通攻击按钮本身不会选择倒地者。
    state.executions += 1;
    killPerson(host, state, person);
    return;
  }

  person.hp = Math.max(0, before - dmg);

  if (person.hp <= 0) {
    person.hp = 0;
    person.downedTurns = 0;
    person.activity = '倒在地上，动不了';
    person.alert = 100;
    host.log(state, `${person.name} 被打倒在地上。现在可以直接处决；如果暂时放过，同伴仍可能赶来救援。`);
    host.addAlarm(state, 4);
    host.npcWitnessEvent(state, person.room, 'attack', person.id);
    return;
  }

  // 受到伤害后会惊慌逃跑；累计达到 2 点时，状态才正式变为受伤。
  person.alert = 100;
  person.activity = person.hp <= SURVIVOR_INJURED_HP ? '捂着伤口逃窜' : '受到攻击，惊慌逃窜';
  if (before > SURVIVOR_INJURED_HP && person.hp <= SURVIVOR_INJURED_HP) host.log(state, `${person.name} 受伤了（${person.hp}/${SURVIVOR_MAX_HP}），丢下手里的东西就跑。`);
  else host.log(state, `${person.name} 受到 ${dmg} 点伤害（剩余 ${person.hp}/${SURVIVOR_MAX_HP}）。`);
  // 同屋目击者必须形成真实行为反应；邻近房间只通过喊声获得转述信息。
  host.npcWitnessEvent(state, person.room, 'attack', person.id);
  host.addAlarm(state, 3);
  // 一刀下去他会连着跑两间屋，地板上留下一道血痕：
  // 「砍一刀、他挪一格、我跟上去」那种没有张力的追逐到此为止。
  for (let i = 0; i < PANIC_HOPS_ON_HIT; i++) {
    if (!host.fleeAway(state, person, false, forceFlee)) break;
    person.movesThisTurn += 1;
  }
}

export function carryPerson(host: NpcHost, state: GameState, personId: string): boolean {
  if (state.phase !== 'playing' || state.carryPersonId || state.energy < 1) return false;
  const person = state.people.find((p) => p.id === personId);
  if (!person || person.role === 'police' || person.hp > 0 || person.room !== state.playerRoom) return false;
  state.energy -= 1;
  state.carryPersonId = person.id;
  state.carryDistance = 0;
  person.activity = '被杀手抱起搬运';
  awardBlood(state, 'hunt', `抓住幸存者 · ${person.name}`, BLOOD.capture, { key: `carry:${person.id}`, limit: 1 });
  host.log(state, `你抱起了倒地的${person.name}。搬运途中不会自行挣脱。`);
  host.npcWitnessEvent(state, person.room, 'abduction', person.id);
  host.afterPlayerAction(state);
  return true;
}


export function dropCarriedPerson(host: NpcHost, state: GameState): boolean {
  if (state.phase !== 'playing' || !state.carryPersonId || state.energy < 1) return false;
  const person = state.people.find((candidate) => candidate.id === state.carryPersonId);
  if (!person || person.hp > 0) return false;
  state.energy -= 1;
  state.carryPersonId = null;
  state.carryDistance = 0;
  person.activity = '被杀手放下';
  host.log(state, `你放下了${person.name}。`);
  host.afterPlayerAction(state);
  return true;
}
export function executeCarriedPerson(host: NpcHost, state: GameState, methodId: ExecutionMethodId): boolean {
  if (!state.carryPersonId || state.phase !== 'playing' || state.attackBlockedTurn === state.turn) return false;
  const person = state.people.find((p) => p.id === state.carryPersonId);
  if (!person || person.room !== state.playerRoom || !canExecuteNow(person)) {
    host.log(state, '怀里的人尚不能处决，或已经不在现场。');
    return false;
  }
  const method = getExecutionMethod(methodId);
  if (!method || method.room !== state.playerRoom) {
    host.log(state, '这里没有可用的特殊处决场地。');
    return false;
  }
  if (state.energy < 1) { host.log(state, '行动点不足，无法完成特殊处决。'); return false; }
  state.energy -= 1;
  const name = person.name;
  state.carryPersonId = null;
  state.carryDistance = 0;
  state.executions += 1;
  const scene = createExecutionScene(state, { kind: 'special', victim: person, siteId: method.id, siteName: method.name });
  host.log(state, `特殊处决【${method.name}】：${scene.description}`);
  host.addAlarm(state, executionWitnessed(state, person) ? 6 : 2);
  awardBlood(state, 'brutal', `特殊处决 · ${method.name}`, BLOOD.specialExecution, { key: `execution:special:${person.id}`, limit: 1 });
  awardBlood(state, 'brutal', `场景处决 · ${method.name}`, BLOOD.locationExecution, { key: `execution:location:${person.id}`, limit: 1 });
  markBloodEvent(state, 'execution:location');
  killPerson(host, state, person);
  if (!state.executionMethodsUsed.includes(method.id)) state.executionMethodsUsed.push(method.id);
  state.attackReady = true;
  host.addAlarm(state, 8);
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}

export function canExecuteNow(person: Person): boolean {
  return person.hp <= 0;
}


/**
 * 处决是否被目击：同屋还活着的幸存者，或相邻房间里听得见动静的人。
 * 没人的屋子里悄悄处决，不应该把警报拉满。
 */
export function executionWitnessed(state: GameState, victim: Person): boolean {
  return npcs(state).some((person) =>
    person.id !== victim.id
    && person.hp > 0
    && !person.hidden
    && (person.room === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(person.room)),
  );
}

export function executePerson(host: NpcHost, state: GameState, person: Person): void {
  if (person.hp > 0) {
    host.log(state, `${person.name} 还站着，处决需要先把他打倒。`);
    return;
  }
  const witnessed = executionWitnessed(state, person);
  host.addAlarm(state, witnessed ? 8 : 1);
  state.executions += 1;
  createExecutionScene(state, { kind: 'normal', victim: person });
  awardBlood(state, 'brutal', `处决 · ${person.name}`, BLOOD.specialExecution, { key: `execution:${person.id}`, limit: 1 });
  host.log(state, witnessed ? `你处决了 ${person.name}，屋里的人看见了这一幕。` : `你悄悄处决了 ${person.name}，没有惊动别人。`);
  killPerson(host, state, person);
}

export function rescuePerson(host: NpcHost, state: GameState, person: Person): void {
  if (person.hp > 0) return;
  person.hp = SURVIVOR_INJURED_HP;
  person.downedTurns = 0;
  person.activity = '被人从地上拖了起来';
  host.addAlarm(state, 2);
  host.log(state, `${person.name} 被同伴救起，重新站着（受伤）。`);
}

export function healPerson(host: NpcHost, state: GameState, person: Person, amount = 1): void {
  if (person.hp <= 0) return;
  const before = person.hp;
  const maxHp = (person.statusEffects?.incurable ?? 0) > 0 ? SURVIVOR_INJURED_HP : SURVIVOR_MAX_HP;
  person.hp = Math.min(maxHp, person.hp + amount);
  if (person.hp > before && amount >= 2 && person.statusEffects?.deepWound) person.statusEffects.deepWound = 0;
  if (person.hp > before) host.log(state, `${person.name} 的伤口被处理过（${person.hp}/${SURVIVOR_MAX_HP}）。`);
}
