import { CARD_MAP, UNLOCK_REWARDS } from './cards';
import { KILLER_MAP } from './killers';
import { generateMission, roomName } from './missions';
import {
  CABINET_ROOMS,
  ENTRY_ROOM,
  EXIT_ROOM,
  OBSTACLE_ROOMS,
  POLICE_START,
  ROOM_MAP,
  ROOMS,
  TOTEM_ROOMS,
} from './rooms';
import { SETUP_CARDS, SETUP_MAP } from './setupCards';
import { SPECIAL_SURVIVORS, SURVIVOR_MAP, SURVIVORS, type NpcThreat } from './survivors';
import type {
  CardInstance,
  GameState,
  Mission,
  Person,
  ResultKind,
  RoomId,
} from './types';

let uidCounter = 0;
const uid = (prefix: string) => `${prefix}-${Date.now()}-${uidCounter++}`;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function log(state: GameState, text: string): void {
  state.log.unshift(`[第 ${state.turn} 回合] ${text}`);
  if (state.log.length > 40) state.log.length = 40;
}

function mechanicId(state: GameState): string | undefined {
  return KILLER_MAP[state.killer]?.mechanic.id;
}

function resetKillerRuntime(state: GameState): void {
  state.killerRuntime = { killUsed: false, moveUsed: false, attackUsed: false, witnessUsed: false };
}

function hasThreatInRoom(state: GameState, room: RoomId, threat: NpcThreat, excludeId?: string): boolean {
  return peopleInRoom(state, room).some(
    (p) => p.id !== excludeId && SURVIVOR_MAP[p.id]?.threat === threat,
  );
}

/** 布局牌对报警通缉值的削弱 */
function witnessWanted(state: GameState, base: number): number {
  let gain = base;
  if (state.phoneCut) gain -= 1;
  if (state.poltergeist) gain -= 1;
  return Math.max(0, gain);
}

function peopleInRoom(state: GameState, room: RoomId, role?: 'target' | 'civilian' | 'police'): Person[] {
  return state.people.filter((p) => p.room === room && (!role || p.role === role));
}

function findVictim(state: GameState, room: RoomId): Person | undefined {
  const here = peopleInRoom(state, room);
  return (
    here.find((p) => p.role === 'target' && p.marked) ??
    here.find((p) => p.role === 'target') ??
    here.find((p) => p.role === 'civilian')
  );
}

function addWanted(state: GameState, amount: number): void {
  state.wanted = clamp(state.wanted + amount, 0, 10);
}

function killPerson(state: GameState, person: Person, fromCurse = false): void {
  state.people = state.people.filter((p) => p.id !== person.id);
  state.kills += 1;
  state.killsThisTurn += 1;
  if (person.marked) state.markedKilled += 1;
  state.lastCrimeRoom = state.playerRoom;

  const id = mechanicId(state);
  const spiritualVictim = SURVIVOR_MAP[person.id]?.threat === 'spiritual';
  const silentFirstKill = id === 'nightfall' && !state.killerRuntime.killUsed && !spiritualVictim;
  if (silentFirstKill) {
    log(state, `${KILLER_MAP[state.killer].mechanic.name}：第一刀没有惊动任何人。`);
  } else {
    addWanted(state, person.role === 'target' ? 2 : 1);
  }
  state.killerRuntime.killUsed = true;
  log(state, `你击杀了${person.marked ? '标记目标' : person.role === 'police' ? '警察' : '平民'} ${person.name}。`);

  if (id === 'curse' && !fromCurse) {
    ROOM_MAP[state.playerRoom].neighbors.forEach((room) => {
      peopleInRoom(state, room, 'target').forEach((victim) => {
        victim.hp -= 1;
        if (victim.hp <= 0) {
          killPerson(state, victim, true);
        } else {
          log(state, `诅咒蔓延到${roomName(room)}，${victim.name} 失去 1 点生命。`);
        }
      });
    });
  }
}

function damageVictim(
  state: GameState,
  amount: number,
  onlyWounded = false,
  chosenVictim?: Person,
): boolean {
  const victim = chosenVictim ?? findVictim(state, state.playerRoom);
  if (!victim) {
    log(state, '当前房间没有可下手的目标。');
    return false;
  }
  if (onlyWounded && victim.hp > 2) {
    log(state, `${victim.name} 伤势不重，最后一刀没有奏效。`);
    return false;
  }
  let damage = amount + state.bonusDamage;
  const mid = mechanicId(state);
  if (mid === 'huntress' && !state.killerRuntime.attackUsed) {
    damage += 1;
    state.killerRuntime.attackUsed = true;
    log(state, '蓄力飞斧：本回合首次攻击伤害 +1。');
  }
  if (mid === 'butcher' && !state.killerRuntime.attackUsed) {
    damage += 2;
    state.killerRuntime.attackUsed = true;
    addWanted(state, 1);
    log(state, '狂暴冲撞：首次攻击伤害 +2，但引擎声让通缉值 +1。');
  }
  if (hasThreatInRoom(state, state.playerRoom, 'team', victim.id)) {
    damage = Math.max(1, damage - 1);
    log(state, `${victim.name} 受到同伴掩护，伤害 -1。`);
  }
  state.bonusDamage = 0;
  victim.hp -= damage;
  if (victim.hp <= 0) {
    killPerson(state, victim);
  } else {
    log(state, `你对 ${victim.name} 造成 ${damage} 点伤害，剩余生命 ${victim.hp}。`);
    if (mid === 'torture' && !state.pinnedPeople.includes(victim.id)) {
      state.pinnedPeople.push(victim.id);
      log(state, `锁链拷问：${victim.name} 被钉在原地，无法逃离。`);
    }
  }
  return true;
}

function createPeople(mission: Mission, luredRoom?: RoomId): Person[] {
  const rooms = shuffle(ROOMS.map((r) => r.id));
  const markedCount = mission.kind === 'assassinate' ? mission.targetCount ?? 2 : 1;

  // 每局至少安排两名知名角色，他们具备会改变局势的威胁能力。
  const featured = shuffle(SPECIAL_SURVIVORS).slice(0, 2);
  const rest = shuffle(SURVIVORS.filter((s) => !featured.some((f) => f.id === s.id)));
  const cast = [...featured, ...rest];

  const people: Person[] = [];
  cast.slice(0, markedCount).forEach((s, i) => {
    people.push({
      id: s.id,
      name: s.name,
      role: 'target',
      room: luredRoom ?? rooms[i + 2] ?? rooms[i],
      hp: 4,
      marked: true,
    });
  });
  cast.slice(markedCount, markedCount + 2).forEach((s, i) => {
    people.push({
      id: s.id,
      name: s.name,
      role: 'target',
      room: rooms[(i + 3) % rooms.length],
      hp: 4,
      marked: false,
    });
  });
  cast.slice(markedCount + 2, markedCount + 6).forEach((s, i) => {
    people.push({
      id: s.id,
      name: s.name,
      role: 'civilian',
      room: rooms[(i + 5) % rooms.length],
      hp: 2,
      marked: false,
    });
  });

  people.push({
    id: 'police-0',
    name: '巡逻警员',
    role: 'police',
    room: POLICE_START,
    hp: 99,
    marked: false,
  });

  return people;
}

export function drawCards(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break;
      state.drawPile = shuffle(state.discardPile);
      state.discardPile = [];
      log(state, '弃牌堆重新洗入牌库。');
    }
    const card = state.drawPile.pop();
    if (card) state.hand.push(card);
  }
}

export function createGame(
  deckIds: string[],
  mission = generateMission(),
  killer = '迈克尔·迈尔斯',
): GameState {
  const pile = shuffle(deckIds).map<CardInstance>((defId) => ({ uid: uid('card'), defId }));
  const killerId = KILLER_MAP[killer] ? killer : '迈克尔·迈尔斯';
  const mid = KILLER_MAP[killerId].mechanic.id;
  const state: GameState = {
    phase: 'setup',
    killer: killerId,
    killerRuntime: { killUsed: false, moveUsed: false, attackUsed: false, witnessUsed: false },
    arrestThreshold: mid === 'nightfall' ? 6 : 4,
    turn: 1,
    energy: 3,
    maxEnergy: 3,
    steps: mid === 'nurse' ? 3 : 2,
    maxSteps: mid === 'nurse' ? 3 : 2,
    wanted: 0,
    playerRoom: ENTRY_ROOM,
    people: [],
    hand: [],
    drawPile: pile,
    discardPile: [],
    mission,
    log: [],
    kills: 0,
    killsThisTurn: 0,
    evidence: 0,
    ritualStreak: 0,
    markedKilled: 0,
    targetEscaped: false,
    decoyRoom: null,
    lockedRooms: [],
    freeMove: false,
    discount: 0,
    bonusDamage: 0,
    noAlarmTurn: false,
    lastCrimeRoom: null,
    result: null,
    score: 0,
    rewardCards: [],
    setupPoints: 2,
    setupHand: shuffle(SETUP_CARDS.map((c) => c.id)).slice(0, 4),
    phoneCut: false,
    wiretap: false,
    poltergeist: false,
    firstTurnSilent: false,
    luredRoom: null,
    policeBlocked: false,
    pinnedPeople: [],
    stalkMeter: 0,
    stalkTargetId: null,
    possessed: false,
    bonusEnergyNextTurn: 0,
    clearedObstacles: [],
  };
  drawCards(state, 5);
  log(state, `契约已接取：${mission.title}`);
  log(state, `你以「${killerId}」的身份行动，原创机制「${KILLER_MAP[killerId].mechanic.name}」已生效。`);
  log(state, '布局阶段：先安排好现场，再开始行动。');
  return state;
}

export function canPlaySetupCard(state: GameState, cardId: string): boolean {
  const def = SETUP_MAP[cardId];
  return !!def && state.phase === 'setup' && state.setupPoints >= def.cost && state.setupHand.includes(cardId);
}

export function playSetupCard(state: GameState, cardId: string): boolean {
  if (!canPlaySetupCard(state, cardId)) return false;
  const def = SETUP_MAP[cardId];
  state.setupPoints -= def.cost;
  state.setupHand = state.setupHand.filter((id) => id !== cardId);
  log(state, `布局：打出「${def.name}」。`);

  switch (cardId) {
    case 'cut_line':
      state.phoneCut = true;
      break;
    case 'wiretap':
      state.wiretap = true;
      break;
    case 'lure':
      state.luredRoom = randomOf(['attic', 'storage', 'kitchen', 'study'] as RoomId[]);
      log(state, `你在${roomName(state.luredRoom)}制造了声响。`);
      break;
    case 'poltergeist':
      state.poltergeist = true;
      break;
    case 'blackout':
      state.firstTurnSilent = true;
      break;
    case 'block_gate':
      state.policeBlocked = true;
      break;
    case 'ghost_light':
      state.steps += 1;
      break;
    case 'false_report':
      state.arrestThreshold += 1;
      break;
  }
  return true;
}

export function beginOperation(state: GameState): void {
  if (state.phase !== 'setup') return;
  state.people = createPeople(state.mission, state.luredRoom ?? undefined);
  state.phase = 'playing';
  log(state, '布局完成，行动开始。');
  if (state.luredRoom) log(state, `标记目标已被吸引到${roomName(state.luredRoom)}。`);
}

export function effectiveCost(defId: string, state: GameState): number {
  const card = CARD_MAP[defId];
  if (!card) return 99;
  return Math.max(0, card.cost - state.discount);
}

export function canMoveTo(state: GameState, room: RoomId): boolean {
  if (state.phase !== 'playing') return false;
  if (state.steps <= 0 && !state.freeMove) return false;
  if (room === state.playerRoom) return false;
  if (state.freeMove) return true;
  const id = mechanicId(state);
  if (OBSTACLE_ROOMS.includes(room) && !state.clearedObstacles.includes(room)) {
    if (!(id === 'stalker' && state.possessed)) return false;
  }
  if ((id === 'wraith' || id === 'rift') && !state.killerRuntime.moveUsed) return true;
  return ROOM_MAP[state.playerRoom].neighbors.includes(room);
}

export function movePlayer(state: GameState, room: RoomId): boolean {
  if (!canMoveTo(state, room)) {
    log(state, '无法移动到那里：不是相邻房间，或本回合步数已用尽。');
    return false;
  }

  const id = mechanicId(state);
  const firstMove = !state.killerRuntime.moveUsed;
  const phaseThroughWall = (id === 'wraith' || id === 'rift') && firstMove && !state.freeMove;

  if (OBSTACLE_ROOMS.includes(room) && !state.clearedObstacles.includes(room) && id === 'stalker' && state.possessed) {
    state.clearedObstacles.push(room);
    log(state, `恶魔附身：你徒手拆开${roomName(room)}的障碍物，闯了进去。`);
  }
  if (id === 'trapper' && firstMove) {
    const left = state.playerRoom;
    if (!state.lockedRooms.includes(left)) {
      state.lockedRooms.push(left);
      log(state, `封门设陷：${roomName(left)}被封锁 1 回合。`);
    }
  }
  if (phaseThroughWall) {
    log(state, '穿墙逐影：这次移动无视相邻限制，且不会惊动目击者。');
  }

  state.killerRuntime.moveUsed = true;
  if (!state.freeMove) state.steps -= 1;
  state.playerRoom = room;
  log(state, `你移动到${roomName(room)}。`);

  if (id === 'stalker' && !state.possessed) {
    const observed = peopleInRoom(state, room, 'target').concat(peopleInRoom(state, room, 'civilian'));
    if (observed.length > 0) {
      let gain = 12 + observed.length * 8;
      if (state.stalkTargetId && observed.some((p) => p.id === state.stalkTargetId)) gain += 10;
      state.stalkMeter = clamp(state.stalkMeter + gain, 0, 100);
      state.stalkTargetId = randomOf(observed).id;
      log(state, `恶魔附身：尾随值 +${gain}（当前 ${state.stalkMeter}/100）。`);
      if (state.stalkMeter >= 100) log(state, '尾随值已满，你可以进入恶魔附身。');
    }
  }

  if (id === 'dream' && firstMove) {
    state.steps += 1;
    log(state, '梦中追猎：额外获得 1 点步数。');
  }
  return true;
}

export function canEnterPossession(state: GameState): boolean {
  return (
    state.phase === 'playing' &&
    mechanicId(state) === 'stalker' &&
    !state.possessed &&
    state.stalkMeter >= 100
  );
}

export function enterPossession(state: GameState): boolean {
  if (!canEnterPossession(state)) return false;
  state.possessed = true;
  log(state, '恶魔附身：面具合拢，你可以直接处决同房间的人类。');
  return true;
}

/** 基础攻击：消耗 1 点能量，攻击当前房间的指定人物（默认优先标记目标）。 */
export function basicAttack(state: GameState, personId?: string): boolean {
  if (state.phase !== 'playing') return false;
  if (state.energy < 1) {
    log(state, '能量不足：基础攻击需要 1 点能量。');
    return false;
  }

  const here = peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police' && p.hp > 0);
  const victim = (personId ? here.find((p) => p.id === personId) : findVictim(state, state.playerRoom));
  if (!victim || victim.role === 'police') {
    log(state, '当前房间没有可以攻击的人类。');
    return false;
  }

  if (state.possessed && mechanicId(state) === 'stalker') {
    killPerson(state, victim);
    addWanted(state, 1);
    state.possessed = false;
    state.stalkMeter = 0;
    state.stalkTargetId = null;
    log(state, `恶魔附身：你处决了 ${victim.name}，附身结束，尾随值清零。`);
    checkImmediateWin(state);
    return true;
  }

  state.energy -= 1;
  log(state, `基础攻击：你扑向 ${victim.name}（消耗 1 能量）。`);
  damageVictim(state, 1, false, victim);
  checkImmediateWin(state);
  return true;
}

function randomNeighbor(room: RoomId): RoomId {
  return randomOf(ROOM_MAP[room].neighbors);
}

export function playCard(state: GameState, cardUid: string): boolean {
  if (state.phase !== 'playing') return false;
  const index = state.hand.findIndex((c) => c.uid === cardUid);
  if (index < 0) return false;
  const card = state.hand[index];
  const def = CARD_MAP[card.defId];
  const cost = effectiveCost(card.defId, state);
  if (cost > state.energy) {
    log(state, `能量不足：${def.name} 需要 ${cost} 点。`);
    return false;
  }

  state.energy -= cost;
  state.hand.splice(index, 1);
  state.discardPile.push(card);
  log(state, `你打出「${def.name}」（消耗 ${cost} 能量）。`);

  switch (card.defId) {
    case 'shuriken':
      damageVictim(state, 2);
      break;
    case 'choke':
      damageVictim(state, 4);
      break;
    case 'silent_step':
      addWanted(state, -2);
      log(state, '通缉值 -2。');
      break;
    case 'false_lead':
      state.decoyRoom = randomNeighbor(state.playerRoom);
      log(state, `你在${roomName(state.decoyRoom)}留下伪造线索。`);
      break;
    case 'sprint':
      state.steps += 2;
      log(state, '本回合步数 +2。');
      break;
    case 'lock_door':
      if (!state.lockedRooms.includes(state.playerRoom)) {
        state.lockedRooms.push(state.playerRoom);
        log(state, `${roomName(state.playerRoom)}被封锁 1 回合。`);
      }
      break;
    case 'execute': {
      const victim = findVictim(state, state.playerRoom);
      if (victim) {
        killPerson(state, victim);
        addWanted(state, 3);
        log(state, '灭口完成，但现场留下了明显痕迹。');
      } else {
        log(state, '当前房间没有目标，灭口失败。');
      }
      break;
    }
    case 'intimidate':
      state.noAlarmTurn = true;
      log(state, '本回合目击者不敢报警。');
      break;
    case 'disguise': {
      const before = state.wanted;
      state.wanted = Math.floor(state.wanted / 2);
      log(state, `通缉值从 ${before} 降至 ${state.wanted}。`);
      break;
    }
    case 'bait':
      state.decoyRoom = randomNeighbor(state.playerRoom);
      log(state, `诱饵声引向${roomName(state.decoyRoom)}。`);
      break;
    case 'clean':
      addWanted(state, -1);
      log(state, '通缉值 -1。');
      break;
    case 'night_cover':
      drawCards(state, 1);
      log(state, '你抽了 1 张牌。');
      break;
    case 'harvest':
      if (state.killsThisTurn > 0) {
        const victims = peopleInRoom(state, state.playerRoom, 'target').filter(
          (v) => !(CABINET_ROOMS.includes(v.room) && v.role === 'civilian'),
        );
        victims.forEach((v) => {
          v.hp -= 3 + state.bonusDamage;
          if (v.hp <= 0) killPerson(state, v);
        });
        state.bonusDamage = 0;
        log(state, `收割波及 ${victims.length} 名目标。`);
      } else {
        log(state, '本回合尚无击杀，连环收割没有发动。');
      }
      break;
    case 'break_in': {
      state.freeMove = true;
      const cleared = ROOM_MAP[state.playerRoom].neighbors.filter(
        (room) => OBSTACLE_ROOMS.includes(room) && !state.clearedObstacles.includes(room),
      );
      cleared.forEach((room) => state.clearedObstacles.push(room));
      log(state, cleared.length
        ? `破门而入：障碍物已清除（${cleared.map(roomName).join('、')}），本回合移动无视相邻限制。`
        : '本回合移动无视相邻限制。');
      break;
    }
    case 'silence':
      state.discount = Math.min(2, state.discount + 1);
      log(state, '本回合后续卡牌费用 -1。');
      break;
    case 'fear':
      state.noAlarmTurn = true;
      log(state, '恐惧在相邻房间蔓延，本回合无人报警。');
      break;
    case 'aim':
      state.bonusDamage += 2;
      log(state, '下次攻击伤害 +2。');
      break;
    case 'evacuate':
      state.playerRoom = EXIT_ROOM;
      addWanted(state, -2);
      log(state, `你紧急撤离到${roomName(EXIT_ROOM)}。`);
      break;
    case 'mind_control': {
      const target = state.people.find(
        (p) => p.role === 'target' && p.room !== state.playerRoom && !CABINET_ROOMS.includes(p.room),
      );
      if (target) {
        target.room = state.playerRoom;
        log(state, `${target.name} 被引到${roomName(state.playerRoom)}。`);
      } else {
        log(state, '没有可被操控的目标。');
      }
      break;
    }
    case 'final_blow':
      damageVictim(state, 5, true);
      break;
    case 'search':
      state.evidence += 1;
      log(state, `证据 +1（当前 ${state.evidence}）。`);
      break;
  }

  checkImmediateWin(state);
  return true;
}

function checkImmediateWin(state: GameState): void {
  if (state.result) return;
  const m = state.mission;
  if (m.kind === 'assassinate' && state.markedKilled >= (m.targetCount ?? 2)) {
    finish(state, 'win');
  } else if (m.kind === 'evidence' && state.evidence >= (m.targetCount ?? 2) && state.playerRoom === EXIT_ROOM) {
    finish(state, 'win');
  } else if (m.kind === 'escape' && state.markedKilled >= 1 && state.playerRoom === EXIT_ROOM) {
    finish(state, 'win');
  }
}

function policeNextStep(state: GameState): RoomId {
  const police = state.people.find((p) => p.role === 'police');
  if (!police) return POLICE_START;
  const destination = state.decoyRoom ?? state.lastCrimeRoom ?? state.playerRoom;
  if (police.room === destination) return police.room;

  const queue: RoomId[][] = [[police.room]];
  const visited = new Set<RoomId>([police.room]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    for (const next of ROOM_MAP[current].neighbors) {
      if (visited.has(next)) continue;
      if (state.lockedRooms.includes(next) && next !== destination) continue;
      visited.add(next);
      const newPath = [...path, next];
      if (next === destination) return path.length === 1 ? next : newPath[1];
      queue.push(newPath);
    }
  }
  return police.room;
}

function policePhase(state: GameState): void {
  const police = state.people.find((p) => p.role === 'police');
  if (!police) return;

  const next = policeNextStep(state);
  if (state.wiretap) log(state, `窃听：警察正在前往${roomName(next)}。`);
  if (state.policeBlocked && state.turn === 1) {
    log(state, '后院大门被锁，警察第一回合无法移动。');
  } else if (next !== police.room) {
    police.room = next;
    log(state, `警察移动到${roomName(next)}。`);
  }

  if (police.room === state.playerRoom) {
    if (state.wanted >= state.arrestThreshold) {
      log(state, '警察在现场将你逮捕。');
      finish(state, 'caught');
      return;
    }
    addWanted(state, 1);
    log(state, '警察与你擦肩而过，通缉值 +1。');
  }
}

function witnessPhase(state: GameState): void {
  if (state.noAlarmTurn || (state.firstTurnSilent && state.turn === 1)) {
    log(state, '目击者保持沉默。');
    return;
  }
  const witnesses = peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police' && p.hp > 0);
  if (witnesses.length === 0) return;

  const id = mechanicId(state);
  const spiritualSees = hasThreatInRoom(state, state.playerRoom, 'spiritual');
  if (spiritualSees) {
    log(state, '灵异感知者看穿了你的伪装，任何隐匿都失效。');
  } else {
    if ((id === 'wraith' || id === 'rift') && state.killerRuntime.moveUsed) {
      log(state, `${KILLER_MAP[state.killer].mechanic.name}：目击者只看见一道模糊的影子，没有报警。`);
      return;
    }
    if (id === 'nightfall' && !state.killerRuntime.witnessUsed) {
      state.killerRuntime.witnessUsed = true;
      log(state, '夜幕潜行：目击者没能确认你的脸，本回合没有报警。');
      return;
    }
    if (id === 'shock' && !state.killerRuntime.witnessUsed) {
      state.killerRuntime.witnessUsed = true;
      addWanted(state, 1);
      log(state, '强制治疗：目击者突然安静下来，但电流痕迹让通缉值 +1。');
      return;
    }
  }

  const alarmWitness = witnesses.find((p) => SURVIVOR_MAP[p.id]?.threat === 'alarm');
  const witness = alarmWitness ?? witnesses[0];
  const base = alarmWitness ? 3 : 2;
  const gain = witnessWanted(state, base);
  addWanted(state, gain);
  state.lastCrimeRoom = state.playerRoom;
  log(state, `${witness.name} 目击了你，通缉值 +${gain}${alarmWitness ? '（报警者）' : ''}。`);
  if (alarmWitness) {
    state.decoyRoom = witness.room;
    log(state, `${witness.name} 直接报出了这间房，警察正在赶来。`);
  }
  const escapeRooms = ROOM_MAP[witness.room].neighbors.filter((r) => r !== state.playerRoom);
  if (escapeRooms.length) witness.room = randomOf(escapeRooms);
}

function finish(state: GameState, result: ResultKind): void {
  if (state.result) return;
  state.result = result;
  state.phase = 'gameover';

  let score = state.mission.reward + state.kills * 10 - state.wanted * 3;
  if (result === 'win') {
    score += (state.mission.turns - state.turn) * 5;
    state.rewardCards = [UNLOCK_REWARDS[state.mission.kind]].filter(Boolean);
  } else if (result === 'caught') {
    score -= 80;
  } else if (result === 'timeout') {
    score -= 50;
  } else {
    score -= 40;
  }
  state.score = Math.max(0, Math.round(score));
}

export function endTurn(state: GameState): void {
  if (state.phase !== 'playing') return;

  const m = state.mission;
  if (m.kind === 'ritual' && m.targetRoom) {
    if (state.playerRoom === m.targetRoom && state.wanted < 4) {
      state.ritualStreak += 1;
      log(state, `仪式进度 ${state.ritualStreak}/${m.targetCount ?? 2}。`);
    } else {
      state.ritualStreak = 0;
      log(state, '仪式中断。');
    }
  }

  if (m.kind === 'bodyCount' && state.kills >= (m.targetCount ?? 3) && state.wanted <= (m.maxWanted ?? 3)) {
    finish(state, 'win');
    return;
  }
  if (m.kind === 'ritual' && state.ritualStreak >= (m.targetCount ?? 2)) {
    finish(state, 'win');
    return;
  }

  if (mechanicId(state) === 'stalker') {
    if (state.possessed) {
      state.possessed = false;
      log(state, '恶魔附身：这一回合没有处决，附身自行消散。');
    }
    if (state.stalkMeter > 0) {
      const decay = Math.min(state.stalkMeter, 8);
      state.stalkMeter -= decay;
      log(state, `尾随值随时间衰减 -${decay}（当前 ${state.stalkMeter}/100）。`);
    }
  }

  if (TOTEM_ROOMS.includes(state.playerRoom)) {
    state.bonusEnergyNextTurn = 1;
    log(state, '图腾余响：下一回合额外获得 1 点能量。');
  }

  // 领路人会带一名同伴离开你的视线；被锁链钉住的人无法跟走。
  state.people
    .filter((p) => SURVIVOR_MAP[p.id]?.threat === 'lead' && !state.pinnedPeople.includes(p.id))
    .forEach((leader) => {
      const follower = state.people.find(
        (p) =>
          p.id !== leader.id &&
          p.role !== 'police' &&
          p.room === leader.room &&
          !state.pinnedPeople.includes(p.id),
      );
      if (!follower) return;
      const options = ROOM_MAP[follower.room].neighbors.filter((r) => r !== state.playerRoom);
      if (options.length) {
        follower.room = randomOf(options);
        log(state, `${leader.name} 带着 ${follower.name} 撤离到${roomName(follower.room)}。`);
      }
    });

  policePhase(state);
  if (state.result) return;

  witnessPhase(state);
  checkImmediateWin(state);
  if (state.result) return;

  state.decoyRoom = null;
  state.lockedRooms = [];
  state.freeMove = false;
  state.discount = 0;
  state.bonusDamage = 0;
  state.noAlarmTurn = false;
  state.killsThisTurn = 0;

  if (state.turn >= m.turns) {
    finish(state, 'timeout');
    return;
  }

  state.turn += 1;
  state.energy = state.maxEnergy + state.bonusEnergyNextTurn;
  state.bonusEnergyNextTurn = 0;
  state.steps = state.maxSteps;
  resetKillerRuntime(state);
  state.pinnedPeople = [];
  drawCards(state, 5);
  log(state, '新回合开始，能量与步数已恢复。');
}

export function giveUp(state: GameState): void {
  finish(state, 'failed');
}

export function startTurn(state: GameState): void {
  state.energy = state.maxEnergy;
  state.steps = state.maxSteps;
  resetKillerRuntime(state);
  state.freeMove = false;
  state.discount = 0;
  state.bonusDamage = 0;
  state.noAlarmTurn = false;
  state.killsThisTurn = 0;
  drawCards(state, Math.max(0, 5 - state.hand.length));
}

export function getStars(score: number): number {
  if (score >= 220) return 3;
  if (score >= 130) return 2;
  return 1;
}

export { generateMission };
