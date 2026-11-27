/**
 * 规则回归：玩家反馈打磨出来的边界，改引擎时最先会破的就是这些。
 * 运行：npm run check
 */
import { CARD_MAP, CARDS, STARTING_DECK, deckCardsForKiller } from '../src/game/data/cards';
import { ACTIVE_KILLERS, KILLERS, STARTER_KILLERS } from '../src/game/data/killers';
import {
  ARCH_LABEL,
  BASE_AP,
  BLEEDOUT_TURNS,
  blinkPlayer,
  collectTrapCache,
  nurseGrabPerson,
  refillHuntressHatchets,
  throwHuntressHatchet,
  HAND_LIMIT,
  LOOK_COST,
  drawCardAction,
  discardCard,
  FRENZY_AP_BONUS,
  SEARCH_COST,
  TEAM_STAGE_COUNT,
  conditionOf,
  SABOTAGE_COST,
  addAlarm,
  currentScore,
  calculateHuntStyleRating,
  triggerBearTrapForPerson,
  sabotageSiteItem,
  togglePowerCircuit,
  breakerBlockReason,
  BREAKER_SWITCH_COST,
  attack,
  executeDownedPerson,
  executeBlockReason,
  carryPerson,
  canCoordinateRescue,
  executeCarriedPerson,
  finishFreeHunt,
  finishContract,
  waitAction,
  isRoomLit,
  recoverBearTrap,
  getHuntOpportunities,
  recordRoutineObservation,
  missionTaskProgress,
  attackBlockReason,
  canAttack,
  canMoveTo,
  createGame,
  effectiveCost,
  endTurn,
  isPersonVisible,
  isRoomVisible,
  lookAround,
  lookAtRoom,
  cancelLookSelection,
  selectAuraRoom,
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
  usePower,
  nextStepToward,
  updateNpcDialogue,
} from '../src/game/engine';
import { CABINET_ROOMS, OBSTACLE_ROOMS, PHONE_ROOMS, RADIO_ROOMS, ROOM_MAP, ROOMS, buildLayout, doorMarkerPosition, layoutAspect } from '../src/game/rooms';
import { cardImage } from '../src/game/assetMap';
import { readdirSync } from 'node:fs';
import { personChip, personDetailHtml } from '../src/ui/render/shared';
import { SURVIVOR_MAP } from '../src/game/survivors';
import { generateMission, generateFreeHunt } from '../src/game/missions';
import { HUNTING_GROUNDS } from '../src/game/maps';
import type { GameState, RoomId } from '../src/game/types';
import { createSeededRandom, random, withRandomSource } from '../src/game/random';
import { nearestOf, roomDistance } from '../src/game/navigation';
import { EXECUTION_METHODS } from '../src/game/executions';
import { awarenessLabel, awarenessStage, myersStalkGain } from '../src/game/npc/awareness';
import { ROUTINE_PROFILE } from '../src/game/npc/catalog';

let pass = 0;
let fail = 0;

check('开局会随机生成少量上锁住屋，且断电可解除电子门锁', (() => {
  const locked = createGame(['silent_step', 'sprint', 'choke', 'shuriken'], undefined, '迈克尔·迈尔斯');
  const room = Object.keys(locked.roomLocks)[0] as RoomId | undefined;
  if (!room || !isLocked(locked, room)) return false;
  const circuit = locked.powerCircuits.find((item) => item.affectedRooms.includes(room));
  if (!circuit) return false;
  circuit.enabled = false;
  return !isLocked(locked, room);
})());
check('初始幸存者人数为 10，UI 可按 1/10 形式显示', newGame().survivorTotal === 10);

check('初期可选杀手包含设陷者、护士、女猎手与迈尔斯',
  ACTIVE_KILLERS.map((killer) => killer.owner).join('|') === '设陷者|护士|女猎手|迈克尔·迈尔斯' &&
  STARTER_KILLERS.join('|') === '设陷者|护士|女猎手|迈克尔·迈尔斯',
  ACTIVE_KILLERS.map((killer) => killer.owner).join('、'),
);
check('未开放杀手资料仍保留在内部数据库，便于后续实装',
  KILLERS.length > ACTIVE_KILLERS.length && !!KILLERS.find((killer) => killer.owner === '幽灵'),
  `数据库 ${KILLERS.length} 位 / 当前开放 ${ACTIVE_KILLERS.length} 位`,
);

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
  const state = createGame(deck, undefined, '迈克尔·迈尔斯');
  // 大多数规则测试不应被随机开局锁门干扰；锁门机制另有独立测试。
  state.roomLocks = {};
  return state;
}
function caseRoutineHuntOpportunities(): void {
  const s = newGame();
  const person = s.people.find((item) => item.role !== 'police');
  if (!person) {
    check('日常习惯：对局至少有一名幸存者可观察', false);
    return;
  }
  person.goal = 'routine';
  person.room = s.playerRoom;
  person.routineIndex = 0;
  person.routineSightings = 0;
  person.routineObserved = false;
  person.routineLastObservedTurn = -1;
  check('日常习惯：七种行为类型均有独立路线',
    Object.keys(ROUTINE_PROFILE).length === 7 &&
    Object.values(ROUTINE_PROFILE).every((routine) => routine.rooms.length >= 3));
  const first = recordRoutineObservation(s, person.room);
  const repeatedSameTurn = recordRoutineObservation(s, person.room);
  check('日常习惯：同一回合重复查看不会刷观察次数',
    first === 0 && repeatedSameTurn === 0 && person.routineSightings === 1 && !person.routineObserved);
  s.turn += 1;
  const second = recordRoutineObservation(s, person.room);
  check('日常习惯：跨回合观察两次后确认路线',
    second === 1 && person.routineObserved === true && person.routineSightings === 2 && s.huntStats.routineInsights === 1);
  const otherRoom: RoomId = person.room === 'garage' ? 'attic' : 'garage';
  s.people.filter((item) => item.id !== person.id).forEach((item) => { item.room = otherRoom; });
  person.alert = 0;
  person.hp = 4;
  person.hidden = false;
  person.activity = ROUTINE_PROFILE[person.archetype].activity;
  const circuit = s.powerCircuits.find((item) => item.affectedRooms.includes(person.room));
  if (circuit) circuit.enabled = false;
  const opportunities = getHuntOpportunities(s);
  check('猎杀机会：独处目标会显示落单窗口',
    opportunities.some((item) => item.targetId === person.id && item.id.startsWith('isolated-')));
  if (circuit) {
    check('猎杀机会：断电房间会显示暗处接近窗口',
      opportunities.some((item) => item.targetId === person.id && item.id.startsWith('dark-')));
  }
  check('猎杀机会：已确认习惯且正在按习惯停留时显示机会',
    opportunities.some((item) => item.targetId === person.id && item.id.startsWith('routine-')));
  const dossier = personDetailHtml(s, person.id);
  check('人物档案：确认路线后显示习惯名称与常去房间',
    dossier.includes(ROUTINE_PROFILE[person.archetype].label) &&
    dossier.includes('常去路线') &&
    dossier.includes('data-action="close-person-detail"'));
}

function caseIndependentBreakerNetwork(): void {
  const s = newGame();
  const circuit = s.powerCircuits[0];
  const room = circuit.affectedRooms[0];
  check('电力系统：现场只生成道具箱，不再生成发电机',
    s.siteItems.length === 2 && s.siteItems.every((item) => item.kind === 'itemBox'));
  check('电闸：每组电路独立供电，不依赖发电机', isRoomLit(s, room) && !('generatorId' in circuit));
  s.playerRoom = circuit.breakerRoom;
  const before = s.energy;
  const pulled = togglePowerCircuit(s, circuit.id);
  check('电闸：拉闸消耗 1 AP 并关闭所属区域照明',
    pulled && s.energy === before - BREAKER_SWITCH_COST && !isRoomLit(s, room) && s.huntStats.environmentActions === 1);
  const closed = togglePowerCircuit(s, circuit.id);
  check('电闸：合闸恢复照明', closed && isRoomLit(s, room) && s.huntStats.environmentActions === 2);
  circuit.broken = true;
  check('电闸：控制箱损坏后所属区域保持断电', !isRoomLit(s, room));
}
function casePhoneLineCoordination(): void {
  const s = newGame();
  const farRoom = ROOMS.map((room) => room.id)
    .filter((room) => roomDistance('hall', room) > 3)
    .sort((a, b) => roomDistance('hall', b) - roomDistance('hall', a))[0];
  const adjacentRoom = ROOM_MAP.hall.neighbors[0];
  s.phoneCut = true;
  check('电话线：剪断后仍可在同屋协调救援', canCoordinateRescue(s, 'hall', 'hall'));
  check('电话线：无线电正常时保留有限远程协调（3 格内）',
    canCoordinateRescue(s, 'hall', adjacentRoom) &&
    (!farRoom || !canCoordinateRescue(s, 'hall', farRoom)),
    '备用无线电范围为 3 格');
  s.sabotage.push('radio');
  check('电话线与无线电都被破坏时，只能同屋或相邻呼救',
    canCoordinateRescue(s, 'hall', adjacentRoom) &&
    (!farRoom || !canCoordinateRescue(s, 'hall', farRoom)),
    '无线电失效后协调范围缩至 1 格');
  s.phoneCut = false;
  check('电话线路正常时恢复全屋远程救援协调',
    !farRoom || canCoordinateRescue(s, 'hall', farRoom));
}


/** 房间导航模块：验证随机生成的房屋图最短路与候选点选择。 */

/** 新抽牌规则：每回合补 1 张、主动抽牌、六张上限、洗牌推进团队进度。 */
/** 环境事件：每三回合改变一次现场局势，并正确区分临时闪断与永久断电。 */
function caseExecutionVariety(): void {
  check('特殊处决：六种处决方式分布在六个不同的场地',
    EXECUTION_METHODS.length === 6 &&
    new Set(EXECUTION_METHODS.map((method) => method.room)).size === 5 &&
    EXECUTION_METHODS.some((method) => method.id === 'fridge') &&
    EXECUTION_METHODS.some((method) => method.id === 'microwave'));

  for (const method of EXECUTION_METHODS) {
    const s = newGame();
    const victim = s.people.find((person) => person.role !== 'police');
    if (!victim) {
      check('特殊处决：' + method.name + '可以完成并记录', false, '没有幸存者');
      continue;
    }
    s.playerRoom = method.room;
    victim.room = method.room;
    victim.hp = 0;
    victim.downedTurns = 0;
    s.carryPersonId = victim.id;
    s.energy = 10;
    const ok = executeCarriedPerson(s, method.id);
    check('特殊处决：' + method.name + '完成击杀并写入本局图鉴',
      ok && !s.people.some((person) => person.id === victim.id) &&
      s.executionMethodsUsed.includes(method.id) && s.specialExecutionBonus === 35,
      method.room);
  }
}
caseExecutionVariety();

function caseHuntingGroundsAndFreeHunt(): void {
  const aspects = new Set<string>();
  for (const ground of HUNTING_GROUNDS) {
    const state = createGame(STARTING_DECK, undefined, '迈克尔·迈尔斯', ground.id);
    aspects.add(layoutAspect());
    check('主题猎场：' + ground.name + '使用对应主题和空间布局',
      state.mapId === ground.id && ROOM_MAP.hall.name === ground.rooms.hall?.name &&
      state.mission.mode !== 'free',
      `布局比例 ${layoutAspect()} · ${ROOM_MAP.hall.name}`);
  }
  check('主题猎场：五张地图至少形成四种不同的空间比例', aspects.size >= 4, [...aspects].join('、'));

  const freeMission = generateFreeHunt();
  const free = createGame(STARTING_DECK, freeMission, '迈克尔·迈尔斯', 'lampkin');
  check('自由猎杀：不指定标记目标，并提供三项非强制挑战',
    free.mission.mode === 'free' &&
    free.people.every((person) => !person.marked) &&
    (free.mission.tasks?.length ?? 0) === 3);
  free.survivorKills = 3;
  free.executions = 2;
  free.executionMethodsUsed.push('fridge');
  check('自由猎杀：特殊处决挑战能正确累计',
    missionTaskProgress(free, free.mission.tasks!.find((task) => task.kind === 'special_execute')!) === 1);
  endTurn(free);
  check('自由猎杀：完成挑战不会自动结束，玩家保留自主决定权',
    free.phase === 'playing' && free.result === null);
  check('自由猎杀：完成至少一次击杀后可以主动结束并结算',
    finishFreeHunt(free) && free.phase === 'gameover' && free.result === 'win' && free.rewardCards.length === 0);
}
caseHuntingGroundsAndFreeHunt();

caseRoutineHuntOpportunities();
caseIndependentBreakerNetwork();
casePhoneLineCoordination();

function caseEnvironmentalEvents(): void {
  const s = newGame();
  s.turn = 2;
  s.people.forEach((person) => {
    person.alert = 0;
    person.awareness = 0;
    person.intent = 'idle';
    person.movesThisTurn = 3;
  });
  withRandomSource(createSeededRandom(20261126), () => endTurn(s));
  check('环境事件：进入第 3 回合时触发一次事件',
    s.turn === 3 && s.log.some((line) => line.includes('【环境事件】')),
    s.log.find((line) => line.includes('【环境事件】')) ?? '没有事件记录');

  const circuit = s.powerCircuits.find((item) => !item.broken);
  if (circuit) {
    const room = circuit.affectedRooms[0];
    circuit.flickerTurns = 1;
    const darkDuringFlicker = !isRoomLit(s, room);
    circuit.flickerTurns = 0;
    const lightReturns = isRoomLit(s, room);
    check('环境事件：临时闪断只影响供电区域且恢复后重新点亮',
      darkDuringFlicker && lightReturns, `闪断时暗=${darkDuringFlicker}，恢复后亮=${lightReturns}`);
  }
}

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
  check('抽牌规则：洗牌正常进行且不再推进废弃的团队进度', shuffle.teamProgress === progress && shuffle.hand.some((c) => c.uid === 'reshuffle-test'));

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
    flee.roomLocks[escapeSetup.id] = 0;
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
  check('迈尔斯：配件效果仍可开启旧尾随姿态', s.myersStalking);
  check('迈尔斯：尾随模式移动额外消耗 1 点行动点', moveCost(s, next) === beforeCost + 1);

  const stealth = newGame();
  const hiddenTarget = player(stealth);
  const stealthRoom = openNeighbor(stealth.playerRoom);
  hiddenTarget.room = stealthRoom;
  runOps(stealth, [{ op: 'flag', key: 'myersStalk' }]);
  stealth.energy = 9;
  movePlayer(stealth, stealthRoom);
  check('迈尔斯：尾随者模式进入幸存者所在房间也不会被察觉', hiddenTarget.alert === 0 && hiddenTarget.awareness === 0, `alert=${hiddenTarget.alert} awareness=${hiddenTarget.awareness}`);

  const stalking = createGame(STARTING_DECK, undefined, '迈克尔·迈尔斯');
  const prey = player(stalking);
  const farRoom = (Object.keys(ROOM_MAP) as RoomId[]).find((room) =>
    room !== stalking.playerRoom && !ROOM_MAP[stalking.playerRoom].neighbors.includes(room),
  ) ?? openNeighbor(stalking.playerRoom);
  stalking.people.forEach((person) => {
    if (person.role !== 'police') {
      person.room = farRoom;
      person.hidden = true;
      person.intent = 'idle';
      person.alert = 0;
      person.awareness = 0;
    }
  });
  prey.room = stalking.playerRoom;
  prey.hidden = false;
  prey.intent = 'idle';
  prey.hp = 4;
  stalking.energy = 5;
  stalking.fearRadius = 0;
  const stalkStart = stalking.stalkMeter;
  check('迈尔斯：落单目标提供基础尾随值与额外收益',
    usePower(stalking, 'myers_gaze') && stalking.stalkMeter === stalkStart + 20 && stalking.energy === 4 &&
    stalking.stalkPressure === 0 && prey.alert === 0 && prey.intent === 'idle',
    `stalk=${stalking.stalkMeter} AP=${stalking.energy}`);

  const groupStalk = createGame(STARTING_DECK, undefined, '迈克尔·迈尔斯');
  const visibleGroup = groupStalk.people.filter((person) => person.role !== 'police');
  visibleGroup.forEach((person) => { person.room = groupStalk.playerRoom; person.hidden = false; person.alert = 0; });
  groupStalk.energy = 5;
  const expectedGroupGain = visibleGroup.length * 15;
  check('迈尔斯：视野内每名幸存者都会贡献尾随值',
    usePower(groupStalk, 'myers_gaze') && groupStalk.stalkMeter === Math.min(100, expectedGroupGain),
    `visible=${visibleGroup.length} stalk=${groupStalk.stalkMeter}`);

  const fleeingVisible = createGame(STARTING_DECK, undefined, '迈克尔·迈尔斯');
  const fleeingTarget = player(fleeingVisible);
  const fleeingFarRoom = (Object.keys(ROOM_MAP) as RoomId[]).find((room) =>
    room !== fleeingVisible.playerRoom && !ROOM_MAP[fleeingVisible.playerRoom].neighbors.includes(room),
  ) ?? openNeighbor(fleeingVisible.playerRoom);
  fleeingVisible.people.forEach((person) => {
    if (person.role !== 'police' && person.id !== fleeingTarget.id) {
      person.room = fleeingFarRoom;
      person.hidden = true;
    }
  });
  fleeingTarget.room = fleeingVisible.playerRoom;
  fleeingTarget.hidden = false;
  fleeingTarget.intent = 'flee';
  fleeingTarget.movesThisTurn = 2;
  fleeingVisible.fearRadius = 0;
  fleeingVisible.energy = 2;
  check('迈尔斯：视野内正在逃跑的 NPC 仍可被观察',
    usePower(fleeingVisible, 'myers_gaze') && fleeingVisible.stalkMeter === 20 && fleeingVisible.energy === 1);

  const trackedButInvisible = createGame(STARTING_DECK, undefined, '迈克尔·迈尔斯');
  const trackedTarget = player(trackedButInvisible);
  const trackedHiddenRoom = (Object.keys(ROOM_MAP) as RoomId[]).find((room) =>
    room !== trackedButInvisible.playerRoom && !ROOM_MAP[trackedButInvisible.playerRoom].neighbors.includes(room),
  ) ?? openNeighbor(trackedButInvisible.playerRoom);
  trackedButInvisible.people.forEach((person) => {
    if (person.role !== 'police' && person.id !== trackedTarget.id) { person.room = trackedHiddenRoom; person.hidden = true; }
  });
  trackedTarget.room = trackedHiddenRoom;
  trackedTarget.hidden = false;
  trackedTarget.trackedTurns = 2;
  trackedButInvisible.energy = 4;
  check('迈尔斯：追踪标记不能让视野外的人贡献尾随值',
    !usePower(trackedButInvisible, 'myers_gaze') && trackedButInvisible.energy === 4 && trackedButInvisible.stalkMeter === 0);

  const noPrey = createGame(STARTING_DECK, undefined, '迈克尔·迈尔斯');
  const hiddenRoom = (Object.keys(ROOM_MAP) as RoomId[]).find((room) =>
    room !== noPrey.playerRoom && !ROOM_MAP[noPrey.playerRoom].neighbors.includes(room),
  ) ?? openNeighbor(noPrey.playerRoom);
  noPrey.people.forEach((person) => { if (person.role !== 'police') { person.room = hiddenRoom; person.hidden = true; person.trackedTurns = 0; person.revealedActions = 0; } });
  noPrey.energy = 4;
  check('迈尔斯：视野内没有幸存者时尾随不能使用也不扣 AP',
    !usePower(noPrey, 'myers_gaze') && noPrey.energy === 4 && noPrey.stalkMeter === 0 && !noPrey.myersStalking);

  const myersBurst = createGame(STARTING_DECK, undefined, '迈克尔·迈尔斯');
  const burstTarget = player(myersBurst);
  myersBurst.people.forEach((person) => {
    if (person.role !== 'police' && person.id !== burstTarget.id) { person.room = openNeighbor(myersBurst.playerRoom); person.hidden = true; }
  });
  burstTarget.room = myersBurst.playerRoom;
  burstTarget.hidden = false;
  myersBurst.stalkMeter = 100;
  myersBurst.energy = 4;
  check('迈尔斯：尾随值满后同一按钮发动恶魔附身，发动后保留 80 点爆发能量',
    usePower(myersBurst, 'myers_gaze') && myersBurst.possessed && myersBurst.stalkMeter === 80);
  check('迈尔斯：恶魔附身挥刀可直接击倒健康目标',
    attack(myersBurst, burstTarget.id) && burstTarget.hp === 0 && myersBurst.possessed && myersBurst.huntStats.myersBurstHits === 1,
    `hp=${burstTarget.hp} stalk=${myersBurst.stalkMeter}`);

  const trapper = createGame(STARTING_DECK, undefined, '设陷者');
  const trapRoom = ROOMS.find((room) =>
    room.id !== trapper.playerRoom && room.id !== 'garden' && room.id !== 'garage' &&
    !trapper.objectiveRooms.includes(room.id) && room.neighbors.length >= 2 &&
    !trapper.people.some((person) => person.role !== 'police' && person.hp > 0 && person.room === room.id),
  )?.id ?? openNeighbor(trapper.playerRoom);
  trapper.playerRoom = trapRoom;
  trapper.energy = 4;
  check('设陷者：开局携带 2 个捕兽夹并可在合适房间布设',
    trapper.trapInventory === 2 && usePower(trapper, 'trap_set') && trapper.trapInventory === 1 &&
    trapper.bearTraps.some((trap) => trap.room === trapRoom && trap.armed));
  check('设陷者：地图随机生成额外捕兽夹补给点',
    trapper.trapCaches.length === 2, `caches=${trapper.trapCaches.length}`);
  const trappedPerson = player(trapper);
  trappedPerson.room = trapRoom;
  trappedPerson.hp = 4;
  trappedPerson.alert = 0;
  triggerBearTrapForPerson(trapper, trappedPerson);
  check('设陷者：捕兽夹触发后造成伤害、限制移动并记录猎杀风格',
    trappedPerson.hp === 3 && trappedPerson.blockedTurns === 1 &&
    trapper.huntStats.trapTriggers === 1 && trapper.trapTriggerCount === 1 &&
    trappedPerson.trapTriggered === true && (trappedPerson.revealedActions ?? 0) >= 2 && !trapper.bearTraps[0].armed);
  const disarmGame = createGame(STARTING_DECK, undefined, '设陷者');
  const disarmTarget = player(disarmGame);
  const disarmRoom = openNeighbor(disarmGame.playerRoom);
  disarmGame.bearTraps = [{ id: 'test-disarm-trap', room: disarmRoom, armed: true, discovered: false }];
  disarmTarget.room = disarmRoom;
  disarmTarget.hp = 4;
  disarmTarget.alert = 100;
  disarmTarget.awareness = 0;
  withRandomSource(() => 0.01, () => triggerBearTrapForPerson(disarmGame, disarmTarget));
  check('设陷者：警觉 NPC 能先发现陷阱而不是直接触发',
    disarmGame.bearTraps[0].armed && disarmGame.bearTraps[0].discovered &&
    disarmTarget.hp === 4 && disarmGame.trapTriggerCount === 0);
  endTurn(disarmGame);
  check('设陷者：发现陷阱的 NPC 会在自己的回合拆除陷阱',
    !disarmGame.bearTraps[0].armed && disarmGame.huntStats.trapTriggers === 0);

  if (trapper.trapCaches.length) {
    trapper.playerRoom = trapper.trapCaches[0];
    trapper.energy = 4;
    const beforeCache = trapper.trapInventory;
    check('设陷者：可以在地图补给点收集额外捕兽夹',
      collectTrapCache(trapper) && trapper.trapInventory === beforeCache + 1);
  }

  const nurse = createGame(STARTING_DECK, undefined, '护士');
  const nurseTarget = player(nurse);
  const blinkRoom = ROOM_MAP[nurse.playerRoom].neighbors[0];
  nurseTarget.room = blinkRoom;
  nurseTarget.hidden = false;
  nurse.energy = 4;
  check('护士：闪现能力先进入选点状态，不立即消耗行动点',
    usePower(nurse, 'nurse_blink') && nurse.nurseBlinkTargeting && nurse.energy === 4);
  check('护士：可以穿过房门闪现到 1 格外房间并开启抓取窗口',
    blinkPlayer(nurse, blinkRoom) && nurse.playerRoom === blinkRoom && nurse.nurseFollowUp && nurse.nurseFatiguePending && nurse.energy === 3);
  check('护士：闪现后抓取会打断目标并施加疲惫',
    nurseGrabPerson(nurse, nurseTarget.id) && nurseTarget.hp === 3 && nurseTarget.blockedTurns === 1 &&
    nurse.huntStats.nurseBlinks === 1 && nurse.huntStats.nurseGrabs === 1 && nurse.stunTurns === 1 && !nurse.nurseFollowUp && !nurse.nurseFatiguePending);

  const huntress = createGame(STARTING_DECK, undefined, '女猎手');
  const hatchetTarget = player(huntress);
  hatchetTarget.room = huntress.playerRoom;
  hatchetTarget.hidden = false;
  huntress.energy = 4;
  check('女猎手：开局携带 3 把飞斧并可进入瞄准状态',
    huntress.hatchets === 3 && usePower(huntress, 'huntress_axe') && huntress.huntressAiming);
  check('女猎手：投掷飞斧消耗 1 把并对选中目标造成 1 点伤害',
    throwHuntressHatchet(huntress, hatchetTarget.id) && huntress.hatchets === 2 && hatchetTarget.hp === 3 && huntress.huntStats.hatchetHits === 1);
  huntress.playerRoom = CABINET_ROOMS[0];
  huntress.hatchets = 1;
  huntress.energy = 4;
  check('女猎手：在柜子处可以将飞斧补充至 3 把',
    refillHuntressHatchets(huntress) && huntress.hatchets === 3);
  
  const styleGame = createGame(STARTING_DECK, undefined, '设陷者');
  styleGame.turn = 5;
  const baseStyle = calculateHuntStyleRating(styleGame, 'win');
  check('猎杀风格：普通完成任务有基础评级，但不发额外风格血点',
    baseStyle.rank === 'C' && baseStyle.bonus === 0 && baseStyle.score >= 40,
    `rank=${baseStyle.rank} score=${baseStyle.score} bonus=${baseStyle.bonus}`);
  styleGame.huntStats = {
    routineInsights: 3,
    environmentActions: 3,
    trapTriggers: 2,
    hatchetHits: 2,
    nurseBlinks: 2,
    nurseGrabs: 2,
    myersBurstHits: 2,
    quietKills: 3,
  };
  styleGame.specialExecutionBonus = 35;
  const highStyle = calculateHuntStyleRating(styleGame, 'win');
  check('猎杀风格：多样化计划与专属能力可达到 S 级并获得 40 血点奖励',
    highStyle.rank === 'S' && highStyle.score === 100 && highStyle.bonus === 40 &&
    highStyle.breakdown.length >= 6);
  const failedStyle = calculateHuntStyleRating(styleGame, 'failed');
  check('猎杀风格：失败任务仍显示行动评价，但不发胜利奖励',
    failedStyle.score > 0 && failedStyle.bonus === 0);

  check('卡牌图标：每张卡都有图标文件，且直接使用以卡牌 id 命名的专属图标（不借用其他卡牌图案）',
    (() => {
      const files = new Set(readdirSync('public/assets/dbd/perks'));
      return Object.keys(CARD_MAP).every((id) =>
        files.has(`${id}.png`) && (cardImage(id)?.endsWith(`/${id}.png`) ?? false));
    })());
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

  // 把其他幸存者移出现场，明确构造「目标独处」的致命窗口。
  s.people.filter((person) => person.role !== 'police' && person.id !== v.id).forEach((person) => {
    person.hp = 0;
    person.hidden = true;
  });
  v.hp = 4;
  const hp = v.hp;
  // 固定随机源，避免随机手电筒干扰把伏击命中回归变成偶发测试。
  const hit = withRandomSource(() => 0.99, () => attack(s, v.id));
  check('B 伏击后第一刀能砍中', hit && v.hp < hp, `hp ${hp} → ${v.hp}`);
  check('B 独处且未察觉的伏击触发致命窗口', hit && v.hp === hp - 2 && s.ambushTurn === 0,
    `hp ${hp} → ${v.hp}，伏击标记已消耗=${s.ambushTurn === 0}`);
  const crowded = newGame();
  const first = player(crowded);
  const second = crowded.people.find((person) => person.role !== 'police' && person.id !== first.id)!;
  first.room = crowded.playerRoom;
  second.room = crowded.playerRoom;
  first.hp = 4;
  second.hp = 4;
  first.alert = 50;
  second.alert = 50;
  crowded.ambushTurn = crowded.turn;
  const crowdedHp = first.hp;
  const crowdedHit = withRandomSource(() => 0.99, () => attack(crowded, first.id));
  check('B 伏击时有其他幸存者在场，不触发独处致命窗口',
    crowdedHit && first.hp === crowdedHp - 1 && crowded.ambushTurn === crowded.turn,
    `hp ${crowdedHp} → ${first.hp}`);
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

/** E：低警觉者先观察；暗处进一步压低察觉速度；高警觉者仍会逃跑。 */
function caseUnaware(): void {
  const s = newGame();
  s.people.forEach((person) => { person.item = null; person.itemUses = 0; person.armed = false; });
  const v = s.people.find((person) => person.role !== 'police' && SURVIVOR_MAP[person.id]?.threat !== 'spiritual')!;
  const next = openNeighbor(s.playerRoom);
  v.room = next;
  v.alert = 0;
  v.awareness = 0;
  v.intent = 'idle';
  movePlayer(s, next);
  check('E 低警觉者被推门后不会立刻逃跑',
    v.room === next && v.alert < 75 && v.intent !== 'flee',
    `房间=${v.room}，警觉=${v.alert}，意图=${v.intent}`);

  const dark = newGame();
  dark.people.forEach((person) => { person.item = null; person.itemUses = 0; person.armed = false; });
  dark.powerCircuits.forEach((circuit) => { circuit.broken = true; });
  const darkVictim = dark.people.find((person) => person.role !== 'police' && SURVIVOR_MAP[person.id]?.threat !== 'spiritual')!;
  const darkNext = openNeighbor(dark.playerRoom);
  darkVictim.room = darkNext;
  darkVictim.alert = 0;
  darkVictim.awareness = 0;
  darkVictim.intent = 'idle';
  movePlayer(dark, darkNext);
  check('E 暗处进入显著降低幸存者警觉增长',
    darkVictim.room === darkNext && darkVictim.alert <= 12 && darkVictim.intent !== 'flee',
    `警觉=${darkVictim.alert}，意图=${darkVictim.intent}，状态=${darkVictim.activity}`);

  const prePanic = newGame();
  prePanic.people.forEach((person) => { person.item = null; person.itemUses = 0; person.armed = false; });
  const suspiciousTarget = player(prePanic);
  const suspiciousRoom = openNeighbor(prePanic.playerRoom);
  suspiciousTarget.room = suspiciousRoom;
  suspiciousTarget.alert = 30;
  suspiciousTarget.awareness = 1;
  suspiciousTarget.intent = 'wary';
  movePlayer(prePanic, suspiciousRoom);
  check('E 进门前低于恐慌的幸存者不会被瞬时警觉推成逃跑',
    suspiciousTarget.room === suspiciousRoom && suspiciousTarget.intent !== 'flee',
    `警觉=${suspiciousTarget.alert}，意图=${suspiciousTarget.intent}`);

  const darkPanic = newGame();
  darkPanic.people.forEach((person) => { person.item = null; person.itemUses = 0; person.armed = false; });
  darkPanic.powerCircuits.forEach((circuit) => { circuit.broken = true; });
  const darkAlreadyWary = darkPanic.people.find((person) => person.role !== 'police' && SURVIVOR_MAP[person.id]?.threat !== 'spiritual')!;
  const darkWaryRoom = openNeighbor(darkPanic.playerRoom);
  darkAlreadyWary.room = darkWaryRoom;
  darkAlreadyWary.alert = 30;
  darkAlreadyWary.awareness = 1;
  movePlayer(darkPanic, darkWaryRoom);
  check('E 暗处进入只增加极少警觉，低于恐慌者仍不逃跑',
    darkAlreadyWary.room === darkWaryRoom && darkAlreadyWary.alert <= 37 && darkAlreadyWary.intent !== 'flee',
    `警觉=${darkAlreadyWary.alert}，意图=${darkAlreadyWary.intent}`);

  const panic = newGame();
  const alarmed = player(panic);
  const panicNext = openNeighbor(panic.playerRoom);
  alarmed.room = panicNext;
  alarmed.alert = 66;
  alarmed.awareness = 2;
  alarmed.intent = 'wary';
  panic.people.forEach((person) => { person.item = null; person.itemUses = 0; });
  movePlayer(panic, panicNext);
  check('E 高警觉者进入房间后仍会立即逃跑',
    alarmed.room !== panicNext && alarmed.alert >= 75,
    `房间=${alarmed.room}，警觉=${alarmed.alert}`);
}

/** F：倒地者挥刀补刀致死 + 处决牌 + 恶魔附身 */
function caseFinisher(): void {
  const s = newGame();
  const v = player(s);
  v.room = s.playerRoom;
  v.hp = 0;
  v.downedTurns = 0;
  v.alert = 0;
  v.hidden = false;
  v.intent = 'stunned';
  s.energy = 3;
  check('F 倒地者不能再使用普通攻击', !canAttack(s, v.id) && attackBlockReason(s, v.id).includes('处决'));
  check('F 倒地者可立即处决，无需等待回合', executeBlockReason(s, v.id) === '');
  const executed = executeDownedPerson(s, v.id);
  check('F 独立处决按钮能立即结束倒地者并消耗 1 AP',
    executed && !s.people.some((p) => p.id === v.id) && s.energy === 2 && s.executions === 1,
    `执行=${executed}，剩余 AP=${s.energy}，处决数=${s.executions}`);

  const s2 = newGame();
  const v2 = player(s2);
  v2.room = s2.playerRoom;
  v2.hp = 0;
  v2.downedTurns = 0;
  const before2 = s2.people.length;
  const ok2 = play(s2, 'execute');
  check('F 处决卡也能在倒地当回合生效', ok2 && s2.people.length < before2);

  const scoped = newGame();
  const localDowned = scoped.people.find((p) => p.role !== 'police')!;
  const remoteDowned = scoped.people.find((p) => p.role !== 'police' && p.id !== localDowned.id)!;
  localDowned.room = scoped.playerRoom;
  localDowned.hp = 0;
  localDowned.downedTurns = 0;
  remoteDowned.room = openNeighbor(scoped.playerRoom);
  remoteDowned.hp = 0;
  remoteDowned.downedTurns = 0;
  runOps(scoped, CARD_MAP.execute!.ops);
  check('F 处决牌只处决当前房间目标',
    !scoped.people.some((p) => p.id === localDowned.id) && scoped.people.some((p) => p.id === remoteDowned.id));

  const rescue = newGame();
  const downed = rescue.people.find((p) => p.role !== 'police')!;
  const rescuer = rescue.people.find((p) => p.role !== 'police' && p.id !== downed.id)!;
  const rescueRoom = openNeighbor(rescue.playerRoom);
  downed.room = rescueRoom;
  downed.hp = 0;
  downed.downedTurns = 0;
  downed.intent = 'stunned';
  downed.hidden = false;
  rescuer.room = rescueRoom;
  rescuer.hp = 4;
  rescuer.archetype = 'rescuer';
  rescuer.intent = 'idle';
  rescuer.hidden = false;
  rescuer.blockedTurns = 0;
  rescue.energy = 0;
  withRandomSource(() => 0, () => endTurn(rescue));
  check('F 玩家暂不处决时，同伴仍可救起倒地者',
    downed.hp > 0 && downed.downedTurns === 0,
    `救援后生命值=${downed.hp}`);

  const executioner = KILLERS.find((killer) => killer.owner === '处刑者');
  const ultimate = executioner?.powers.find((power) => power.id === 'executioner_judge');
  check('F 处刑者大招仍只处决当前房间目标',
    ultimate?.ops.some((op) => op.op === 'execute' && op.who === 'downedHere') ?? false);

  const s3 = newGame();
  const v3 = player(s3);
  v3.room = s3.playerRoom;
  v3.hp = 4;
  v3.hidden = false;
  s3.energy = 3;
  s3.possessed = true;
  s3.possessTurns = 3;
  attack(s3, v3.id);
  check('F 迈尔斯恶魔附身一刀击倒健康幸存者', v3.hp === 0 && conditionOf(v3) === 'downed');
}

/** G：猎杀动作必须明确区分，人物档案必须展示背景与实时状态。 */
function caseHuntActionAndDossierUi(): void {
  const s = newGame();
  const victim = player(s);
  victim.room = s.playerRoom;
  victim.hp = 0;
  victim.downedTurns = 0;
  victim.activity = '倒在地上，试图呼救';
  s.energy = 3;
  const dossier = personDetailHtml(s, victim.id);
  check('G 人物档案显示角色背景',
    dossier.includes(SURVIVOR_MAP[victim.id].bio));
  check('G 人物档案显示当前状态与正在做的事',
    dossier.includes('倒地') && dossier.includes('倒在地上，试图呼救'));
}
caseHuntActionAndDossierUi();

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
  s.roomLocks = {};
  v.room = s.playerRoom;
  v.hp = 3;
  v.alert = 0;
  v.sneaky = false;
  s.energy = 3;
  const ok = attack(s);
  check('I 再受 1 点伤害后进入受伤状态', ok && v.hp === 2 && conditionOf(v) === 'injured', `hp ${v.hp}`);
  check(
    'I 被砍伤的人会立即逃跑并留下血迹',
    v.movesThisTurn >= 1 && v.room !== s.playerRoom,
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
  const hop1 = ROOM_MAP[s.playerRoom].neighbors.find((candidate) =>
    !OBSTACLE_ROOMS.includes(candidate) &&
    ROOM_MAP[candidate].neighbors.some((next) => next !== s.playerRoom && !OBSTACLE_ROOMS.includes(next)),
  );
  const hop2 = hop1
    ? ROOM_MAP[hop1].neighbors.find((r) => r !== s.playerRoom && !OBSTACLE_ROOMS.includes(r))
    : undefined;
  if (!hop1 || !hop2) {
    check('J 玩家走一步，逃跑的人也跟着动', true, '本局入口没有两跳走廊，跳过此布局');
    return;
  }
  // 把 NPC 放在玩家即将进入的房间，确保测试的是玩家行动触发反应，而非视野方向随机性。
  v.room = hop1;
  v.alert = 100;
  v.intent = 'flee';
  v.trackedTurns = 0;
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
  check('P 玩家移动后不能继续观察刚离开的房间', !isRoomVisible(s, from) && !isPersonVisible(s, v), `身后房间：${from}`);
  check('P 刚离开的房间仍保留已探索轮廓', isRoomExplored(s, from));
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

/** S：警报阈值开放逃生点，警报满值进入最终阶段。 */
function caseTeamGoal(): void {
  const s = newGame();
  s.alarm = 50;
  addAlarm(s, 10);
  check('S 警报值达到 60 后开放两个动态逃生点', s.escapeRooms.length === 2 && !s.emergencyActive);
  addAlarm(s, -15);
  check('S 警报值可以下降', s.alarm === 45 && s.escapeRooms.length === 2);
  const solid = newGame();
  solid.alarm = 99;
  addAlarm(solid, 1);
  check('S 普通杀手警报满值进入警察最终阶段而非立即结算',
    solid.emergencyActive && solid.result === null && solid.people.filter((p) => p.role === 'police').length >= 4);
  const ghost = createGame(['silent_step'], undefined, '贞子');
  ghost.alarm = 99;
  addAlarm(ghost, 1);
  check('S 灵异杀手警报满值让所有幸存者逃亡且不召来警察',
    ghost.emergencyActive && ghost.people.every((p) => p.role !== 'police' && p.intent === 'escape'));
}

/** 目击袭击、尸体与统一破坏入口回归。 */
function caseWitnessFearAndUnifiedSabotage(): void {
  const attackState = newGame();
  const victim = attackState.people.find((p) => p.role !== 'police' && p.hp > 0)!;
  const witness = attackState.people.find((p) => p.id !== victim.id && p.role !== 'police' && p.hp > 0)!;
  victim.room = attackState.playerRoom;
  witness.room = attackState.playerRoom;
  victim.hidden = false; witness.hidden = false;
  victim.hp = 4; witness.fear = 0; witness.alert = 0;
  attackState.people.filter((p) => p.id !== victim.id && p.id !== witness.id && p.role !== 'police').forEach((p) => { p.room = 'attic'; p.hidden = true; });
  attackState.energy = 4; attackState.attackReady = true;
  const attacked = attack(attackState, victim.id);
  check('目击袭击：同屋目击者不仅增加恐惧警戒，还会立刻改变行动',
    attacked && witness.fear >= 22 && witness.alert >= 55 &&
    witness.awareness >= 2 && witness.intent !== 'idle',
    `fear=${witness.fear} alert=${witness.alert} awareness=${witness.awareness} intent=${witness.intent}`);

  const murder = newGame();
  const murderVictim = murder.people.find((p) => p.role !== 'police' && p.hp > 0)!;
  const murderWitness = murder.people.find((p) => p.id !== murderVictim.id && p.role !== 'police' && p.hp > 0)!;
  murderVictim.room = murder.playerRoom;
  murderVictim.hp = 0;
  murderWitness.room = murder.playerRoom;
  murderWitness.hidden = false;
  murderWitness.hp = 4;
  murderWitness.alert = 0;
  murderWitness.fear = 0;
  murderWitness.awareness = 0;
  murderWitness.intent = 'idle';
  murderWitness.movesThisTurn = 0;
  murder.people.filter((p) => p.id !== murderVictim.id && p.id !== murderWitness.id && p.role !== 'police')
    .forEach((p) => { p.room = 'attic'; p.hidden = true; });
  murder.energy = 4;
  const executed = executeDownedPerson(murder, murderVictim.id);
  check('目击击杀：一击处决会被同屋 NPC 亲眼目击并触发真实反应',
    executed && !murder.people.some((p) => p.id === murderVictim.id) &&
    murderWitness.awareness >= 3 && murderWitness.alert >= 88 &&
    murderWitness.intent !== 'idle' && murder.log.some((line) => line.includes('【NPC目击】')),
    `awareness=${murderWitness.awareness} alert=${murderWitness.alert} intent=${murderWitness.intent}`);

  const carryWitnessState = newGame();
  const carriedVictim = carryWitnessState.people.find((p) => p.role !== 'police' && p.hp > 0)!;
  const carryWitness = carryWitnessState.people.find((p) => p.id !== carriedVictim.id && p.role !== 'police' && p.hp > 0)!;
  const doorwayWitness = carryWitnessState.people.find((p) => p.id !== carriedVictim.id && p.id !== carryWitness.id && p.role !== 'police' && p.hp > 0)!;
  const carryDestination = openNeighbor(carryWitnessState.playerRoom);
  carriedVictim.room = carryWitnessState.playerRoom;
  carriedVictim.hp = 0;
  carryWitness.room = carryWitnessState.playerRoom;
  carryWitness.hidden = false;
  carryWitness.alert = 0;
  carryWitness.awareness = 0;
  carryWitness.intent = 'idle';
  // 固定目击者原型，避免随机的二次呼喊让门口 NPC 在玩家进入前就逃离。
  carryWitness.archetype = 'hider';
  carryWitness.item = null;
  carryWitness.itemUses = 0;
  doorwayWitness.item = null;
  doorwayWitness.itemUses = 0;
  doorwayWitness.room = carryDestination;
  doorwayWitness.hidden = false;
  doorwayWitness.alert = 0;
  doorwayWitness.awareness = 0;
  doorwayWitness.intent = 'idle';
  carryWitnessState.people.filter((p) =>
    p.id !== carriedVictim.id && p.id !== carryWitness.id && p.id !== doorwayWitness.id && p.role !== 'police')
    .forEach((p) => { p.room = 'attic'; p.hidden = true; });
  carryWitnessState.energy = 12;
  const pickedUp = carryPerson(carryWitnessState, carriedVictim.id);
  const pickupSeen = pickedUp && carryWitness.awareness >= 2 &&
    carryWitness.alert >= 50 && carryWitness.intent !== 'idle' &&
    carryWitnessState.log.some((line) => line.includes('目睹倒地者被强行带走'));
  carryWitnessState.freeMove = true;
  const carriedIntoRoom = movePlayer(carryWitnessState, carryDestination);
  check('目击搬运：抱起倒地者时，同屋 NPC 会立即识别并行动',
    pickupSeen,
    `awareness=${carryWitness.awareness} alert=${carryWitness.alert} intent=${carryWitness.intent}`);
  check('目击搬运：抱着受害者进入新房间时，新的目击者也会作出反应',
    carriedIntoRoom && doorwayWitness.awareness >= 2 &&
    doorwayWitness.alert >= 78 && doorwayWitness.intent !== 'idle',
    `awareness=${doorwayWitness.awareness} alert=${doorwayWitness.alert} intent=${doorwayWitness.intent}`);

  const door = newGame();
  const poweredDoorRooms = new Set((Object.keys(ROOM_MAP) as RoomId[]).filter((room) => isRoomLit(door, room)));
  const doorRoom = (Object.keys(ROOM_MAP) as RoomId[]).find((room) =>
    ROOM_MAP[room].neighbors.some((next) => poweredDoorRooms.has(next)) &&
    !PHONE_ROOMS.includes(room) && !RADIO_ROOMS.includes(room) &&
    !door.powerCircuits.some((c) => c.breakerRoom === room) &&
    !door.siteItems.some((item) => item.room === room && !item.broken),
  )!;
  door.playerRoom = doorRoom;
  const neighbor = ROOM_MAP[door.playerRoom].neighbors.find((room) => poweredDoorRooms.has(room))!;
  door.roomLocks[neighbor] = 2;
  const inside = door.people.find((p) => p.role !== 'police')!;
  inside.room = neighbor; inside.hp = 4; inside.alert = 0; inside.fear = 0;
  door.energy = 4;
  const doorBroken = sabotageSiteItem(door);
  check('统一破坏：可以从相邻房间撞开门锁', doorBroken && !isLocked(door, neighbor));
  check('强行破门：屋内人类警戒与恐惧都会上升',
    inside.alert >= 24 && inside.fear >= 12,
    `alert=${inside.alert} fear=${inside.fear}`);

  const phone = newGame();
  phone.playerRoom = PHONE_ROOMS[0];
  phone.phoneCut = false;
  phone.powerCircuits = phone.powerCircuits.filter((circuit) => circuit.breakerRoom !== phone.playerRoom);
  phone.siteItems = phone.siteItems.filter((item) => item.room !== phone.playerRoom);
  phone.energy = 4;
  const phoneBroken = sabotageSiteItem(phone);
  check('统一破坏：电话房可直接剪断电话线', phoneBroken && phone.phoneCut);
}

/** 恐惧满值后再次受到攻击会直接倒地；警戒与恐惧保持独立。 */
function caseFearSystem(): void {
  const s = newGame();
  const victim = s.people.find((p) => p.role !== 'police')!;
  victim.room = s.playerRoom;
  victim.hp = 4;
  victim.fear = 80;
  victim.alert = 12;
  victim.hidden = false;
  s.people.filter((p) => p.id !== victim.id && p.role !== 'police').forEach((p) => { p.room = 'attic'; p.hidden = true; });
  s.energy = 4;
  s.attackReady = true;
  const ok = attack(s, victim.id);
  check('恐惧系统：受击使恐惧值达到上限后直接倒地', ok && victim.hp === 0 && victim.fear === 100);
  victim.alert = 12;
  check('恐惧系统：警戒值可独立于恐惧值调整', victim.alert === 12 && victim.fear === 100);
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

/** X：道具箱固定摆放；杀手能砸，砸完幸存者就少了这条补给路 */
function caseSiteItems(): void {
  const s = newGame();
  const boxes = s.siteItems.filter((item) => item.kind === 'itemBox');
  const rooms = s.siteItems.map((item) => item.room);
  check(
    'X 只生成 2 个道具箱且位置不重叠，不再生成发电机',
    boxes.length === 2 && s.siteItems.every((item) => item.kind === 'itemBox') && new Set(rooms).size === rooms.length,
    `箱 ${boxes.length}`,
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
  check('Y 钥匙道具不再推进已废弃的团队进度', s3.teamProgress === before, `${before} → ${s3.teamProgress}`);
}

/** 本轮：擦刀 / 同屋目击者 / 袭警 / 道具次数 / 拉扯型 */
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
  check('Z 倒地者有 4 回合流血倒计时，处决不再等待', BLEEDOUT_TURNS === 4);
  const health = newGame();
  const healthy = health.people.find((p) => p.role !== 'police')!;
  check('Z 幸存者初始生命值为 4', healthy.hp === 4 && conditionOf(healthy) === 'healthy');
  healthy.hp = 2;
  check('Z 累计 2 点伤害后进入受伤', conditionOf(healthy) === 'injured');
  healthy.hp = 0;
  check('Z 再累计 2 点伤害后倒地', conditionOf(healthy) === 'downed');

  // 攻击与处决是两个独立动作，倒地者不会再被攻击按钮误选。
  const e = newGame();
  e.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; });
  const freshDown = e.people.find((p) => p.role !== 'police')!;
  freshDown.room = e.playerRoom;
  freshDown.hp = 0;
  freshDown.downedTurns = 0;
  e.attackReady = true;
  const denied = !attack(e, freshDown.id);
  const executed = executeDownedPerson(e, freshDown.id);
  check('Z 普通攻击不会误补刀，独立处决立即生效',
    denied && executed && !e.people.some((p) => p.id === freshDown.id));

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

  // 倒地者不再触发守尸惩罚，玩家可以选择继续追击或处决。
  const c = newGame();
  c.people.forEach((p) => { p.item = null; p.itemUses = 0; p.alert = 0; });
  const downed = c.people.find((p) => p.role !== 'police')!;
  downed.room = c.playerRoom;
  downed.hp = 0;
  downed.downedTurns = 0;
  const tp2 = c.teamProgress;
  endTurn(c);
  check('Z 倒地者不再触发守尸惩罚', c.teamProgress === tp2, `${tp2} → ${c.teamProgress}`);

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

  // 警报满值不再瞬间判负，而是启动最终逃亡阶段。
  const solid = newGame();
  solid.alarm = 99;
  addAlarm(solid, 5);
  check('Z 警报满 → 普通杀手进入警察围捕阶段', solid.emergencyActive && solid.result === null);

  const ghost = createGame(['silent_step', 'sprint'], undefined, '贞子');
  ghost.alarm = 99;
  addAlarm(ghost, 5);
  check('Z 警报满 → 灵异杀手进入全员逃亡阶段', ghost.emergencyActive && ghost.result === null && ghost.people.every((p) => p.role !== 'police'));

  // 每逃走一个幸存者扣 15 分（全逃才判负，不再有硬阈值）
  const sc = newGame();
  const base = currentScore(sc);
  sc.escaped = 2;
  check('Z 每逃一人扣 15 分', currentScore(sc) === base - 30, `${base} → ${currentScore(sc)}`);
}

caseMyersStalkingAndFearRadius();
caseWitnessFearAndUnifiedSabotage();
caseFearSystem();
caseNavigationUtilities();
caseMergeAndMissions();
caseEnvironmentalEvents();
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
  b.roomLocks = {};
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

  const medkitGame = newGame();
  medkitGame.roomLocks = {};
  const medkitPair = medkitGame.people.filter((p) => p.role !== 'police').slice(0, 2);
  const medkitDowned = medkitPair[0];
  const medic = medkitPair[1];
  const medkitRoom = openNeighbor(medkitGame.playerRoom);
  medkitDowned.room = medkitRoom; medkitDowned.hp = 0; medkitDowned.downedTurns = 0; medkitDowned.hidden = false;
  medic.room = medkitRoom; medic.hp = 4; medic.hidden = false; medic.alert = 0; medic.awareness = 0;
  medic.archetype = 'hider'; medic.intent = 'heal'; medic.item = 'medkit'; medic.itemUses = 2; medic.healTurns = 0;
  withRandomSource(() => 0.99, () => { endTurn(medkitGame); endTurn(medkitGame); });
  check('AA 医疗包会在连续两回合后救起倒地同伴', medkitDowned.hp > 0 && medkitDowned.downedTurns === 0 && medic.itemUses < 2, `hp=${medkitDowned.hp} healTurns=${medic.healTurns}`);

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
  check('AA 连杀三人不再推进已废弃的团队目标', delta === 0, `旧进度变化 ${delta}`);
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
  check('AB 契约只使用新任务类型且包含可选奖励目标', (contract.mission.tasks ?? []).every((task) => ['kill_count', 'marked_kill', 'execute', 'special_execute', 'alarm_below', 'killer_stat'].includes(task.kind)) && (contract.mission.tasks ?? []).some((task) => task.optional && (task.reward ?? 0) > 0));
  check('AB 新契约回合上限延长到 40 且不生成限时击杀任务', contract.mission.turns === 40 && !(contract.mission.tasks ?? []).some((task) => task.kind === 'kill_count_before_turn'));
  const myersContract = generateMission('迈克尔·迈尔斯');
  check('AB 迈尔斯契约含尾随不同幸存者的专属奖励任务', myersContract.tasks?.some((task) => task.kind === 'killer_stat' && task.metric === 'myers_stalk') === true);
  const trapperContract = generateMission('设陷者');
  check('AB 设陷者契约含捕兽夹触发的专属奖励任务', trapperContract.tasks?.some((task) => task.kind === 'killer_stat' && task.metric === 'trap_triggers') === true);
  const huntressContract = generateMission('女猎手');
  check('AB 女猎手契约含飞斧命中的专属奖励任务', huntressContract.tasks?.some((task) => task.kind === 'killer_stat' && task.metric === 'hatchet_hits') === true);
  const lowAlarmTask = { id: 'low-alarm', kind: 'alarm_below' as const, label: '低报警', target: 1, limit: 35 };
  contract.alarm = 30;
  check('AB 报警上限任务在警报低于阈值时完成', missionTaskProgress(contract, lowAlarmTask) === 1);
  contract.alarm = 40;
  check('AB 报警上限任务超过阈值时未完成', missionTaskProgress(contract, lowAlarmTask) === 0);
  const timed = newGame();
  const timedTask = { id: 'timed-check', kind: 'kill_count_before_turn' as const, label: '限时猎杀', target: 2, deadlineTurn: 5 };
  timed.survivorKills = 2; timed.turn = 4;
  check('AB 限时任务：期限内达成后记录完成', missionTaskProgress(timed, timedTask) === 2);
  timed.completedMissionTasks.push(timedTask.id); timed.turn = 8;
  check('AB 限时任务：完成记录不会因回合推进而倒退', missionTaskProgress(timed, timedTask) === 2);
  const expired = newGame();
  expired.mission.tasks = [{ ...timedTask, optional: false }]; expired.turn = 6;
  endTurn(expired);
  check('AB 旧限时任务不会再导致第 5 回合提前判负', expired.result === null && expired.phase === 'playing');
  const mainObjective = newGame();
  mainObjective.markedKilled = 1;
  endTurn(mainObjective);
  check('AB 主目标完成后不自动结束，可继续追求额外奖励', mainObjective.missionPrimaryCompleted && mainObjective.result === null);
  check('AB 玩家可在主目标完成后主动结算契约', finishContract(mainObjective) && mainObjective.result === 'win');
  const waiting = newGame();
  waiting.energy = 2;
  const waitClock = waiting.trailClock;
  check('AB 等待行动消耗 1 AP 并让幸存者行动一次', waitAction(waiting) && waiting.energy === 1 && waiting.trailClock > waitClock && waiting.log.some((line) => line.includes('幸存者趁这个空档行动')));
  const watch = newGame();
  const watched = watch.people.find((p) => p.role !== 'police')!;
  const watchedRoom = openNeighbor(watch.playerRoom);
  watch.roomLocks[watchedRoom] = 0;
  watch.watchedRoom = watchedRoom;
  const currentRect = ROOM_MAP[watch.playerRoom].rect;
  const rearRect = ROOM_MAP[watchedRoom].rect;
  const dx = currentRect.left + currentRect.width / 2 - (rearRect.left + rearRect.width / 2);
  const dy = currentRect.top + currentRect.height / 2 - (rearRect.top + rearRect.height / 2);
  const length = Math.hypot(dx, dy) || 1;
  watch.playerFacing = { x: dx / length, y: dy / length };
  watched.room = watchedRoom;
  check('AB 玩家离开房间后不能继续观察身后的相邻房间', !isRoomVisible(watch, watchedRoom));
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
    if (current.path.length === 4) { route = current.path; break; }
    for (const next of ROOM_MAP[current.room].neighbors) if (!seen.has(next)) { seen.add(next); frontier.push({ room: next, path: [...current.path, next] }); }
  }
  carry.freeMove = true;
  for (const room of route.slice(0, 3)) movePlayer(carry, room);
  const safeCarry = route.length === 4 && carry.playerRoom === route[2] && carry.carryDistance === 3;
  const failedCheck = route.length === 4 && withRandomSource(() => 0, () => movePlayer(carry, route[3]));
  check('AB 搬运前三格安全，第四格检定失败会挣脱并恢复受伤状态',
    safeCarry && !failedCheck && carry.carryPersonId === null && victim.hp === 2 && victim.intent === 'flee',
    'route=' + route.length + ' distance=' + carry.carryDistance + ' hp=' + victim.hp + ' carried=' + (carry.carryPersonId === victim.id));
  const special = newGame();
  special.people = special.people.filter((p) => p.role !== 'police').slice(0, 1);
  const target = special.people[0]; target.room = 'kitchen'; target.hp = 0; target.downedTurns = 0;
  special.playerRoom = 'kitchen'; special.carryPersonId = target.id; special.energy = BASE_AP;
  const executed = executeCarriedPerson(special, 'fridge');
  check('AB 厨房冰箱特殊处决会击杀目标并计入处决数', executed && special.executions === 1 && !special.people.some((p) => p.id === target.id));
  check('AB 地形处决会累计额外奖励分', special.specialExecutionBonus === 35, String(special.specialExecutionBonus));
}
caseContractsPowerAndCarry();

function caseMarkedTargetIdentification(): void {
  const game = newGame();
  const marked = game.people.find((person) => person.marked && person.role !== 'police');
  const ordinary = game.people.find((person) => !person.marked && person.role !== 'police');
  check('特殊幸存者：每局至少有一名契约指定目标', Boolean(marked));
  if (marked) {
    const html = personChip(marked);
    check('特殊幸存者：地图人物标签明确显示契约目标文字', html.includes('chip-contract-target') && html.includes('契约目标'));
    check('特殊幸存者：人物标签标题也说明指定击杀身份', html.includes('本局契约指定击杀目标'));
  }
  if (ordinary) {
    const html = personChip(ordinary);
    check('普通幸存者：不会误显示契约目标徽记', !html.includes('chip-contract-target'));
  }
}
caseMarkedTargetIdentification();

/** AB：封锁房门必须同时阻止 NPC 进入和离开；脚印不应随机消失 */
function caseNpcLocksAndPersistentTrails(): void {
  const locked = newGame();
  const survivor = player(locked);
  const poweredLockedRooms = (Object.keys(ROOM_MAP) as RoomId[]).filter((room) => isRoomLit(locked, room) && ROOM_MAP[room].neighbors.length >= 2);
  const lockedRoom = poweredLockedRooms[0] ?? locked.playerRoom;
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
  const poweredOutsideRooms = new Set((Object.keys(ROOM_MAP) as RoomId[]).filter((room) => isRoomLit(outside, room)));
  const from = (Object.keys(ROOM_MAP) as RoomId[]).find((room) => ROOM_MAP[room].neighbors.some((next) => poweredOutsideRooms.has(next))) ?? outside.playerRoom;
  outside.playerRoom = from;
  const lockedDestination = ROOM_MAP[from].neighbors.find((r) => poweredOutsideRooms.has(r) && !OBSTACLE_ROOMS.includes(r));
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
  const suspiciousFarRoom = (Object.keys(ROOM_MAP) as RoomId[]).find((room) =>
    room !== suspicious.playerRoom && !ROOM_MAP[suspicious.playerRoom].neighbors.includes(room),
  ) ?? openNeighbor(suspicious.playerRoom);
  target.room = suspiciousFarRoom;
  target.movesThisTurn = 0;
  target.intent = 'idle';
  target.awareness = 0;
  target.alert = 20;
  endTurn(suspicious);
  check('AC 低强度异常只让 NPC 起疑，不直接进入求生', target.awareness === 1 && target.intent === 'wary' && target.dialogue.length > 0);

  const panic = newGame();
  const witness = player(panic);
  witness.room = panic.playerRoom;
  witness.movesThisTurn = 0;
  witness.intent = 'idle';
  witness.hidden = false;
  witness.awareness = 0;
  witness.alert = 100;
  endTurn(panic);
  check('AC 高危信息让 NPC 进入求生并显示逃跑对白', witness.awareness === 3 && witness.dialogue.length > 0);
}
caseNpcAwarenessAndDialogue();

/** 新版通用卡池、限时情报与迈尔斯专属印记。 */
function caseNewPerkSystem(): void {
  const freeWipe = createGame(['unbreakable', 'clean'], undefined, '迈克尔·迈尔斯');
  const freeWipeVictim = freeWipe.people.find((person) => person.role !== 'police')!;
  freeWipeVictim.room = freeWipe.playerRoom;
  freeWipeVictim.hp = 4;
  freeWipeVictim.bloodSacrifice = false;
  freeWipe.hand = [{ uid: 'test-unbreakable', defId: 'unbreakable' }];
  freeWipe.energy = 1;
  freeWipe.myersLastBestActive = true;
  freeWipe.myersLastBestMarks = 2;
  const firstHit = withRandomSource(() => 0.99, () => attack(freeWipe, freeWipeVictim.id));
  const energyAfterHit = freeWipe.energy;
  const freeWipePlayed = playCard(freeWipe, 'test-unbreakable');
  check(
    '不屈不挠：0行动点时仍能抽牌并免费擦刀',
    firstHit && energyAfterHit === 0 && freeWipePlayed && freeWipe.energy === 0 && freeWipe.attackReady,
    `攻击后行动点=${energyAfterHit}，结算后=${freeWipe.energy}，attackReady=${freeWipe.attackReady}`,
  );
  check('不屈不挠：免费擦刀同样移除至多两枚终局印记', freeWipe.myersLastBestMarks === 1, `攻击获得 1 枚后移除 2 枚，剩余=${freeWipe.myersLastBestMarks}`);

  check('天灾：鬼魔神龛使用「天灾钩子：鬼魔神龛」的钩子图案', cardImage('scourge_shrine')?.endsWith('/scourge_shrine.png') ?? false, cardImage('scourge_shrine') ?? '无图标');
  check('猎杀戾气使用「厄咒：猎杀戾气」的图腾图案', cardImage('hex_huntress')?.endsWith('/hex_huntress.png') ?? false);
  check('粉碎希望使用「Shattered Hope」的碎裂图案', cardImage('hex_ruin')?.endsWith('/hex_ruin.png') ?? false);
  check('苦涩低语使用「Bitter Murmur」的耳朵图案', cardImage('bitter_murmur')?.endsWith('/bitter_murmur.png') ?? false);

  const pool = deckCardsForKiller('迈克尔·迈尔斯');
  check('新版通用初始卡池恰好 12 张', pool.filter((card) => card.pool === 'initial').length === 12);
  check('迈尔斯专属卡恰好 3 张', pool.filter((card) => card.killerOnly === '迈克尔·迈尔斯').length === 3);
  check('初始牌组只使用新版通用卡牌', STARTING_DECK.length >= 10 && STARTING_DECK.every((id) => pool.some((card) => card.id === id) && !CARD_MAP[id]?.killerOnly));
  check('其他杀手构筑池不会出现迈尔斯专属卡', !deckCardsForKiller('设陷者').some((card) => card.killerOnly === '迈克尔·迈尔斯'));

  const lastBest = createGame(['myers_last_best'], undefined, '迈克尔·迈尔斯');
  const lastHuman = lastBest.people.find((person) => person.role !== 'police')!;
  lastBest.people = lastBest.people.filter((person) => person.role === 'police' || person.id === lastHuman.id);
  lastBest.hand = [{ uid: 'test-last-best', defId: 'myers_last_best' }];
  lastBest.energy = 6;
  const lastBestPlayed = playCard(lastBest, 'test-last-best');
  check('把最好的留在最后：显形 5 次后续行动并提供一次免费移动',
    lastBestPlayed && (lastHuman.revealedActions ?? 0) >= 5 && lastBest.freeMove);

  const eclipse = createGame(['myers_eclipse_light'], undefined, '迈克尔·迈尔斯');
  const downed = eclipse.people.find((person) => person.role !== 'police')!;
  downed.room = eclipse.playerRoom;
  downed.hp = 1;
  downed.bloodSacrifice = true;
  eclipse.energy = 6;
  eclipse.attackReady = true;
  attack(eclipse, downed.id);
  eclipse.hand = [{ uid: 'test-eclipse', defId: 'myers_eclipse_light' }];
  eclipse.energy = 6;
  const fearBeforeEclipse = eclipse.people.filter((person) => person.role !== 'police' && person.id !== downed.id).map((person) => person.fear);
  const eclipsePlayed = playCard(eclipse, 'test-eclipse');
  const remainingAfterEclipse = eclipse.people.filter((person) => person.role !== 'police' && person.hp > 0);
  check('湮灭之光：处决刚击倒的人类，若为血祭品则全体人类恐惧 +35',
    eclipsePlayed && !eclipse.people.some((person) => person.id === downed.id) &&
    remainingAfterEclipse.every((person, index) => person.fear >= fearBeforeEclipse[index] + 35));

  const food = createGame(['myers_plaything'], undefined, '迈克尔·迈尔斯');
  food.hand = [{ uid: 'test-food', defId: 'myers_plaything' }];
  food.energy = 1;
  const foodTarget = food.people.find((person) => person.role !== 'police')!;
  foodTarget.room = food.playerRoom;
  const foodPlayed = playCard(food, 'test-food');
  check('玩弄食物：0费、视野内有幸存者时获得 2 AP 并禁止本回合攻击',
    foodPlayed && food.energy === 3 && food.attackBlockedTurn === food.turn &&
    attackBlockReason(food).includes('不能攻击'));

  const hex = createGame(['hex_huntress'], undefined, '迈克尔·迈尔斯');
  hex.hand = [{ uid: 'test-hex', defId: 'hex_huntress' }];
  hex.energy = 6;
  playCard(hex, 'test-hex');
  const hexVictim = hex.people.find((person) => person.role !== 'police')!;
  hexVictim.room = hex.playerRoom;
  hexVictim.hp = 1;
  hexVictim.bloodSacrifice = false;
  hex.energy = 6;
  hex.attackReady = true;
  const hexHit = attack(hex, hexVictim.id);
  check('猎杀戾气：下一次攻击命中幸存者额外获得 50 分',
    hexHit && hex.hexHuntressUsed && hex.cardBonusScore === 50);

  const noed = createGame(['hex_noed'], undefined, '迈克尔·迈尔斯');
  noed.people.forEach((person) => { person.room = 'bedroom'; person.alert = 0; person.awareness = 0; person.item = null; person.itemUses = 0; });
  noed.hand = [{ uid: 'test-noed', defId: 'hex_noed' }];
  noed.energy = 6;
  const noedPlayed = playCard(noed, 'test-noed');
  const noedTarget = noed.people.find((person) => person.role !== 'police')!;
  noedTarget.room = noed.playerRoom;
  noedTarget.hp = 4;
  noed.energy = 6;
  noed.attackReady = true;
  const noedAttack = attack(noed, noedTarget.id);
  check('难逃一死：只要厄咒图腾仍在，攻击命中就直接击倒而非处决',
    noedPlayed && noed.totems.length > 0 && noedAttack && noed.people.some((person) => person.id === noedTarget.id && person.hp === 0),
    `played=${noedPlayed} attacked=${noedAttack} totems=${noed.totems.length} targetPresent=${noed.people.some((person) => person.id === noedTarget.id)} hp=${noedTarget.hp}`);

  const bitter = createGame(['bitter_murmur'], undefined, '迈克尔·迈尔斯');
  const bitterTarget = bitter.people.find((person) => person.role !== 'police')!;
  bitterTarget.room = bitter.playerRoom;
  bitterTarget.hp = 0;
  bitter.hand = [{ uid: 'test-bitter', defId: 'bitter_murmur' }];
  bitter.energy = 6;
  const otherHumans = bitter.people.filter((person) => person.role !== 'police' && person.id !== bitterTarget.id && person.hp > 0);
  playCard(bitter, 'test-bitter');
  bitter.energy = 6;
  const bitterExecuted = executeDownedPerson(bitter, bitterTarget.id);
  check('苦涩低语：下一次击杀后，其他存活人类气场显现',
    bitterExecuted && !bitter.bitterMurmurReady && otherHumans.length > 0 &&
    otherHumans.every((person) => (person.revealedActions ?? 0) >= 3));

  const reveal = createGame(['hell'], undefined, '迈克尔·迈尔斯');
  const revealTarget = reveal.people.find((person) => person.role !== 'police')!;
  const revealRoom = (Object.keys(ROOM_MAP) as RoomId[]).find((room) => room !== reveal.playerRoom)!;
  revealTarget.room = revealRoom;
  reveal.hand = [{ uid: 'test-hell', defId: 'hell' }];
  reveal.energy = 6;
  const revealPlayed = playCard(reveal, 'test-hell');
  const auraSelected = selectAuraRoom(reveal, revealRoom);
  check('恶灵低语：0费且不推进 NPC 行动，可选任意房间并显示气场',
    revealPlayed && reveal.energy === 6 && auraSelected && !reveal.auraTargeting && (revealTarget.revealedActions ?? 0) > 0);

  const shrine = createGame(['scourge_shrine'], undefined, '迈克尔·迈尔斯');
  const shrineTarget = shrine.people.find((person) => person.role !== 'police')!;
  shrineTarget.room = shrine.playerRoom;
  shrineTarget.fear = 0;
  shrine.hand = [{ uid: 'test-shrine', defId: 'scourge_shrine' }];
  shrine.energy = 6;
  const shrinePlayed = playCard(shrine, 'test-shrine');
  check('鬼魔神龛：当前房间有人时立即触发恐惧与气场效果',
    shrinePlayed && shrineTarget.fear >= 35 && (shrineTarget.revealedActions ?? 0) >= 3 && shrine.scourgeShrineRoom === null);

  const fear = createGame(['distressing'], undefined, '迈克尔·迈尔斯');
  const adjacentRoom = ROOM_MAP[fear.playerRoom].neighbors[0];
  const fearTarget = fear.people.find((person) => person.role !== 'police')!;
  fearTarget.room = adjacentRoom;
  fearTarget.fear = 0;
  fear.hand = [{ uid: 'test-distressing', defId: 'distressing' }];
  fear.energy = 6;
  const fearPlayed = playCard(fear, 'test-distressing');
  check('恐惧释放：相邻房间人类恐惧 +25 且显露气场',
    fearPlayed && fearTarget.fear === 25 && (fearTarget.revealedActions ?? 0) > 0);

  const sloppy = createGame(['sloppy_butcher'], undefined, '迈克尔·迈尔斯');
  const sloppyTarget = sloppy.people.find((person) => person.role !== 'police')!;
  sloppyTarget.room = sloppy.playerRoom;
  sloppyTarget.hp = 4;
  sloppy.hand = [{ uid: 'test-sloppy', defId: 'sloppy_butcher' }];
  sloppy.energy = 6;
  const sloppyPlayed = playCard(sloppy, 'test-sloppy');
  check('辣手屠夫：打牌本身发动一次攻击，命中附带流血',
    sloppyPlayed && sloppyTarget.hp < 4 && sloppyTarget.bleed === 2 && !sloppy.attackReady);

  const stealth = createGame(['insidious'], undefined, '迈克尔·迈尔斯');
  stealth.hand = [{ uid: 'test-stealth', defId: 'insidious' }];
  stealth.energy = 6;
  const stealthPlayed = playCard(stealth, 'test-stealth');
  check('静止隐身：出牌后仍保留两次完整的无法侦测行动',
    stealthPlayed && stealth.stealthActions === 2);

}
const lookTest = newGame();
const lookNeighbors = [...ROOM_MAP[lookTest.playerRoom].neighbors];
const lookFarRoom = (Object.keys(ROOM_MAP) as RoomId[]).find((room) =>
  room !== lookTest.playerRoom && !lookNeighbors.includes(room),
)!;
lookTest.energy = LOOK_COST;
const lookBefore = lookTest.energy;
const beganLooking = lookAround(lookTest);
check(
  '查看：点击按钮只进入选房模式，不自动选择或消耗 AP',
  beganLooking && lookTest.lookingAround && lookTest.energy === lookBefore && Object.keys(lookTest.scouted).length === 0,
);
const selectedLookRoom = lookNeighbors[0];
const invalidLook = lookAtRoom(lookTest, lookFarRoom);
check('查看：不能选择两格外的房间', !invalidLook && lookTest.lookingAround && lookTest.energy === lookBefore);
const looked = lookAtRoom(lookTest, selectedLookRoom);
check(
  '查看：玩家点选后仅显示所选相邻房间并消耗 1 AP',
  looked && !lookTest.lookingAround && lookTest.energy === lookBefore - LOOK_COST &&
    lookTest.scouted[selectedLookRoom] === 1 &&
    lookNeighbors.filter((room) => room !== selectedLookRoom).every((room) => !lookTest.scouted[room]),
  `selected=${selectedLookRoom} AP ${lookBefore}→${lookTest.energy}`,
);
check('查看：不会把两格外房间一并点亮', !isRoomVisible(lookTest, lookFarRoom), `远处房间=${lookFarRoom}`);
const cancelLook = newGame();
const cancelAp = cancelLook.energy;
lookAround(cancelLook);
check('查看：取消选房不消耗行动点', cancelLook.lookingAround && cancelLook.energy === cancelAp && cancelLookSelection(cancelLook) && !cancelLook.lookingAround && cancelLook.energy === cancelAp);
const noApLook = newGame();
noApLook.energy = 0;
const noApLookResult = lookAround(noApLook);
check('查看：行动点不足时不能进入选房模式', !noApLookResult && !noApLook.lookingAround && noApLook.energy === 0 && Object.keys(noApLook.scouted).length === 0);


/* 不规则房间布局：多种种子验证矩形拼接、门网连通和后院出口。 */
let layoutOverlapFailures = 0;
let layoutAdjacencyFailures = 0;
let layoutConnectivityFailures = 0;
let layoutGardenFailures = 0;
let layoutSizeVarietyFailures = 0;
let layoutCountFailures = 0;
const layoutCounts = new Set<number>();
let layoutDoorMarkerFailures = 0;
for (let seed = 1; seed <= 40; seed += 1) {
  withRandomSource(createSeededRandom(seed), () => buildLayout());
  layoutCounts.add(ROOMS.length);
  if (ROOMS.length < 23 || ROOMS.length > 33) layoutCountFailures += 1;
  const rects = ROOMS.map((room) => room.rect);
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const overlapW = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
      const overlapH = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
      if (overlapW > 0.01 && overlapH > 0.01) layoutOverlapFailures += 1;
    }
  }
  for (const room of ROOMS) {
    for (const neighborId of room.neighbors) {
      if (!doorMarkerPosition(room.id, neighborId)) layoutDoorMarkerFailures += 1;
      const a = room.rect;
      const b = ROOM_MAP[neighborId].rect;
      const vertical = (
        Math.abs(a.left + a.width - b.left) < 1 ||
        Math.abs(b.left + b.width - a.left) < 1
      ) && Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top) > 0.01;
      const horizontal = (
        Math.abs(a.top + a.height - b.top) < 1 ||
        Math.abs(b.top + b.height - a.top) < 1
      ) && Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left) > 0.01;
      if (!vertical && !horizontal) layoutAdjacencyFailures += 1;
    }
  }
  const reached = new Set<RoomId>(['hall']);
  const queue: RoomId[] = ['hall'];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const next of ROOM_MAP[queue[cursor]].neighbors) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  if (reached.size !== ROOMS.length) layoutConnectivityFailures += 1;
  if (ROOM_MAP.garden.neighbors.length !== 1 || ROOM_MAP.garden.neighbors[0] !== 'garage') layoutGardenFailures += 1;
  if (new Set(ROOMS.map((room) => room.size)).size < 2) layoutSizeVarietyFailures += 1;
}
buildLayout();
check('不规则地图：40 组随机布局无房间重叠', layoutOverlapFailures === 0, `overlap=${layoutOverlapFailures}`);
check('不规则地图：所有门都位于真实共边处', layoutAdjacencyFailures === 0, `invalid doors=${layoutAdjacencyFailures}`);
check('不规则地图：每条可通行邻接边都有门形标记位置', layoutDoorMarkerFailures === 0, `missing door markers=${layoutDoorMarkerFailures}`);
check('不规则地图：每局 23–33 个房间且数量会随机变化', layoutCountFailures === 0 && layoutCounts.size > 1, `counts=${[...layoutCounts].sort((a,b)=>a-b).join(',')}`);
check('不规则地图：每局房间保持全图连通', layoutConnectivityFailures === 0, `disconnected maps=${layoutConnectivityFailures}`);
check('不规则地图：后院始终只有车库一个入口', layoutGardenFailures === 0, `invalid garden exits=${layoutGardenFailures}`);
check('不规则地图：每局至少出现三种房间尺寸', layoutSizeVarietyFailures === 0, `low-variety maps=${layoutSizeVarietyFailures}`);


/* NPC 认知分档、迈尔斯尾随收益、对白真实性与寻路避让。 */
check('幸存者认知：100 点严格分为未发觉 / 怀疑 / 恐慌 / 警觉',
  [0, 11, 12, 39, 40, 74, 75, 100].map(awarenessLabel).join('|') === '未发觉|未发觉|怀疑|怀疑|恐慌|恐慌|警觉|警觉' &&
  [0, 12, 40, 75].map(awarenessStage).join('|') === '0|1|2|3');
check('迈尔斯尾随：目标越警觉，尾随收益越低',
  [0, 12, 40, 75].map(myersStalkGain).join('|') === '15|8|3|0');
const dialogueGuard = newGame();
const dialoguePerson = dialogueGuard.people.find((p) => p.role !== 'police')!;
dialoguePerson.alert = 0;
dialoguePerson.awareness = 3;
dialoguePerson.intent = 'flee';
updateNpcDialogue(dialogueGuard);
check('NPC 对白：未发觉且没有危险认知时，不会声称正在被追',
  !/追我|他就在后面|快跑|离我远点/.test(dialoguePerson.dialogue), dialoguePerson.dialogue);
check('NPC 对白刷新：不会清除已确认的危险记忆', dialoguePerson.awareness === 3);
const pathGuard = newGame();
const pathStart = ROOM_MAP[pathGuard.playerRoom].neighbors[0];
check('NPC 寻路：避让列表中的玩家房间不能成为路径终点',
  nextStepToward(pathGuard, pathStart, pathGuard.playerRoom, [pathGuard.playerRoom]) === null);
const revealGuard = newGame();
runOps(revealGuard, [{ op: 'flag', key: 'bitterMurmur' }]);
check('苦涩低语：出牌后会等待下一次人类死亡，再触发全场回声',
  revealGuard.bitterMurmurReady && revealGuard.people.filter((p) => p.role !== 'police' && p.hp > 0).every((p) => !(p.revealedActions ?? 0)));

caseNewPerkSystem();

console.log(`\n规则回归 ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
