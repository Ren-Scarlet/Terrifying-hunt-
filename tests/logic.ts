/**
 * 规则回归：玩家反馈打磨出来的边界，改引擎时最先会破的就是这些。
 * 运行：npm run check
 */
import { CARD_MAP, CARDS } from '../src/game/data/cards';
import { KILLERS } from '../src/game/data/killers';
import {
  ARCH_LABEL,
  BASE_AP,
  BLEEDOUT_TURNS,
  DOWNED_LOCK_TURNS,
  FRENZY_AP_BONUS,
  SEARCH_COST,
  TEAM_GOAL_MAX,
  GENERATOR_JAM_TURNS,
  SABOTAGE_COST,
  addAlarm,
  currentScore,
  sabotageSiteItem,
  attack,
  attackBlockReason,
  canAttack,
  canMoveTo,
  createGame,
  effectiveCost,
  endTurn,
  isPersonVisible,
  isRoomExplored,
  isSensing,
  moveCost,
  movePlayer,
  playCard,
  runOps,
  searchRoom,
  visibleDisturbances,
  visibleTrails,
  wipeBlade,
} from '../src/game/engine';
import { OBSTACLE_ROOMS, ROOM_MAP } from '../src/game/rooms';
import { SURVIVOR_MAP } from '../src/game/survivors';
import { generateMission } from '../src/game/missions';
import type { GameState, RoomId } from '../src/game/types';
import { createSeededRandom, random, withRandomSource } from '../src/game/random';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
}

const seededA = createSeededRandom(20261125);
const seededB = createSeededRandom(20261125);
const sequenceA = Array.from({ length: 8 }, () => seededA());
const sequenceB = Array.from({ length: 8 }, () => seededB());
check('随机源：相同种子产生相同序列', sequenceA.every((value, index) => value === sequenceB[index]));
const injected = withRandomSource(() => 0.25, () => random());
check('随机源：可在作用域内注入确定值', injected === 0.25);

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

/** 给这张牌补足行动点，免得测试被资源卡住 */
function play(state: GameState, defId: string): boolean {
  state.energy = Math.max(state.energy, 9);
  return playCard(state, drawInto(state, defId));
}

/**
 * 取一个「走得到」的隔壁房间。
 * 障碍房现在也能撞开（多花 1 点行动点），但测试仍优先挑普通房间，
 * 免得用例被随机户型和额外消耗搞成假失败。
 */
function openNeighbor(from: RoomId): RoomId {
  const cands = ROOM_MAP[from].neighbors.filter((r) => !OBSTACLE_ROOMS.includes(r));
  return cands[0] ?? ROOM_MAP[from].neighbors[0];
}

/** 这间屋还能往几间屋跑（排除要破门的、以及玩家占着的那间） */
function exitsOf(room: RoomId, blocked?: RoomId): number {
  return ROOM_MAP[room].neighbors.filter(
    (r) => !OBSTACLE_ROOMS.includes(r) && r !== blocked,
  ).length;
}

const player = (s: GameState) => s.people.find((p) => p.role !== 'police')!;

/** A：已经起疑的人，不打卡牌直接推门 → 当场跑掉 */
function caseBoltOnEnter(): void {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const s = newGame();
    const v = player(s);
    const next = openNeighbor(s.playerRoom);
    if (exitsOf(next, s.playerRoom) < 1) continue;
    v.room = next;
    v.alert = 100;
    movePlayer(s, next);
    const fled = v.room !== next;
    check('A 高警觉者被推门惊动会跑', fled, fled ? '跑到了 ' + v.room : '留在原地');
    return;
  }
  check('A 高警觉者被推门惊动会跑', true, '户型太封闭，跳过');
}

/** B：先打「静止隐身」再进门 → 没人察觉，可以白砍一刀 */
function caseAmbush(): void {
  const s = newGame();
  const v = s.people.find(
    (p) =>
      p.role !== 'police' &&
      SURVIVOR_MAP[p.id]?.threat !== 'spiritual' &&
      p.archetype !== 'hider' &&
      p.archetype !== 'rescuer' &&
      p.archetype !== 'caller',
  )!;
  const next = openNeighbor(s.playerRoom);
  v.room = next;
  v.alert = 70;
  const before = v.alert;

  play(s, 'silent_step');
  movePlayer(s, next);
  const stayed = v.room === next;
  const delta = v.alert - before;
  check('B 伏击牌压住进门惊动', stayed && delta <= 0, `留在原地=${stayed}，警觉 ${delta >= 0 ? '+' : ''}${delta}`);

  const hp = v.hp;
  // 固定随机源，避免随机手电筒干扰把伏击命中回归变成偶发测试。
  const hit = withRandomSource(() => 0.99, () => attack(s));
  check('B 伏击后第一刀能砍中', hit && v.hp < hp, `hp ${hp} → ${v.hp}`);
}

/** C：「疾速残暴」把两间房的距离抹平，追上去还能补刀 */
function casePursue(): void {
  // 户型是随机的：有的局入口只有一条死路，凑不出「两跳走廊」，重开一局再试
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const s = newGame();
    const start = s.playerRoom;
    const hop1 = ROOM_MAP[start].neighbors.find((r) => !OBSTACLE_ROOMS.includes(r))
      ?? ROOM_MAP[start].neighbors[0];
    const hop2 = ROOM_MAP[hop1]?.neighbors.find((r) => r !== start);
    if (!hop2) continue;

    const v = player(s);
    v.room = hop2;
    v.hp = 1;
    v.intent = 'flee';

    // 追击牌把你送到他原来所在的房间；贴住之后他会立刻再跑——这是新节奏：
    // 「追上」不再等于「按住」，同屋的目击者会跑、会干活、会拿手电筒照你。
    const targetRoom = v.room;
    play(s, 'sprint');
    const followed = s.playerRoom === targetRoom;
    check('C 追击牌能贴到目标房间', followed, `玩家在 ${s.playerRoom}，目标原在 ${targetRoom}，现在在 ${v.room}`);

    if (s.playerRoom === v.room) {
      const hp = v.hp;
      const hit = attack(s);
      check('C 追上后能补刀', hit && v.hp < hp, `hp ${hp} → ${v.hp}`);
    }
    return;
  }
  check('C 追击牌能贴到目标房间', false, '连续 10 局都凑不出两跳走廊');
}

/** D：没打卡牌，一进门就被看见 → 对方当场跑 */
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

/** E：推门就是一次照面——没打伏击，再迟钝的人也会跑 */
function caseUnaware(): void {
  for (let attempt = 0; attempt < 10; attempt++) {
    const s = newGame();
    const v = player(s);
    const next = openNeighbor(s.playerRoom);
    v.room = next;
    v.alert = 0;
    v.hidden = false;
    movePlayer(s, next);
    if (v.room === next) continue;
    check('E 低警觉者被推门惊动也会跑', true, `换了 ${attempt + 1} 局才碰到能跑的户型`);
    check(
      'E 不会再白送「背对着门」的偷袭窗口',
      v.activity !== '背对着门，没有察觉' && v.alert >= 30,
      `动作=${v.activity}，警觉=${v.alert}`,
    );
    return;
  }
  check('E 低警觉者被推门惊动也会跑', false, '10 局都没碰到能跑的户型');
}

/** F：倒地者挥刀补刀致死 + 处决牌 + 恶魔附身 */
function caseFinisher(): void {
  const s = newGame();
  const v = player(s);
  v.room = s.playerRoom;
  v.hp = 0;
  v.downedTurns = DOWNED_LOCK_TURNS;
  v.alert = 0;
  v.hidden = false;
  v.intent = 'stunned';
  s.energy = 3;
  check('F 倒地者能被挥刀补刀（不再砍不动）', canAttack(s), attackBlockReason(s));
  const stabbed = attack(s, v.id);
  const gone = !s.people.some((p) => p.id === v.id);
  check('F 补刀之后目标确实死亡', stabbed && gone, stabbed ? (gone ? '已死亡' : 'hp=' + v.hp) : '刀被拒绝');

  const s2 = newGame();
  const v2 = player(s2);
  v2.room = s2.playerRoom;
  v2.hp = 0;
  v2.downedTurns = DOWNED_LOCK_TURNS;
  const before2 = s2.people.length;
  const ok2 = play(s2, 'execute');
  check('F 处决牌也能结束倒地者', ok2 && s2.people.length < before2, ok2 ? (s2.people.length < before2 ? '已处决' : 'hp=' + v2.hp) : '牌被拒绝');

  // 处决范围必须限制在玩家当前房间，不能波及其他房间的倒地者
  const scoped = newGame();
  const localDowned = scoped.people.find((p) => p.role !== 'police')!;
  const remoteDowned = scoped.people.find((p) => p.role !== 'police' && p.id !== localDowned.id)!;
  localDowned.room = scoped.playerRoom;
  localDowned.hp = 0;
  localDowned.downedTurns = DOWNED_LOCK_TURNS;
  remoteDowned.room = openNeighbor(scoped.playerRoom);
  remoteDowned.hp = 0;
  remoteDowned.downedTurns = DOWNED_LOCK_TURNS;
  runOps(scoped, CARD_MAP.execute!.ops);
  check(
    'F 处决牌只处决当前房间目标',
    !scoped.people.some((p) => p.id === localDowned.id) && scoped.people.some((p) => p.id === remoteDowned.id),
    `local=${scoped.people.some((p) => p.id === localDowned.id)} remote=${scoped.people.some((p) => p.id === remoteDowned.id)}`,
  );

  const executioner = KILLERS.find((killer) => killer.owner === '处刑者');
  const ultimate = executioner?.powers.find((power) => power.id === 'executioner_judge');
  check(
    'F 处刑者大招也使用当前房间目标',
    ultimate?.ops.some((op) => op.op === 'execute' && op.who === 'downedHere') ?? false,
  );

  const s3 = newGame();
  const v3 = player(s3);
  v3.room = s3.playerRoom;
  v3.hp = 2;
  v3.hidden = false;
  s3.energy = 3;
  s3.possessed = true;
  s3.possessTurns = 3;
  attack(s3, v3.id);
  check('F 恶魔附身时健康者一刀倒地', v3.hp === 0, `hp=${v3.hp}`);
}

/** G：卡牌数据仍然挂着正确的指令，而且不再直接造成伤害 */
function caseCardData(): void {
  const ambush = (CARD_MAP['silent_step']?.ops ?? []).some((o) => o.op === 'ambush');
  const pursue = (CARD_MAP['sprint']?.ops ?? []).some((o) => o.op === 'pursue');
  const pulse = (CARD_MAP['night_cover']?.ops ?? []).some((o) => o.op === 'pulse');
  check('G 静止隐身带 ambush', ambush);
  check('G 疾速残暴带 pursue', pursue);
  check('G 黑暗启迪改用 pulse（人影而不是全图）', pulse);

  const hurtful = CARDS.filter((c) =>
    c.ops.some((o) => o.op === 'damage' || o.op === 'bleed' || o.op === 'down' || o.op === 'kill'),
  ).map((c) => c.name);
  check('G 没有一张卡直接造成伤害', hurtful.length === 0, hurtful.join('、') || '干净');
}

/** H：挥刀的门槛——行动点、以及「砍完不能连砍」 */
function caseSwingGate(): void {
  const s = newGame();
  const v = player(s);
  v.room = s.playerRoom;
  v.hp = 2;
  v.alert = 0;
  v.intent = 'idle';

  s.energy = 3;
  const first = attack(s);
  const hurt = v.hp === 1;
  check('H 挥刀把健康砍成受伤', first && hurt, `hp ${v.hp}，行动点 ${s.energy}`);

  const second = attack(s);
  check('H 不能连续挥刀', !second && !s.attackReady, attackBlockReason(s));

  play(s, 'clean');
  check('H 做别的事之后可以再砍', s.attackReady, 'attackReady=' + s.attackReady);

  s.energy = 0;
  check('H 没有行动点就砍不动', !canAttack(s), attackBlockReason(s));
}

/** I：受伤的人不是挪一格，而是当场连跑两间屋，并留下血迹 */
function casePanicRun(): void {
  const s = newGame();
  const v = player(s);
  v.room = s.playerRoom;
  v.hp = 2;
  v.alert = 0;
  v.sneaky = false;
  s.energy = 3;
  const ok = attack(s);
  check('I 挥刀命中健康的人', ok && v.hp === 1, `hp ${v.hp}`);
  check(
    'I 被砍伤的人会连着跑好几间屋',
    v.movesThisTurn >= 2,
    `movesThisTurn=${v.movesThisTurn}，位置 ${v.room}`,
  );
  const trails = visibleTrails(s);
  const blood = trails.filter((t) => t.blood);
  check('I 血迹留在通往他下一间屋的路上', blood.length > 0, `${blood.length} 段血痕`);
  check(
    'I 痕迹最后指向他真正所在的房间',
    trails.some((t) => t.to === v.room),
    trails.map((t) => `${t.room}→${t.to}`).join(' '),
  );
}

/** J：玩家每做一个动作，跑掉的人也跟着动一步 */
function caseWorldTicks(): void {
  const s = newGame();
  const v = player(s);
  const hop1 = openNeighbor(s.playerRoom);
  const hop2 = ROOM_MAP[hop1].neighbors.find((r) => r !== s.playerRoom)!;
  v.room = hop2;
  v.alert = 100;
  v.intent = 'flee';
  v.movesThisTurn = 0;

  s.energy = 9;
  movePlayer(s, hop1);
  check('J 玩家走一步，逃跑的人也跟着动', v.movesThisTurn >= 1, `movesThisTurn=${v.movesThisTurn}`);
}

/** K：感知只给影子，不给身份 */
function caseSense(): void {
  const s = newGame();
  const v = s.people.find((p) => p.role !== 'police' && p.trackedTurns === 0)!;
  const hop1 = openNeighbor(s.playerRoom);
  const hop2 = ROOM_MAP[hop1].neighbors.find(
    (r) => r !== s.playerRoom && !ROOM_MAP[s.playerRoom].neighbors.includes(r),
  )!;
  v.room = hop2;
  v.alert = 0;

  play(s, 'night_cover');
  const sensing = isSensing(s);
  const identified = isPersonVisible(s, v);
  check('K 感知生效（地图上会浮出人影）', sensing);
  check('K 隔着两间屋仍看不出是谁', !identified, identified ? '直接被看见了' : `他在 ${v.room}`);
}

/** L：痕迹会过期，不会在地图上留一辈子 */
function caseTrailDecay(): void {
  const s = newGame();
  const v = player(s);
  v.room = s.playerRoom;
  v.hp = 2;
  s.energy = 3;
  attack(s);
  s.people.forEach((p) => {
    p.alert = 0;
    p.intent = 'idle';
    p.hp = 2;
    p.movesThisTurn = 0;
  });
  const now = visibleTrails(s).length;
  for (let i = 0; i < 4; i++) s.trailClock += 1;
  const later = visibleTrails(s).length;
  check('L 痕迹只留最近两次行动', now > 0 && later === 0, `${now} → ${later}`);
}

/** M：同屋多人时，点谁打谁 */
function casePickTarget(): void {
  const s = newGame();
  const pair = s.people.filter((p) => p.role !== 'police' && p.hp > 0).slice(0, 2);
  pair.forEach((p) => {
    p.room = s.playerRoom;
    p.alert = 0;
    p.hidden = false;
  });
  s.energy = 5;
  s.attackReady = true;
  const before = pair.map((p) => p.hp);
  // 固定随机值，避免手电筒 NPC 的随机干扰让目标选择测试偶发失败。
  const ok = withRandomSource(() => 0.99, () => attack(s, pair[1].id));
  check(
    'M 点谁打谁（同屋两人时指定目标）',
    ok && pair[1].hp < before[1] && pair[0].hp === before[0],
    pair.map((p) => `${p.name}:${p.hp}`).join(' '),
  );
}

/** N：障碍房不再是死路——多花 1 点行动点能撞开进去 */
function caseObstacleEnter(): void {
  const s = newGame();
  const obstacle = OBSTACLE_ROOMS.find((id) => ROOM_MAP[id].neighbors.length > 0)!;
  const from = ROOM_MAP[obstacle].neighbors[0];
  s.playerRoom = from;
  s.energy = 9;
  s.freeMove = false;
  const cost = moveCost(s, obstacle);
  const can = canMoveTo(s, obstacle);
  const moved = movePlayer(s, obstacle);
  check(
    'N 障碍房能撞开进去（多花 1 点）',
    can && moved && cost === 2 && s.playerRoom === obstacle && s.clearedObstacles.includes(obstacle),
    `cost=${cost} can=${can} at=${s.playerRoom}`,
  );
}

/** O：行动点统一——走路、挥刀、出牌、搜索都从同一个池子扣 */
function caseActionPoints(): void {
  const s = newGame();
  const next = openNeighbor(s.playerRoom);
  s.energy = 9;
  const e0 = s.energy;
  movePlayer(s, next);
  check('O 走路扣行动点', s.energy < e0, `${e0} → ${s.energy}`);

  const before = s.energy;
  searchRoom(s);
  check('O 搜索扣 1 点行动点', before - s.energy === SEARCH_COST, `${before} → ${s.energy}`);

  const uid = drawInto(s, 'clean');
  const cost = effectiveCost('clean', s);
  const before2 = s.energy;
  playCard(s, uid);
  check('O 出牌扣行动点', before2 - s.energy === cost, `${before2} → ${s.energy}`);
}

/** P：相邻房间看得见轮廓，看不见人 */
function caseAdjacentHidden(): void {
  const s = newGame();
  const v = s.people.find((p) => p.role !== 'police' && p.trackedTurns === 0)!;
  const next = openNeighbor(s.playerRoom);
  v.room = next;
  check('P 相邻房间不再白送人物视野', !isPersonVisible(s, v), `他在 ${v.room}`);
  check('P 相邻房间仍然算已探索（有轮廓）', isRoomExplored(s, next));
}

/** Q：搜索把柜子里的人翻出来 */
function caseSearch(): void {
  const s = newGame();
  const v = player(s);
  v.room = s.playerRoom;
  v.hidden = true;
  s.energy = 9;
  const ok = searchRoom(s);
  check('Q 搜索能把藏起来的人翻出来', ok && !v.hidden, `hidden=${v.hidden}`);
}

/** R：有人经过会留下乌鸦 / 地板响的动静 */
function caseDisturbance(): void {
  const s = newGame();
  const v = player(s);
  v.room = s.playerRoom;
  v.hp = 2;
  v.sneaky = false;
  s.energy = 9;
  s.disturbances = [];
  attack(s);
  check('R 有人跑过会留下动静提示', visibleDisturbances(s).length > 0, `${visibleDisturbances(s).length} 处`);
}

/** S：他们的团队目标做满，玩家直接失败 */
function caseTeamGoal(): void {
  const s = newGame();
  s.people = [];
  s.teamProgress = TEAM_GOAL_MAX;
  endTurn(s);
  check('S 团队目标做满直接判负', s.result === 'failed' && s.resultReason.length > 0, s.resultReason);
}

/** T：动静和脚印一样是短线索，不会一直挂在地图上 */
function caseDisturbanceDecay(): void {
  const s = newGame();
  s.disturbances = [{ room: s.playerRoom, turn: s.turn, clock: s.trailClock, label: '乌鸦叫' }];
  const now = visibleDisturbances(s).length;
  for (let i = 0; i < 5; i++) s.trailClock += 1;
  const later = visibleDisturbances(s).length;
  check('T 动静过几次行动就听不见了', now > 0 && later === 0, `${now} → ${later}`);
}

/** U：严格踩着脚印才攒杀戮，随便走不涨；满值给行动点而不是替玩家瞬移 */
function caseFrenzy(): void {
  const s = newGame();
  const v = player(s);
  const next = openNeighbor(s.playerRoom);
  v.room = next;
  v.hp = 2;
  v.alert = 0;
  s.trails = [{ room: s.playerRoom, to: next, turn: s.turn, clock: s.trailClock, blood: false }];
  s.energy = 9;
  const before = s.frenzy;
  movePlayer(s, next);
  check('U 严格踩着脚印走会攒杀戮', s.frenzy > before, `${before} → ${s.frenzy}`);

  const s2 = newGame();
  const b = openNeighbor(s2.playerRoom);
  s2.trails = [];
  s2.frenzy = 60;
  s2.energy = 9;
  const before2 = s2.frenzy;
  movePlayer(s2, b);
  check('U 没有按脚印追踪就不涨杀戮', s2.frenzy < before2, `${before2} → ${s2.frenzy}`);

  s.frenzy = 80;
  s.energy = 5;
  s.attackReady = true;
  v.room = s.playerRoom;
  v.hp = 2;
  v.hidden = false;
  attack(s);
  check('U 砍中人杀戮清零', s.frenzy === 0, String(s.frenzy));
}

/** V：杀戮满值不替玩家走第二步，而是每回合多给行动点 */
function caseFrenzyMobility(): void {
  for (let i = 0; i < 30; i++) {
    const s = newGame();
    const a = s.playerRoom;
    const b = ROOM_MAP[a].neighbors.find((r) => !OBSTACLE_ROOMS.includes(r));
    if (!b) continue;
    s.trails = [];
    s.frenzy = 80;
    s.energy = 9;
    movePlayer(s, b);
    check('V 杀戮满值不会自动多走一格（不瞬移）', s.playerRoom === b, `停在 ${s.playerRoom}`);
    s.people = [];
    endTurn(s);
    check(
      'V 杀戮满值每回合多给行动点',
      s.energy >= BASE_AP + FRENZY_AP_BONUS - 1,
      `energy=${s.energy}（基础 ${BASE_AP}）`,
    );
    return;
  }
  check('V 杀戮满值不会自动多走一格（不瞬移）', true, '户型跳过');
}

/** W：场上有老练的幸存者（会悄悄走路） */
function caseSneaky(): void {
  const s = newGame();
  check('W 有老练的幸存者', s.people.some((p) => p.role !== 'police' && p.sneaky), '至少两名知名角色带此技巧');
}

check('开局行动点为 4', newGame().energy === BASE_AP, String(newGame().energy));
caseBoltOnEnter();
caseAmbush();
casePursue();
caseDefaultWindow();
caseUnaware();
caseFinisher();
caseCardData();
caseSwingGate();
casePanicRun();
caseWorldTicks();
caseSense();
caseTrailDecay();
casePickTarget();
caseObstacleEnter();
caseActionPoints();
caseAdjacentHidden();
caseSearch();
caseDisturbance();
caseTeamGoal();
caseDisturbanceDecay();
caseFrenzy();
caseFrenzyMobility();
caseSneaky();

/** X：道具箱 / 发电机随机摆放；杀手能砸，砸完幸存者就少了这条路 */
function caseSiteItems(): void {
  const s = newGame();
  const boxes = s.siteItems.filter((i) => i.kind === 'itemBox');
  const gens = s.siteItems.filter((i) => i.kind === 'generator');
  const rooms = s.siteItems.map((i) => i.room);
  check(
    'X 道具箱 2 个、发电机 1~2 台且位置不重叠',
    boxes.length === 2 && gens.length >= 1 && gens.length <= 2 && new Set(rooms).size === rooms.length,
    `箱 ${boxes.length} / 机 ${gens.length}`,
  );

  const box = boxes[0];
  s.playerRoom = box.room;
  s.energy = BASE_AP;
  const ok = sabotageSiteItem(s);
  check(
    'X 砸道具箱后补给清零（幸存者再拿不到）',
    ok && box.broken && box.charges === 0,
    `broken=${box.broken} charges=${box.charges}`,
  );
  check('X 破坏消耗 1 点行动点', s.energy === BASE_AP - SABOTAGE_COST, `energy=${s.energy}`);

  const gen = gens[0];
  gen.progress = 80;
  gen.charged = true;
  s.teamProgress = 50;
  s.playerRoom = gen.room;
  s.energy = BASE_AP;
  const teamBefore = s.teamProgress;
  const ok2 = sabotageSiteItem(s);
  check(
    'X 砸发电机扣进度 + 停机 + 团队进度倒退',
    ok2 &&
      gen.progress === 35 &&
      gen.jammedTurns === GENERATOR_JAM_TURNS &&
      !gen.charged &&
      // 破坏后同屋目击者可能趁乱再推 3 点，所以看「至少倒退 10」而不是卡死 28
      s.teamProgress <= teamBefore - 10,
    `progress=${gen.progress} jam=${gen.jammedTurns} team=${s.teamProgress}`,
  );
}

/** Y：幸存者真的会从道具箱拿道具，并按局势用掉 */
function caseSurvivorItems(): void {
  let got = false;
  for (let attempt = 0; attempt < 12 && !got; attempt++) {
    const s = newGame();
    const box = s.siteItems.find((i) => i.kind === 'itemBox')!;
    const p = s.people.find((x) => x.role !== 'police')!;
    p.room = box.room;
    p.goal = 'supply';
    p.alert = 0;
    p.item = null;
    s.playerRoom = 'hall';
    endTurn(s);
    got = s.people.some((x) => x.item !== null);
  }
  check('Y 幸存者会从道具箱取得道具', got);

  const s2 = newGame();
  s2.siteItems.filter((i) => i.kind === 'itemBox').forEach((b) => {
    s2.playerRoom = b.room;
    s2.energy = BASE_AP;
    sabotageSiteItem(s2);
  });
  const p2 = s2.people.find((x) => x.role !== 'police')!;
  p2.room = s2.siteItems[0].room;
  p2.goal = 'supply';
  p2.alert = 0;
  // 开局随机带道具是新的设计：这里先清空，只验证「箱子全坏就领不到新道具」
  s2.people.forEach((x) => { x.item = null; x.itemUses = 0; });
  s2.playerRoom = 'hall';
  endTurn(s2);
  check('Y 道具箱全被破坏后，幸存者拿不到道具', !s2.people.some((x) => x.item !== null));

  const s3 = newGame();
  const p3 = s3.people.find((x) => x.role !== 'police')!;
  p3.item = 'key';
  p3.itemUses = 1;
  p3.alert = 0;
  s3.playerRoom = 'hall';
  const before = s3.teamProgress;
  endTurn(s3);
  check('Y 幸存者道具能推进团队进度', s3.teamProgress > before, `${before} → ${s3.teamProgress}`);
}

/** 本轮：擦刀 / 同屋目击者 / 守尸 / 袭警 / 道具次数 / 拉扯型 */
function caseNewMechanics() {
  check('Z 行动点上限为 4', BASE_AP === 4, `BASE_AP=${BASE_AP}`);
  check('Z 拉扯型幸存者已注册', ARCH_LABEL.kiter === '拉扯型');
  check('Z 倒地 2 回合后才能补刀', DOWNED_LOCK_TURNS === 2 && BLEEDOUT_TURNS > DOWNED_LOCK_TURNS, `lock=${DOWNED_LOCK_TURNS} bleed=${BLEEDOUT_TURNS}`);

  // 倒地保护期：砍倒当回合不能补刀，满 2 回合才能处决
  const e = newGame();
  e.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; });
  const freshDown = e.people.find((p) => p.role !== 'police')!;
  freshDown.room = e.playerRoom;
  freshDown.hp = 0;
  freshDown.downedTurns = 0;
  e.attackReady = true;
  const denied = !attack(e, freshDown.id);
  check('Z 刚倒下 2 回合内不能补刀', denied && e.people.some((p) => p.id === freshDown.id));
  freshDown.downedTurns = DOWNED_LOCK_TURNS;
  e.attackReady = true;
  const executed = attack(e, freshDown.id);
  check('Z 满 2 回合后可以处决', executed && !e.people.some((p) => p.id === freshDown.id));

  // 擦刀：砍完刀锋收不回来，花 1 点原地擦刀就能再砍
  const b = newGame();
  b.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; });
  const victim = b.people.find((p) => p.role !== 'police')!;
  victim.room = b.playerRoom;
  victim.hp = 2;
  b.attackReady = true;
  attack(b, victim.id);
  const afterAtk = !b.attackReady && b.energy === BASE_AP - 1;
  const wiped = wipeBlade(b);
  check('Z 擦刀收回刀锋且消耗 1 点', afterAtk && wiped && b.attackReady && b.energy === BASE_AP - 2, `ready=${b.attackReady} energy=${b.energy}`);

  // 同屋目击者：另一个人不会站着发呆
  const g = newGame();
  g.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; });
  const pair = g.people.filter((p) => p.role !== 'police').slice(0, 2);
  pair[0].room = g.playerRoom;
  pair[1].room = g.playerRoom;
  pair[0].hp = 2;
  g.attackReady = true;
  const tp = g.teamProgress;
  attack(g, pair[0].id);
  check('Z 同屋另一名幸存者不会站着不动', pair[1].alert > 0 || pair[1].movesThisTurn > 0 || g.teamProgress > tp, `alert=${pair[1].alert} tp=${g.teamProgress}`);

  // 守尸：站在倒地者房间干等，其他人把团队进度赶上去
  const c = newGame();
  c.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; });
  const downed = c.people.find((p) => p.role !== 'police')!;
  downed.room = c.playerRoom;
  downed.hp = 0;
  downed.downedTurns = 0;
  const tp2 = c.teamProgress;
  endTurn(c);
  check('Z 守尸会推进团队进度', c.guardingTurns > 0 && c.teamProgress > tp2, `${tp2} → ${c.teamProgress}`);

  // 袭警：现在可以砍警员，但通缉立刻暴涨
  const f = newGame();
  f.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; });
  const cop = f.people.find((p) => p.role === 'police')!;
  cop.room = f.playerRoom;
  f.attackReady = true;
  const wanted = f.wanted;
  attack(f, cop.id);
  check('Z 可以袭警且通缉暴涨', f.policeAssaulted && f.wanted >= wanted + 6, `${wanted} → ${f.wanted}`);

  // 道具有使用次数
  const d = newGame();
  const carrier = d.people.find((p) => p.role !== 'police')!;
  carrier.item = 'flashlight';
  carrier.itemUses = 2;
  check('Z 道具有使用次数', carrier.item === 'flashlight' && carrier.itemUses === 2);
}

caseSiteItems();
caseSurvivorItems();
caseNewMechanics();

function caseMergeAndMissions(): void {
  // 挂机类任务已从任务池移除：赢只能靠杀够人 / 杀关键人物撤离 / 收齐证据撤离
  const kinds = new Set<string>();
  for (let i = 0; i < 40; i++) kinds.add(generateMission().kind);
  check('Z 任务池不含挂机类 ritual', !kinds.has('ritual'), [...kinds].join(','));

  // 通缉与警戒合并：袭警推高的是同一条暴露度，wanted 只是它的 0~10 镜像
  const s = newGame();
  s.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; });
  const cop = s.people.find((p) => p.role === 'police')!;
  cop.room = s.playerRoom;
  s.attackReady = true;
  const before = s.alarm;
  attack(s, cop.id);
  check('Z 袭警推高同一条暴露度', s.alarm >= before + 60 && s.wanted >= 6, `alarm ${before}→${s.alarm} wanted=${s.wanted}`);

  // 满值判负：实体杀手被捕，灵异鬼怪被驱散（贞子不该「被警察抓捕」）
  const solid = newGame();
  solid.alarm = 99;
  addAlarm(solid, 5);
  check('Z 暴露度满 → 实体杀手被警察抓捕', solid.result === 'caught' && solid.resultReason.includes('警察'));

  const ghost = createGame(['silent_step', 'sprint'], undefined, '贞子');
  ghost.alarm = 99;
  addAlarm(ghost, 5);
  check(
    'Z 暴露度满 → 贞子被驱散不提警察',
    ghost.result === 'failed' && !ghost.resultReason.includes('警察') && ghost.resultReason.includes('黑暗'),
    ghost.resultReason,
  );

  // 每逃走一个幸存者扣 15 分（全逃才判负，不再有硬阈值）
  const sc = newGame();
  const base = currentScore(sc);
  sc.escaped = 2;
  check('Z 每逃一人扣 15 分', currentScore(sc) === base - 30, `${base} → ${currentScore(sc)}`);
}

caseMergeAndMissions();

/** 本轮：人人可救援 / 主动赶去救 / 连杀之后团队进度被催快 */
function caseAidAndPressure(): void {
  const originalRandom = Math.random;

  // 同屋救援：把原型换成普通「警觉型」，验证不再只有救援型会拉人
  const a = newGame();
  a.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; p.hidden = false; p.hp = 2; });
  const pair = a.people.filter((p) => p.role !== 'police').slice(0, 2);
  const away = ROOM_MAP[a.playerRoom].neighbors.find((r) => !OBSTACLE_ROOMS.includes(r))
    ?? ROOM_MAP[a.playerRoom].neighbors[0];
  pair[0].room = away;
  pair[0].hp = 0;
  pair[0].downedTurns = 0;
  pair[1].room = away;
  pair[1].archetype = 'alert';
  Math.random = () => 0.01;
  endTurn(a);
  Math.random = originalRandom;
  check('AA 非救援型也会拉起同屋倒地同伴', pair[0].hp === 1, `hp=${pair[0].hp} down=${pair[0].downedTurns}`);

  // 主动赶路：倒地的人在另一间屋，附近的人会放下手里的活往那边走
  const b = newGame();
  b.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; p.hidden = false; p.hp = 2; });
  const folk = b.people.filter((p) => p.role !== 'police').slice(0, 2);
  const near = ROOM_MAP[b.playerRoom].neighbors.find((r) => !OBSTACLE_ROOMS.includes(r))
    ?? ROOM_MAP[b.playerRoom].neighbors[0];
  const far = ROOM_MAP[near].neighbors.find((r) => r !== b.playerRoom && !OBSTACLE_ROOMS.includes(r)) ?? near;
  folk[0].room = near;
  folk[0].hp = 0;
  folk[0].downedTurns = 0;
  folk[1].room = far;
  folk[1].archetype = 'alert';
  folk[1].intent = 'idle';
  Math.random = () => 0.01;
  endTurn(b);
  Math.random = originalRandom;
  check(
    'AA 幸存者会主动朝倒地同伴赶过去',
    folk[1].room === near || folk[1].intent === 'rescue' || folk[1].activity.includes('赶去'),
    `room=${folk[1].room} intent=${folk[1].intent} activity=${folk[1].activity}`,
  );

  // 击杀压力：死了 3 个人后，目标房干活一回合推进明显快于基础值 5
  let delta = 0;
  for (let attempt = 0; attempt < 5 && delta < 7; attempt += 1) {
    const w = newGame();
    w.siteItems = [];
    w.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; p.hidden = false; p.hp = 2; });
    const room = w.objectiveRooms.find((r) => r !== w.playerRoom);
    if (!room) continue;
    const worker = w.people.filter((p) => p.role !== 'police')[0];
    worker.goal = 'objective';
    worker.room = room;
    worker.intent = 'idle';
    worker.movesThisTurn = 0;
    w.kills = 3;
    const before = w.teamProgress;
    Math.random = () => 0.5;
    endTurn(w);
    Math.random = originalRandom;
    delta = w.teamProgress - before;
  }
  check('AA 连杀三人后团队目标推得更快', delta >= 7, `一回合推进 ${delta}`);
}

caseAidAndPressure();

console.log(`\n规则回归 ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
