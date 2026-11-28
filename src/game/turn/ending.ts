/**
 * 回合总循环：从"玩家结束回合"到"下一回合开始"的全部结算。
 *
 * 顺序是固定的：主目标检查 → 夜幕 → 图腾余响 → 幸存者行动 → 电话 → 逃生 →
 * 警察 → 目击 → 警报降温 → 回合收尾 → 超时判定 → 天亮/环境/补牌。
 * 只通过 NpcHost 调引擎写服务。
 */
import { FRENZY_AP_BONUS, FRENZY_THRESHOLD, HAND_LIMIT, REACT_MOVE_CAP, WATCH_GAIN } from '../constants';
import { KILLER_MAP } from '../killers';
import { roomName } from '../missions';
import { ROOM_MAP } from '../rooms';
import type { GameState, RoomId } from '../types';
import { npcPeople as npcs } from '../world/roomState';
import type { NpcHost } from '../npc/ai/host';
export function endTurn(host: NpcHost, state: GameState): void {
  if (state.phase !== 'playing') return;

  const m = state.mission;
  if (state.nurseFatiguePending) {
    state.nurseFatiguePending = false;
    state.nurseFollowUp = false;
    state.stunTurns = Math.max(state.stunTurns, 1);
    host.log(state, '你没有利用闪现后的攻击窗口，护士仍因濒死之息进入疲惫：下回合行动点减少 1。');
  }
  host.checkImmediateWin(state);
  if (state.result) return;

  // 鬼面「夜幕」：监视相邻房间的人；有人闯进鬼面房间就中断，且他能多跑一步
  if (state.killer === '鬼面' && state.nightfallActive) {
    const intruder = npcs(state).find((p) => p.hp > 0 && p.room === state.playerRoom);
    if (intruder) {
      state.nightfallActive = false;
      npcs(state).forEach((p) => {
        p.watchValue = 0;
      });
      if (intruder.movesThisTurn < REACT_MOVE_CAP) {
        host.fleeAway(state, intruder);
        intruder.movesThisTurn += 1;
      }
      host.log(state, `${intruder.name} 一头撞进你所在的房间，夜幕被打断了——他趁乱又多跑了一步。`);
    } else {
      const targets = npcs(state).filter(
        (p) => p.hp > 0 && !p.watched && ROOM_MAP[state.playerRoom].neighbors.includes(p.room),
      );
      const watchedTarget = targets.sort((a, b) => b.watchValue - a.watchValue)[0];
      if (watchedTarget) {
        watchedTarget.watchValue = Math.min(100, watchedTarget.watchValue + WATCH_GAIN);
        host.log(state, `夜幕：你盯着${roomName(watchedTarget.room)}里的${watchedTarget.name}（监视 ${watchedTarget.watchValue}/100）。`);
        if (watchedTarget.watchValue >= 100) {
          watchedTarget.watched = true;
          watchedTarget.trackedTurns = Math.max(watchedTarget.trackedTurns, 99);
          host.log(state, `${watchedTarget.name} 的监视值满了：他持续显形，下一刀可以直接把他放倒。`);
        }
      }
    }
  }

  if (state.totems.includes(state.playerRoom)) {
    state.bonusEnergyNextTurn = 1;
    host.log(state, '图腾余响：下一回合额外获得 1 点行动点。');
  }

  host.runNpcTurn(state);
  if (state.result) return;
  host.callPhase(state);
  if (state.result) return;

  host.escapePhase(state);
  if (state.result) return;

  host.policePhase(state);
  if (state.result) return;

  host.checkImmediateWin(state);
  if (state.result) return;

  // 警报值可随猎场平静而下降；最终危机开始后不会撤销。
  if (!state.emergencyActive) state.alarm = Math.max(0, state.alarm - 6);
  host.syncWanted(state);
  if (!state.emergencyActive && state.heatTurn !== state.turn) {
    // 这一回合没有新的动静（没人报警、没人看见你、也没动手），注意力就散一点。
    // 这是「潜行 / 潜伏」玩法能成立的前提。
    state.alarm = Math.max(0, state.alarm - 4);
    host.syncWanted(state);
    host.log(state, `这一夜没人再提起你，暴露度降到 ${state.alarm}。`);
  }

  /* ---------- 回合收尾 ---------- */
  host.refreshVision(state);
  host.pruneTrails(state);
  host.pruneDisturbances(state);
  state.decoyRoom = null;
  state.freeMove = false;
  state.discount = 0;
  state.bonusDamage = 0;
  // 迈尔斯的附身按行动消耗尾随值；其他来源仍兼容旧回合计时。
  if (state.possessed && state.killer !== '迈克尔·迈尔斯') {
    state.possessTurns = Math.max(0, state.possessTurns - 1);
    if (state.possessTurns === 0) {
      state.possessed = false;
      host.log(state, '恶魔附身消退，刀锋恢复了原本的重量。');
    }
  }
  state.myersMovedThisTurn = false;
  state.noAlarmTurn = false;
  state.killsThisTurn = 0;
  state.revealedThisTurn = false;
  state.roomLocks = Object.fromEntries(
    Object.entries(state.roomLocks)
      .map(([k, v]) => [k, (v ?? 0) - 1])
      .filter(([, v]) => (v as number) > 0),
  ) as Partial<Record<RoomId, number>>;
  state.exitBlockedTurns = Math.max(0, state.exitBlockedTurns - 1);
  // 临时闪断只持续一个完整回合，不会把电闸永久标记为已破坏。
  state.powerCircuits.forEach((circuit) => {
    if ((circuit.flickerTurns ?? 0) > 0) circuit.flickerTurns = Math.max(0, (circuit.flickerTurns ?? 0) - 1);
  });
  state.cooldowns = Object.fromEntries(
    Object.entries(state.cooldowns)
      .map(([k, v]) => [k, v - 1])
      .filter(([, v]) => (v as number) > 0),
  );
  state.pinnedPeople = [];

  if (state.turn >= m.turns) {
    if (state.missionPrimaryCompleted) { state.resultReason = '主目标已经完成，猎场时间耗尽，本局按已完成契约结算。'; host.finish(state, 'win'); }
    else { state.resultReason = KILLER_MAP[state.killer]?.school === 'supernatural' ? '天光刺破猎场，恶灵失去依附之所，猎杀被迫终止。' : '天亮了，警队封锁整条街，猎杀被迫终止。'; host.finish(state, 'timeout'); }
    return;
  }

  // 手牌保留；每个新回合只补 1 张，不再整手弃掉重抽。
  const dawnBefore = host.dawnPhase(state);
  state.turn += 1;
  host.applyDawnPressure(state, dawnBefore);
  host.triggerEnvironmentalEvent(state);
  // 杀戮满值 = 移动力提升：每回合多 2 点行动点，但绝不替玩家走第二步
  const frenzyBonus = state.frenzy >= FRENZY_THRESHOLD ? FRENZY_AP_BONUS : 0;
  state.energy = Math.max(
    1,
    state.maxEnergy + state.bonusEnergyNextTurn + frenzyBonus - state.stunTurns,
  );
  state.bonusEnergyNextTurn = 0;
  state.stunTurns = 0;
  state.blindTurns = 0;
  // 新回合：刀已经收回来，所有人的腿也歇过来了
  state.attackReady = true;
  state.people.forEach((p) => {
    p.movesThisTurn = 0;
  });
  host.drawForPlayer(state, 1);
  if (state.hand.length > HAND_LIMIT) {
    host.log(state, `当前手牌 ${state.hand.length} 张，超过上限 ${HAND_LIMIT}，请先选择弃牌。`);
  }
  host.log(state, `新回合开始，行动点恢复${frenzyBonus ? `（杀戮 +${frenzyBonus}）` : ''}。`);
}
