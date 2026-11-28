/**
 * 世界查询层的回归测试。
 *
 * 这一套只测 `src/game/world/roomState.ts`：它是从 engine.ts 里拆出来的第一块，
 * 以后新 AI 会直接依赖它，所以先把行为钉死，避免后续拆分时悄悄改变语义。
 *
 * 运行：npm run check
 */
import { STARTING_DECK } from '../src/game/data/cards';
import { ROOM_MAP } from '../src/game/rooms';
import { createGame } from '../src/game/setup';
import {
  cabinetRoomsFor,
  canStand,
  isLocked,
  isRoomLit,
  lockedRoomsOf,
  npcPeople,
  peopleInRoom,
  standingPeople,
} from '../src/game/world/roomState';
import { canMoveTo, moveBlockReason, moveCost } from '../src/game/world/movement';
import { phoneWorks, workingPhones } from '../src/game/world/phones';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

const game = createGame(STARTING_DECK, undefined, '设陷者');
const litRoom = game.powerCircuits[0].affectedRooms[0];

/* ---------------- 锁与电 ---------------- */

game.roomLocks = { [litRoom]: 2 };
check('上锁且房间有电：门是锁的', isLocked(game, litRoom), `room=${litRoom}`);

const circuit = game.powerCircuits[0];
const wasEnabled = circuit.enabled;
circuit.enabled = false;
check('同一扇门，断电后自动解锁（电子锁失效）', !isLocked(game, litRoom), `room=${litRoom}`);
circuit.enabled = wasEnabled;

circuit.broken = true;
check('电路被破坏：房间不再算亮着', !isRoomLit(game, litRoom), `room=${litRoom}`);
check('电路被破坏时，锁着的门同样失效', !isLocked(game, litRoom), `room=${litRoom}`);
circuit.broken = false;

circuit.flickerTurns = 1;
check('环境事件闪断：暂时不算亮着', !isRoomLit(game, litRoom), `flicker=${circuit.flickerTurns}`);
circuit.flickerTurns = 0;

check('恢复供电后重新算亮着', isRoomLit(game, litRoom), `room=${litRoom}`);

game.roomLocks = { [litRoom]: 0, attic: 3 };
check(
  'lockedRoomsOf 只返回还剩回合数的房间',
  lockedRoomsOf(game).length === 1 && lockedRoomsOf(game)[0] === 'attic',
  `locks=${JSON.stringify(lockedRoomsOf(game))}`,
);

/* ---------------- 障碍物 ---------------- */

check('被封死的入口：清障之前不能站人', !canStand(game, 'storage'), 'storage');
game.clearedObstacles = ['storage'];
check('清掉木板后可以站人', canStand(game, 'storage'), 'storage');
check('普通房间一直可以站人', canStand(game, 'attic'), 'attic');

/* ---------------- 人 ---------------- */

const npc = npcPeople(game)[0];
game.people.forEach((person) => {
  person.room = 'attic';
});
npc.room = 'basement';
npc.hp = 0;

check('peopleInRoom 按房间过滤', peopleInRoom(game, 'attic').length === game.people.length - 1,
  `attic=${peopleInRoom(game, 'attic').length} total=${game.people.length}`);
check('peopleInRoom 按角色过滤，警察不在 NPC 名单里',
  peopleInRoom(game, 'attic', 'police').every((person) => person.role === 'police'),
  `police=${peopleInRoom(game, 'attic', 'police').length}`);
check('npcPeople 排除警察', npcPeople(game).every((person) => person.role !== 'police'),
  `npc=${npcPeople(game).length}`);
check('standingPeople 排除倒地的人', standingPeople(game).every((person) => person.hp > 0),
  `standing=${standingPeople(game).length}`);

/* ---------------- 藏身房间 ---------------- */

const onBadham = { ...game, mapId: 'badham' as const };
const onMidwich = { ...game, mapId: 'midwich' as const };
const badhamRooms = cabinetRoomsFor(onBadham);
const midwichRooms = cabinetRoomsFor(onMidwich);
check('巴德姆幼儿园额外开放玩具仓库 / 值班室 / 幼儿教室',
  ['nursery', 'storage', 'guestroom'].every((room) => badhamRooms.includes(room as never)),
  `rooms=${badhamRooms.join(',')}`);
check('其他地图不额外开放这三间',
  !['guestroom'].some((room) => midwichRooms.includes(room as never)),
  `rooms=${midwichRooms.join(',')}`);

/* ---------------- 电话 ---------------- */

const phoneGame = createGame(STARTING_DECK, undefined, '设陷者');
const phoneRoom = phoneGame.phones[0];
check('默认布局：电话可用', phoneWorks(phoneGame, phoneRoom), `room=${phoneRoom}`);
phoneGame.brokenPhones = [phoneRoom];
check('砸坏的房间不再可用', !phoneWorks(phoneGame, phoneRoom), `room=${phoneRoom}`);
check('workingPhones 不会列出被砸坏的电话',
  !workingPhones(phoneGame).includes(phoneRoom), `working=${workingPhones(phoneGame).join(',')}`);
phoneGame.brokenPhones = [];
phoneGame.phoneCut = true;
check('整条线路被切断：所有电话失效', workingPhones(phoneGame).length === 0, 'phoneCut');

/* ---------------- 移动 ---------------- */

const moveGame = createGame(STARTING_DECK, undefined, '设陷者');
const inside = moveGame.playerRoom;
check('站在自己的房间：不能移动到原地',
  moveBlockReason(moveGame, inside) === '你已经在这个房间了。', `room=${inside}`);

const nextRoom = ROOM_MAP[inside].neighbors.find((room) => room !== 'storage' && room !== 'basement')
  ?? ROOM_MAP[inside].neighbors[0];
check('相邻房间：行动点够时可以走', moveBlockReason(moveGame, nextRoom) === null && canMoveTo(moveGame, nextRoom),
  `room=${nextRoom}`);
check('默认走一步 1 点', moveCost(moveGame, nextRoom) === 1, `cost=${moveCost(moveGame, nextRoom)}`);

moveGame.energy = 0;
check('行动点不够时给出原因', (moveBlockReason(moveGame, nextRoom) ?? '').includes('行动点不够'),
  `reason=${moveBlockReason(moveGame, nextRoom)}`);
moveGame.energy = 4;

moveGame.barricades = [nextRoom];
check('门口有木板：不能直接走', (moveBlockReason(moveGame, nextRoom) ?? '').includes('木板'),
  `reason=${moveBlockReason(moveGame, nextRoom)}`);
moveGame.barricades = [];

moveGame.roomLocks = { [nextRoom]: 3 };
check('门被锁住：不能走', (moveBlockReason(moveGame, nextRoom) ?? '').includes('门被锁住了'),
  `reason=${moveBlockReason(moveGame, nextRoom)}`);
moveGame.roomLocks = {};

moveGame.killer = '迈克尔·迈尔斯';
moveGame.myersStalking = true;
check('迈尔斯尾随模式：走一步要 2 点', moveCost(moveGame, nextRoom) === 2,
  `cost=${moveCost(moveGame, nextRoom)}`);
moveGame.myersStalking = false;

console.log(`\n世界查询 ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
