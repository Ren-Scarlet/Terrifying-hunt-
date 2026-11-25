/**
 * 规则回归：六条「手感」断言。
 * 这些是玩家反馈打磨出来的边界，改引擎时最先会破的就是它们。
 * 运行：npm run check
 */
import { CARD_MAP } from '../src/game/data/cards';
import { createGame, movePlayer, playCard } from '../src/game/engine';
import { OBSTACLE_ROOMS, ROOM_MAP } from '../src/game/rooms';
import { SURVIVOR_MAP } from '../src/game/survivors';
import type { GameState, RoomId } from '../src/game/types';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
}

function newGame(): GameState {
  const deck = ['silent_step', 'sprint', 'choke', 'shuriken', 'execute', 'clean', 'night_cover', 'aim'];
  return createGame(deck, undefined, '迈克尔·迈尔斯');
}

function handOf(state: GameState, defId: string): string | null {
  return state.hand.find((c) => c.defId === defId)?.uid ?? null;
}

/** 确保手牌里有这张牌（测试专用，绕过抽牌随机） */
function drawInto(state: GameState, defId: string): string {
  const uid = handOf(state, defId);
  if (uid) return uid;
  const found =
    state.drawPile.find((c) => c.defId === defId) ?? state.discardPile.find((c) => c.defId === defId);
  if (!found) throw new Error('牌库里没有 ' + defId);
  state.hand.push(found);
  state.drawPile = state.drawPile.filter((c) => c.uid !== found.uid);
  state.discardPile = state.discardPile.filter((c) => c.uid !== found.uid);
  return found.uid;
}

/**
 * 取一个「走得到」的隔壁房间。
 * 储藏室/地下室要破门，直接走会被引擎拒绝，测试会因为随机邻居而假失败。
 */
function openNeighbor(from: RoomId): RoomId {
  const cands = ROOM_MAP[from].neighbors.filter((r) => !OBSTACLE_ROOMS.includes(r));
  return cands[0] ?? ROOM_MAP[from].neighbors[0];
}

const player = (s: GameState) => s.people.find((p) => p.role !== 'police')!;

/** A：已经起疑的人，不打卡牌直接推门 → 当场跑掉 */
function caseBoltOnEnter(): void {
  const s = newGame();
  const v = player(s);
  const next = openNeighbor(s.playerRoom);
  v.room = next;
  v.alert = 100;
  movePlayer(s, next);
  const fled = v.room !== next;
  check('A 高警觉者被推门惊动会跑', fled, fled ? '跑到了 ' + v.room : '留在原地');
}

/** B：先打「静止隐身」再进门 → 没人察觉，可以白打一刀 */
function caseAmbush(): void {
  const s = newGame();
  const v = s.people.find(
    (p) => p.role !== 'police' && SURVIVOR_MAP[p.id]?.threat !== 'spiritual',
  )!;
  const next = openNeighbor(s.playerRoom);
  v.room = next;
  v.alert = 70;
  const before = v.alert;

  playCard(s, drawInto(s, 'silent_step'));
  movePlayer(s, next);
  const stayed = v.room === next;
  const delta = v.alert - before;
  check('B 伏击牌压住进门惊动', stayed && delta <= 0, `留在原地=${stayed}，警觉 ${delta >= 0 ? '+' : ''}${delta}`);

  const hp = v.hp;
  playCard(s, drawInto(s, 'choke'));
  check('B 伏击后第一刀能打中', v.hp < hp, `hp ${hp} → ${v.hp}`);
}

/** C：「疾速残暴」把两间房的距离抹平，追上去还能补刀 */
function casePursue(): void {
  const s = newGame();
  const v = player(s);
  const start = s.playerRoom;
  const hop1 = openNeighbor(start);
  const hop2 = ROOM_MAP[hop1].neighbors.find((r) => r !== start)!;
  v.room = hop2;
  v.hp = 1;
  v.intent = 'flee';

  playCard(s, drawInto(s, 'sprint'));
  const followed = s.playerRoom === v.room;
  check('C 追击牌能贴到目标房间', followed, `玩家在 ${s.playerRoom}，目标在 ${v.room}`);

  if (followed) {
    const hp = v.hp;
    playCard(s, drawInto(s, 'shuriken'));
    check('C 追上后能补刀', v.hp < hp, `hp ${hp} → ${v.hp}`);
  }
}

/** D：没打卡牌，一进门就被看见 → 对方当场跑，玩家来不及出手 */
function caseDefaultWindow(): void {
  const s = newGame();
  const v = player(s);
  const next = openNeighbor(s.playerRoom);
  v.room = next;
  v.alert = 66;
  movePlayer(s, next);
  const bolted = v.room !== next;
  check('D 不打卡牌就别想轻松追上', bolted, bolted ? '跑向 ' + v.room : '还留在原地');
}

/** E：背对着门、毫无防备的人，走进屋也不会惊动他 */
function caseUnaware(): void {
  const s = newGame();
  const v = player(s);
  const next = openNeighbor(s.playerRoom);
  v.room = next;
  v.alert = 0;
  v.hidden = false;
  movePlayer(s, next);
  const stayed = v.room === next;
  const attackable = s.people.some((p) => p.room === s.playerRoom && p.hp > 0);
  check('E 未察觉者不会凭空逃跑', stayed && attackable, `原地=${stayed}，可出手=${attackable}`);
}

/** F：屋里只剩倒地者时，攻击牌自动变成补刀 */
function caseFinisher(): void {
  const s = newGame();
  const v = player(s);
  v.room = s.playerRoom;
  v.hp = 0;
  v.alert = 0;
  const before = s.people.length;
  const ok = playCard(s, drawInto(s, 'shuriken'));
  const gone = s.people.length < before;
  check('F 倒地者能被攻击牌处决', ok && gone, ok ? (gone ? '已杀死' : 'hp=' + v.hp) : '牌被拒绝');
}

/** G：卡牌数据仍挂着正确的指令（防止改数据时把卡牌化设计退回去） */
function caseCardData(): void {
  const ambush = (CARD_MAP['silent_step']?.ops ?? []).some((o) => o.op === 'ambush');
  const pursue = (CARD_MAP['sprint']?.ops ?? []).some((o) => o.op === 'pursue');
  check('G 静止隐身带 ambush', ambush);
  check('G 疾速残暴带 pursue', pursue);
}

check('开局步数为 4', newGame().steps === 4, String(newGame().steps));
caseBoltOnEnter();
caseAmbush();
casePursue();
caseDefaultWindow();
caseUnaware();
caseFinisher();
caseCardData();

console.log(`\n规则回归 ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
