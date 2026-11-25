import { drawCards } from '../deck';
import { INTENT_LABEL } from '../npc/catalog';
import { POSSESS_TURNS } from '../constants';
import { roomDistance } from '../navigation';
import { roomName } from '../missions';
import { ROOM_MAP, ROOMS } from '../rooms';
import type { Cond, Dest, Op, Who } from '../effect';
import type { GameState, Person, RoomId } from '../types';

export interface EffectRuntime {
  selectPeople(state: GameState, who: Who): Person[];
  log(state: GameState, message: string): void;
  damagePerson(state: GameState, person: Person, amount: number): void;
  canExecuteNow(person: Person): boolean;
  executePerson(state: GameState, person: Person): void;
  killPerson(state: GameState, person: Person): void;
  addWanted(state: GameState, amount: number): void;
  addAlarm(state: GameState, amount: number): void;
  resolveDest(state: GameState, dest: Dest): RoomId;
  movePersonTo(state: GameState, person: Person, room: RoomId, clearAlert?: boolean): void;
  markExplored(state: GameState, room: RoomId): void;
  onPlayerEnter(state: GameState, chasedId?: string): void;
  scoutRoom(state: GameState, room: RoomId, turns?: number): void;
  npcs(state: GameState): Person[];
  peopleInRoom(state: GameState, room: RoomId, role?: Person['role']): Person[];
  standing(state: GameState): Person[];
  nextStepToward(state: GameState, from: RoomId, to: RoomId, avoid?: RoomId[], respectLocks?: boolean): RoomId | null;
  healPerson(state: GameState, person: Person, amount?: number): void;
  rescuePerson(state: GameState, person: Person): void;
  checkCond(state: GameState, cond: Cond): boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function executeOps(state: GameState, ops: Op[], runtime: EffectRuntime): void {
  const { selectPeople, log, damagePerson, canExecuteNow, executePerson, killPerson, addWanted, addAlarm, resolveDest, movePersonTo, markExplored, onPlayerEnter, scoutRoom, npcs, peopleInRoom, standing, nextStepToward, healPerson, rescuePerson, checkCond } = runtime;
  for (const op of ops) {
    switch (op.op) {
      case 'damage': {
        const list = selectPeople(state, op.who).filter((p) => p.hp <= (op.maxHp ?? Infinity));
        if (!list.length) {
          log(state, '没有可以下手的人。');
          break;
        }
        list.forEach((p) => damagePerson(state, p, op.amount));
        break;
      }
      case 'down': {
        const list = selectPeople(state, op.who).filter((p) => p.hp > 0 && p.hp <= 2);
        if (!list.length) {
          log(state, '没有受伤的人可以被击倒。');
          break;
        }
        list.forEach((p) => damagePerson(state, p, 2));
        break;
      }
      case 'execute': {
        const list = selectPeople(state, op.who).filter((p) => canExecuteNow(p));
        if (!list.length) {
          log(state, '没有倒地够久的人可以处决（刚倒下的人要等两回合）。');
          break;
        }
        list.forEach((p) => executePerson(state, p));
        break;
      }
      case 'kill': {
        const list = selectPeople(state, op.who);
        if (!list.length) {
          log(state, '没有可以下手的人。');
          break;
        }
        list.forEach((p) => killPerson(state, p));
        break;
      }
      case 'wanted':
        addWanted(state, op.amount);
        break;
      case 'wantedHalf': {
        const before = state.alarm;
        addAlarm(state, -Math.floor(state.alarm / 2));
        if (before !== state.alarm) log(state, `暴露度从 ${before} 降到 ${state.alarm}。`);
        break;
      }
      case 'alert':
        selectPeople(state, op.who).forEach((p) => {
          p.alert = clamp(p.alert + op.amount, 0, 100);
          if (op.amount > 0 && p.intent === 'idle') p.intent = 'wary';
        });
        break;
      case 'block':
        selectPeople(state, op.who).forEach((p) => {
          p.blockedTurns = Math.max(p.blockedTurns, op.turns);
          p.intent = 'stunned';
        });
        break;
      case 'pin':
        selectPeople(state, op.who).forEach((p) => {
          if (!state.pinnedPeople.includes(p.id)) state.pinnedPeople.push(p.id);
        });
        break;
      case 'move': {
        const dest = resolveDest(state, op.to);
        selectPeople(state, op.who)
          .filter((p) => p.hp > 0)
          .forEach((p) => movePersonTo(state, p, dest, op.clearAlert));
        break;
      }
      case 'teleportPlayer': {
        const dest = resolveDest(state, op.to);
        if (dest !== state.playerRoom) {
          log(state, `你移动到${roomName(dest)}。`);
          state.playerRoom = dest;
          markExplored(state, dest);
          onPlayerEnter(state);
        }
        break;
      }
      case 'lockRoom': {
        const dest = resolveDest(state, op.room);
        state.roomLocks[dest] = Math.max(state.roomLocks[dest] ?? 0, op.turns);
        log(state, `${roomName(dest)}被封锁 ${op.turns} 回合。`);
        break;
      }
      case 'scout': {
        const turns = op.turns ?? 2;
        const rooms = op.all
          ? ROOMS.map((r) => r.id)
          : op.adj
            ? [state.playerRoom, ...ROOM_MAP[state.playerRoom].neighbors]
            : [op.to ? resolveDest(state, op.to) : state.playerRoom];
        rooms.forEach((r) => scoutRoom(state, r, turns));
        log(
          state,
          op.all
            ? `你点亮了整栋房子的位置（${turns} 回合）。`
            : op.adj
              ? `你贴着门缝看过去：相邻的 ${rooms.length - 1} 间屋子都在视野里了（${turns} 回合）。`
              : `${roomName(rooms[0])}的情况被你摸清了。`,
        );
        break;
      }
      case 'pulse': {
        // 只给影子，不给身份：地图上每个人所在的位置浮出一个红色人影，
        // 而且只亮这一回合——之后的去向要靠地面上的痕迹。
        state.senseTurn = state.turn;
        const alive = npcs(state).filter((p) => p.hp > 0 && !p.hidden);
        log(
          state,
          alive.length
            ? `你感觉到 ${alive.length} 个活人的位置——地图上浮起红色人影，但你看不清是谁。`
            : '你什么也感觉不到。',
        );
        break;
      }
      case 'search': {
        const here = peopleInRoom(state, state.playerRoom).filter((p) => p.role !== 'police');
        const found = here.filter((p) => p.hidden);
        found.forEach((p) => {
          p.hidden = false;
          p.alert = clamp(p.alert + 35, 0, 100);
          p.intent = 'flee';
          log(state, `${p.name} 被你从藏身处拖了出来。`);
        });
        if (!found.length) log(state, '这里没有藏着人。');
        scoutRoom(state, state.playerRoom, 2);
        break;
      }
      case 'track':
        selectPeople(state, op.who).forEach((p) => {
          p.trackedTurns = Math.max(p.trackedTurns, op.turns);
          p.hidden = false;
          log(state, `你记住了 ${p.name} 的气味，接下来 ${op.turns} 回合他跑不掉。`);
        });
        break;
      case 'lure': {
        const dest = resolveDest(state, op.to);
        const pool = standing(state)
          .filter((p) => p.room !== dest && !p.hidden && p.blockedTurns === 0)
          .sort((a, b) => roomDistance(a.room, dest) - roomDistance(b.room, dest))
          .slice(0, op.count);
        pool.forEach((p) => {
          const step = nextStepToward(state, p.room, dest, [state.playerRoom]);
          if (step) {
            movePersonTo(state, p, step);
            p.intent = 'wary';
            p.activity = '循着声音走过去';
          } else if (p.room !== dest) {
            p.room = dest;
            log(state, `${p.name} 被声音引到了${roomName(dest)}。`);
          }
        });
        if (!pool.length) log(state, '没人上钩。');
        break;
      }
      case 'alarm':
        addAlarm(state, op.amount);
        if (op.amount < 0) log(state, `暴露度降至 ${state.alarm}/100。`);
        break;
      case 'sabotage':
        if (op.key === 'phone') {
          state.phoneCut = true;
          if (!state.sabotage.includes('phone')) state.sabotage.push('phone');
          log(state, '电话线被你剪断，求救的路只剩下一台旧无线电。');
        } else if (op.key === 'exit') {
          state.exitBlockedTurns = Math.max(state.exitBlockedTurns, 2);
          log(state, '后院的门被你从里面钉死了。');
        } else if (op.key === 'radio') {
          if (!state.sabotage.includes('radio')) state.sabotage.push('radio');
          state.phoneCut = true;
          log(state, '无线电的真空管被你踩碎，地下室里再没有声音能传出去。');
        } else if (op.key === 'lights') {
          if (!state.sabotage.includes('lights')) state.sabotage.push('lights');
          state.noAlarmTurn = true;
          addAlarm(state, -4);
          log(state, '总闸落下，整栋房子沉进黑里。');
        }
        break;
      case 'draw':
        drawCards(state, op.amount);
        break;
      case 'energy':
        state.energy = clamp(state.energy + op.amount, 0, 99);
        if (op.amount > 0) log(state, `行动点 +${op.amount}。`);
        break;
      case 'steps':
        // 兼容旧卡面：原本叫「步数」，统一行动点后同样加进 AP 池
        state.energy = clamp(state.energy + op.amount, 0, 99);
        if (op.amount > 0) log(state, `行动点 +${op.amount}。`);
        break;
      case 'stun':
        state.stunTurns += op.amount;
        state.frenzy = 0;
        state.frenzyStreak = 0;
        log(state, `你被绊了一下，下回合少 ${state.stunTurns} 点行动点。`);
        break;
      case 'evidence':
        state.evidence += op.amount;
        log(state, `证据 ${op.amount >= 0 ? '+' : ''}${op.amount}（当前 ${state.evidence}）。`);
        break;
      case 'discount':
        state.discount = Math.min(2, state.discount + op.amount);
        log(state, `本回合后续卡牌费用 -${op.amount}。`);
        break;
      case 'bonusDamage':
        state.bonusDamage += op.amount;
        log(state, `下次攻击伤害 +${op.amount}。`);
        break;
      case 'arrestThreshold':
        // 警戒与逮捕合并后，这张牌改为直接压低暴露度
        addAlarm(state, -10);
        log(state, `你抹掉了现场的痕迹，暴露度降到 ${state.alarm}。`);
        break;
      case 'reveal': {
        const list = npcs(state)
          .filter((p) => !p.hidden)
          .map((p) => `${p.name}（${roomName(p.room)}·${INTENT_LABEL[p.intent]}）`)
          .join('、');
        log(state, list ? `你摸清了所有人的位置：${list}。` : '房子里安静得没有人。');
        scoutRoom(state, state.playerRoom, 2);
        break;
      }
      case 'heal':
        selectPeople(state, op.who).forEach((p) => healPerson(state, p, op.amount));
        break;
      case 'rescue':
        selectPeople(state, op.who).forEach((p) => rescuePerson(state, p));
        break;
      case 'bleed':
        selectPeople(state, op.who).forEach((p) => {
          p.bleed += op.amount;
        });
        break;
      case 'stalk':
        state.stalkMeter = clamp(state.stalkMeter + op.amount, 0, 100);
        log(state, `尾随值 ${state.stalkMeter}/100。`);
        break;
      case 'ambush': {
        state.ambushTurn = state.turn;
        log(state, '你收住了呼吸——这一回合推门进去，不会有任何人察觉。');
        break;
      }
      case 'pursue': {
        const maxD = op.distance ?? 2;
        const pool = selectPeople(state, op.who)
          .filter((p) => p.hp > 0 && p.room !== state.playerRoom)
          .filter((p) => roomDistance(p.room, state.playerRoom) <= maxD)
          .sort((a, b) => roomDistance(a.room, state.playerRoom) - roomDistance(b.room, state.playerRoom));
        const target = pool[0];
        if (!target) {
          log(state, '身边没有可以追的人。');
          break;
        }
        const from = roomName(state.playerRoom);
        state.playerRoom = target.room;
        markExplored(state, target.room);
        log(state, `你贴着他的脚步声从${from}追进了${roomName(target.room)}。`);
        target.alert = clamp(target.alert + 12, 0, 100);
        // 被追的人已经在你手边上了，不该再白拿一次「转身就跑」的反应，
        // 否则追击牌等于把人推得更远。
        onPlayerEnter(state, target.id);
        break;
      }
      case 'silenceAlarm':
        state.alarmSilencedUntilTurn = Math.max(state.alarmSilencedUntilTurn, state.turn + op.turns);
        log(state, `接下来 ${op.turns} 回合没有人能报警。`);
        break;
      case 'flag':
        switch (op.key) {
          case 'hexHuntress':
            state.hexHuntressActive = true;
            log(state, '猎杀戾气已启用：首次伤害幸存者时会在地图生成图腾。');
            break;
          case 'hexNoed':
            state.hexNoedActive = true;
            if (state.teamStage >= 4 && state.totems.length > 0 && !state.hexNoedBonusGranted) {
              state.energy += 2;
              state.hexNoedBonusGranted = true;
              log(state, '难逃一死立即生效：图腾仍然存留，你获得 2 点额外行动点。');
            }
            log(state, '难逃一死已启用：第四阶段仍有图腾时，攻击可直接击倒站立的幸存者。');
            break;
          case 'scourgeShrine':
            state.scourgeShrineReady = true;
            log(state, '鬼魔神龛已准备：下一次在特殊处决地点命中的攻击会倒退团队进度。');
            break;
          case 'distressing':
            state.distressingActive = true;
            log(state, '恐惧释放已启用：恐惧范围内的幸存者推进团队目标变慢。');
            break;
          case 'hexRuin':
            state.hexRuinActive = true;
            log(state, '粉碎希望已启用：首次破坏设施会额外倒退团队进度。');
            break;
          case 'stealthNext':
            state.stealthActions = Math.max(state.stealthActions, Number(op.value ?? 2));
            break;
          case 'revealAura':
            state.revealAuraActions = Math.max(state.revealAuraActions, Number(op.value ?? 1) + 1);
            log(state, '恶灵地狱：周围房间浮现红色人影。');
            break;
          case 'revealNearestTrail': {
            const nearest = [...state.trails].sort((a, b) => roomDistance(a.to, state.playerRoom) - roomDistance(b.to, state.playerRoom))[0];
            if (nearest) {
              state.highlightedTrail = { ...nearest };
              state.trailRevealActions = Math.max(state.trailRevealActions, Number(op.value ?? 1) + 1);
              log(state, `猎鹿者：最近的脚印路线显现，指向${roomName(nearest.to)}。`);
            } else {
              log(state, '猎鹿者：附近没有可追踪的脚印。');
            }
            break;
          }
          case 'revealWorkers': {
            const duration = Number(op.value ?? 2) + 1;
            const targets = state.teamStage >= 4
              ? npcs(state).filter((person) => person.hp > 0 && !person.hidden)
              : npcs(state).filter((person) => person.hp > 0 && !person.hidden && (person.intent === 'work' || ['objective', 'generator', 'key'].includes(person.goal)));
            targets.forEach((person) => { person.revealedActions = Math.max(person.revealedActions ?? 0, duration); });
            log(state, targets.length ? `苦涩低语：${state.teamStage >= 4 ? '所有幸存者' : '正在推进任务的幸存者'}显形。` : '苦涩低语：暂时没有正在推进任务的幸存者。');
            break;
          }
          case 'myersLastBest':
            state.myersLastBestActive = true;
            log(state, '把最好的留在最后已启用：攻击非血祭品时会积累专属印记。');
            break;
          case 'phoneCut':
            state.phoneCut = true;
            break;
          case 'wiretap':
            state.wiretap = true;
            break;
          case 'poltergeist':
            state.poltergeist = true;
            break;
          case 'policeBlocked':
            state.policeBlocked = true;
            break;
          case 'noAlarm':
            state.noAlarmTurn = true;
            break;
          case 'exitBlocked':
            state.exitBlockedTurns = Math.max(state.exitBlockedTurns, Number(op.value ?? 1));
            log(state, `逃生点被封住 ${state.exitBlockedTurns} 回合。`);
            break;
          case 'clearBarricade': {
            const cleared = state.barricades.filter(
              (r) => r === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(r),
            );
            state.barricades = state.barricades.filter((r) => !cleared.includes(r));
            state.clearedObstacles = Array.from(new Set([...state.clearedObstacles, ...cleared]));
            log(state, cleared.length
              ? `你撞开了${cleared.map(roomName).join('、')}的堵门。`
              : '这里没有需要撞开的东西。');
            break;
          }
          case 'freeMove':
            state.freeMove = true;
            break;
          case 'possessReady':
            state.possessed = true;
            state.possessTurns = 0;
            state.myersStalking = false;
            state.stalkPressure = 0;
            state.stalkTargetId = null;
            state.stalkMeter = 100;
            log(state, '恶魔附身：每次行动消耗 20 点尾随值，归零时退出；每一刀都能直接击倒站立的幸存者。');
            break;
          case 'myersStalk':
            state.myersStalking = !state.myersStalking;
            state.stalkTargetId = null;
            state.stalkPressure = 0;
            if (state.myersStalking) {
              state.possessed = false;
              log(state, '尾随者模式启动：你的恐惧范围降为 0。停下脚步，盯住猎物。');
            } else {
              log(state, '你离开了阴影，恐惧范围恢复。');
            }
            break;
        }
        break;
      case 'log':
        log(state, op.text);
        break;
      case 'if':
        executeOps(state, checkCond(state, op.cond) ? op.then : op.else ?? [], runtime);
        break;
    }
    if (state.result) return;
  }
}

