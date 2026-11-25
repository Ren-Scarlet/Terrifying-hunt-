/**
 * 胜率抽样：一个「会打」的机器人，按职责选牌、朝情报移动、倒地就处决。
 * 用来抓「改动之后整体变简单/变难」的趋势，不是精确数值。
 *
 * 默认每杀手 3 局（39 局，约 0.1 秒）。要全量：GAMES=8 npm run check:sim
 */
import { CARDS, CARD_MAP } from '../src/game/data/cards';
import { KILLERS } from '../src/game/data/killers';
import {
  createGame,
  endTurn,
  movePlayer,
  playCard,
  usePower,
  canUsePower,
  canMoveTo,
  isPersonVisible,
} from '../src/game/engine';
import { ROOM_MAP, ROOMS } from '../src/game/rooms';
import { generateMission } from '../src/game/missions';
import type { GameState, RoomId } from '../src/game/types';

const has = (id: string, op: string): boolean => (CARD_MAP[id]?.ops ?? []).some((o) => o.op === op);
const damageOf = (id: string): number =>
  (CARD_MAP[id]?.ops ?? []).reduce((n, o) => (o.op === 'damage' ? n + ((o as any).amount ?? 0) : n), 0);

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
const PER_KILLER = Number(process.env.GAMES ?? 3);

function buildDeck(): string[] {
  const deck: string[] = [];
  const dmg = byOp('damage').sort((a, b) => damageOf(b) - damageOf(a));
  const push = (pool: string[], n: number) => {
    for (let i = 0; i < n && pool.length; i++) deck.push(pool[i % pool.length]);
  };
  push(dmg.slice(0, 6), 7);
  push(byOp('execute'), 3);
  push(byOp('scout'), 2);
  push(byOp('search'), 2);
  push(byOp('sabotage').concat(byOp('alarm'), byOp('lure'), byOp('stun')), 1);
  if (MODE === 'tactics') {
    push(CARDS.filter((c) => has(c.id, 'ambush')).map((c) => c.id), 2);
    push(CARDS.filter((c) => has(c.id, 'pursue')).map((c) => c.id), 2);
  }
  while (deck.length < 15) deck.push(dmg[0]);
  return deck;
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
  const byDamage = () =>
    hand().filter((c) => has(c.defId, 'damage')).sort((a, b) => damageOf(b.defId) - damageOf(a.defId));

  let guard = 0;
  while (state.phase === 'playing' && guard < 120) {
    guard += 1;

    // 0. 战术：进门之前先伏击
    if (tactics) {
      const visible = state.people.filter(
        (p) => p.role !== 'police' && p.hp > 0 && isPersonVisible(state, p) && p.room !== state.playerRoom,
      );
      if (visible.length) {
        const amb = withOp('ambush')[0];
        if (amb) playCard(state, amb.uid);
      }
    }

    // 1. 先移动再出牌：朝最近的可疑目标走
    for (let i = 0; i < 3; i++) {
      const known = state.people.filter((p) => p.role !== 'police' && p.hp > 0 && isPersonVisible(state, p));
      const sorted = [...known].sort((a, b) => dist(state.playerRoom, a.room) - dist(state.playerRoom, b.room));
      const target: RoomId | null = sorted.length ? sorted[0].room : null;
      if (target === state.playerRoom) break;
      const opts = ROOMS.map((r) => r.id).filter((r) => canMoveTo(state, r));
      if (!opts.length) break;
      const scored = opts
        .map((r) => ({ r, s: target ? dist(r, target) : state.explored.includes(r) ? 8 : 0 }))
        .sort((a, b) => a.s - b.s);
      movePlayer(state, scored[0].r);
      if (target && scored[0].r === target) break;
    }

    // 2. 同屋有倒地者 → 处决
    const here = state.people.filter(
      (p) => p.role !== 'police' && p.room === state.playerRoom && isPersonVisible(state, p),
    );
    if (here.some((p) => p.hp <= 0)) {
      const fin = withOp('execute')[0];
      if (fin) playCard(state, fin.uid);
    }

    // 3. 同屋有活人 → 打到倒地
    if (state.phase === 'playing') {
      for (let i = 0; i < 4; i++) {
        const alive = state.people.filter(
          (p) => p.role !== 'police' && p.room === state.playerRoom && p.hp > 0 && isPersonVisible(state, p),
        );
        if (!alive.length) break;
        if (stealth && alive.length > 1) break;
        if (stealth && state.wanted >= state.arrestThreshold - 2) {
          const cool = hand().filter((c) => COOL.includes(c.defId))[0];
          if (cool) playCard(state, cool.uid);
        }
        const atk = byDamage()[0];
        if (!atk || !playCard(state, atk.uid)) break;
        if (state.people.some((p) => p.room === state.playerRoom && p.hp <= 0)) break;
      }
    }

    // 3.5 战术：人跑了就追
    if (tactics) {
      const stillHere = state.people.some((p) => p.role !== 'police' && p.room === state.playerRoom && p.hp > 0);
      if (!stillHere) {
        const chase = withOp('pursue')[0];
        if (chase) {
          const before = state.playerRoom;
          playCard(state, chase.uid);
          if (state.playerRoom !== before) {
            const atk = byDamage()[0];
            if (atk) playCard(state, atk.uid);
          }
        }
      }
    }

    // 4. 没人可见 → 用情报牌
    if (state.phase === 'playing') {
      const nearby = state.people.filter((p) => p.role !== 'police' && p.hp > 0 && isPersonVisible(state, p));
      if (!nearby.length) {
        const scout = withOp('scout')[0];
        if (scout) playCard(state, scout.uid);
        const s2 = withOp('search')[0];
        if (s2 && state.energy >= CARD_MAP[s2.defId].cost) playCard(state, s2.uid);
      }
    }

    // 5. 能力
    if (state.phase === 'playing') {
      const kd = KILLERS.find((k) => k.owner === killer);
      const usable = (kd?.powers ?? []).filter((p) => canUsePower(state, p.id));
      if (usable.length) usePower(state, usable[0].id);
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
  if (guard >= 120) stat.stuck += 1;
}

for (const killer of KILLERS.map((k) => k.owner)) {
  for (let i = 0; i < PER_KILLER; i++) playOneGame(killer);
}

const g = stat.games;
console.log(
  `模拟 ${g} 局（${MODE}）：胜 ${stat.wins}（${((stat.wins / g) * 100).toFixed(0)}%）` +
    ` / 天亮 ${stat.timeout} / 其他失败 ${stat.fail} / 卡死 ${stat.stuck}`,
);
console.log(
  `均值：击杀 ${(agg.kills / g).toFixed(2)}　通缉 ${(agg.wanted / g).toFixed(2)}` +
    `　警戒 ${(agg.alarm / g).toFixed(2)}　回合 ${(agg.turn / g).toFixed(2)}`,
);
console.log('结局分布', JSON.stringify(reasons, null, 2));

if (stat.invalidHp > 0) {
  console.log(`!! hp 越界 ${stat.invalidHp} 次`);
  process.exitCode = 1;
}
if (stat.stuck > 0) {
  console.log(`!! 有 ${stat.stuck} 局卡死`);
  process.exitCode = 1;
}
