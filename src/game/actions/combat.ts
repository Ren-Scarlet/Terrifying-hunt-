/**
 * 玩家的战斗执行：挥刀、处决、分数处决，以及"为什么砍不出去"的判定。
 *
 * 判定与执行放在一起，是因为两者共用同一套目标选择规则；
 * 界面只读判定，真正改世界的是下面这些执行函数。
 */
import { ALARM_MAX, ATTACK_COST, SCORE_EXECUTION_THRESHOLD, SURVIVOR_MAX_HP } from '../constants';
import { getExecutionMethod } from '../executions';
import { modifierValue } from '../modifiers';
import { random } from '../random';
import { currentScore } from '../scoring';
import type { GameState, Person, RoomId } from '../types';
import { ROOM_MAP } from '../rooms';
import { npcPeople as npcs, peopleInRoom } from '../world/roomState';
import { ambushActive } from '../npc/ai/predicates';
import type { NpcHost } from '../npc/ai/host';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
/**
 * 现在这一刀能不能砍出去
 *
 * 三条门槛，缺一条都不行：
 *   1. 能量够（1 点）——挥刀不是免费的
 *   2. 上一刀已经收回来——「无法连续挥刀」，砍完必须再做一件事
 *   3. 屋里确实站着一个能下手的人——倒地的人只能处决，砍不动
 */
export function attackBlockReason(host: NpcHost, state: GameState, targetId?: string, costOverride = ATTACK_COST): string {
  if (state.phase !== 'playing') return '现在不能攻击';
  if (state.attackBlockedTurn === state.turn) return '戏耍食物生效中：本回合不能攻击。';
  // 攻击只针对站立目标；倒地者有独立的处决按钮，避免两个动作混在一起。
  if (targetId) {
    const picked = state.people.find((p) => p.id === targetId);
    if (!picked) return '这个人已经不在现场了';
    if (picked.role === 'police' && state.policeAssaulted) return '警员已经倒下，别再看了';
    if (picked.room !== state.playerRoom) return '他不在这间屋里';
    if (picked.hidden) return '他躲起来了，先搜索这间屋子';
    if (picked.hp <= 0) return '目标已经倒地，请使用「处决」按钮';
  }
  if (!state.attackReady) return '刀还没收回来：先挪一步或出一张牌';
  if (state.energy < costOverride) return `需要 ${costOverride} 点行动点`;
  if (host.findVictim(state, state.playerRoom, Infinity, false, targetId)) return '';
  const downedHere = peopleInRoom(state, state.playerRoom).some((p) => p.role !== 'police' && p.hp <= 0);
  if (downedHere) return '当前房间只有倒地目标，请使用「处决」按钮';
  const onlyPolice = peopleInRoom(state, state.playerRoom).some((p) => p.role === 'police');
  return onlyPolice ? '屋里只有警察——他不能攻击，别在他眼皮底下动手' : '这间屋子里没有站立目标';
}

export function canAttack(host: NpcHost, state: GameState, targetId?: string): boolean {
  return attackBlockReason(host, state, targetId) === '';
}

/** 独立处决动作：倒地后立即可用，消耗 1 AP；玩家不处决时，同伴仍可在之后救援。 */
export function executeBlockReason(host: NpcHost, state: GameState, targetId?: string): string {
  if (state.phase !== 'playing') return '现在不能处决';
  if (state.attackBlockedTurn === state.turn) return '戏耍食物生效中：本回合不能处决。';
  const target = targetId
    ? state.people.find((person) => person.id === targetId)
    : peopleInRoom(state, state.playerRoom).find((person) => person.role !== 'police' && person.hp <= 0);
  if (!target) return '当前房间没有倒地的幸存者';
  if (target.role === 'police') return '警员不能使用普通处决';
  if (target.room !== state.playerRoom) return '目标不在当前房间';
  if (target.hp > 0) return '目标还站着，先将其击倒';
  if (state.energy < 1) return '需要 1 点行动点';
  return '';
}

export function executeDownedPerson(host: NpcHost, state: GameState, targetId?: string): boolean {
  const reason = executeBlockReason(host, state, targetId);
  if (reason) {
    host.log(state, reason);
    return false;
  }
  const target = targetId
    ? state.people.find((person) => person.id === targetId)!
    : peopleInRoom(state, state.playerRoom).find((person) => person.role !== 'police' && person.hp <= 0)!;
  state.energy -= 1;
  if (state.carryPersonId === target.id) state.carryPersonId = null;
  host.executePerson(state, target);
  if (state.result) return true;
  state.attackReady = true;
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}

export function scoreExecutionBlockReason(host: NpcHost, state: GameState, targetId: string): string {
  if (currentScore(state) < SCORE_EXECUTION_THRESHOLD) return '猎杀评分尚未达到 ' + SCORE_EXECUTION_THRESHOLD + ' 分，暂时无法发动分数处决。';
  if (state.carryPersonId === targetId) return '目标已经被抱起；请将其搬运到地点处决区域。';
  return executeBlockReason(host, state, targetId);
}

/** 分数处决：独立于普通处决与搬运地点处决，使用单独的头顶按钮和 QTE。 */
export function executeScoreSpecial(host: NpcHost, state: GameState, targetId: string): boolean {
  const reason = scoreExecutionBlockReason(host, state, targetId);
  if (reason) {
    host.log(state, reason);
    return false;
  }
  const target = state.people.find((person) => person.id === targetId);
  if (!target) {
    host.log(state, '分数处决失败：没有找到目标。');
    return false;
  }
  state.energy -= 1;
  state.scoreExecutions += 1;
  state.specialExecutionBonus += 25;
  host.addAlarm(state, host.executionWitnessed(state, target) ? 8 : 1);
  state.executions += 1;
  host.log(state, '分数处决：你消耗 1 AP，发动独立处决动作，额外获得 25 分。');
  host.killPerson(state, target);
  if (state.result) return true;
  state.attackReady = true;
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}

/**
 * 普通攻击：只针对站立目标，健康 → 受伤，受伤 → 倒地；倒地后使用独立处决动作。
 * 恶魔附身期间伤害翻倍，还站着的人一刀就倒。
 * 砍完就把 attackReady 关掉，必须再做一件事（走路 / 出牌 / 用能力）才能砍第二刀，
 * 所以「一刀接一刀」不是按得快就行，中间得有一次追逐或一次控制。
 * 传入 targetId 时只砍那个人——点房间里的谁，就砍谁。
 */
export function attack(host: NpcHost, state: GameState, targetId?: string, options: { costOverride?: number; bleedOnHit?: boolean; bleedTurns?: number; hitStatus?: 'blind' | 'undetectable' | 'danger' | 'deepWound' | 'oblivious' | 'incurable' | 'cursed'; hitStatusTurns?: number } = {}): boolean {
  if (state.phase !== 'playing') return false;
  const attackCost = options.costOverride ?? ATTACK_COST;
  const reason = attackBlockReason(host, state, targetId, attackCost);
  if (reason) {
    host.log(state, reason);
    return false;
  }
  const target = host.findVictim(state, state.playerRoom, Infinity, false, targetId)!;
  const heavy = state.possessed;
  const alone = npcs(state).every((person) =>
    person.id === target.id || person.room !== state.playerRoom || person.hp <= 0,
  );
  const ambushStrike = ambushActive(state) && target.role !== 'police' && target.alert < 100 && alone;
  // 难逃一死：警报拉满（最终危机）之后才生效；图腾被拆光也会失效。
  const noedActive = state.hexNoedActive && state.alarm >= ALARM_MAX && state.totems.length > 0;
  // 带手电筒的人可能从隔壁冲进来照你：这一刀落空，两个人都趁机跑掉
  const flasher = npcs(state).find(
    (p) =>
      p.item === 'flashlight' &&
      p.itemUses > 0 &&
      p.hp > 0 &&
      p.alert >= 40 &&
      (p.room === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(p.room)),
  );
  if (flasher && random() < 0.82) {
    host.consumeItem(state, flasher);
    if (flasher.room !== state.playerRoom) flasher.room = state.playerRoom;
    host.interruptPlayer(
      state,
      `${flasher.name} 从旁边冲进来，手电筒正照着你的眼睛——这一刀落空了。`,
      flasher.id,
    );
    if (target.hp > 0) {
      host.fleeAway(state, target);
      target.alert = 100;
      host.log(state, `${target.name} 毫发无伤地跟着跑出了屋子。`);
    }
    host.afterPlayerAction(state);
    host.checkImmediateWin(state);
    return false;
  }
  state.energy -= attackCost;
  if (state.killer === '护士' && state.nurseFollowUp && target.role !== 'police') {
    state.huntStats.nurseBlinkAttacks += 1;
    host.log(state, `护士利用闪现后的追击窗口攻击了 ${target.name}，额外挑战进度 +1。`);
  }
  state.attackReady = false;
  state.lastAttackedId = target.id;
  if (target.role === 'police') {
    state.policeAssaulted = true;
    state.heatTurn = state.turn;
    state.policeLock = 1;
    host.addWanted(state, 6);
    host.addAlarm(state, 12);
    host.log(state, '你居然对警员动了刀——暴露度暴涨 +72，警察会立刻咬住你。');
  }
  host.log(
    state,
    target.hp <= 0
      ? `你俯身补上一刀，${target.name} 没能再起来（消耗 ${attackCost} 点行动点）。`
      : heavy
        ? `恶魔附身 · 你挥刀砍向 ${target.name}，这一刀直接见骨（消耗 ${attackCost} 点行动点）。`
        : `你挥刀砍向 ${target.name}（消耗 ${attackCost} 点行动点）。`,
  );
  // 鬼面监视完成：这一刀直接把还站着的人放倒，不必补第二下
  const nightfallKill = target.watched;
  if (nightfallKill) {
    target.watched = false;
    target.watchValue = 0;
    host.log(state, `夜幕锁定 ${target.name}：这一刀直接把他放倒。`);
  }
  const hpBeforeHit = target.hp;
  // 卡牌联动：定位、控制、伏击都能转化成真正的猎杀优势，而不是只提供一段说明文字。
  const trackingCombo = target.role !== 'police' && target.trackedTurns > 0;
  const controlCombo = target.role !== 'police' && target.blockedTurns > 0;
  // 基础挥刀 1 点：健康 4 点、受伤 2 点，所以四刀倒地（第二刀进入受伤）。
  // 配件的「挥刀伤害」只在普通挥刀上生效，不放大厄咒/附身的一击倒地。
  const baseDamage = noedActive || (heavy && state.killer === '迈克尔·迈尔斯')
    ? SURVIVOR_MAX_HP
    : Math.min(SURVIVOR_MAX_HP, 1 + modifierValue(state, 'attackDamage'));
  const comboDamage = controlCombo && baseDamage < SURVIVOR_MAX_HP ? 1 : 0;
  if (noedActive && target.role !== 'police') {
    host.damagePerson(state, target, SURVIVOR_MAX_HP);
    host.log(state, `难逃一死：厄咒图腾仍然存续，${target.name}被攻击后直接倒地（图腾剩余 ${state.totems.length} 座）。`);
  } else {
    host.damagePerson(state, target, baseDamage + comboDamage);
  }
  const bleedTurns = options.bleedTurns ?? (options.bleedOnHit ? 2 : 0);
  if (bleedTurns > 0 && target.role !== 'police' && state.people.some((person) => person.id === target.id) && target.hp < hpBeforeHit) {
    target.bleed = Math.max(target.bleed, bleedTurns); host.log(state, `${target.name}开始流血 ${bleedTurns} 次结算，移动时会留下血迹。`);
  }
  if (options.hitStatus && (options.hitStatusTurns ?? 0) > 0 && target.role !== 'police' && state.people.some((person) => person.id === target.id) && target.hp < hpBeforeHit) {
    target.statusEffects ??= {}; target.statusEffects[options.hitStatus] = Math.max(target.statusEffects[options.hitStatus] ?? 0, (options.hitStatusTurns ?? 0) + 1);
    host.log(state, `${target.name}命中后获得状态：${options.hitStatus}（${options.hitStatusTurns} 次结算）。`);
  }
  if (state.bleedNextHit && target.role !== 'police' && state.people.some((person) => person.id === target.id) && target.hp > 0) {
    target.bleed = Math.max(target.bleed, 2);
    state.bleedNextHit = false;
    host.log(state, `辣手屠夫：${target.name}的伤口开始持续流血，移动时会留下血迹。`);
  }
  if (target.role !== 'police' && target.hp < hpBeforeHit && state.hexHuntressActive && !state.hexHuntressUsed) {
    state.hexHuntressUsed = true;
    state.cardBonusScore += 50;
    host.log(state, '厄咒：猎杀戾气触发：这次攻击命中，额外获得 50 点猎杀评分。');
  }
  if (heavy && state.killer === '迈克尔·迈尔斯' && target.hp < hpBeforeHit) {
    state.huntStats.myersBurstHits += 1;
  }
  if (ambushStrike) {
    state.ambushTurn = 0;
    host.log(state, `致命窗口：${target.name} 独自一人且尚未察觉，你的伏击造成重创（2 点伤害）。`);
  }
  if (target.role !== 'police' && target.hp < hpBeforeHit) {
    if (controlCombo) host.log(state, `控制连携：你趁${target.name}被限制行动时出手，额外造成 1 点伤害。`);
    if (trackingCombo) {
      state.specialExecutionBonus += 10;
      host.log(state, `定位连携：你沿着追踪标记精准截住${target.name}，猎杀评分 +10。`);
    }
  }
  if (target.role !== 'police' && target.hp < hpBeforeHit) {
    if (state.killer === '迈克尔·迈尔斯' && state.myersLastBestActive && !target.bloodSacrifice) {
      state.myersLastBestMarks = Math.min(8, state.myersLastBestMarks + 1);
      host.log(state, `把最好的留在最后印记 +1（${state.myersLastBestMarks}/8）。`);
    }
    if (state.killer === '迈克尔·迈尔斯' && state.myersFoodMarks > 0) {
      state.myersFoodMarks -= 1;
      host.log(state, `戏耍食物印记 -1（${state.myersFoodMarks}/8）。`);
    }
  }
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}
