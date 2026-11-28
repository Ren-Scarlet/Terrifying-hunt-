import { drawCards } from '../deck';
import { POSSESS_TURNS, SURVIVOR_MAX_HP } from '../constants';
import { roomDistance } from '../navigation';
import { EXECUTION_METHODS } from '../executions';
import { roomName } from '../missions';
import { ROOM_MAP, ROOMS, TOTEM_ROOMS } from '../rooms';
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
  sabotageContext(state: GameState): boolean;
  destroyCurrentObject(state: GameState): boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function executeOps(state: GameState, ops: Op[], runtime: EffectRuntime): void {
  const { selectPeople, log, damagePerson, canExecuteNow, executePerson, killPerson, addWanted, addAlarm, resolveDest, movePersonTo, markExplored, onPlayerEnter, scoutRoom, npcs, peopleInRoom, standing, nextStepToward, healPerson, rescuePerson, checkCond, sabotageContext, destroyCurrentObject } = runtime;
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
        });
        break;
      case 'block':
        selectPeople(state, op.who).forEach((p) => {
          p.blockedTurns = Math.max(p.blockedTurns, op.turns);
        });
        break;
      case 'status':
        selectPeople(state, op.who).forEach((p) => {
          p.statusEffects ??= {};
          p.statusEffects[op.status] = Math.max(p.statusEffects[op.status] ?? 0, op.turns + 1);
          const labels = { blind: '障目', undetectable: '无法侦测', danger: '危险', deepWound: '深度伤口', oblivious: '浑然不觉', incurable: '不治', cursed: '被诅咒' };
          log(state, `${p.name} 获得状态：${labels[op.status]}。`);
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
      case 'fearWave': {
        const wounded = state.people.filter((p) => p.role !== 'police' && p.hp > 0 && p.hp < SURVIVOR_MAX_HP).length;
        const downed = state.people.filter((p) => p.role !== 'police' && p.hp <= 0).length;
        const stacks = wounded + downed + state.kills;
        if (stacks <= 0) {
          log(state, '死亡恐惧：还没有人受伤，恐惧无从蔓延。');
          break;
        }
        const gain = op.amount * stacks;
        state.people.forEach((p) => {
          if (p.role === 'police' || p.hp <= 0) return;
          p.fear = Math.min(100, p.fear + gain);
        });
        log(state, `死亡恐惧：${stacks} 个伤者、倒地者与尸体，让所有人恐惧 +${gain}。`);
        break;
      }
      case 'fearFlee': {
        const candidates = standing(state)
          .filter((person) => person.role !== 'police' && !person.hidden && roomDistance(person.room, state.playerRoom) <= 1)
          .sort((a, b) => roomDistance(a.room, state.playerRoom) - roomDistance(b.room, state.playerRoom) || b.alert - a.alert);
        const target = candidates[0];
        if (!target) {
          log(state, '恐慌降临：当前房间及相邻房间没有可影响的幸存者。');
          break;
        }
        const oldDistance = roomDistance(target.room, state.playerRoom);
        target.fear = clamp(target.fear + op.amount, 0, 100);
        const escapeRoom = ROOM_MAP[target.room].neighbors
          .filter((room) => roomDistance(room, state.playerRoom) > oldDistance)
          .filter((room) => !(state.roomLocks[room] && state.roomLocks[room]! > 0) && !state.barricades.includes(room))
          .sort((a, b) => roomDistance(b, state.playerRoom) - roomDistance(a, state.playerRoom))[0];
        if (escapeRoom) {
          movePersonTo(state, target, escapeRoom);
          target.activity = '受到恐惧冲击，向远离杀手的方向逃跑';
          log(state, `恐慌降临：${target.name}恐惧 +${op.amount}，并向远离你的方向逃进${roomName(escapeRoom)}。`);
        } else {
          log(state, `恐慌降临：${target.name}恐惧 +${op.amount}，但周围没有能继续远离你的通路。`);
        }
        break;
      }
      case 'destroyCurrentObject':
        if (!destroyCurrentObject(state)) log(state, '所向无敌：当前房间没有可破坏的物品。');
        break;
      case 'revealExecutionSite': {
        const nearestRoom = [...new Set(EXECUTION_METHODS.map((method) => method.room))]
          .sort((a, b) => roomDistance(state.playerRoom, a) - roomDistance(state.playerRoom, b))[0];
        if (!nearestRoom) {
          log(state, '欣喜若狂：当前猎场没有可用的特殊处决地点。');
          break;
        }
        state.executionSiteHint = nearestRoom;
        scoutRoom(state, nearestRoom, op.turns);
        const methods = EXECUTION_METHODS.filter((method) => method.room === nearestRoom).map((method) => method.name).join('、');
        log(state, `欣喜若狂：最近的特殊处决地点是${roomName(nearestRoom)}（${methods}），已在地图上标出。`);
        break;
      }
      case 'contextSabotage':
        if (sabotageContext(state)) {
          addAlarm(state, -10);
          log(state, `粉碎希望：完成一次环境破坏，警报降低 10 点（当前 ${state.alarm}/100）。`);
        } else {
          log(state, '粉碎希望：当前房间附近没有可破坏的目标。');
        }
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
          .map((p) => `${p.name}（${roomName(p.room)}·${p.activity || '没有明显动作'}）`)
          .join('、');
        log(state, list ? `你摸清了所有人的位置：${list}。` : '房子里安静得没有人。');
        scoutRoom(state, state.playerRoom, 2);
        break;
      }
      case 'revealPanicked': {
        // 恐慌阈值与 engine.ts 的 FEAR_AFRAID 保持一致（60）
        const panicked = npcs(state)
          .filter((p) => p.role !== 'police' && p.hp > 0 && p.fear >= 60)
          .sort((a, b) => b.fear - a.fear);
        const chosen = panicked[0];
        if (chosen) {
          // 出牌本身也会消耗一次行动计数，+1 才能让玩家真正看到 turns 次
          chosen.revealedActions = Math.max(chosen.revealedActions ?? 0, op.turns + 1);
          log(state, `喘鸣声里最刺耳的是 ${chosen.name}（恐惧 ${chosen.fear}）：他接下来 ${op.turns} 次行动都会暴露气场。`);
        } else {
          log(state, '房子里没有恐惧到失控的人，喘鸣只带回一片杂音。');
        }
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
      case 'silenceAlarm':
        state.alarmSilencedUntilTurn = Math.max(state.alarmSilencedUntilTurn, state.turn + op.turns);
        log(state, `接下来 ${op.turns} 回合没有人能报警。`);
        break;
      case 'flag':
        switch (op.key) {
          case 'hexHuntress':
            state.hexHuntressActive = true;
            state.hexHuntressUsed = false;
            log(state, '猎杀戾气已启用：下一次击杀人类时获得额外猎杀评分。');
            break;
          case 'hexNoed':
            state.hexNoedActive = true;
            state.totems = [...TOTEM_ROOMS];
            log(state, `难逃一死已启用：${state.totems.map(roomName).join('、')}出现厄咒图腾；只要仍有图腾存续，攻击命中就会直接击倒幸存者。`);
            break;
          case 'scourgeShrine':
            state.scourgeShrineRoom = state.playerRoom;
            state.scourgeShrineOccupants = [];
            log(state, `鬼魔神龛已安置在${roomName(state.playerRoom)}：之后第一个踏入此处的人会受到惊吓并显形。`);
            break;
          case 'distressing': {
            const affected = npcs(state).filter((person) => person.role !== 'police' && person.hp > 0 && !person.hidden && roomDistance(person.room, state.playerRoom) === 1);
            affected.forEach((person) => {
              person.fear = clamp(person.fear + 25, 0, 100);
              person.revealedActions = Math.max(person.revealedActions ?? 0, 3);
            });
            log(state, affected.length
              ? `恐惧释放：相邻房间的 ${affected.length} 名人类听见耳边低语，恐惧上升并显露气场。`
              : '恐惧释放：相邻房间没有可回应低语的人。');
            break;
          }
          case 'stealthNext':
            state.stealthActions = Math.max(state.stealthActions, Number(op.value ?? 2));
            break;
          case 'revealAura':
            state.auraTargeting = true;
            log(state, '恶灵低语：请选择地图上的任意一个房间。若里面有人，其气场将显现。');
            break;
          case 'revealNearestTrail': {
            const trails = [...state.trails].sort((a, b) => b.clock - a.clock);
            const newest = trails[0];
            if (newest) {
              state.highlightedTrail = { ...newest };
              state.trailRevealActions = Math.max(state.trailRevealActions, Number(op.value ?? 2) + 1);
              log(state, `猎鹿者：地图上 ${trails.length} 段尚未消失的脚印同时显现，最新一段指向${roomName(newest.to)}。`);
            } else {
              log(state, '猎鹿者：地图上没有留下可追踪的脚印。');
            }
            break;
          }
          case 'bitterMurmur':
            state.bitterMurmurReady = true;
            log(state, '苦涩低语已埋下：下一次有人死亡时，回声会显露其余所有人。');
            break;
          case 'bleedNextHit':
            state.bleedNextHit = true;
            log(state, '辣手屠夫：下一次命中会留下持续流血的伤口与血迹。');
            break;
          case 'noAttackTurn':
            state.attackBlockedTurn = state.turn;
            log(state, '戏耍食物：本回合不能攻击，也不能打出造成伤害或处决的卡牌。');
            break;
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

