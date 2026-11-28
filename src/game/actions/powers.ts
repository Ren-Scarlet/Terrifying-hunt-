/**
 * 杀手专属能力：设陷者的夹子、护士的闪现、女猎手的飞斧、迈尔斯的尾随。
 *
 * 能力数值全部来自 modifiers.ts；这里只负责判定能不能用、以及用出去发生什么。
 */
import { KILLER_MAP } from '../killers';
import { blinkRangeOf, blinkWithinRange, hatchetDamageOf, hatchetMax, modifierValue, possessCost } from '../modifiers';
import { roomName } from '../missions';
import { ROOMS, ROOM_MAP } from '../rooms';
import { myersStalkGain } from '../npc/awareness';
import type { GameState, Person, RoomId } from '../types';
import { cabinetRoomsFor, npcPeople as npcs } from '../world/roomState';
import type { NpcHost } from '../npc/ai/host';

function visibleMyersStalkTargets(host: NpcHost, state: GameState) {
  // 只排除无法观察的目标；正在逃跑但仍在视野里的幸存者也可以被观察。
  return npcs(state).filter((person) => person.hp > 0 && !person.hidden && person.role !== 'police' && host.isRoomVisible(state, person.room));
}

function trapPlacementBlockReason(host: NpcHost, state: GameState): string | null {
  if (state.killer !== '设陷者') return '只有设陷者可以布设捕兽夹。';
  if (state.trapInventory <= 0) return '没有可用的捕兽夹；寻找地图上的补给点。';
  if (state.energy < 1) return '行动点不足：布设捕兽夹需要 1 点。';
  return null;
}

function huntressTargetable(host: NpcHost, state: GameState, person: Person): boolean {
  if (person.role === 'police' || person.hp <= 0 || person.hidden || !host.isPersonVisible(state, person)) return false;
  if (person.room === state.playerRoom) return true;
  return host.forwardRoom(state) === person.room;
}

export function blinkPlayer(host: NpcHost, state: GameState, room: RoomId): boolean {
  if (state.killer !== '护士' || !state.nurseBlinkTargeting) return false;
  const maxRange = blinkRangeOf(state);
  if (!blinkWithinRange(state, room) || state.energy < 1) {
    host.log(state, `闪现目标必须在 ${maxRange} 格内的任意房间，且需要 1 点行动点。`);
    return false;
  }
  const from = ROOM_MAP[state.playerRoom].rect;
  const to = ROOM_MAP[room].rect;
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const length = Math.hypot(dx, dy) || 1;
  state.playerFacing = { x: dx / length, y: dy / length };
  state.watchedRoom = state.playerRoom;
  state.energy -= 1;
  state.playerRoom = room;
  host.markExplored(state, room);
  // 闪现同样属于进入房间：屋内幸存者会察觉护士，并在门锁被闯入后尝试逃跑。
  host.npcOnPlayerEnter(state);
  state.nurseBlinkTargeting = false;
  state.nurseFollowUp = true;
  state.nurseFatiguePending = true;
  // 冷却修正：负数 = 更快。基础闪现冷却 1 回合。
  const blinkCooldown = Math.max(0, 1 + modifierValue(state, 'cooldown'));
  if (blinkCooldown > 0) state.cooldowns.nurse_blink = blinkCooldown;
  else delete state.cooldowns.nurse_blink;
  state.huntStats.nurseBlinks += 1;
  state.attackReady = true;
  host.log(state, `护士穿过墙壁与房门，闪现到${roomName(room)}。你可以立即对同屋站立幸存者发动一次普通攻击；下一次行动后将进入疲惫。`);
  return true;
}

export function throwHuntressHatchet(host: NpcHost, state: GameState, targetId: string): boolean {
  if (state.killer !== '女猎手') { host.log(state, '只有女猎手可以投掷狩猎飞斧。'); return false; }
  if (!state.huntressAiming) { host.log(state, '请先点击「狩猎飞斧」进入瞄准状态。'); return false; }
  if (state.hatchets <= 0) { host.log(state, '飞斧已经耗尽：前往柜子补充后再投掷。'); return false; }
  if (state.energy < 1) { host.log(state, '行动点不足：投掷飞斧需要 1 点行动点。'); return false; }
  if (state.attackBlockedTurn === state.turn) { host.log(state, '本回合攻击动作已被打断，暂时无法投掷飞斧。'); return false; }
  const target = state.people.find((person) => person.id === targetId);
  if (!target || !huntressTargetable(host, state, target)) {
    host.log(state, '飞斧未投出：只能选择可见、未倒地、未藏匿，且位于当前房间或正前方直线房间的幸存者。');
    return false;
  }
  state.energy -= 1;
  state.hatchets -= 1;
  state.huntStats.hatchetHits += 1;
  state.huntressAiming = false;
  host.log(state, `女猎手掷出狩猎飞斧，命中${target.name}（剩余飞斧 ${state.hatchets}/${hatchetMax(state)}）。`);
  // 飞斧不影响恐惧值，也不因恐惧满值放大伤害；命中后仍会触发逃跑反应。
  host.damagePerson(state, target, hatchetDamageOf(state), { affectFear: false, forceFlee: true });
  state.attackReady = true;
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}

export function refillHuntressHatchets(host: NpcHost, state: GameState): boolean {
  const max = hatchetMax(state);
  if (state.killer !== '女猎手' || !cabinetRoomsFor(state).includes(state.playerRoom) || state.hatchets >= max || state.energy < 1) {
    host.log(state, '只有在柜子房间内、行动点充足且飞斧未满时才能补充。');
    return false;
  }
  state.energy -= 1;
  const restored = max - state.hatchets;
  state.hatchets = max;
  host.log(state, `你从柜子里取出 ${restored} 把飞斧，补充至 ${max}/${max}。`);
  host.afterPlayerAction(state);
  return true;
}

export function collectTrapCache(host: NpcHost, state: GameState): boolean {
  if (state.killer !== '设陷者' || !state.trapCaches.includes(state.playerRoom) || state.trapInventory >= 4 || state.energy < 1) {
    host.log(state, '这里没有可收集的捕兽夹补给，或携带数量已达上限。');
    return false;
  }
  state.energy -= 1;
  state.trapCaches = state.trapCaches.filter((room) => room !== state.playerRoom);
  state.trapInventory += 1;
  host.log(state, `你从补给点收集到 1 个捕兽夹（携带 ${state.trapInventory}/4）。`);
  host.afterPlayerAction(state);
  return true;
}

export function recoverBearTrap(host: NpcHost, state: GameState): boolean {
  const trap = state.bearTraps.find((item) => item.room === state.playerRoom && !item.armed);
  if (state.killer !== '设陷者' || !trap || state.energy < 1 || state.trapInventory >= 4) {
    host.log(state, '当前没有可回收的捕兽夹，或携带数量已达上限。');
    return false;
  }
  state.energy -= 1;
  state.bearTraps = state.bearTraps.filter((item) => item.id !== trap.id);
  state.trapInventory += 1;
  host.log(state, `你回收了${roomName(state.playerRoom)}的捕兽夹（携带 ${state.trapInventory}/4）。`);
  host.afterPlayerAction(state);
  return true;
}

export function canUsePower(host: NpcHost, state: GameState, powerId: string): boolean {
  if (state.phase !== 'playing') return false;
  const killer = KILLER_MAP[state.killer];
  const power = killer?.powers.find((p) => p.id === powerId);
  if (!power) return false;
  if (host.powerCooldown(state, powerId) > 0) return false;
  if (powerId === 'trap_set') return trapPlacementBlockReason(host, state) === null;
  if (powerId === 'nurse_blink') {
    if (state.killer !== '护士') return false;
    if (state.nurseBlinkTargeting) return true;
    if (state.nurseFollowUp || state.energy < 1) return false;
    return ROOMS.some((room) => blinkWithinRange(state, room.id));
  }
  if (powerId === 'huntress_axe') {
    if (state.killer !== '女猎手' || state.energy < 1) return false;
    if (state.huntressAiming) return true;
    return state.hatchets > 0 && visibleMyersStalkTargets(host, state).some((person) => huntressTargetable(host, state, person));
  }
  if (powerId === 'myers_gaze') {
    if (state.killer !== '迈克尔·迈尔斯' || state.possessed || state.energy < 1) return false;
    if (state.stalkMeter >= 100) return true;
    return visibleMyersStalkTargets(host, state).some((person) => myersStalkGain(person.alert) > 0);
  }
  if (power.requires && !power.requires.every((c) => host.checkCond(state, c))) return false;
  return true;
}

/** 能力为什么不能用，给按钮的 tooltip 用 */
export function powerBlockReason(host: NpcHost, state: GameState, powerId: string): string {
  const killer = KILLER_MAP[state.killer];
  const power = killer?.powers.find((p) => p.id === powerId);
  if (!power) return '';
  const cd = host.powerCooldown(state, powerId);
  if (cd > 0) return `冷却中，还要 ${cd} 回合`;
  if (powerId === 'trap_set') return trapPlacementBlockReason(host, state) ?? '';
  if (powerId === 'nurse_blink') {
    if (state.nurseBlinkTargeting) return '再次点击可取消闪现选点';
    if (state.nurseFollowUp) return '闪现后的攻击窗口尚未结束';
    if (state.energy < 1) return '至少需要 1 点行动点';
    return '';
  }
  if (powerId === 'huntress_axe') {
    if (state.huntressAiming) return '再次点击可取消瞄准';
    if (state.hatchets <= 0) return '飞斧耗尽：请前往柜子补充';
    if (state.energy < 1) return '至少需要 1 点行动点';
    if (!visibleMyersStalkTargets(host, state).some((person) => huntressTargetable(host, state, person))) return '视野内没有直线可命中的站立幸存者';
    return '';
  }
  if (powerId === 'myers_gaze') {
    if (state.possessed) return '恶魔附身期间不能再次尾随';
    if (state.energy < 1) return '至少需要 1 点行动点';
    if (state.stalkMeter >= 100) return '';
    if (!visibleMyersStalkTargets(host, state).some((person) => myersStalkGain(person.alert) > 0)) return '视野内没有可继续积累尾随值的幸存者';
  }
  if (power.requires && !power.requires.every((c) => host.checkCond(state, c))) {
    const need = power.requires.find((c) => !host.checkCond(state, c));
    if (need?.c === 'stalk') return `需要尾随值达到 ${need.gte}`;
    if (need?.c === 'downedHere') return '房间里没有倒地的人';
    if (need?.c === 'peopleHere') return '房间里没有人';
    return '条件还不满足';
  }
  return '';
}

export function usePower(host: NpcHost, state: GameState, powerId: string): boolean {
  if (powerId === 'trap_set') {
    const reason = trapPlacementBlockReason(host, state);
    if (reason) { host.log(state, reason); return false; }
    state.energy -= 1;
    state.trapInventory -= 1;
    state.bearTraps.push({
      id: `bear-trap-${state.turn}-${state.trailClock}-${state.bearTraps.length}`,
      room: state.playerRoom,
      armed: true,
      discovered: false,
    });
    host.log(state, `你在${roomName(state.playerRoom)}布设了一只捕兽夹。现在可以在任何房间连续布设，不再受地点和间距限制。`);
    state.attackReady = true;
    host.afterPlayerAction(state);
    host.checkImmediateWin(state);
    return true;
  }
  if (powerId === 'nurse_blink') {
    if (state.nurseBlinkTargeting) {
      state.nurseBlinkTargeting = false;
      host.log(state, '已取消闪现选点。');
      return true;
    }
    if (!canUsePower(host, state, powerId)) { host.log(state, powerBlockReason(host, state, powerId) || '当前无法闪现。'); return false; }
    state.nurseBlinkTargeting = true;
    host.log(state, `选择地图上 ${blinkRangeOf(state)} 格内的任意位置；闪现后可立即攻击同屋站立幸存者。`);
    return true;
  }
  if (powerId === 'huntress_axe') {
    if (state.huntressAiming) {
      state.huntressAiming = false;
      host.log(state, '已取消飞斧瞄准。');
      return true;
    }
    if (!canUsePower(host, state, powerId)) { host.log(state, powerBlockReason(host, state, powerId) || '当前无法投掷飞斧。'); return false; }
    state.huntressAiming = true;
    host.log(state, '狩猎飞斧已举起：点击地图中直线视野内的站立幸存者进行投掷。');
    return true;
  }
  if (powerId === 'myers_gaze') {
    if (!canUsePower(host, state, powerId)) { host.log(state, powerBlockReason(host, state, powerId) || '当前无法尾随。'); return false; }
    if (state.stalkMeter >= 100) {
      state.energy -= 1;
      state.possessed = true;
      host.log(state, `恶魔附身：尾随值已满，迈克尔释放积攒的恶意。接下来每次行动消耗 ${possessCost(state)} 点尾随值，强化挥刀可直接击倒站立目标；结束后不会陷入虚弱。`);
      state.attackReady = true;
      host.afterPlayerAction(state);
      host.checkImmediateWin(state);
      return true;
    }
    const visible = visibleMyersStalkTargets(host, state).filter((person) => myersStalkGain(person.alert) > 0);
    if (!visible.length) { host.log(state, '视野内没有可继续积累尾随值的幸存者。'); return false; }
    state.energy -= 1;
    let totalGain = 0;
    const names: string[] = [];
    for (const person of visible) {
      if (!state.myersStalkedIds.includes(person.id)) state.myersStalkedIds.push(person.id);
      const isolated = !npcs(state).some((other) =>
        other.id !== person.id && other.hp > 0 && other.role !== 'police' && !other.hidden && other.room === person.room,
      );
      const baseGain = myersStalkGain(person.alert) + (isolated ? 5 : 0);
      // 配件的「尾随获取」按百分比放大，四舍五入保证 HUD 与结算看到同一个整数。
      const gain = Math.max(0, Math.round(baseGain * (1 + modifierValue(state, 'stalkGain') / 100)));
      totalGain += gain;
      names.push(`${person.name} +${gain}${isolated ? '（落单）' : ''}`);
    }
    state.stalkMeter = Math.min(100, state.stalkMeter + totalGain);
    host.log(state, `你观察视野内 ${visible.length} 名幸存者：${names.join('、')}；尾随值 +${totalGain}（${state.stalkMeter}/100）。`);
    state.attackReady = true;
    host.afterPlayerAction(state);
    host.checkImmediateWin(state);
    return true;
  }
  if (!canUsePower(host, state, powerId)) {
    host.log(state, powerBlockReason(host, state, powerId) || '这个能力现在用不了。');
    return false;
  }
  const killer = KILLER_MAP[state.killer];
  const power = killer.powers.find((p) => p.id === powerId)!;
  const cooldown = Math.max(0, power.cooldown + modifierValue(state, 'cooldown'));
  if (cooldown > 0) state.cooldowns[powerId] = cooldown;
  else delete state.cooldowns[powerId];
  host.log(state, `${killer.owner}·${power.name}：${power.desc}`);
  host.runOps(state, power.ops);
  if (state.killer === '鬼面' && powerId === 'ghost_stalk') {
    state.nightfallActive = true;
    host.log(state, '夜幕拉开：接下来每回合盯住相邻房间的一个人，监视值满 100 他就会持续显形。');
  }
  state.attackReady = true;
  host.afterPlayerAction(state);
  host.checkImmediateWin(state);
  return true;
}
