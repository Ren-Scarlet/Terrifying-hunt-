/**
 * 整局冒烟：让一个「会打」的机器人把每局从开局跑到结算。
 *
 * 它不产出可用的平衡数据（牌组和打法是启发式的，数值没有统计意义），
 * 唯一目的是抓「跑不到底」的问题：连续 160 步没有推进（卡死）、血量越界、
 * 结算抛异常。出现这两类问题进程会以 1 退出，从而卡住 npm run check 与部署。
 *
 * 只跑当前开放的 4 位杀手，每位 2 局（共 8 局，约 0.1 秒）。
 * 想多跑几局：GAMES=6 node .cache/tests/sim.mjs
 */
import { CARDS, CARD_MAP } from '../src/game/data/cards';
import { KILLERS, STARTER_KILLERS } from '../src/game/killers';
import {
  attack,
  canAttack,
  canMoveTo,
  canUsePower,
  createGame,
  endTurn,
  isPersonVisible,
  movePlayer,
  playCard,
  searchRoom,
  usePower,
  visibleDisturbances,
  visibleTrails,
} from '../src/game/engine';
import { ROOM_MAP, ROOMS } from '../src/game/rooms';
import { generateMission } from '../src/game/missions';
import type { GameState, RoomId } from '../src/game/types';

const has = (id: string, op: string): boolean => (CARD_MAP[id]?.ops ?? []).some((o) => o.op === op);
const byOp = (op: string) => CARDS.filter((c) => has(c.id, op)).map((c) => c.id);

/** 能降温（通缉/警戒）的牌 */
const COOL = CARDS.filter((c) =>
  c.ops.some(
    (o) =>
      (o as any).op === 'wantedHalf' ||
      ((o as any).op === 'wanted' && ((o as any).amount ?? 0) < 0) ||
      ((o as any).op === 'alarm' && ((o as any).amount ?? 0) < 0),
  ),
).map((c) => c.id);

const MODE = (process.env.SIM_MODE ?? 'tactics') as 'brute' | 'stealth' | 'tactics';
const PER_KILLER = Number(process.env.GAMES ?? 2);

/** 牌组：伏击 / 处决 / 侦查，剩下靠功能牌 */
function buildDeck(): string[] {
  const deck: string[] = [];
  const push = (pool: string[], n: number) => {
    for (let i = 0; i < n && pool.length; i++) deck.push(pool[i % pool.length]);
  };
  push(byOp('ambush'), 2);
  push(byOp('execute'), 3);
  push(COOL, 2);
  push(byOp('sabotage'), 1);
  while (deck.length < 15) deck.push('sloppy_butcher');
  return deck.slice(0, 15);
}

/** BFS 距离 */
function dist(from: RoomId, to: RoomId): number {
  if (from === to) return 0;
  const seen = new Set<RoomId>([from]);
  let frontier: RoomId[] = [from];
  let d = 0;
  while (frontier.length && d < 20) {
    d += 1;
    const next: RoomId[] = [];
    for (const r of frontier) {
      for (const n of ROOM_MAP[r].neighbors) {
        if (seen.has(n)) continue;
        if (n === to) return d;
        seen.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return 99;
}

/** 追踪的目标：看得见的人 > 最新脚印 > 最新动静（乌鸦叫） */
function chaseTarget(state: GameState): RoomId | null {
  const seen = state.people.filter(
    (p) => p.role !== 'police' && p.hp > 0 && isPersonVisible(state, p) && p.room !== state.playerRoom,
  );
  if (seen.length) {
    return seen.sort(
      (a, b) => dist(state.playerRoom, a.room) - dist(state.playerRoom, b.room),
    )[0].room;
  }
  const trails = visibleTrails(state).sort((a, b) => b.clock - a.clock);
  if (trails.length) return trails[0].to;
  const noises = visibleDisturbances(state).sort((a, b) => b.clock - a.clock);
  return noises.length ? noises[0].room : null;
}

const stat = { games: 0, wins: 0, timeout: 0, fail: 0, invalidHp: 0, stuck: 0 };
const reasons: Record<string, number> = {};
const agg = { kills: 0, wanted: 0, alarm: 0, turn: 0 };

function playOneGame(killer: string): void {
  const stealth = MODE === 'stealth';
  const tactics = MODE === 'tactics';
  const state = createGame(buildDeck(), generateMission(), killer);
  stat.games += 1;

  const hand = () => state.hand.filter((c) => CARD_MAP[c.defId] && CARD_MAP[c.defId].cost <= state.energy);
  const withOp = (op: string) => hand().filter((c) => has(c.defId, op));
  const hereAlive = () =>
    state.people.filter(
      (p) => p.role !== 'police' && p.room === state.playerRoom && p.hp > 0 && isPersonVisible(state, p),
    );
  const hereDowned = () =>
    state.people.filter((p) => p.role !== 'police' && p.room === state.playerRoom && p.hp <= 0);
  const hiddenHere = () => state.people.some((p) => p.room === state.playerRoom && p.hidden);

  let guard = 0;
  while (state.phase === 'playing' && guard < 160) {
    guard += 1;

    // 一回合内反复「移动 / 出牌 / 挥刀 / 搜索」，直到没招可出
    for (let act = 0; act < 16 && state.phase === 'playing'; act += 1) {
      // 1. 屋里有人倒地：处决优先
      if (hereDowned().length) {
        const fin = withOp('execute')[0];
        if (fin && playCard(state, fin.uid)) continue;
      }

      // 2. 有人藏在柜子里：先搜出来（同样消耗行动点）
      if (hiddenHere() && state.energy >= 1 && searchRoom(state)) continue;

      // 3. 屋里还站着人：先砍，再考虑磨刀——AP 有限，别把点花光了砍不动
      if (hereAlive().length) {
        if (stealth && state.wanted >= state.arrestThreshold - 2) {
          const cool = hand().filter((c) => COOL.includes(c.defId))[0];
          if (cool && playCard(state, cool.uid)) continue;
        }
        if (canAttack(state) && attack(state)) continue;
        if (state.energy > 2) {
          const buff = withOp('bonusDamage')[0];
          if (buff && playCard(state, buff.uid)) continue;
          const pin = withOp('pin')[0];
          if (pin && playCard(state, pin.uid)) continue;
        }
        break;
      }

      // 4. 没人：追最近的目标 / 脚印 / 动静，但至少留 1 点给下一刀
      const target = chaseTarget(state);
      if (target && target !== state.playerRoom && state.energy > 2) {
        const opts = ROOMS.map((r) => r.id).filter((r) => canMoveTo(state, r));
        if (opts.length) {
          const scored = opts
            .map((r) => ({ r, s: dist(r, target) }))
            .sort((a, b) => a.s - b.s);
          if (scored[0].s < dist(state.playerRoom, target) && movePlayer(state, scored[0].r)) continue;
        }
      }

      // 5. 彻底没线索：用情报牌
      const intel = withOp('scout')[0];
      if (intel && playCard(state, intel.uid)) continue;

      // 6. 还有闲钱就降温
      if (stealth) {
        const cool = hand().filter((c) => COOL.includes(c.defId))[0];
        if (cool && playCard(state, cool.uid)) continue;
      }
      break;
    }

    // 能力（有就放）
    if (state.phase === 'playing') {
      const kd = KILLERS.find((k) => k.owner === killer);
      const usable = (kd?.powers ?? []).filter((p) => canUsePower(state, p.id));
      if (usable.length) {
        const basic = usable.find((p) => !p.ultimate) ?? usable[0];
        usePower(state, basic.id);
      }
    }

    if (state.phase === 'playing') endTurn(state);
    if (state.people.some((p) => p.hp < 0)) stat.invalidHp += 1;
  }

  if (state.result === 'win') stat.wins += 1;
  else if (state.result === 'timeout') stat.timeout += 1;
  else stat.fail += 1;

  agg.kills += state.kills;
  agg.wanted += state.wanted;
  agg.alarm += state.alarm;
  agg.turn += state.turn;
  const reason = (state.resultReason ?? state.result ?? '?').replace(/[\d.]+/g, 'N');
  reasons[reason] = (reasons[reason] ?? 0) + 1;
  if (guard >= 160) stat.stuck += 1;
}

for (const killer of STARTER_KILLERS) {
  for (let i = 0; i < PER_KILLER; i++) playOneGame(killer);
}

const g = stat.games;
console.log(`整局冒烟：跑完 ${g} 局（${STARTER_KILLERS.length} 位开放杀手 × ${PER_KILLER}）`);
if (stat.invalidHp || stat.stuck) {
  console.log('结局分布', JSON.stringify(reasons, null, 2));
}

if (stat.invalidHp > 0) {
  console.log(`!! hp 越界 ${stat.invalidHp} 次`);
  process.exitCode = 1;
}
if (stat.stuck > 0) {
  console.log(`!! 有 ${stat.stuck} 局卡死`);
  process.exitCode = 1;
}
