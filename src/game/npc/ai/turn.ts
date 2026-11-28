/**
 * 回合结束后，逐个幸存者结算这一回合。
 *
 * 底层（倒地、流血、被控、躲藏、陷阱）仍在这里；
 * "他决定做什么"已经全部交给新 AI（runtime.executeDecision）。
 */
import { BLEEDOUT_TURNS, REACT_MOVE_CAP, SURVIVOR_INJURED_HP } from '../../constants';
import { roomName } from '../../missions';
import { roomDistance } from '../../navigation';
import { ROOM_MAP } from '../../rooms';
import type { GameState, Person } from '../../types';
import { isLocked, isRoomLit, npcPeople as npcs, peopleInRoom } from '../../world/roomState';
import { applyAlertEvent, applyFearEvent } from './model';
import type { NpcHost } from './host';

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
    if (totemIndex >= 0 && person.hp > 0 && person.alert >= 25 && (person.id.charCodeAt(0) + state.turn) % 2 === 0) {
      state.totems.splice(totemIndex, 1);
      host.log(state, `${person.name} 在${roomName(person.room)}发现并破坏了图腾。`);
      host.log(state, `【图腾被拆】${roomName(person.room)}的图腾已被幸存者拆毁，地图上不再显示。剩余 ${state.totems.length} 座。`);
    }

    // 看见尸体：一次性受惊，之后不再重复触发。
    if (person.hp > 0 && state.corpseRooms.includes(person.room) && !(person.seenCorpseRooms ?? []).includes(person.room)) {
      person.seenCorpseRooms = [...(person.seenCorpseRooms ?? []), person.room];
      applyAlertEvent(person, 'see_corpse');
      applyFearEvent(person, 'corpse_in_room');
      host.log(state, `${person.name} 在${roomName(person.room)}看见了尸体，呼吸一下子乱了。`);
    }

    // 已被发现的捕兽夹可以被幸存者拆除，避免陷阱成为永久封路工具。
    const spottedTrap = state.bearTraps.find((trap) => trap.armed && trap.discovered && trap.room === person.room);
    if (spottedTrap && person.hp > 0 && person.alert >= 12) {
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
      }
      continue;
    }

    // 日常生活阶段不会因为房间亮着灯就逐渐怀疑异常。
    if (isRoomLit(state, person.room) && person.alert >= 12) {
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
      person.activity = person.blockedTurns > 0 ? '被按在原地，动不了' : '扶着墙站起来';
      continue;
    }
    if (state.pinnedPeople.includes(person.id)) {
      person.activity = '被锁链钉住，无法动弹';
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
    if (nearbyVictim && person.alert < 40) {
      person.alert = Math.max(person.alert, 45);
    }

    // 保命优先：救援、手里的道具、赶去救倒地的人，先于一切日常决策。
    if (host.tryRescue(state, person)) continue;
    if (host.useSurvivorItem(state, person)) continue;
    if (person.alert < 75 && !/电话|无线电/.test(person.activity) && host.tryAidRun(state, person)) continue;
    // 低警戒、没被追时才会顺手翻道具箱；追着人的时候没空。
    if (person.alert < 40 && !state.chaseTargetId && host.tryTakeSupply(state, person)) continue;

    // 房门被封锁时，NPC 不能离开当前房间。
    if (isLocked(state, person.room)) {
      person.activity = '房门被封锁，无法离开';
      continue;
    }

    // 其余全部交给新决策：逃/躲/放板/报警/拆图腾/观察/日常。
    host.runDecision(state, person, true);
  }
  // 结算 NPC 本轮移动进入的陷阱；即时反应与直接移动也由统一入口处理。
  host.resolveTrapEntries(state, before);
  host.updateNpcDialogue(state);
  host.recordTrails(state, before);
}
