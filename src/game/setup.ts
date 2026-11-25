import { random, randomOf, shuffle } from './random';
import { CARD_MAP } from './cards';
import { KILLER_MAP } from './killers';
import { generateMission } from './missions';
import { createPeople } from './npc/factory';
import {
  BASE_AP, ESCAPE_ROOMS, GENERATOR_MAX, GENERATOR_MIN, ITEM_BOX_CHARGES,
  ITEM_BOX_COUNT, SABOTAGE_COST,
} from './constants';
import {
  ENTRY_ROOM, EXIT_ROOM, OBSTACLE_ROOMS, ROOM_MAP, ROOMS, buildLayout,
} from './rooms';
import type { CardInstance, GameState, Mission, SiteItem } from './types';
import { drawCards } from './deck';

let cardUidCounter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${cardUidCounter++}`;

function log(state: GameState, message: string): void {
  state.log.unshift(`[第 ${state.turn} 回合] ${message}`);
  if (state.log.length > 60) state.log.length = 60;
}

export function createGame(
  deckIds: string[],
  mission = generateMission(),
  killer = '迈克尔·迈尔斯',
): GameState {
  // 先重新排一遍户型：每一局的房子都不一样，之后所有人都在新户型上出生
  buildLayout();

  const pile = shuffle(deckIds.filter((id) => CARD_MAP[id])).map<CardInstance>((defId) => ({
    uid: uid('card'),
    defId,
  }));
  const killerId = KILLER_MAP[killer] ? killer : '迈克尔·迈尔斯';
  const people = createPeople(mission);
  const sacrifice = randomOf(people.filter((person) => person.role !== 'police'));
  if (sacrifice) sacrifice.bloodSacrifice = true;
  const state: GameState = {
    phase: 'playing',
    killer: killerId,
    killerRuntime: { killUsed: false, moveUsed: false, attackUsed: false, witnessUsed: false },
    // 逮捕阈值已废弃（警戒与逮捕合并），保留字段只为兼容旧存档
    arrestThreshold: 5 + (mission.targetCount ?? 1),
    turn: 1,
    // 走路 / 砍人 / 打牌 / 搜索共用这一个池子，原来「能量 + 步数」两套资源合并
    energy: BASE_AP,
    maxEnergy: BASE_AP,
    // 与初始 alarm:12 对齐：wanted 只是暴露度 /10 的镜像
    wanted: 2,
    heatTurn: 0,
    policeLock: 0,
    ambushTurn: 0,
    senseTurn: 0,
    revealAuraActions: 0,
    trailRevealActions: 0,
    highlightedTrail: null,
    stealthActions: 0,
    attackReady: true,
    trailClock: 0,
    frenzy: 0,
    trails: [],
    playerRoom: ENTRY_ROOM,
    // 与场景初始朝向一致：开局面向画面下方
    playerFacing: { x: 0, y: 1 },
    people,
    hand: [],
    drawPile: pile,
    discardPile: [],
    mission,
    log: [],
    kills: 0,
    killsThisTurn: 0,
    executions: 0,
    survivorKills: 0,
    specialExecutionBonus: 0,
    npcAlarmed: false,
    carryPersonId: null,
    carryDistance: 0,
    evidence: 0,
    markedKilled: 0,
    decoyRoom: null,
    freeMove: false,
    discount: 0,
    bonusDamage: 0,
    noAlarmTurn: false,
    alarmSilencedUntilTurn: 0,
    lastCrimeRoom: null,
    result: null,
    score: 0,
    scoreBreakdown: [],
    rewardCards: [],
    phoneCut: false,
    wiretap: false,
    poltergeist: false,
    policeBlocked: false,
    pinnedPeople: [],
    fearRadius: KILLER_MAP[killerId].fearRadius ?? 1,
    myersStalking: false,
    myersMovedThisTurn: false,
    stalkPressure: 0,
    stalkMeter: 0,
    stalkTargetId: null,
    possessed: false,
    possessTurns: 0,
    myersEclipseMarks: 0,
    myersLastBestActive: false,
    myersLastBestMarks: 0,
    myersFoodMarks: 0,
    hexHuntressActive: false,
    hexHuntressUsed: false,
    hexNoedActive: false,
    hexNoedBonusGranted: false,
    scourgeShrineReady: false,
    distressingActive: false,
    hexRuinActive: false,
    hexRuinUsed: false,
    totems: [],
    bonusEnergyNextTurn: 0,
    clearedObstacles: [],
    escaped: 0,
    barricades: [],
    exitBlockedTurns: 0,
    stunTurns: 0,
    blindTurns: 0,
    chaseTargetId: null,
    chaseTurns: 0,
    guardingTurns: 0,
    nightfallActive: false,
    lastAttackedId: null,
    policeAssaulted: false,
    cooldowns: {},
    roomLocks: {},
    revealedThisTurn: false,
    resultReason: '',
    alarm: 12,
    explored: [ENTRY_ROOM, ...ROOM_MAP[ENTRY_ROOM].neighbors],
    scouted: {},
    noiseRoom: null,
    sabotage: [],
    frenzyStreak: 0,
    disturbances: [],
    objectiveRooms: [],
    teamProgress: 0,
    teamStage: 0,
    escapeRooms: [],
    survivorTotal: people.filter((person) => person.role !== 'police').length,
    teamGoalLabel: '',
    siteItems: [],
    powerCircuits: [
      { id: 'main-floor', name: '主楼照明', breakerRoom: 'basement', affectedRooms: ['basement', 'hall', 'kitchen', 'dining', 'study'], broken: false },
      { id: 'upper-floor', name: '二层照明', breakerRoom: 'workshop', affectedRooms: ['workshop', 'bedroom', 'nursery', 'guestroom', 'attic'], broken: false },
      { id: 'east-wing', name: '东翼照明', breakerRoom: 'conservatory', affectedRooms: ['conservatory', 'garden', 'balcony', 'foyer', 'garage'], broken: false },
      { id: 'service-wing', name: '服务区照明', breakerRoom: 'laundry', affectedRooms: ['laundry', 'corridor', 'storage', 'wine', 'chapel', 'stairwell', 'bathroom', 'library'], broken: false },
    ],
  };
  // 团队目标：随机挑 3 间房作为「电闸 / 钥匙柜」，再给每个人派一个个人目的。
  // 不定死：有人修装置、有人找钥匙，也有人只是想报警或躲起来。
  const objPool = ROOMS.map((r) => r.id).filter(
    (id) => id !== ENTRY_ROOM && id !== EXIT_ROOM && !ESCAPE_ROOMS.includes(id) && !OBSTACLE_ROOMS.includes(id),
  );
  state.objectiveRooms = shuffle(objPool).slice(0, 3);
  state.teamGoalLabel = randomOf(['修好电闸', '凑齐后门钥匙', '接通无线电']);

  // 场地物品：道具箱固定 2 个，发电机随机 1~2 台，撒在能走的房间里。
  // 杀手用不了它们，但能砸——去哪边、什么时候砸，多了一层取舍。
  const breakerRooms = state.powerCircuits.map((circuit) => circuit.breakerRoom);
  const sitePool = shuffle(objPool.filter((id) => !state.objectiveRooms.includes(id) && !breakerRooms.includes(id)));
  const genCount = GENERATOR_MIN + Math.floor(random() * (GENERATOR_MAX - GENERATOR_MIN + 1));
  const items: SiteItem[] = [];
  for (let i = 0; i < ITEM_BOX_COUNT; i++) {
    const room = sitePool.pop();
    if (room) {
      items.push({ id: `box-${i}`, kind: 'itemBox', room, broken: false, charges: ITEM_BOX_CHARGES, progress: 0, charged: false, jammedTurns: 0 });
    }
  }
  for (let i = 0; i < genCount; i++) {
    const room = sitePool.pop();
    if (room) {
      items.push({ id: `gen-${i}`, kind: 'generator', room, broken: false, charges: 0, progress: 0, charged: false, jammedTurns: 0 });
    }
  }
  state.siteItems = items;

  state.people
    .filter((p) => p.role !== 'police')
    .forEach((p) => {
      const roll = random();
      if (roll < 0.26) p.goal = 'supply';
      else if (roll < 0.46) p.goal = 'generator';
      else if (roll < 0.68) p.goal = 'objective';
      else if (roll < 0.8) p.goal = 'key';
    });
  drawCards(state, 5);
  log(state, `契约已接取：${mission.title}`);
  if (sacrifice) log(state, `血祭品已标记：${sacrifice.name}。此标记本身没有额外效果。`);
  log(state, `你以「${killerId}」的身份行动。每回合 ${BASE_AP} 点行动点：走路、挥刀、出牌、搜索柜子都从这里扣。`);
  log(state, `他们也在忙自己的事：${state.teamGoalLabel}就会集体从后门逃走。留意乌鸦叫和地板响，那是有人刚经过。`);
  log(state, `屋里有 ${items.filter((i) => i.kind === 'itemBox').length} 个道具箱、${genCount} 台发电机：他们会靠这些翻盘，你只能砸掉它们（${SABOTAGE_COST} 点行动点）。`);
  return state;
}

