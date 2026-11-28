/**
 * 幸存者的"反应"：看到、听到、被撞见之后的第一反应。
 *
 * 与 decide/turn 的分工：这里处理"瞬间事件"，decision 处理"轮到他的回合"。
 * 只通过 NpcHost 调引擎写服务，不 import engine.ts。
 */
import { REACT_MOVE_CAP } from '../../constants';
import { KILLER_MAP } from '../../killers';
import { roomName } from '../../missions';
import { roomDistance } from '../../navigation';
import { random, randomOf } from '../../random';
import { ROOM_MAP } from '../../rooms';
import { SURVIVOR_MAP } from '../../survivors';
import type { GameState, Person, RoomId } from '../../types';
import { isLocked, isObstacle, isRoomLit, npcPeople as npcs, peopleInRoom } from '../../world/roomState';
import type { NpcHost } from './host';
import { applyAlertEvent } from './model';
import { ambushActive, effectiveFearRadius, playerIsHidden, wantsToLeave } from './predicates';

/** 幸存者亲眼目击的事件类型 */
export type NpcWitnessedEvent = 'attack' | 'murder' | 'abduction';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
/**
 * 屠夫就在同一间屋：除非杀手不可侦测、或幸存者看不见，
 * 否则当场警觉并开始逃；看不见时只因为动静起疑。
 */
export function sameRoomKillerReact(host: NpcHost, state: GameState, armed: boolean): void {
  if (!armed) return;
  for (const person of npcs(state)) {
    if (state.result) break;
    if (person.hp <= 0 || person.role === 'police' || person.room !== state.playerRoom) continue;
    const effects = person.statusEffects ?? {};
    // 站在脸上时潜行/尾随不再算「看不见」：只有障目、浑然不觉或黑暗能让他们没反应。
    const killerHidden = false;
    const survivorBlind = (effects.blind ?? 0) > 0 || (effects.oblivious ?? 0) > 0 || !isRoomLit(state, person.room);
    if (!killerHidden && !survivorBlind) {
      person.alert = clamp(Math.max(person.alert, 70), 0, 100);
      if ((person.startleTurns ?? 0) > 0) { person.activity = '被门口的动静惊到，愣在原地'; continue; }
      person.activity = '被你堵在屋里，正拼命往外跑';
    } else {
      person.alert = clamp(person.alert + 6, 0, 100);
    }
  }
}

export function npcReact(host: NpcHost, state: GameState): void {
  if (state.result) return;
  const before = host.snapshotRooms(state);
  const fearRadius = effectiveFearRadius(state);
  if (fearRadius === 0) {
    host.recordTrails(state, before);
    host.rememberVisible(state);
    return;
  }
  for (const person of npcs(state)) {
    if (state.result) return;
    if (!state.people.some((p) => p.id === person.id)) continue;
    // 倒地、藏着、被按住的人在原地等；屋里的人留给进门反应与回合结算
    if (person.hp <= 0 || person.hidden) continue;
    if (person.lastWitnessedEventClock === state.trailClock) continue;
    if (person.blockedTurns > 0 || state.pinnedPeople.includes(person.id)) continue;
    if ((person.startleTurns ?? 0) > 0) continue;
    const effects = person.statusEffects ?? {};
    const cannotSense = (effects.undetectable ?? 0) > 0 || (effects.oblivious ?? 0) > 0 || (effects.blind ?? 0) > 0 || !isRoomLit(state, person.room);
    if (cannotSense) continue;

    // 相邻房间只把玩家的动静当作“小幅声响”，不应凭空看见玩家或直接进入逃跑。
    const distanceToPlayer = roomDistance(person.room, state.playerRoom);
    if (distanceToPlayer === 1 && person.alert < 12) {
      applyAlertEvent(person, 'noise_adjacent');
      person.activity = '听见附近有动静，停下来观察';
    }

    // 同房间的目击者也要有动作：刚被砍的那个人本回合已经反应过，不重复。
    // 只依据持久认知阶段判断是否进入恐慌；不能用进门刚增加的 alert 反过来触发即时逃跑。
    const sameRoom = person.room === state.playerRoom;
    if (sameRoom && person.id === state.lastAttackedId) continue;
    if (sameRoom) {
      if (state.ambushTurn === state.turn) continue;
      if (person.alert < 40) continue;
      if (person.movesThisTurn >= REACT_MOVE_CAP) continue;
      if (witnessInRoom(host, state, person)) person.movesThisTurn += 1;
      continue;
    }
    if (person.movesThisTurn >= REACT_MOVE_CAP) continue;
    // 后院翻篱笆是回合结束的结算，不在这中间偷偷逃出去
    if (wantsToLeave(state, person)) continue;

    const fleeing = person.alert >= 75 || person.escapeProgress > 0;
    const busy = /电话|包扎|拖|救/.test(person.activity);
    if (!fleeing && !busy) continue;

    person.movesThisTurn += 1;
    if (fleeing) host.fleeAway(state, person, true);
    else host.actOnInstinct(state, person);
  }
  host.recordTrails(state, before);
  host.rememberVisible(state);
}

/**
 * NPC 对重大事件的统一感知入口。
 * 同屋、未被遮挡的幸存者属于直接目击者；他们立即获得明确认知并按人格采取行动。
 * 超自然杀手造成的事件会引发无法理解的恐慌，不会机械地全部转成报警。
 */
export function npcWitnessEvent(host: NpcHost, 
  state: GameState,
  room: RoomId,
  event: NpcWitnessedEvent,
  subjectId: string,
): number {
  const witnesses = npcs(state).filter(
    (person) =>
      person.id !== subjectId &&
      person.hp > 0 &&
      !person.hidden &&
      person.room === room,
  );
  if (!witnesses.length) return 0;

  const supernatural = KILLER_MAP[state.killer]?.school === 'supernatural';
  const eventLabel =
    event === 'murder' ? '目睹同伴死亡' :
    event === 'abduction' ? '目睹倒地者被强行带走' :
    '目睹同伴遭到袭击';

  // 先由现场目击者发出声音，再让他们各自采取行动；邻近房间只能获得转述信息。
  host.shout(state, witnesses[0], event === 'murder' ? 28 : 22);

  for (const witness of witnesses) {
    const alertFloor = event === 'murder' ? 88 : event === 'abduction' ? 78 : 70;
    const fearGain = event === 'murder' ? 42 : event === 'abduction' ? 30 : 24;
    witness.alert = clamp(Math.max(witness.alert + alertFloor, alertFloor), 0, 100);
    witness.fear = clamp(witness.fear + fearGain, 0, 100);
    witness.lastWitnessedEventClock = state.trailClock;
    witness.dialogue = supernatural
      ? randomOf(['那不是人……快躲起来！', '别看它！快跑！', '这到底是什么东西？！'])
      : event === 'murder'
        ? randomOf(['他杀了人！快跑！', '我亲眼看见了！救命！', '快报警！有人被杀了！'])
        : event === 'abduction'
          ? randomOf(['他把人拖走了！快来帮忙！', '那个人还活着！不能让他带走！', '有人被强行带走了！'])
          : randomOf(['他袭击了那个人！', '救命！有人受伤了！', '快离开这里！']);

    const previousRoom = witness.room;
    if (supernatural) {
      // 面对超自然威胁，普通人优先逃命，不会像目击普通凶杀那样统一报警。
      witness.activity = '目睹无法理解的恐怖，拼命逃离';
      if (witness.movesThisTurn < REACT_MOVE_CAP && host.fleeAway(state, witness, true)) {
        witness.movesThisTurn += 1;
      }
    } else {
      host.actOnInstinct(state, witness);
    }

    if (witness.room !== previousRoom) {
      witness.movesThisTurn = Math.min(REACT_MOVE_CAP, witness.movesThisTurn + 1);
    }
    if (witness.activity === '在翻找抽屉' || witness.activity === '靠在窗边抽烟') {
      witness.activity = eventLabel;
    }
  }

  host.log(state, `【NPC目击】${witnesses.map((person) => person.name).join('、')}${eventLabel}，立即作出反应。`);
  return witnesses.length;
}

/** 玩家踏进房间的瞬间 */
export function npcOnPlayerEnter(host: NpcHost, state: GameState, barricadedEntry = false): void {
  // 杀手既然已经进入电子门锁封闭的房间，门锁就不能继续把里面的幸存者钉死。
  // 他们会趁杀手进门造成的混乱解锁并夺门逃跑；护士等穿墙能力因此不会让 NPC 原地等死。
  if (isLocked(state, state.playerRoom)) {
    state.roomLocks[state.playerRoom] = 0;
    host.log(state, `你闯入了封锁区域，屋内幸存者立刻解除门锁，试图夺门逃跑！`);
  }
  const hidden = playerIsHidden(state);
  const ambush = ambushActive(state);
  const before = host.snapshotRooms(state);
  const here = peopleInRoom(state, state.playerRoom).filter(
    (p) => p.role !== 'police' && p.hp > 0,
  );

  // 恐惧范围为 0 时，幸存者无法侦测玩家；迈尔斯可在同屋静默尾随。
  if (effectiveFearRadius(state) === 0) {
    here.forEach((person) => { person.activity = '没有察觉到你的存在'; });
    return;
  }

  here.forEach((person) => {
    const threat = SURVIVOR_MAP[person.id]?.threat;

    // 刚被追上来的人：他已经在你面前了，这一下跑不掉
    if (person.id === host.getChasedId()) {
      person.alert = 100;
      person.activity = '被你堵在屋里';
      host.log(state, `${person.name} 猛一回头，你已经在门口了。`);
      return;
    }

    // 伏击：屋里的人根本没发现你进来——不加警觉、不喊人，
    // 回合结束时也不会夺门而逃。这是「偷袭」这张牌买来的一个回合。
    if (ambush && threat !== 'spiritual') {
      person.activity = '背对着门，没有察觉';
      return;
    }
    if (ambush) {
      // 灵异感知者是你唯一骗不过的人：她能直接感觉到你在屋里
      host.log(state, `${person.name} 忽然抬头，看向你藏身的方向——她感觉到了。`);
      person.alert = 100;
    }

    // 推门会制造动静，但不代表每个人都会立刻认出杀手。
    // 只有警觉达到「警戒」(75+) 才会夺路而逃；低于阈值先观察、怀疑或继续原本的事。
    const wasAlert = person.alert;
    if (wasAlert < 40) person.startleTurns = 1;
    const darkRoom = !isRoomLit(state, state.playerRoom);
    // 进门前已经恐慌的人会在这次照面中确认危险；低于恐慌者不因进门噪声直接升级认知。 


    let gain = 30;
    if (threat === 'spiritual') gain = 65;
    else if (threat === 'alarm') gain = 55;
    else if (threat === 'lead') gain = 42;
    else if (threat === 'brave') gain = 38;
    if (threat !== 'spiritual') {
      if (hidden) gain = Math.round(gain * 0.4);
      // 黑暗会显著削弱幸存者对入侵者的辨认能力。
      if (darkRoom) gain = Math.round(gain * 0.1);
    }
    person.alert = clamp(person.alert + gain, 0, 100);
    // 迈尔斯的尾随：盯着看得越久，越不容易被屋里的人察觉
    if (state.killer === '迈克尔·迈尔斯' && state.stalkMeter >= 60) {
      person.alert = clamp(person.alert - 20, 0, 100);
    }

    // 看见你就等于确认「杀手在这间屋里」——不会站着等你出牌。
    // 想在他们转身之前动手，就得靠伏击；想在他们跑掉之后补刀，就得靠追击。
    if (person.armed && person.alert >= 40 && person.room === state.playerRoom) {
      host.counterAttack(state, person);
      return;
    }

    // 已经跑满这一回合的人，腿已经不听使唤了：门一开他也只能贴着墙喘气。
    // 这是玩家唯一能稳稳砍中「警觉的人」的机会，也是痕迹系统的兑现点。
    const exhausted = person.movesThisTurn >= REACT_MOVE_CAP;
    // 进门瞬间的警觉增长不能把未发觉 / 怀疑阶段直接推成逃亡。
    // 只有进门前已经达到恐慌（40+）的人，才会因这次照面立即逃跑。
    if (!exhausted && wasAlert >= 40 && host.fleeAway(state, person)) {
      person.movesThisTurn += 1;
      person.alert = 100;
      host.log(
        state,
        wasAlert >= 85
          ? `${person.name} 根本没等你站稳，已经冲出了门口。`
          : `${person.name} 确认了你的威胁，终于转身逃跑。`,
      );
      return;
    }

    // 尚未恐慌的人不会自动逃跑：明亮环境里先起疑，黑暗里可能根本没看清你。
    person.activity = exhausted
      ? '跑不动了，靠着墙喘气'
      : darkRoom && person.alert < 12
        ? '黑暗中没有察觉到你的存在'
        : person.alert >= 12
          ? '察觉到异常，但还没有确认危险'
          : '没有察觉到你的存在';
    if (person.alert >= 12) host.log(state, `${person.name} 察觉到异常，但还没有确认危险（警觉 ${person.alert}/100）。`);
  });

  // 追击热度：你越死盯着同一个人，其他人越敢放手干活
  const chased = here.find((p) => p.hp > 0 && p.role !== 'police');
  if (chased) {
    if (state.chaseTargetId === chased.id) state.chaseTurns += 1;
    else {
      state.chaseTargetId = chased.id;
      state.chaseTurns = 1;
    }
  } else {
    state.chaseTargetId = null;
    state.chaseTurns = 0;
  }

  // 障碍伏击：推门这一下会挨一下，幸存者借机行动
  if (!ambush && !state.possessed) {
    const obstacleHere = isObstacle(state.playerRoom) && !state.clearedObstacles.includes(state.playerRoom);
    const trapper = here.find(
      (p) => p.hp > 0 && p.alert >= 40,
    );
    if (barricadedEntry) {
      host.interruptPlayer(
        state,
        `你撞上幸存者刚刚放倒的家具，沉重的杂物砸得你眼前一黑！`,
        trapper?.id ?? 'dropped-obstacle',
      );
    } else if (obstacleHere && trapper && random() < 0.75) {
      host.interruptPlayer(
        state,
        `${trapper.name} 猛地推倒${roomName(state.playerRoom)}门口的杂物，正好砸在你身上。`,
        trapper.id,
      );
    }
  }
  // 门口那一步也会在地板上留下痕迹：你至少知道他是从哪儿溜走的
  host.recordTrails(state, before);
}

/** 同房间的目击者：另一个人不会站着发呆，会喊人、跑 */
export function witnessInRoom(host: NpcHost, state: GameState, person: Person): boolean {
  person.alert = clamp(Math.max(person.alert + 45, 75), 0, 100);
  host.addDisturbance(state, person.room);
  person.lastWitnessedEventClock = state.trailClock;
  host.shout(state, person, 18);
  const previousRoom = person.room;
  host.actOnInstinct(state, person);
  if (person.room !== previousRoom) {
    person.movesThisTurn = Math.min(REACT_MOVE_CAP, person.movesThisTurn + 1);
  }
  host.log(state, `${person.name} 亲眼确认了危险，按自己的本能作出反应。`);
  return true;
}
