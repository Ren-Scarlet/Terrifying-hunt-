/**
 * 幸存者 AI 判定的回归测试。
 *
 * 这些判定是整个 AI 的"地基"：档位怎么分、谁算想逃、哪里能放板、隔多远还能协调救援。
 * 先用测试钉死，之后把 AI 决策整块搬走时，就能确认地基没有跟着漂移。
 */
import { STARTING_DECK } from '../src/game/data/cards';
import { roomDistance } from '../src/game/navigation';
import { ROOMS } from '../src/game/rooms';
import { createGame } from '../src/game/setup';
import { npcPeople } from '../src/game/world/roomState';
import {
  canCoordinateRescue,
  canPlaceBarricade,
  effectiveFearRadius,
  fearAtLeast,
  fearBand,
  isQuietMove,
  wantsToLeave,
} from '../src/game/npc/ai/predicates';
import type { Person, RoomId } from '../src/game/types';

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
const person: Person = npcPeople(game)[0];

/* ---------------- 恐惧档位 ---------------- */

const bandOf = (fear: number) => {
  person.fear = fear;
  return fearBand(person);
};
check('恐惧 0–29：冷静', bandOf(0) === 'calm' && bandOf(29) === 'calm');
check('恐惧 30–59：不安', bandOf(30) === 'uneasy' && bandOf(59) === 'uneasy');
check('恐惧 60–84：恐惧', bandOf(60) === 'afraid' && bandOf(84) === 'afraid');
check('恐惧 85+：崩溃', bandOf(85) === 'broken' && bandOf(100) === 'broken');

person.fear = 60;
check('fearAtLeast 按档位判断', fearAtLeast(person, 'afraid') && !fearAtLeast(person, 'broken'));
person.fear = 85;
check('fearAtLeast 崩溃档', fearAtLeast(person, 'broken'));
person.fear = 0;

/* ---------------- 感知半径 ---------------- */

game.modifiers.fearRadius = 1;
check('默认感知半径等于杀手基础值', effectiveFearRadius(game) === 2, `r=${effectiveFearRadius(game)}`);
game.stealthActions = 1;
check('静止隐身：感知半径压到 0', effectiveFearRadius(game) === 0);
game.stealthActions = 0;
game.killer = '迈克尔·迈尔斯';
game.myersStalking = true;
check('迈尔斯尾随：感知半径压到 0', effectiveFearRadius(game) === 0);
game.myersStalking = false;
check('迈尔斯不尾随：恢复基础值', effectiveFearRadius(game) === 2);
game.killer = '设陷者';

/* ---------------- 逃生意愿 ---------------- */

person.room = 'garden' as RoomId;
game.escapeRooms = ['garden' as RoomId];
person.alert = 34;
check('警觉没到 35：路过后院不算想逃', !wantsToLeave(game, person), `alert=${person.alert}`);
person.alert = 35;
check('警觉到 35：会翻篱笆', wantsToLeave(game, person));
person.alert = 0;
person.escapeProgress = 1;
check('已经决定逃的人不受警觉限制', wantsToLeave(game, person));
person.escapeProgress = 0;
game.escapeRooms = [];
check('没有逃生点时谁都不想走', !wantsToLeave(game, person));

/* ---------------- 放板 ---------------- */

person.room = 'storage' as RoomId;
game.barricades = [];
game.clearedObstacles = [];
check('原始就有木板的房间可以放板', canPlaceBarricade(game, person));
game.barricades = ['storage' as RoomId];
check('同一房间不能重复放板', !canPlaceBarricade(game, person));
game.barricades = [];
game.clearedObstacles = ['storage' as RoomId];
check('木板已被清掉：不能再放', !canPlaceBarricade(game, person));
game.clearedObstacles = [];
game.possessed = true;
check('恶魔附身状态下幸存者不敢放板', !canPlaceBarricade(game, person));
game.possessed = false;
person.room = 'attic' as RoomId;
check('不是障碍房间：不能放板', !canPlaceBarricade(game, person));

/* ---------------- 跨区救援 ---------------- */

const ids = ROOMS.map((room) => room.id);
let farPair: [RoomId, RoomId] | null = null;
let midPair: [RoomId, RoomId] | null = null;
let nearPair: [RoomId, RoomId] | null = null;
for (const a of ids) {
  for (const b of ids) {
    if (a === b) continue;
    const d = roomDistance(a, b);
    if (d > 3 && !farPair) farPair = [a, b];
    if (d === 2 && !midPair) midPair = [a, b];
    if (d === 1 && !nearPair) nearPair = [a, b];
  }
}

game.phoneCut = false;
check('电话正常：多远都能协调', canCoordinateRescue(game, farPair![0], farPair![1]));
game.phoneCut = true;
game.sabotage = [];
check('线路被剪、无线电正常：3 格内可协调', canCoordinateRescue(game, midPair![0], midPair![1]));
check('线路被剪、无线电正常：超过 3 格无法协调', !canCoordinateRescue(game, farPair![0], farPair![1]));
game.sabotage = ['radio'];
check('无线电也被毁：相邻仍可协调', canCoordinateRescue(game, nearPair![0], nearPair![1]));
check('无线电也被毁：隔两格就不行', !canCoordinateRescue(game, midPair![0], midPair![1]));

/* ---------------- 潜行移动 ---------------- */

person.sneaky = false;
check('不潜行：不会静音移动', !isQuietMove(game, person));
person.sneaky = true;
const first = isQuietMove(game, person);
check('潜行：同一状态下结果稳定可复现', first === isQuietMove(game, person));

console.log(`\nAI 判定 ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
