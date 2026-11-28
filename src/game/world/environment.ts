/**
 * 环境事件：雷雨、断电、电话铃、玻璃碎裂。
 *
 * 每三回合发生一次，改变当前局势而不是只弹一条文本。只读世界状态、写日志与警报。
 */
import { roomName } from '../missions';
import { roomDistance } from '../navigation';
import { randomOf } from '../random';
import { ROOMS, ROOM_MAP } from '../rooms';
import type { GameState, RoomId } from '../types';
import { workingPhones } from './phones';
import { npcPeople as npcs } from './roomState';
import type { NpcHost } from '../npc/ai/host';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
/**
 * 每三回合发生一次环境事件。事件改变当前局势，而不是只弹一条装饰性文本：
 * 雷雨暂时压低暴露度、照明故障制造黑暗、电话铃声引出求救者、玻璃碎裂制造线索。
 */
export function triggerEnvironmentalEvent(host: NpcHost, state: GameState): void {
  if (state.turn % 3 !== 0) return;
  if (state.mapId === 'ormond') {
    const event = randomOf(['whiteout', 'avalanche'] as const);
    if (event === 'whiteout') {
      state.alarm = Math.max(0, state.alarm - 6);
      host.syncWanted(state);
      const room = 'garden' as RoomId;
      state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '暴风雪呼啸' });
      if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
      host.log(state, '【环境事件】奥蒙德 · 白色风墙】暴风雪撞上木屋，窗外一片白茫。风声吞掉了远处的动静，暴露度 -6。');
    } else {
      const room = randomOf(['balcony', 'garden'] as RoomId[]);
      const affected = npcs(state).filter((person) => person.hp > 0 && !person.hidden && roomDistance(person.room, room) <= 1);
      affected.forEach((person) => {
        person.alert = clamp(person.alert + 14, 0, 100);
        person.activity = '被屋顶积雪坠落的巨响惊动';
      });
      state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '积雪坠落' });
      if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
      host.log(state, `【环境事件】奥蒙德 · 屋顶雪崩】${roomName(room)}外传来沉闷的坠落声，${affected.length ? affected.map((person) => person.name).join('、') + '被惊动' : '没有人靠近窗边'}。`);
    }
    return;
  }
  if (state.mapId === 'badham') {
    const event = randomOf(['toy', 'intercom'] as const);
    if (event === 'toy') {
      const room = 'nursery' as RoomId;
      state.noiseRoom = room;
      state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '走调的玩具音乐' });
      if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
      const affected = npcs(state).filter((person) => person.hp > 0 && !person.hidden && roomDistance(person.room, room) <= 1);
      affected.forEach((person) => {
        person.alert = clamp(person.alert + 10, 0, 100);
        person.activity = '被幼儿教室断续响起的玩具音乐吸引';
      });
      host.log(state, `【环境事件】巴德姆 · 玩具音乐盒】幼儿教室传出走调的旋律，${affected.length ? affected.map((person) => person.name).join('、') + '开始寻找声音来源' : '空荡荡的走廊里只有音乐在回响'}。`);
    } else {
      const room = 'hall' as RoomId;
      state.noiseRoom = room;
      state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '失真的广播' });
      if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
      const caller = randomOf(npcs(state).filter((person) => person.hp > 0 && !person.hidden));
      if (caller) {
        caller.alert = clamp(caller.alert + 16, 0, 100);
        caller.activity = '听见广播里的求救杂音，正在确认来源';
      }
      host.log(state, `【环境事件】巴德姆 · 失真广播】大厅喇叭突然响起一段听不清的求救录音${caller ? '，' + caller.name + '停下脚步侧耳倾听' : ''}。`);
    }
    return;
  }
  if (state.mapId === 'lampkin') {
    const event = randomOf(['streetlight', 'caralarm'] as const);
    if (event === 'streetlight') {
      const circuit = randomOf(state.powerCircuits.filter((item) => !item.broken && (item.flickerTurns ?? 0) <= 0));
      if (circuit) {
        circuit.flickerTurns = 2;
        host.log(state, `【环境事件】兰普金巷 · 街灯熄灭】${circuit.name}的电流突然中断，窗外的街灯接连熄灭，阴影沿着房间边缘蔓延。`);
      } else {
        host.log(state, '【环境事件】兰普金巷 · 街灯熄灭】街灯闪了几下又恢复，窗外仿佛有个人影一闪而过。');
      }
    } else {
      const room = 'garage' as RoomId;
      state.noiseRoom = room;
      state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '汽车警报' });
      if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
      const affected = npcs(state).filter((person) => person.hp > 0 && !person.hidden && roomDistance(person.room, room) <= 1);
      affected.forEach((person) => {
        person.alert = clamp(person.alert + 12, 0, 100);
        person.activity = '被车库外突然响起的汽车警报惊动';
      });
      host.log(state, `【环境事件】兰普金巷 · 汽车警报】车库里的警报器突然尖叫，${affected.length ? affected.map((person) => person.name).join('、') + '被惊动' : '街道上没有人回应'}。`);
    }
    return;
  }
  if (state.mapId === 'midwich') {
    const room = randomOf(['corridor', 'library', 'nursery'] as RoomId[]);
    const affected = npcs(state).filter((person) =>
      person.hp > 0 && !person.hidden && roomDistance(person.room, room) <= 1,
    );
    affected.forEach((person) => {
      person.alert = clamp(person.alert + 12, 0, 100);
      person.activity = '被课间铃声惊动，正在寻找声音来源';
    });
    state.disturbances.push({ room, turn: state.turn, clock: state.trailClock, label: '课间铃声' });
    if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
    host.log(state, `【米德维奇 · 课间铃声】${roomName(room)}附近响起刺耳铃声，${affected.length ? affected.map((person) => person.name).join('、') + '被惊动' : '走廊里空无一人'}。`);
    return;
  }
  const eventPool = state.mapId === 'asylum'
    ? ['flicker', 'flicker', 'phone', 'glass'] as const
    : ['storm', 'flicker', 'phone', 'glass'] as const;
  const event = randomOf(eventPool);

  if (event === 'storm') {
    state.alarm = Math.max(0, state.alarm - 4);
    host.syncWanted(state);
    host.log(state, '【环境事件】雷雨突然压境，雨声盖住了屋内的动静。暴露度 -4。');
    return;
  }

  if (event === 'flicker') {
    const circuits = state.powerCircuits.filter((circuit) =>
      !circuit.broken && (circuit.flickerTurns ?? 0) === 0,
    );
    if (circuits.length) {
      const circuit = randomOf(circuits);
      circuit.flickerTurns = 1;
      host.log(state, `【环境事件】${circuit.name}的灯光突然闪烁，整片区域陷入短暂黑暗。`);
      return;
    }
  }

  if (event === 'phone' && workingPhones(state).length) {
    const callers = npcs(state).filter((person) =>
      person.hp > 0 && !person.hidden && person.archetype === 'alert' && person.goal !== 'phone',
    );
    if (callers.length) {
      const person = randomOf(callers);
      person.goal = 'phone';
      person.alert = clamp(Math.max(45, person.alert + 18), 0, 100);
      person.activity = '被突然响起的电话吸引，正赶去求救';
      host.log(state, `【环境事件】电话突然响起。${person.name}听见铃声，正朝电话赶去——再不阻止，他可能会报警。`);
      return;
    }
  }

  // 玻璃碎裂是其他事件无法触发时的可靠兜底，也会成为短时地图线索。
  const knownRooms = ROOMS.filter((room) => state.explored.includes(room.id) && room.id !== state.playerRoom);
  const room = randomOf(knownRooms.length ? knownRooms : ROOM_MAP[state.playerRoom].neighbors.map((id) => ROOM_MAP[id]));
  if (!room) {
    host.log(state, '【环境事件】屋外传来一阵异响，整栋房子短暂安静下来。');
    return;
  }
  state.disturbances.push({
    room: room.id,
    turn: state.turn,
    clock: state.trailClock,
    label: '玻璃碎裂声',
  });
  if (state.disturbances.length > 24) state.disturbances.splice(0, state.disturbances.length - 24);
  const startled = npcs(state).filter((person) => person.hp > 0 && !person.hidden && person.room === room.id);
  startled.forEach((person) => {
    person.alert = clamp(person.alert + 12, 0, 100);
    person.activity = '被玻璃碎裂声惊动，正查看四周';
  });
  host.log(state, `【环境事件】${room.name}突然传来玻璃碎裂声${startled.length ? `，${startled.map((person) => person.name).join('、')}被惊动了` : '，声音在空房间里回荡'}。`);
}
