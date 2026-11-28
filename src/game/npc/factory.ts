import { random, randomOf, shuffle } from '../random';
import { roomDistance } from '../navigation';
import { ESCAPE_ROOMS } from '../constants';
import { ENTRY_ROOM, OBSTACLE_ROOMS, POLICE_START, ROOMS } from '../rooms';
import { SPECIAL_SURVIVORS, SURVIVOR_MAP, SURVIVORS } from '../survivors';
import type { Mission, Person, PersonRole, RoomId } from '../types';

export const ACTIVITIES = [
  '在翻找抽屉',
  '靠在窗边抽烟',
  '整理桌上的文件',
  '盯着墙上的旧钟',
  '在门后犹豫',
  '把箱子搬到墙角',
  '低声哼着歌',
];

function makePerson(
  s: (typeof SURVIVORS)[number],
  role: PersonRole,
  room: RoomId,
  hp: number,
  marked: boolean,
): Person {
  return {
    id: s.id,
    name: s.name,
    role,
    room,
    hp,
    marked,
    bloodSacrifice: false,
    alert: 0,
    fear: 0,
    dialogue: randomOf(['今晚吃什么？', '这里还挺安静的。', '等会儿要不要看电影？', '我有点饿了。', '忙完就去休息吧。']),
    activity: randomOf(ACTIVITIES),
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
    watchValue: 0,
    watched: false,
    movesThisTurn: 0,
  };
}

export function createPeople(mission: Mission): Person[] {
  const markedCount = mission.mode === 'free' ? 0 : (mission.tasks ?? []).some((task) => !task.optional && task.kind === 'marked_kill') ? mission.targetCount ?? 1 : 0;

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

  // 柜子/床底机制对任何人都可能发生，不再指定固定的躲藏型。
  people.push({
    id: 'police-0',
    name: '巡逻警员',
    role: 'police',
    room: POLICE_START,
    hp: 4,
    marked: false,
    bloodSacrifice: false,
    alert: 0,
    fear: 0,
    dialogue: '',
    activity: '在辖区巡逻',
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
    watchValue: 0,
    watched: false,
    movesThisTurn: 0,
  });

  return people;
}


