/**
 * 玩家出牌：卡牌的前置检查、目标选择与效果执行。
 *
 * 卡牌数据仍然是纯数据（data/cards.ts）；这里只负责"打出去会发生什么"。
 */
import { CARD_MAP } from '../cards';
import { roomName } from '../missions';
import { ROOM_MAP } from '../rooms';
import type { GameState, RoomId } from '../types';
import { sabotageTarget } from '../rules/actionRules';
import { attack, attackBlockReason } from './combat';
import type { NpcHost } from '../npc/ai/host';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function retireCard(state: GameState, card: { uid: string; defId: string }, def: { exhaust?: boolean; power?: boolean }): void {
  if (def.exhaust) state.exhaustPile.push(card);
  else if (def.power) state.powerPile.push(card.defId);
  else state.discardPile.push(card);
}

/** 基础条件检查（不消耗能量、不弃牌） */
function precheckFailed(host: NpcHost, state: GameState, defId: string): string | null {
  const def = CARD_MAP[defId];
  if (!def?.precheck) return null;
  return host.checkCond(state, def.precheck.cond) ? null : def.precheck.hint;
}

export function cancelAuraSelection(host: NpcHost, state: GameState): boolean {
  if (state.phase !== 'playing' || !state.auraTargeting) return false;
  state.auraTargeting = false;
  host.log(state, '你取消了恶灵低语的选房，没有显现任何人的气场。');
  return true;
}

export function selectAuraRoom(host: NpcHost, state: GameState, room: RoomId): boolean {
  if (state.phase !== 'playing' || !state.auraTargeting || !ROOM_MAP[room]) return false;
  state.auraTargeting = false;
  const targets = state.people.filter((person) => person.role !== 'police' && person.hp > 0 && !person.hidden && person.room === room);
  targets.forEach((person) => { person.revealedActions = Math.max(person.revealedActions ?? 0, 3); });
  host.log(state, targets.length
    ? `恶灵低语：${roomName(room)}中的 ${targets.length} 名人类气场显现。`
    : `恶灵低语：${roomName(room)}空无一人，没有捕捉到气场。`);
  return true;
}

export function playCard(host: NpcHost, state: GameState, cardUid: string): boolean {
  if (state.phase !== 'playing') return false;
  const index = state.hand.findIndex((c) => c.uid === cardUid);
  if (index < 0) return false;
  const card = state.hand[index];
  const def = CARD_MAP[card.defId];
  if (!def) {
    state.hand.splice(index, 1);
    return false;
  }
  const cost = host.effectiveCost(card.defId, state);
  if (cost > state.energy) {
    host.log(state, `行动点不足：${def.name} 需要 ${cost} 点。`);
    return false;
  }
  const blocked = precheckFailed(host, state, card.defId);
  if (blocked) {
    host.log(state, blocked);
    return false;
  }
  if (state.attackBlockedTurn === state.turn && (card.defId === 'myers_eclipse_light' || def.ops.some((op) => ['attack', 'damage', 'down', 'execute', 'kill'].includes(op.op)))) {
    host.log(state, '戏耍食物生效中：本回合不能打出造成伤害或处决的卡牌。');
    return false;
  }
  if (def.killerOnly && def.killerOnly !== state.killer) {
    host.log(state, `「${def.name}」是 ${def.killerOnly} 的专属卡牌。`);
    return false;
  }
  if (card.defId === 'myers_eclipse_light') {
    const lastTarget = state.people.find((person) => person.id === state.lastAttackedId);
    if (state.killer !== '迈克尔·迈尔斯' || !lastTarget || lastTarget.hp > 0 || lastTarget.role === 'police') {
      host.log(state, '优胜劣汰：必须先击倒一名人类才能打出。');
      return false;
    }
  }
  if (card.defId === 'myers_last_best') {
    const remaining = state.people.filter((person) => person.role !== 'police');
    if (state.killer !== '迈克尔·迈尔斯' || remaining.length !== 1) {
      host.log(state, '把最好的留在最后：地图上必须只剩最后一名人类才能打出。');
      return false;
    }
  }
  if (card.defId === 'hex_ruin' && !sabotageTarget(state)) {
    host.log(state, '粉碎希望：当前房间附近没有可破坏的环境目标。');
    return false;
  }

  // 所有卡牌都可通过 DSL 的 attack 步骤发动真正攻击，并配置命中后效果。
  const attackOp = def.ops.find((op) => op.op === 'attack');
  if (attackOp && attackOp.op === 'attack') {
    const victim = host.selectPeople(state, attackOp.who)[0];
    if (!victim) { host.log(state, '当前目标范围内没有可以攻击的站立幸存者。'); return false; }
    const reason = attackBlockReason(host, state, victim.id, cost);
    if (reason) { host.log(state, reason); return false; }
    state.hand.splice(index, 1); retireCard(state, card, def);
    state.cardsPlayed.push(card.defId);
    host.log(state, `你打出「${def.name}」，对 ${victim.name} 发动攻击。`);
    return attack(host, state, victim.id, { costOverride: cost, bleedTurns: attackOp.bleedTurns, hitStatus: attackOp.statusTurns > 0 ? attackOp.status : undefined, hitStatusTurns: attackOp.statusTurns });
  }

  state.energy -= cost;
  state.hand.splice(index, 1);
  retireCard(state, card, def);
  state.cardsPlayed.push(card.defId);
  host.log(state, `你打出「${def.name}」（消耗 ${cost} 点行动点）。`);

  if (card.defId === 'myers_eclipse_light') {
    const target = state.people.find((person) => person.id === state.lastAttackedId);
    if (target && target.hp <= 0) {
      const sacrifice = target.bloodSacrifice;
      state.executions += 1;
      host.executePerson(state, target);
      if (sacrifice) {
        const survivors = state.people.filter((person) => person.role !== 'police' && person.hp > 0);
        survivors.forEach((person) => { person.fear = clamp(person.fear + 35, 0, 100); });
        host.log(state, `血祭品被优胜劣汰处决：所有 ${survivors.length} 名幸存人类恐惧值 +35。`);
      }
    }
  } else if (card.defId === 'myers_last_best') {
    const last = state.people.find((person) => person.role !== 'police');
    if (last) {
      last.revealedActions = Math.max(last.revealedActions ?? 0, 6);
      state.freeMove = true;
      host.log(state, `把最好的留在最后：最后一名人类 ${last.name} 的气场显现 5 次后续行动；你获得一次免费移动。`);
    }
  }


  host.runOps(state, def.ops);
  // 不屈不挠把「擦刀」作为卡牌效果免费结算：不检查也不扣行动点，
  // 并且与普通擦刀一样移除「把最好的留在最后」的印记。
  if (card.defId === 'unbreakable') {
    state.attackReady = true;
    if (state.killer === '迈克尔·迈尔斯' && state.myersLastBestActive && state.myersLastBestMarks > 0) {
      const removed = Math.min(2, state.myersLastBestMarks);
      state.myersLastBestMarks -= removed;
      host.log(state, `把最好的留在最后：免费擦刀移除 ${removed} 枚专属印记（剩余 ${state.myersLastBestMarks}）。`);
    }
    host.log(state, '不屈不挠：抽牌并免费擦刀（不消耗行动点）。');
  } else if (!def.noAction) {
    // 普通卡牌仍按原规则收回刀锋；零行动卡不刷新攻击状态。
    state.attackReady = true;
  }
  if (!def.noAction) {
    host.afterPlayerAction(state);
    host.checkImmediateWin(state);
  }
  return true;
}
