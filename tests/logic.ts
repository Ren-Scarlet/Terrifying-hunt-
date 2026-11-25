/**
 * 规则回归：玩家反馈打磨出来的边界，改引擎时最先会破的就是这些。
 * 运行：npm run check
 */
import { CARD_MAP, CARDS, STARTING_DECK, deckCardsForKiller } from '../src/game/data/cards';
import { KILLERS } from '../src/game/data/killers';
import {
  ARCH_LABEL,
  BASE_AP,
  BLEEDOUT_TURNS,
  DOWNED_LOCK_TURNS,
  HAND_LIMIT,
  drawCardAction,
  discardCard,
  FRENZY_AP_BONUS,
  SEARCH_COST,
  TEAM_STAGE_COUNT,
  conditionOf,
  GENERATOR_JAM_TURNS,
  SABOTAGE_COST,
  addAlarm,
  currentScore,
  sabotageSiteItem,
  attack,
  carryPerson,
  executeCarriedPerson,
  isRoomLit,
  missionTaskProgress,
  attackBlockReason,
  canAttack,
  canMoveTo,
  createGame,
  effectiveCost,
  endTurn,
  isPersonVisible,
  isRoomVisible,
  isLocked,
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
import { nearestOf, roomDistance } from '../src/game/navigation';

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

/** 房间导航模块：验证随机生成的房屋图最短路与候选点选择。 */

/** 新抽牌规则：每回合补 1 张、主动抽牌、六张上限、洗牌推进团队进度。 */
function caseDrawAndDiscardRules(): void {
  const s = newGame();
  check('抽牌规则：开局仍有 5 张手牌', s.hand.length === 5, `hand=${s.hand.length}`);
  const initialDeck = s.drawPile.length;
  s.people.forEach((p) => { p.alert = 0; p.item = null; p.itemUses = 0; });
  endTurn(s);
  check('抽牌规则：新回合只补 1 张且保留原手牌', s.hand.length === 6 && s.drawPile.length === initialDeck - 1, `hand=${s.hand.length} deck=${s.drawPile.length}`);

  const draw = newGame();
  draw.energy = 2;
  const before = draw.hand.length;
  const ok = drawCardAction(draw);
  check('抽牌规则：主动抽 1 张消耗 1 AP', ok && draw.hand.length === before + 1 && draw.energy === 1, `hand=${draw.hand.length} AP=${draw.energy}`);

  const discard = newGame();
  discard.hand = [...discard.hand, ...discard.hand.slice(0, 2).map((card, index) => ({ ...card, uid: `${card.uid}-extra-${index}` }))];
  const denied = !drawCardAction(discard);
  const selected = discard.hand[0].uid;
  const dropped = discardCard(discard, selected);
  check('抽牌规则：手牌超过 6 张必须先弃牌', denied && dropped && discard.hand.length === HAND_LIMIT && discard.discardPile.some((c) => c.uid === selected));
  check('抽牌规则：弃牌后恢复正常操作', discard.hand.length === HAND_LIMIT && drawCardAction(discard) && discard.hand.length === HAND_LIMIT + 1);

  const shuffle = newGame();
  shuffle.drawPile = [];
  shuffle.discardPile = [{ uid: 'reshuffle-test', defId: 'silent_step' }];
  const progress = shuffle.teamProgress;
  drawCardAction(shuffle);
  check('抽牌规则：牌库耗尽洗回弃牌堆并推进团队进度', shuffle.teamProgress >= progress + 5 && shuffle.hand.some((c) => c.uid === 'reshuffle-test'), `team=${progress}→${shuffle.teamProgress}`);

  const flee = newGame();
  const victim = player(flee);
  // 选一间至少有两个普通出口的房间，并让玩家与幸存者处于同一房间。
  // 原测试把玩家放在隔壁，实际没有覆盖 npcTurn 的「同屋最终逃跑」分支；
  // movesThisTurn 已满的隔壁幸存者按规则不会在这里额外移动。
  const escapeSetup = Object.values(ROOM_MAP).find((room) =>
    room.neighbors.filter((r) => !OBSTACLE_ROOMS.includes(r)).length >= 2,
  );
  if (escapeSetup) {
    flee.playerRoom = escapeSetup.id;
    victim.room = escapeSetup.id;
    victim.hp = 2;
    victim.alert = 100;
    victim.intent = 'flee';
    victim.hidden = false;
    victim.blockedTurns = 0;
    victim.movesThisTurn = 3;
    const beforeRoom = victim.room;
    endTurn(flee);
    check('回合结束：同屋幸存者即使移动次数用尽也会尝试逃跑', victim.room !== beforeRoom || !flee.people.some((p) => p.id === victim.id), `room=${victim.room}`);
  } else {
    check('回合结束：同屋幸存者即使移动次数用尽也会尝试逃跑', false, '随机户型没有两条可走出口');
  }
}

/** 迈尔斯尾随模式与杀手恐惧范围。 */
function caseMyersStalkingAndFearRadius(): void {
  const s = newGame();
  const victim = player(s);
  check('恐惧范围：普通杀手基础值默认为 1', s.fearRadius === 1);
  const next = openNeighbor(s.playerRoom);
  s.energy = 9;
  const beforeCost = moveCost(s, next);
  runOps(s, [{ op: 'flag', key: 'myersStalk' }]);
  check('迈尔斯：尾随者技能切换开启潜行模式', s.myersStalking);
  check('迈尔斯：尾随模式移动额外消耗 1 点行动点', moveCost(s, next) === beforeCost + 1);

  const stealth = newGame();
  const hiddenTarget = player(stealth);
  const stealthRoom = openNeighbor(stealth.playerRoom);
  hiddenTarget.room = stealthRoom;
  runOps(stealth, [{ op: 'flag', key: 'myersStalk' }]);
  stealth.energy = 9;
  movePlayer(stealth, stealthRoom);
  check('迈尔斯：尾随者模式进入幸存者所在房间也不会被察觉', hiddenTarget.alert === 0 && hiddenTarget.awareness === 0, `alert=${hiddenTarget.alert} awareness=${hiddenTarget.awareness}`);

  victim.room = s.playerRoom;
  const beforeStalk = s.stalkMeter;
  endTurn(s);
  check('迈尔斯：静止观察视野内幸存者会积累尾随值', s.stalkMeter > beforeStalk, `stalk=${s.stalkMeter}`);
  const normal = createGame(['silent_step'], undefined, '设陷者');
  check('恐惧范围：其他杀手仍保持默认 1', normal.fearRadius === 1);
}

function caseNavigationUtilities(): void {
  const state = newGame();
  const start = state.playerRoom;
  const neighbor = ROOM_MAP[start].neighbors[0];
  check('导航：同一房间距离为 0', roomDistance(start, start) === 0);
  check('导航：相邻房间距离为 1', roomDistance(start, neighbor) === 1);
  check('导航：最短距离具有对称性', roomDistance(start, neighbor) === roomDistance(neighbor, start));
  check('导航：候选列表优先选择起点本身', nearestOf(start, [neighbor, start]) === start);
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
  v3.hp = 4;
  v3.hidden = false;
  s3.energy = 3;
  s3.possessed = true;
  s3.possessTurns = 3;
  attack(s3, v3.id);
  check('F 迈尔斯恶魔附身一刀击倒健康幸存者', v3.hp === 0 && conditionOf(v3) === 'downed', `hp=${v3.hp}`);
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
  v.hp = 4;
  v.alert = 0;
  v.intent = 'idle';

  s.energy = 3;
  const first = attack(s);
  check('H 默认挥刀造成 1 点伤害', first && v.hp === 3 && conditionOf(v) === 'healthy', `hp ${v.hp}，行动点 ${s.energy}`);

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
  v.hp = 3;
  v.alert = 0;
  v.sneaky = false;
  s.energy = 3;
  const ok = attack(s);
  check('I 再受 1 点伤害后进入受伤状态', ok && v.hp === 2 && conditionOf(v) === 'injured', `hp ${v.hp}`);
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
  const hop2 = ROOM_MAP[hop1].neighbors.find((r) => r !== s.playerRoom);
  if (!hop2) {
    check('J 玩家走一步，逃跑的人也跟着动', true, '本局入口没有两跳走廊，跳过此布局');
    return;
  }
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
  );
  if (!hop2) {
    check('K 感知生效（地图上会浮出人影）', true, '本局没有两跳视野，跳过此布局');
    check('K 隔着两间屋仍看不出是谁', true, '本局没有两跳视野，跳过此布局');
    return;
  }
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
  v.hp = 4;
  s.energy = 3;
  // 固定随机源，避免开局道具与随机 NPC 行为影响痕迹回归。
  withRandomSource(() => 0.99, () => attack(s));
  s.people.forEach((p) => {
    p.alert = 0;
    p.intent = 'idle';
    p.hp = 4;
    p.movesThisTurn = 0;
  });
  const now = visibleTrails(s).length;
  for (let i = 0; i < 4; i++) s.trailClock += 1;
  const later = visibleTrails(s).length;
  s.trailClock += 1;
  const expired = visibleTrails(s).length;
  check('L 痕迹在 5 次行动内保留，之后自然过期', now > 0 && later > 0 && expired === 0, `${now} → ${later} → ${expired}`);
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

/** P：只看见玩家朝向正前方一格，身后仍受战争迷雾遮挡 */
function caseAdjacentHidden(): void {
  const s = newGame();
  const v = s.people.find((p) => p.role !== 'police' && p.trackedTurns === 0)!;
  const from = s.playerRoom;
  const next = openNeighbor(from);
  s.energy = 9;
  const moved = movePlayer(s, next);
  const center = (id: RoomId) => ({
    x: ROOM_MAP[id].rect.left + ROOM_MAP[id].rect.width / 2,
    y: ROOM_MAP[id].rect.top + ROOM_MAP[id].rect.height / 2,
  });
  const a = center(from);
  const b = center(next);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const front = ROOM_MAP[next].neighbors
    .filter((id) => id !== from)
    .map((id) => {
      const c = center(id);
      const vx = c.x - b.x;
      const vy = c.y - b.y;
      const d = Math.hypot(vx, vy) || 1;
      return { id, dot: (vx / d) * (dx / length) + (vy / d) * (dy / length) };
    })
    .sort((x, y) => y.dot - x.dot)[0];

  if (!moved || !front || front.dot <= 0.35) {
    check('P 玩家移动后能观察正前方一格房间', true, '本局布局没有可用的正前方相邻房间，跳过此布局');
    check('P 玩家身后的房间仍不可直接观察', true, '本局布局没有可用的前后房间组合，跳过此布局');
    return;
  }

  v.room = front.id;
  check('P 玩家移动后能观察正前方一格房间', isRoomVisible(s, front.id) && isPersonVisible(s, v), `正前方：${front.id}`);
  v.room = from;
  check('P 玩家身后的房间仍不可直接观察', !isRoomVisible(s, from) && !isPersonVisible(s, v), `身后：${from}`);
  check('P 相邻房间仍然算已探索（有轮廓）', isRoomExplored(s, from));
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
  v.hp = 4;
  v.sneaky = false;
  s.energy = 9;
  s.disturbances = [];
  attack(s);
  check('R 有人跑过会留下动静提示', visibleDisturbances(s).length > 0, `${visibleDisturbances(s).length} 处`);
}

/** S：他们的团队目标做满，玩家直接失败 */
function caseTeamGoal(): void {
  const s = newGame();
  s.teamStage = TEAM_STAGE_COUNT - 1;
  s.teamProgress = 90;
  const worker = s.people.find((p) => p.role !== 'police')!;
  worker.room = openNeighbor(s.playerRoom);
  worker.item = 'key';
  worker.itemUses = 1;
  worker.alert = 100;
  worker.hidden = false;
  endTurn(s);
  check('S 第四阶段完成后出现两个逃生点', s.teamStage === 4 && s.escapeRooms.length === 2, `stage=${s.teamStage} exits=${s.escapeRooms.join(',')}`);
  check('S 第四阶段不会立刻判负', s.result !== 'failed', s.resultReason);
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
  v.hp = 4;
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
  v.hp = 4;
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
  p3.alert = 100;
  s3.playerRoom = 'hall';
  const before = s3.teamProgress;
  endTurn(s3);
  check('Y 幸存者道具能推进团队进度', s3.teamProgress > before, `${before} → ${s3.teamProgress}`);
}

/** 本轮：擦刀 / 同屋目击者 / 守尸 / 袭警 / 道具次数 / 拉扯型 */
function caseNewMechanics() {
  check('Z 行动点上限为 4', BASE_AP === 4, `BASE_AP=${BASE_AP}`);
  const sacrifice = newGame();
  const sacrifices = sacrifice.people.filter((p) => p.role !== 'police' && p.bloodSacrifice);
  check('Z 每局恰好随机标记一名血祭品', sacrifices.length === 1, `count=${sacrifices.length}`);
  if (sacrifices[0]) {
    const beforeAlert = sacrifices[0].alert;
    runOps(sacrifice, [{ op: 'alert', who: 'bloodSacrifice', amount: 7 }]);
    check('Z DSL 可以单独选择血祭品', sacrifices[0].alert === beforeAlert + 7);
  }
  check('Z 拉扯型幸存者已注册', ARCH_LABEL.kiter === '拉扯型');
  check('Z 倒地 2 回合后才能补刀', DOWNED_LOCK_TURNS === 2 && BLEEDOUT_TURNS > DOWNED_LOCK_TURNS, `lock=${DOWNED_LOCK_TURNS} bleed=${BLEEDOUT_TURNS}`);
  const health = newGame();
  const healthy = health.people.find((p) => p.role !== 'police')!;
  check('Z 幸存者初始生命值为 4', healthy.hp === 4 && conditionOf(healthy) === 'healthy');
  healthy.hp = 2;
  check('Z 累计 2 点伤害后进入受伤', conditionOf(healthy) === 'injured');
  healthy.hp = 0;
  check('Z 再累计 2 点伤害后倒地', conditionOf(healthy) === 'downed');

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
  victim.hp = 4;
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
  pair[0].hp = 4;
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

caseMyersStalkingAndFearRadius();
caseNavigationUtilities();
caseMergeAndMissions();
caseDrawAndDiscardRules();

/** 本轮：人人可救援 / 主动赶去救 / 连杀之后团队进度被催快 */
function caseAidAndPressure(): void {
  const originalRandom = Math.random;

  // 同屋救援：把原型换成普通「警觉型」，验证不再只有救援型会拉人
  const a = newGame();
  a.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; p.hidden = false; p.hp = 4; });
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
  check('AA 非救援型也会拉起同屋倒地同伴', pair[0].hp === 2, `hp=${pair[0].hp} down=${pair[0].downedTurns}`);

  // 主动赶路：倒地的人在另一间屋，附近的人会放下手里的活往那边走
  const b = newGame();
  b.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; p.hidden = false; p.hp = 4; });
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
    w.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; p.hidden = false; p.hp = 4; });
    const room = w.objectiveRooms.find((r) => r !== w.playerRoom);
    if (!room) continue;
    const worker = w.people.filter((p) => p.role !== 'police')[0];
    worker.goal = 'objective';
    worker.room = room;
    worker.intent = 'idle';
    worker.alert = 0;
    worker.awareness = 2;
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


/** AB：组合契约、独立电闸联动、搬运与地形处决 */
function caseContractsPowerAndCarry(): void {
  const contract = newGame();
  check('AB 每局契约至少包含两个组合目标', (contract.mission.tasks?.length ?? 0) >= 2, String(contract.mission.tasks?.length));
  const alarmTask = { id: 'test-alarm', kind: 'no_alarm' as const, label: '阻止报警', target: 1 };
  check('AB 未发生报警时无报警目标保持完成', missionTaskProgress(contract, alarmTask) === 1);
  contract.npcAlarmed = true;
  check('AB 幸存者成功报警后无报警目标失败', missionTaskProgress(contract, alarmTask) === 0);
  check('AB 组合目标均为已支持类型', (contract.mission.tasks ?? []).every((task) => ['kill_count', 'marked_kill', 'execute', 'no_alarm', 'break_circuit'].includes(task.kind)));
  const grid = newGame();
  const circuit = grid.powerCircuits[0];
  const affected = circuit.affectedRooms[0];
  check('AB 区域初始有照明', isRoomLit(grid, affected));
  grid.people = [];
  grid.playerRoom = circuit.breakerRoom;
  grid.energy = BASE_AP;
  const broken = sabotageSiteItem(grid);
  check('AB 破坏独立电闸后对应区域断电', broken && circuit.broken && !isRoomLit(grid, affected));
  check('AB 其他供电回路仍保持照明', isRoomLit(grid, 'bedroom'));

  const carry = newGame();
  carry.people = carry.people.filter((p) => p.role !== 'police').slice(0, 1);
  const victim = carry.people[0];
  victim.room = carry.playerRoom; victim.hp = 0; victim.downedTurns = 2; carry.energy = 30;
  const picked = carryPerson(carry, victim.id);
  check('AB 玩家可以抱起同屋倒地幸存者', picked && carry.carryPersonId === victim.id);
  let frontier: Array<{ room: RoomId; path: RoomId[] }> = [{ room: carry.playerRoom, path: [] }];
  let route: RoomId[] = []; const seen = new Set<RoomId>([carry.playerRoom]);
  while (frontier.length && !route.length) {
    const current = frontier.shift()!;
    if (current.path.length === 3) { route = current.path; break; }
    for (const next of ROOM_MAP[current.room].neighbors) if (!seen.has(next)) { seen.add(next); frontier.push({ room: next, path: [...current.path, next] }); }
  }
  carry.freeMove = true; for (const room of route) movePlayer(carry, room);
  check('AB 搬运达到三间房后挣脱并恢复受伤状态', route.length === 3 && carry.carryPersonId === null && victim.hp === 2, 'route=' + route.length + ' hp=' + victim.hp);
  const special = newGame();
  special.people = special.people.filter((p) => p.role !== 'police').slice(0, 1);
  const target = special.people[0]; target.room = 'kitchen'; target.hp = 0; target.downedTurns = DOWNED_LOCK_TURNS;
  special.playerRoom = 'kitchen'; special.carryPersonId = target.id; special.carryDistance = 1; special.energy = BASE_AP;
  const executed = executeCarriedPerson(special, 'fridge');
  check('AB 厨房冰箱特殊处决会击杀目标并计入处决数', executed && special.executions === 1 && !special.people.some((p) => p.id === target.id));
  check('AB 地形处决会累计额外奖励分', special.specialExecutionBonus === 35, String(special.specialExecutionBonus));
}
caseContractsPowerAndCarry();

/** AB：封锁房门必须同时阻止 NPC 进入和离开；脚印不应随机消失 */
function caseNpcLocksAndPersistentTrails(): void {
  const locked = newGame();
  const survivor = player(locked);
  const lockedRoom = Object.values(ROOM_MAP).find((room) => room.neighbors.length >= 2)?.id ?? locked.playerRoom;
  survivor.room = lockedRoom;
  survivor.alert = 100;
  survivor.intent = 'flee';
  survivor.movesThisTurn = 0;
  locked.roomLocks[lockedRoom] = 3;
  const before = survivor.room;
  endTurn(locked);
  check('AB 被封锁房间内的 NPC 不能逃出', survivor.room === before && isLocked(locked, lockedRoom), `before=${before} after=${survivor.room}`);

  const outside = newGame();
  const target = player(outside);
  const from = outside.playerRoom;
  const lockedDestination = ROOM_MAP[from].neighbors.find((r) => !OBSTACLE_ROOMS.includes(r));
  if (lockedDestination) {
    outside.roomLocks[lockedDestination] = 3;
    target.room = from;
    target.alert = 100;
    target.intent = 'flee';
    const optionsBefore = ROOM_MAP[from].neighbors.filter((r) => r !== lockedDestination && !OBSTACLE_ROOMS.includes(r));
    target.room = lockedDestination;
    const start = target.room;
    endTurn(outside);
    check('AB 锁门房间中的 NPC 不会穿门逃出', target.room === start, `start=${start} end=${target.room} alternate exits=${optionsBefore.length}`);
  } else {
    check('AB 锁门房间中的 NPC 不会穿门逃出', true, '当前房间无普通相邻出口，跳过路径分支');
  }

  const tracks = newGame();
  const routeStart = Object.values(ROOM_MAP).find((room) =>
    room.neighbors.some((next) => ROOM_MAP[next].neighbors.some((exit) => exit !== room.id && !OBSTACLE_ROOMS.includes(exit))),
  );
  if (routeStart) {
    const next = routeStart.neighbors.find((candidate) =>
      ROOM_MAP[candidate].neighbors.some((exit) => exit !== routeStart.id && !OBSTACLE_ROOMS.includes(exit)),
    )!;
    const walker = player(tracks);
    tracks.playerRoom = routeStart.id;
    walker.room = next;
    walker.intent = 'flee';
    walker.alert = 100;
    walker.hp = 4;
    walker.sneaky = true;
    walker.movesThisTurn = 0;
    tracks.trails = [];
    tracks.energy = 9;
    movePlayer(tracks, next);
    const freshTrail = visibleTrails(tracks).find((trail) => trail.to === walker.room);
    check('AB 潜行 NPC 移动仍会留下脚印', !!freshTrail, `room=${walker.room} trails=${visibleTrails(tracks).length}`);
    tracks.trailClock += 4;
    check('AB 脚印在 5 次玩家行动内仍可追踪', visibleTrails(tracks).some((trail) => trail.to === walker.room));
  } else {
    check('AB 潜行 NPC 移动仍会留下脚印', true, '地图无可测试的两跳路线，跳过');
    check('AB 脚印在 5 次玩家行动内仍可追踪', true, '地图无可测试的两跳路线，跳过');
  }
}
caseNpcLocksAndPersistentTrails();

/** AC：开局日常、局部疑惑与对白状态 */
function caseNpcAwarenessAndDialogue(): void {
  const daily = newGame();
  const civilians = daily.people.filter((p) => p.role !== 'police');
  check('AC 幸存者开局处于日常认知阶段', civilians.every((p) => p.awareness === 0 && p.alert === 0));
  const beforeProgress = daily.teamProgress;
  endTurn(daily);
  check('AC 没有异常时幸存者不会启动团队逃生工作', daily.teamProgress === beforeProgress && civilians.every((p) => p.awareness === 0));
  check('AC 日常 NPC 会生成生活对白', civilians.every((p) => p.dialogue.length > 0));

  const suspicious = newGame();
  const target = player(suspicious);
  target.alert = 20;
  endTurn(suspicious);
  check('AC 低强度异常只让 NPC 起疑，不直接进入求生', target.awareness === 1 && target.intent === 'wary' && target.dialogue.length > 0);

  const panic = newGame();
  const witness = player(panic);
  witness.alert = 100;
  endTurn(panic);
  check('AC 高危信息让 NPC 进入求生并显示逃跑对白', witness.awareness === 3 && witness.dialogue.length > 0);
}
caseNpcAwarenessAndDialogue();

/** 新版通用卡池、限时情报与迈尔斯专属印记。 */
function caseNewPerkSystem(): void {
  const pool = deckCardsForKiller('迈克尔·迈尔斯');
  check('新版通用初始卡池恰好 12 张', pool.filter((card) => card.pool === 'initial').length === 12);
  check('迈尔斯专属卡恰好 3 张', pool.filter((card) => card.killerOnly === '迈克尔·迈尔斯').length === 3);
  check('初始牌组只使用新版通用卡牌', STARTING_DECK.length >= 10 && STARTING_DECK.every((id) => pool.some((card) => card.id === id) && !CARD_MAP[id]?.killerOnly));
  check('其他杀手构筑池不会出现迈尔斯专属卡', !deckCardsForKiller('设陷者').some((card) => card.killerOnly === '迈克尔·迈尔斯'));

  const lastBest = createGame(['myers_last_best'], undefined, '迈克尔·迈尔斯');
  lastBest.hand = [{ uid: 'test-last-best', defId: 'myers_last_best' }];
  lastBest.energy = 6;
  check('把最好的留在最后可以启用被动', playCard(lastBest, 'test-last-best') && lastBest.myersLastBestActive);
  const prey = lastBest.people.find((person) => person.role !== 'police')!;
  prey.room = lastBest.playerRoom;
  prey.hp = 4;
  prey.bloodSacrifice = false;
  lastBest.energy = 6;
  lastBest.attackReady = true;
  check('把最好的留在最后：攻击非血祭品获得独立印记', attack(lastBest, prey.id) && lastBest.myersLastBestMarks === 1);
  const beforeWipe = lastBest.energy;
  const wiped = wipeBlade(lastBest);
  check('擦刀移除两枚以内的终局印记，擦刀本身只消耗正常行动点', wiped && lastBest.myersLastBestMarks === 0 && lastBest.energy === beforeWipe - 1);

  const eclipse = createGame(['myers_eclipse_light'], undefined, '迈克尔·迈尔斯');
  const downed = eclipse.people.find((person) => person.role !== 'police')!;
  downed.room = eclipse.playerRoom;
  downed.hp = 1;
  downed.bloodSacrifice = false;
  eclipse.energy = 6;
  eclipse.attackReady = true;
  attack(eclipse, downed.id);
  eclipse.hand = [{ uid: 'test-eclipse', defId: 'myers_eclipse_light' }];
  eclipse.energy = 6;
  check('湮灭之光只能在击倒非血祭品后获得印记', playCard(eclipse, 'test-eclipse') && eclipse.myersEclipseMarks === 1);

  const food = createGame(['myers_plaything'], undefined, '迈克尔·迈尔斯');
  const sacrifice = food.people.find((person) => person.bloodSacrifice)!;
  sacrifice.room = food.playerRoom;
  food.energy = 6;
  food.hand = [{ uid: 'test-food-1', defId: 'myers_plaything' }];
  check('戏耍食物要求视野内有血祭品、获得印记并将其送出视线', playCard(food, 'test-food-1') && food.myersFoodMarks === 1 && !isPersonVisible(food, sacrifice));
  sacrifice.room = food.playerRoom;
  food.hand = [{ uid: 'test-food-2', defId: 'myers_plaything' }];
  const energyBeforeSecondFood = food.energy;
  check('戏耍食物每两枚印记增加 1 点行动点', playCard(food, 'test-food-2') && food.myersFoodMarks === 2 && food.energy === energyBeforeSecondFood);

  const hex = createGame(['hex_huntress'], undefined, '迈克尔·迈尔斯');
  hex.hand = [{ uid: 'test-hex', defId: 'hex_huntress' }];
  hex.energy = 6;
  playCard(hex, 'test-hex');
  const hexVictim = hex.people.find((person) => person.role !== 'police')!;
  hexVictim.room = hex.playerRoom;
  hexVictim.hp = 4;
  hexVictim.bloodSacrifice = false;
  hex.energy = 6;
  hex.attackReady = true;
  attack(hex, hexVictim.id);
  check('猎杀戾气：首次伤害幸存者后生成地图图腾', hex.hexHuntressUsed && hex.totems.length === 1);


  const noed = createGame(['hex_noed'], undefined, '迈克尔·迈尔斯');
  noed.teamStage = 4;
  noed.teamProgress = 100;
  noed.totems = ['attic'];
  noed.people.forEach((person) => { person.room = 'bedroom'; person.alert = 0; person.awareness = 0; });
  noed.hand = [{ uid: 'test-noed', defId: 'hex_noed' }];
  noed.energy = 6;
  const noedEnergy = noed.energy;
  playCard(noed, 'test-noed');
  const noedTarget = noed.people.find((person) => person.role !== 'police')!;
  noedTarget.room = noed.playerRoom;
  noedTarget.hp = 4;
  noed.energy = Math.max(noed.energy, 2);
  noed.attackReady = true;
  attack(noed, noedTarget.id);
  check('难逃一死：第四阶段且图腾存留时获得行动并一刀击倒', noed.hexNoedBonusGranted && noedTarget.hp === 0 && noed.energy >= noedEnergy - 2);

  const bitter = createGame(['bitter_murmur'], undefined, '迈克尔·迈尔斯');
  const worker = bitter.people.find((person) => person.role !== 'police')!;
  const fogRoom = (Object.keys(ROOM_MAP) as Array<keyof typeof ROOM_MAP>).find((room) => room !== bitter.playerRoom && !ROOM_MAP[bitter.playerRoom].neighbors.includes(room))!;
  worker.room = fogRoom;
  worker.intent = 'work';
  worker.goal = 'objective';
  worker.hidden = false;
  worker.trackedTurns = 0;
  worker.lastSeenTurn = 0;
  bitter.hand = [{ uid: 'test-bitter', defId: 'bitter_murmur' }];
  bitter.energy = 6;
  playCard(bitter, 'test-bitter');
  check('苦涩低语显示工作者两次行动但不泄露身份', (worker.revealedActions ?? 0) > 0 && !isPersonVisible(bitter, worker), `revealed=${worker.revealedActions ?? 0} visible=${isPersonVisible(bitter, worker)} room=${worker.room} player=${bitter.playerRoom}`);

  const reveal = createGame(['hell'], undefined, '迈克尔·迈尔斯');
  reveal.hand = [{ uid: 'test-hell', defId: 'hell' }];
  reveal.energy = 6;
  check('恶灵地狱启动周围一格的限时轮廓', playCard(reveal, 'test-hell') && reveal.revealAuraActions > 0);
}
caseNewPerkSystem();

console.log(`\n规则回归 ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
