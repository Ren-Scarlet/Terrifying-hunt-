import { createSeededRandom, random, randomOf, shuffle } from './random';
import { CARD_MAP } from './cards';
import { KILLER_MAP } from './killers';
import { ACCESSORY_MAP, sanitizeAccessoryLoadout } from './accessories';
import { modifiersForAccessories, modifierSummary } from './modifiers';
import { generateMission } from './missions';
import { createPeople } from './npc/factory';
import {
  BASE_AP, ESCAPE_ROOMS, ITEM_BOX_CHARGES,
  ITEM_BOX_COUNT, SABOTAGE_COST,
} from './constants';
import {
  ENTRY_ROOM, EXIT_ROOM, OBSTACLE_ROOMS, ROOM_MAP, ROOMS, TOTEM_ROOMS, buildLayout,
} from './rooms';
import type { CardInstance, GameState, Mission, SiteItem, RoomId } from './types';
import { drawCards } from './deck';
import { roomDistance } from './navigation';
import { applyHuntingGround, getHuntingGround, type HuntingGroundId } from './maps';

let cardUidCounter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${cardUidCounter++}`;

function log(state: GameState, message: string): void {
  state.log.unshift(`[第 ${state.turn} 回合] ${message}`);
  if (state.log.length > 60) state.log.length = 60;
}


/**
 * 电话位置每局随机：从非逃生、非后院的房间里抽 2 间。
 * 用固定种子之外的随机源，保证每局位置不同；太小的房间不放电话。
 */

/**
 * 乌鸦：每局随机停在 3 间屋里（避开电话房，避免线索叠在一起）。
 * 幸存者在这间屋做任何动作都会惊起乌鸦，给玩家一个不带技能的动静提示。
 */
function pickCrowRooms(state: GameState, phones: RoomId[]): RoomId[] {
  const pool = ROOMS
    .filter((room) => room.id !== 'garden' && !phones.includes(room.id) && room.size !== 'small')
    .map((room) => room.id);
  const seedText = `crow|${state.mapId}|${state.mission.title}|${state.people.length}`;
  let seed = 2166136261;
  for (const ch of seedText) {
    seed ^= ch.codePointAt(0) ?? 0;
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const pick = createSeededRandom(seed);
  const picked: RoomId[] = [];
  const local = [...pool];
  while (picked.length < 3 && local.length) {
    picked.push(local.splice(Math.floor(pick() * local.length), 1)[0]);
  }
  return picked;
}

function pickPhoneRooms(state: GameState): RoomId[] {
  const candidates = ROOMS
    .filter((room) => room.id !== 'garden' && !ESCAPE_ROOMS.includes(room.id) && room.size !== 'small')
    .map((room) => room.id);
  const pool = candidates.length >= 2 ? candidates : ROOMS.map((room) => room.id);
  // 独立种子：只由这一局的布局 / 契约 / 人数决定，不消耗全局随机序列。
  const seedText = `${state.mapId}|${state.mission.title}|${state.playerRoom}|${state.people.length}`;
  let seed = 2166136261;
  for (const ch of seedText) {
    seed ^= ch.codePointAt(0) ?? 0;
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const pick = createSeededRandom(seed);
  const picked: RoomId[] = [];
  while (picked.length < 2 && pool.length) {
    const index = Math.floor(pick() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

export function createGame(
  deckIds: string[],
  mission: Mission | undefined = undefined,
  killer = '迈克尔·迈尔斯',
  mapId: HuntingGroundId = 'lampkin',
  accessoryIds: string[] = [],
): GameState {
  // 先生成空间布局，再应用本局场地主题；菜单插画与实际地图使用同一个 mapId。
  const ground = getHuntingGround(mapId);
  buildLayout(ground.layoutStyle);
  applyHuntingGround(ground.id);

  const killerId = KILLER_MAP[killer] ? killer : '迈克尔·迈尔斯';
  // 配件是本局一次性消耗品：只认当前杀手的、最多 2 件，别的 id 直接忽略。
  const accessories = sanitizeAccessoryLoadout(accessoryIds, killerId);
  // 所有配件数值先汇总成一张修正表，开局的基础值统一从这里取。
  const modifiers = modifiersForAccessories(accessories);
  const baseFearRadius = KILLER_MAP[killerId].fearRadius ?? 1;
  const startingEnergy = Math.max(1, BASE_AP + modifiers.ap);
  const activeMission = mission ?? generateMission(killerId);
  const people = createPeople(activeMission).filter((person) => KILLER_MAP[killerId].school !== 'supernatural' || person.role !== 'police');
  const pile = shuffle(deckIds.filter((id) => CARD_MAP[id])).map<CardInstance>((defId) => ({
    uid: uid('card'),
    defId,
  }));
  const sacrifice = randomOf(people.filter((person) => person.role !== 'police'));
  if (sacrifice) sacrifice.bloodSacrifice = true;
  const state: GameState = {
    phase: 'playing',
    mapId: ground.id,
    killer: killerId,
    accessories,
    modifiers,
    killerRuntime: { killUsed: false, moveUsed: false, attackUsed: false, witnessUsed: false },
    // 逮捕阈值已废弃（警戒与逮捕合并），保留字段只为兼容旧存档
    arrestThreshold: 5 + (activeMission.targetCount ?? 1),
    turn: 1,
    // 走路 / 砍人 / 打牌 / 搜索共用这一个池子，原来「能量 + 步数」两套资源合并
    energy: startingEnergy,
    maxEnergy: startingEnergy,
    // 与初始 alarm:12 对齐：wanted 只是暴露度 /10 的镜像
    wanted: 2,
    heatTurn: 0,
    policeLock: 0,
    ambushTurn: 0,
    revealAuraActions: 0,
    trailRevealActions: 0,
    highlightedTrail: null,
    attackBlockedTurn: 0,
    auraTargeting: false,
    stealthActions: Math.max(0, modifiers.startStealth),
    bleedNextHit: false,
    bitterMurmurReady: false,
    scourgeShrineRoom: null,
    scourgeShrineOccupants: [],
    cardBonusScore: 0,
    attackReady: true,
    trailClock: 0,
    frenzy: 0,
    trails: [],
    playerRoom: ENTRY_ROOM,
    lastPlayerRoom: ENTRY_ROOM,
    lookingAround: false,
    // 与场景初始朝向一致：开局面向画面下方
    playerFacing: { x: 0, y: 1 },
    people,
    hand: [],
    drawPile: pile,
    discardPile: [],
    mission: activeMission,
    missionPrimaryCompleted: false,
    myersStalkedIds: [],
    watchedRoom: null,
    completedMissionTasks: [],
    log: [],
    kills: 0,
    killsThisTurn: 0,
    executions: 0,
    scoreExecutions: 0,
    survivorKills: 0,
    specialExecutionBonus: 0,
    executionMethodsUsed: [],
    cardsPlayed: [],
    npcAlarmed: false,
    carryPersonId: null,
    executionSiteHint: null,
    carryDistance: 0,
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
    loot: 0,
    scoreBreakdown: [],
    huntStats: {
      routineInsights: 0,
      environmentActions: 0,
      trapTriggers: 0,
      hatchetHits: 0,
      nurseBlinks: 0,
      nurseBlinkAttacks: 0,
      myersBurstHits: 0,
      quietKills: 0,
      terrorKills: 0,
      comboKills: 0,
    },
    huntStyleScore: 0,
    huntStyleRank: 'C',
    huntStyleBonus: 0,
    huntStyleBreakdown: [],
    rewardCards: [],
    phoneCut: false,
    bearTraps: [],
    trapTriggerCount: 0,
    lastTrapTriggerId: null,
    trapInventory: killerId === '设陷者' ? Math.max(0, 2 + modifiers.trapCount) : 0,
    trapCaches: [],
    huntressAiming: false,
    hatchets: killerId === '女猎手' ? Math.max(1, 3 + modifiers.hatchetCount) : 0,
    nurseBlinkTargeting: false,
    nurseFollowUp: false,
    nurseFatiguePending: false,
    wiretap: false,
    poltergeist: false,
    policeBlocked: false,
    pinnedPeople: [],
    fearRadius: Math.max(0, Math.min(2, baseFearRadius + modifiers.fearRadius)),
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
    distressingActive: false,
    totems: [...TOTEM_ROOMS],
    phones: [],
    crows: [],
    palletDropCount: 0,
    crowAlerts: {},
    brokenPhones: [],
    totemInteractions: [],
    bonusEnergyNextTurn: 0,
    clearedObstacles: [],
    escaped: 0,
    barricades: [],
    exitBlockedTurns: 0,
    stunTurns: 0,
    blindTurns: 0,
    chaseTargetId: null,
    chaseTurns: 0,

    nightfallActive: false,
    lastAttackedId: null,
    policeAssaulted: false,
    cooldowns: {},
    roomLocks: {},
    revealedThisTurn: false,
    resultReason: '',
    alarm: Math.max(0, Math.min(100, 12 + modifiers.startAlarm)),
    emergencyActive: false,
    explored: [ENTRY_ROOM, ...ROOM_MAP[ENTRY_ROOM].neighbors],
    scouted: {},
    noiseRoom: null,
    sabotage: [],
    frenzyStreak: 0,
    disturbances: [],
    escapeRooms: [],
    survivorTotal: people.filter((person) => person.role !== 'police').length,
    siteItems: [],
    powerCircuits: [
      { id: 'main-floor', name: '主楼照明', breakerRoom: 'basement', affectedRooms: ['basement', 'hall', 'kitchen', 'dining', 'study'], broken: false, enabled: true },
      { id: 'upper-floor', name: '二层照明', breakerRoom: 'workshop', affectedRooms: ['workshop', 'bedroom', 'nursery', 'guestroom', 'attic'], broken: false, enabled: true },
      { id: 'east-wing', name: '东翼照明', breakerRoom: 'conservatory', affectedRooms: ['conservatory', 'garden', 'balcony', 'foyer', 'garage'], broken: false, enabled: true },
      { id: 'service-wing', name: '服务区照明', breakerRoom: 'laundry', affectedRooms: ['laundry', 'corridor', 'storage', 'wine', 'chapel', 'stairwell', 'bathroom', 'library'], broken: false, enabled: true },
    ],
  };
  // 少数幸存者开局会躲在上锁房间；断开对应区域电力可令电子门锁失效。
  const lockedHomes = shuffle([...new Set(state.people.filter((person) => person.role !== 'police').map((person) => person.room))])
    .filter((room) => ROOM_MAP[room].neighbors.length >= 2 && state.powerCircuits.some((circuit) => circuit.affectedRooms.includes(room) && !circuit.broken))
    .slice(0, 2);
  lockedHomes.forEach((room) => { state.roomLocks[room] = state.mission.turns; });

  // 场地只保留道具箱；照明由独立电闸控制，不再依赖发电机。
  const breakerRooms = state.powerCircuits.map((circuit) => circuit.breakerRoom);
  const sitePool = shuffle(ROOMS.map((room) => room.id).filter(
    (id) => id !== ENTRY_ROOM && id !== EXIT_ROOM && !ESCAPE_ROOMS.includes(id) && !OBSTACLE_ROOMS.includes(id) && !breakerRooms.includes(id),
  ));
  const items: SiteItem[] = [];
  for (let i = 0; i < ITEM_BOX_COUNT; i++) {
    const room = sitePool.pop();
    if (room) items.push({ id: `box-${i}`, kind: 'itemBox', room, broken: false, charges: ITEM_BOX_CHARGES });
  }
  state.siteItems = items;
  if (killerId === '设陷者') {
    const occupied = new Set([
      ...items.map((item) => item.room),
      ...breakerRooms,
      ENTRY_ROOM,
      EXIT_ROOM,
    ]);
    state.trapCaches = shuffle(
      ROOMS.map((room) => room.id).filter((room) => !occupied.has(room) && ROOM_MAP[room].neighbors.length >= 2),
    ).slice(0, 2);
  }


  state.people
    .filter((p) => p.role !== 'police')
    .forEach((p) => {
      const roll = random();
      if (roll < 0.22) p.goal = 'supply';
      else if (roll < 0.42) p.goal = 'routine';
      else if (roll < 0.62) p.goal = 'hide';
      else if (roll < 0.82) p.goal = 'help';
    });
  drawCards(state, 5);
  log(state, `猎场：${ground.name} · ${ground.ruleName}：${ground.ruleDescription}`);
  log(state, `契约已接取：${activeMission.title}`);
  if (lockedHomes.length) log(state, `有 ${lockedHomes.length} 间住屋从内部上锁。封锁房门会阻挡通行与视线；切断对应区域电力可使电子门锁失效，或在门外强行破门。`);
  if (sacrifice) log(state, `血祭品已标记：${sacrifice.name}。此标记本身没有额外效果。`);
  log(state, `你以「${killerId}」的身份行动。每回合 ${startingEnergy} 点行动点：走路、挥刀、出牌、搜索柜子都从这里扣。`);
  const summary = modifierSummary(state);
  if (summary.length) log(state, `配件生效：${summary.join(' · ')}。`);
  log(state, accessories.length
    ? `随身配件：${accessories.map((id) => ACCESSORY_MAP[id].name).join('、')}。配件带入即永久消耗，本局结束后不会归还。`
    : '本局没有携带配件。想带配件的话，下次出发前在装配界面选好两件。');
  log(state, '留意每个人的恐惧值与警戒值：恐惧会使人崩溃，警戒会促使人报警或逃跑。');
  log(state, `屋里有 ${items.length} 个道具箱；照明由各区域电闸独立控制。`);
  // 电话放在最后抽：不改变前面布局 / NPC / 物品的随机序列，避免影响既有对局与测试。
  state.phones = pickPhoneRooms(state);
  state.crows = pickCrowRooms(state, state.phones);
  return state;
}

