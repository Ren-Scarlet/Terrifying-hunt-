/**
 * 回合结束后，逐个幸存者结算「他这一回合做了什么」。
 *
 * 这是旧 AI 的回合循环，暂时原样搬出来，行为一个字没改。
 * 它按固定优先级检查：被控 → 倒地 → 躲藏 → 同屋逃跑 → 救援 → 道具 →
 * 目标移动 → 日常，靠 continue 互斥。
 */
import { BLEEDOUT_TURNS, ESCAPE_ROOMS, REACT_MOVE_CAP, SURVIVOR_INJURED_HP } from '../../constants';
import { roomName } from '../../missions';
import { nearestOf, roomDistance } from '../../navigation';
import { random, randomOf } from '../../random';
import { ROOM_MAP, WEAPON_ROOMS } from '../../rooms';
import type { GameState, Person, RoomId } from '../../types';
import { nextStepToward } from '../../world/pathfinding';
import { workingPhones } from '../../world/phones';
import { cabinetRoomsFor, isLocked, isRoomLit, npcPeople as npcs, peopleInRoom } from '../../world/roomState';
import { ROUTINE_PROFILE } from '../catalog';
import { ACTIVITIES } from '../factory';
import type { NpcHost } from './host';
import { canPlaceBarricade, wantsToLeave } from './predicates';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
export function npcTurn(host: NpcHost, state: GameState): void {
  host.sameRoomKillerReact(state, state.lastPlayerRoom === state.playerRoom);
  // 红色人影只保留到下一次 NPC 回合开始，给玩家足够时间确认陷阱命中。
  state.people.forEach((person) => { person.trapTriggered = false; });
  const before = host.snapshotRooms(state);
  for (const person of [...npcs(state)]) {
    if (state.result) return;
    if (!state.people.some((p) => p.id === person.id)) continue;
    const totemIndex = state.totems.indexOf(person.room);
    if (totemIndex >= 0 && person.hp > 0 && (person.awareness >= 1 || person.alert >= 25) && (person.id.charCodeAt(0) + state.turn) % 2 === 0) {
      state.totems.splice(totemIndex, 1);
      host.log(state, `${person.name} 在${roomName(person.room)}发现并破坏了图腾。`);
      host.log(state, `【图腾被拆】${roomName(person.room)}的图腾已被幸存者拆毁，地图上不再显示。剩余 ${state.totems.length} 座。`);
    }

    // 已被发现的捕兽夹可以被幸存者拆除，避免陷阱成为永久封路工具。
    const spottedTrap = state.bearTraps.find((trap) => trap.armed && trap.discovered && trap.room === person.room);
    if (spottedTrap && person.hp > 0 && person.awareness >= 1) {
      spottedTrap.armed = false;
      host.log(state, `${person.name} 发现并拆除了${roomName(person.room)}的捕兽夹。`);
    }

    person.statusEffects ??= {};
    const effectsNow = person.statusEffects;
    const cannotSenseKiller = (effectsNow.undetectable ?? 0) > 0 || (effectsNow.oblivious ?? 0) > 0 || (effectsNow.blind ?? 0) > 0 || !isRoomLit(state, person.room);
    if ((person.statusEffects.cursed ?? 0) > 0) {
      if (state.totems.length === 0) {
        person.statusEffects.cursed = 0;
        host.log(state, `${person.name} 身上的诅咒随着最后一座图腾被摧毁而消散。`);
      } else {
        person.fear = clamp(person.fear + 8, 0, 100);
        person.alert = clamp(person.alert + 5, 0, 100);
      }
    }
    // 恐惧：被追着的人越怕越慌；脱离接触、没人追的人会冷静下来。
    if (person.hp > 0 && person.role !== 'police') {
      const companions = peopleInRoom(state, person.room).filter((other) => other.id !== person.id && other.role !== 'police' && other.hp > 0).length;
      const lit = isRoomLit(state, person.room);
      if (companions === 0) person.fear = clamp(person.fear + 8, 0, 100);
      if (!lit) person.fear = clamp(person.fear + 6, 0, 100);
      if (companions > 0 && lit) person.fear = clamp(person.fear - 8, 0, 100);
      // 安全时从恐慌里缓过来：离杀手远、没人追、警戒也不高的人不会永久满恐惧。
      const nearby = person.room === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(person.room);
      const safe = !nearby && person.alert < 70 && person.trackedTurns <= 0 && person.blockedTurns <= 0 && !state.possessed;
      if (safe && (person.statusEffects.cursed ?? 0) === 0) {
        if (person.fear >= 85) person.fear = clamp(person.fear - 18, 0, 100);
        else if (person.fear >= 60) person.fear = clamp(person.fear - 10, 0, 100);
      }
    }

    // 乌鸦：停在这间屋的人一动就会惊起它们
    if ((person.statusEffects.deepWound ?? 0) > 0) person.bleed = Math.max(person.bleed, 1);
    // 即时警觉值可以下降，但已经确认的危险不会被忘记。
    person.awareness = Math.max(person.awareness, person.alert >= 75 ? 3 : person.alert >= 40 ? 2 : person.alert >= 12 ? 1 : 0);

    // 被抱起的人不会参与救援或移动，但仍然会继续流血倒计时。
    if (person.id === state.carryPersonId) {
      person.downedTurns += 1;
      if (person.downedTurns >= BLEEDOUT_TURNS) {
        host.log(state, `${person.name} 在你搬运途中停止了呼吸。`);
        host.addAlarm(state, 10);
        host.killPerson(state, person);
      } else {
        person.activity = '被杀手抱着，无法自行挣脱（倒计时仍在继续）';
      }
      continue;
    }

    // 倒地的人不会自己起来，只能等救援或者流血而死
    if (person.hp <= 0) {
      person.downedTurns += 1;
      if (person.downedTurns >= BLEEDOUT_TURNS) {
        host.log(state, `${person.name} 倒在地上太久，停止了呼吸。`);
        host.addAlarm(state, 10);
        host.killPerson(state, person);
      } else {
        person.activity = `倒在地上，还有 ${BLEEDOUT_TURNS - person.downedTurns} 回合`;
        person.intent = 'stunned';
      }
      continue;
    }

    // 日常生活阶段不会因为房间亮着灯就逐渐怀疑异常。
    if (isRoomLit(state, person.room) && person.awareness > 0) {
      person.alert = clamp(person.alert + 4, 0, 100);
    }

    // 流血
    if (person.bleed > 0) {
      host.log(state, `${person.name} 在流血，失去 1 点生命。`);
      // 流血不吃「下次攻击 +X」的加成，那是玩家的爆发，不该被伤口消耗掉
      const bonus = state.bonusDamage;
      state.bonusDamage = 0;
      host.damagePerson(state, person, 1);
      state.bonusDamage = bonus;
      if (person.hp <= 0 || !state.people.some((p) => p.id === person.id)) continue;
      person.bleed -= 1;
    }

    if (person.blockedTurns > 0) {
      person.blockedTurns -= 1;
      person.intent = person.blockedTurns > 0 ? 'stunned' : 'wary';
      person.activity = person.blockedTurns > 0 ? '被按在原地，动不了' : '扶着墙站起来';
      continue;
    }
    if (state.pinnedPeople.includes(person.id)) {
      person.activity = '被锁链钉住，无法动弹';
      person.intent = 'stunned';
      continue;
    }
    if (person.hidden && !state.emergencyActive) {
      // 藏起来的人只在玩家进房间且警觉拉满时才会冲出去
      if (person.room === state.playerRoom && person.alert >= 85) {
        person.hidden = false;
        if (person.movesThisTurn < REACT_MOVE_CAP && host.fleeAway(state, person)) {
          person.movesThisTurn += 1;
        }
      } else {
        person.intent = 'hide';
        person.activity = '缩在柜子里，不敢出声';
        person.alert = Math.max(0, person.alert - 4);
      }
      continue;
    }
    if (person.hidden && state.emergencyActive) person.hidden = false;

    // 发现同屋或相邻房间的倒地/重伤者属于明确异常，会立刻触发救援意识。
    const nearbyVictim = npcs(state).some(
      (other) => other.id !== person.id && (other.hp <= 0 || (other.hp > 0 && other.hp <= SURVIVOR_INJURED_HP)) && roomDistance(other.room, person.room) <= 1,
    );
    if (nearbyVictim && person.awareness < 2) {
      person.alert = Math.max(person.alert, 45);
      person.awareness = 2;
    }

    // 没有任何异常线索时，幸存者继续自己的日常，不修逃生设施、不报警、不集体行动。
    if (person.awareness === 0) {
      person.intent = 'idle';
      if (random() < 0.18) {
        const options = ROOM_MAP[person.room].neighbors.filter((room) => room !== state.playerRoom && !isLocked(state, room));
        const next = options.length ? randomOf(options) : null;
        if (next) {
          person.room = next;
          person.activity = randomOf(ACTIVITIES);
        } else {
          person.activity = randomOf(ACTIVITIES);
        }
      } else {
        person.activity = randomOf(ACTIVITIES);
      }
      continue;
    }

    // 只有察觉到异常但尚未确认危险的人会停下来倾听、查看，不会立刻逃生。
    if (person.awareness === 1 && person.alert < 40 && person.room !== state.playerRoom) {
      person.intent = 'wary';
      person.activity = randomOf(['停下手里的事，侧耳听着', '四处看了看，像是在找声音来源', '有些疑惑地检查周围']);
      continue;
    }

    // 第四阶段开启后，所有幸存者都以两个动态逃生点为目标，不再执行原本的个人工作。
    if (state.emergencyActive && state.escapeRooms.length === 2) {
      person.goal = 'exit'; person.intent = 'escape'; person.alert = 100;
      if (state.escapeRooms.includes(person.room)) {
        person.activity = person.escapeProgress > 0 ? '正在翻越逃生点' : '已抵达逃生点';
        continue;
      }
      const exitTarget = nearestOf(person.room, state.escapeRooms);
      const exitStep = person.room === state.playerRoom ? null : nextStepToward(state, person.room, exitTarget, [state.playerRoom]);
      if (exitStep) {
        const from = person.room; person.room = exitStep;
        person.activity = `正赶往${roomName(exitTarget)}`;
        host.pushTrail(state, from, exitStep, person.hp <= SURVIVOR_INJURED_HP);
      } else if (person.room === state.playerRoom) host.fleeAway(state, person);
      continue;
    }

    // 玩家就在这一间：先跑，跑不掉再对抗
    if (person.room === state.playerRoom && !cannotSenseKiller) {
      // 同屋幸存者在回合结算时必须获得一次最终逃跑机会。
      // 本回合行动期间的反应移动次数不能让玩家把受伤目标留在原地反复攻击。
      if (
        person.archetype === 'defiant' &&
        person.armed &&
        person.movesThisTurn < REACT_MOVE_CAP &&
        random() < 0.6
      ) {
        host.counterAttack(state, person);
      }
      // 反抗者可以先反击，但回合结束前仍会尝试撤离，不能站在原地等玩家下回合再砍。
      if (host.fleeAway(state, person)) {
        person.movesThisTurn = Math.min(REACT_MOVE_CAP, person.movesThisTurn + 1);
        continue;
      }
      if (person.archetype === 'defiant' && person.movesThisTurn < REACT_MOVE_CAP && canPlaceBarricade(state, person)) {
        host.barricadeRoom(state, person);
      } else {
        person.intent = 'wary';
        person.activity = person.movesThisTurn >= REACT_MOVE_CAP ? '跑不动了，靠着墙喘气' : '贴在墙边，盯着你';
      }
      continue;
    }

    // 决定要走的人站在后院里：不再听性格指挥，专心翻篱笆
    if (wantsToLeave(state, person)) {
      person.intent = 'escape';
      person.activity = person.escapeProgress >= 1 ? '正翻上篱笆' : '正在翻后院篱笆';
      continue;
    }

    // 玩家离开后：救援优先于一切
    if (host.tryRescue(state, person)) continue;

    // 手里有道具的人会挑时机用掉它（救人、报警、开后门、抹掉脚印…）
    if (host.useSurvivorItem(state, person)) continue;

    // 还有人倒在地上：没被吓破胆的人会放下手里的活，朝那边赶过去
    if (person.intent !== 'escape' && person.intent !== 'call' && host.tryAidRun(state, person)) continue;

    // 跑了一整回合的人会喘不上气：找个角落停下来，甚至钻进柜子。
    // 这就是「痕迹」能兑现的地方——你不是追上他，是跟着地板上的划痕找到他。
    const ranFar = person.movesThisTurn >= 2 && roomDistance(state.playerRoom, person.room) >= 2;
    if (ranFar && person.intent !== 'call' && person.intent !== 'escape' && random() < 0.7) {
      person.alert = Math.max(0, person.alert - 30);
      person.intent = 'wary';
      person.activity = '跑不动了，蹲在原地喘气';
      if (cabinetRoomsFor(state).includes(person.room) && random() < 0.55) {
        person.hidden = true;
        person.activity = '钻进柜子，屏住呼吸';
        host.log(state, `${person.name} 躲进了${roomName(person.room)}的柜子——地板上的痕迹到这里就断了。`);
      }
      continue;
    }

    // 这一回合已经跑满了：再急也只能靠着墙缓一口
    if (person.movesThisTurn >= REACT_MOVE_CAP) {
      person.activity = '靠在墙上喘气，跑不动了';
      continue;
    }

    // 已经决定要跑/要打电话的人不会因为稍微冷静就放弃
    const committed = person.intent === 'escape' || person.intent === 'call';
    person.alert = Math.max(0, person.alert - (committed ? 6 : 18 - Math.floor(state.alarm / 12)));

    if (committed && person.alert >= 14) {
      if (person.intent === 'call' && host.tryCall(state, person)) continue;
      host.actByArchetype(state, person);
      continue;
    }
    if (person.alert >= 42) {
      host.actByArchetype(state, person);
      continue;
    }
    if (person.alert >= 22) {
      person.intent = 'wary';
      if (random() < 0.5) host.actByArchetype(state, person);
      else person.activity = '紧张地四处张望';
      continue;
    }

    // 房门被封锁时，NPC 不能离开当前房间；保留原意图，等待封锁解除。
    if (isLocked(state, person.room)) {
      person.activity = '房门被封锁，无法离开';
      continue;
    }

    // 低警觉：不再漫无目的地乱晃，各自朝这一局的个人目标走一步。
    // 低警觉幸存者按个人习惯、补给需求和现场状况行动。
    person.intent = 'idle';
    // 路过没被砸烂的道具箱就翻一件：他们多一条路，你就多一个要盯的地方
    if (host.tryTakeSupply(state, person)) continue;

    const routine = ROUTINE_PROFILE[person.archetype];
    const routineRoom = routine.rooms[(person.routineIndex ?? 0) % routine.rooms.length];
    const toolboxCircuitRooms = person.item === 'toolbox'
      ? state.powerCircuits.filter((circuit) => circuit.broken || circuit.enabled === false).map((circuit) => circuit.breakerRoom)
      : [];
    const goalTargets: RoomId[] = toolboxCircuitRooms.length
      ? toolboxCircuitRooms
      : (
          person.goal === 'routine'
            ? [routineRoom]
            : person.goal === 'supply'
              ? host.usableItemBoxes(state).map((i) => i.room)
              : person.goal === 'phone'
                ? workingPhones(state)
                : person.goal === 'weapon' || person.goal === 'gather'
                  ? WEAPON_ROOMS
                  : person.goal === 'hide'
                    ? cabinetRoomsFor(state)
                    : person.goal === 'help'
                      ? [nearestOf(person.room, cabinetRoomsFor(state))]
                      : person.goal === 'exit' || person.goal === 'panic'
                        ? ESCAPE_ROOMS
                        : [person.room]);
    const target = nearestOf(person.room, goalTargets.length ? goalTargets : [person.room]);
    if (target === person.room) {
      if (person.goal === 'routine') {
        person.activity = routine.activity;
        person.intent = 'idle';
        person.routineIndex = ((person.routineIndex ?? 0) + 1) % routine.rooms.length;
      } else {
        person.activity = randomOf(ACTIVITIES);
      }
    } else {
      const step = nextStepToward(state, person.room, target, [state.playerRoom]);
      if (step) {
        person.room = step;
        person.activity = `朝${roomName(target)}摸过去`;
      } else {
        person.activity = randomOf(ACTIVITIES);
      }
    }
  }
  // 结算 NPC 本轮移动进入的陷阱；即时反应与直接移动也由统一入口处理。
  host.resolveTrapEntries(state, before);
  host.updateNpcDialogue(state);
  host.recordTrails(state, before);
}
