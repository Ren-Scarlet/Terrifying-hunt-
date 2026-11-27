import { random, randomOf, shuffle } from '../random';
import { roomDistance } from '../navigation';
import { ESCAPE_ROOMS } from '../constants';
import { ENTRY_ROOM, OBSTACLE_ROOMS, POLICE_START, ROOMS } from '../rooms';
import { SPECIAL_SURVIVORS, SURVIVOR_MAP, SURVIVORS } from '../survivors';
import type { Archetype, Mission, NpcGoal, Person, PersonRole, RoomId, SurvivorItem } from '../types';
import { ROUTINE_PROFILE } from './catalog';

const STARTER_ITEM_RATE = 0.32;
const STARTER_ITEMS: SurvivorItem[] = ['medkit', 'toolbox', 'flashlight', 'smoke', 'flare'];

/** 每件道具能用几次：工具箱/手电筒/医疗包耐用品 2 次，其余一次 */
export function itemUsesFor(item: SurvivorItem): number {
  return item === 'toolbox' || item === 'flashlight' || item === 'medkit' ? 2 : 1;
}


export const ACTIVITIES = [
  '在翻找抽屉',
  '靠在窗边抽烟',
  '整理桌上的文件',
  '盯着墙上的旧钟',
  '在门后犹豫',
  '把箱子搬到墙角',
  '低声哼着歌',
];

const ARCHETYPES: Archetype[] = ['alert', 'defiant', 'caller', 'rescuer', 'hider', 'brave', 'kiter'];

/** 按角色设定挑行为类型：有威胁设定的角色往对应的类型靠 */
function pickArchetype(survivor: (typeof SURVIVORS)[number]): Archetype {
  switch (survivor.threat) {
    case 'alarm':
      return 'caller';
    case 'lead':
      return 'alert';
    case 'team':
      return 'brave';
    case 'spiritual':
      return random() < 0.5 ? 'hider' : 'defiant';
    default:
      return randomOf(ARCHETYPES);
  }
}

function goalForArchetype(archetype: Archetype): NpcGoal {
  switch (archetype) {
    case 'caller':
      return 'phone';
    case 'alert':
      return 'exit';
    case 'rescuer':
      return 'help';
    case 'brave':
      return 'weapon';
    case 'hider':
      return 'hide';
    case 'defiant':
      return random() < 0.5 ? 'weapon' : 'panic';
    case 'kiter':
      return random() < 0.5 ? 'supply' : 'panic';
  }
}

function makePerson(
  s: (typeof SURVIVORS)[number],
  role: PersonRole,
  room: RoomId,
  hp: number,
  marked: boolean,
): Person {
  const archetype = pickArchetype(s);
  const routine = ROUTINE_PROFILE[archetype];
  // 三成的人开局就带着一件小东西：只有发现他之后才看得到，值得你优先盯
  const starter: SurvivorItem | null = random() < STARTER_ITEM_RATE ? randomOf(STARTER_ITEMS) : null;
  return {
    id: s.id,
    name: s.name,
    role,
    room,
    hp,
    marked,
    bloodSacrifice: false,
    archetype,
    alert: 0,
    fear: 0,
    awareness: 0,
    dialogue: randomOf(['今晚吃什么？', '这里还挺安静的。', '等会儿要不要看电影？', '我有点饿了。', '忙完就去休息吧。']),
    activity: randomOf(ACTIVITIES),
    intent: 'idle',
    goal: goalForArchetype(archetype),
    routineIndex: Math.floor(random() * routine.rooms.length),
    routineSightings: 0,
    routineObserved: false,
    routineLastObservedTurn: -1,
    blockedTurns: 0,
    bleed: 0,
    downedTurns: 0,
    escapeProgress: 0,
    callTurns: 0,
    hidden: false,
    armed: false,
    // 有名有姓、带威胁设定的角色更老练；再随机挑一些普通人，避免人人都好抓
    sneaky: SURVIVOR_MAP[s.id]?.threat ? true : random() < 0.28,
    trackedTurns: 0,
    lastSeenRoom: room,
    lastSeenTurn: 0,
    item: starter,
    itemUses: starter ? itemUsesFor(starter) : 0,
    healTurns: 0,
    watchValue: 0,
    watched: false,
    movesThisTurn: 0,
  };
}

export function createPeople(mission: Mission): Person[] {
  const markedCount = mission.mode === 'free' ? 0 : mission.kind === 'assassinate' ? mission.targetCount ?? 2 : 1;

  // 每局至少安排两名知名角色，他们具备会改变局势的威胁能力。
  const featured = shuffle(SPECIAL_SURVIVORS).slice(0, 2);
  const rest = shuffle(SURVIVORS.filter((s) => !featured.some((f) => f.id === s.id)));
  const cast = [...featured, ...rest];

  // 出生点：离大厅至少 2 步，避开障碍房间与后院，别让人一开局就和玩家脸贴脸。
  const spawnPool = ROOMS.map((r) => r.id).filter(
    (id) =>
      !OBSTACLE_ROOMS.includes(id) &&
      !ESCAPE_ROOMS.includes(id) &&
      id !== ENTRY_ROOM &&
      roomDistance(ENTRY_ROOM, id) >= 2,
  );
  const spawnRooms = shuffle(spawnPool.length ? spawnPool : ROOMS.map((r) => r.id));
  const used: RoomId[] = [];
  const nextRoom = (): RoomId => {
    const pool = spawnRooms.filter((r) => !used.includes(r));
    const room = pool.length ? randomOf(pool) : randomOf(spawnRooms);
    if (!used.includes(room)) used.push(room);
    return room;
  };

  const people: Person[] = [];
  cast.slice(0, markedCount).forEach((s) => {
    const person = makePerson(s, 'target', nextRoom(), 4, true);
    // 名单上的人：你手上有他的照片和住址，开局三回合内知道他在哪。
    // 否则 15 间房的迷雾里找一个人，任务还没开始就已经输了。
    person.trackedTurns = 3;
    people.push(person);
  });
  cast.slice(markedCount, markedCount + 2).forEach((s) => {
    people.push(makePerson(s, 'target', nextRoom(), 4, false));
  });
  cast.slice(markedCount + 2, 10).forEach((s) => {
    people.push(makePerson(s, 'civilian', nextRoom(), 4, false));
  });

  // 每局至少安排两名手电筒携带者，让照晕反制不再依赖极低概率的随机道具分配。
  const flashlightCarriers = shuffle(people.filter((person) => person.item !== 'flashlight'))
    .slice(0, Math.max(0, 2 - people.filter((person) => person.item === 'flashlight').length));
  flashlightCarriers.forEach((person) => {
    person.item = 'flashlight';
    person.itemUses = itemUsesFor('flashlight');
  });

  // 至少保留一名专职躲藏者，确保柜子/床底机制每局都有机会出现。
  if (!people.some((person) => person.archetype === 'hider')) {
    const hider = randomOf(people);
    hider.archetype = 'hider';
    hider.goal = 'hide';
    hider.routineIndex = Math.floor(random() * ROUTINE_PROFILE.hider.rooms.length);
  }

  people.push({
    id: 'police-0',
    name: '巡逻警员',
    role: 'police',
    room: POLICE_START,
    hp: 4,
    marked: false,
    bloodSacrifice: false,
    archetype: 'alert',
    alert: 0,
    fear: 0,
    awareness: 0,
    dialogue: '',
    activity: '在辖区巡逻',
    intent: 'idle',
    goal: 'phone',
    blockedTurns: 0,
    bleed: 0,
    downedTurns: 0,
    escapeProgress: 0,
    callTurns: 0,
    hidden: false,
    armed: false,
    sneaky: false,
    trackedTurns: 0,
    lastSeenRoom: POLICE_START,
    lastSeenTurn: 0,
    item: null,
    itemUses: 0,
    healTurns: 0,
    watchValue: 0,
    watched: false,
    movesThisTurn: 0,
  });

  return people;
}


