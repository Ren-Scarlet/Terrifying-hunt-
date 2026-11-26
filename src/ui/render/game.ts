import { CARD_MAP } from '../../game/cards';
import { awarenessLabel, awarenessStage } from '../../game/npc/awareness';
import { characterImage, uiIcon } from '../../game/assetMap';
import {
  ALARM_MAX,
  ARCH_LABEL,
  ATTACK_COST,
  BASE_AP,
  BLEEDOUT_TURNS,
  FRENZY_AP_BONUS,
  DRAW_CARD_COST,
  HAND_LIMIT,
  FRENZY_MAX,
  FRENZY_THRESHOLD,
  GOAL_LABEL,
  HEALTH_LABEL,
  INTENT_LABEL,
  LOOK_COST,
  SEARCH_COST,
  attackBlockReason,
  canAttack,
  executeBlockReason,
  canMoveTo,
  canUsePower,
  conditionOf,
  currentScore,
  effectiveCost,
  getStars,
  isLocked,
  isPersonVisible,
  isRoomExplored,
  isRoomVisible,
  isSensing,
  knownPeople,
  moveCost,
  powerBlockReason,
  powerCooldown,
  visibleDisturbances,
  visibleTrails,
  wipeBlockReason,
  WIPE_COST,
  SABOTAGE_COST,
  SITE_ITEM_LABEL,
  SURVIVOR_ITEM_LABEL,
  sabotageBlockReason,
  breakerBlockReason,
  BREAKER_SWITCH_COST,
  missionTaskProgress,
  isRoomLit,
  getHuntOpportunities,
} from '../../game/engine';
import { roomDistance } from '../../game/navigation';
import { executionMethodsAtRoom } from '../../game/executions';
import { getHuntingGround } from '../../game/maps';
import { KILLERS, KILLER_MAP, type KillerProfile } from '../../game/killers';
import { roomName } from '../../game/missions';
import {
  CABINET_ROOMS,
  EXIT_ROOM,
  OBSTACLE_ROOMS,
  PHONE_ROOMS,
  RADIO_ROOMS,
  ROOM_MAP,
  ROOMS,
  TOTEM_ROOMS,
  layoutAspect,
  layoutAspectNum,
  doorMarkerPosition,
} from '../../game/rooms';


import { isCardTuned } from '../../game/tuning';
import { isMuted, playHeartbeat, playTrapScream } from '../audio';
import { escape, icon, itemBadge, itemIconHtml, personChip, intentDot, shadowFigures, perkIconHtml, TYPE_NAMES, killerFaceHtml, defaultDetailHtml, cardTextHtml } from './shared';
import type { GameState, Person, RoomId, SaveData } from '../../game/types';

let lastRenderedTrapTriggerCount: number | null = null;
let lastRedFigureSignature = '';

function roomFeatures(state: GameState, roomId: RoomId): string {
  const parts: string[] = [];
  const cleared = state.clearedObstacles.includes(roomId);
  state.siteItems
    .filter((i) => i.room === roomId)
    .forEach((i) => {
      const label = SITE_ITEM_LABEL[i.kind];
      const status =
        i.kind === 'itemBox'
          ? i.broken
            ? '已被砸烂'
            : `还能翻 ${i.charges} 件`
          : i.jammedTurns > 0
            ? `停机 ${i.jammedTurns} 回合`
            : i.charged
              ? '已通电'
              : `修复 ${i.progress}%`;
      const down = i.broken || i.jammedTurns > 0;
      parts.push(
        `<span class="room-feature site ${i.kind} ${down ? 'broken' : ''}" title="${label}：${status}。你用不了它，但可以花 ${SABOTAGE_COST} 点行动点砸掉">${icon(i.kind === 'itemBox' ? 'itemBox' : 'generator', 'ui-icon tiny')}<b>${i.kind === 'itemBox' ? '道具箱' : '发电机'}</b></span>`,
      );
    });
  // 房间照明由 Canvas 光照系统直接表现，不再用文字或 emoji 标记灯光状态。
  const circuitAt = state.powerCircuits.find((c) => c.breakerRoom === roomId);
  if (circuitAt) {
    const source = circuitAt.generatorId ? state.siteItems.find((item) => item.id === circuitAt.generatorId) : undefined;
    const sourceOffline = !!source && (source.broken || source.jammedTurns > 0);
    const status = circuitAt.broken ? '控制箱损坏' : circuitAt.enabled === false ? '已拉闸' : sourceOffline ? '发电机停机' : '供电正常';
    parts.push(`<span class="room-feature breaker ${circuitAt.broken || circuitAt.enabled === false || sourceOffline ? 'broken' : ''}" title="${escape(circuitAt.name)}：${status}，影响 ${circuitAt.affectedRooms.map(roomName).join('、')}">⚡<b>电闸</b></span>`);
  }
  const placedTrap = state.bearTraps.find((trap) => trap.room === roomId);
  if (placedTrap) {
    const trapStatus = placedTrap.armed ? (placedTrap.discovered ? '已被幸存者发现，可能被拆除' : '已布设，等待触发') : '已触发或拆除，可由设陷者回收';
    parts.push(`<span class="room-feature bear-trap ${placedTrap.armed ? 'armed' : 'spent'}" title="捕兽夹：${trapStatus}">${icon('bearTrap', 'ui-icon tiny')}<b>捕兽夹</b></span>`);
  }
  if (state.trapCaches.includes(roomId)) {
    parts.push('<span class="room-feature trap-cache" title="捕兽夹补给：设陷者可在此收集额外捕兽夹">＋<b>陷阱补给</b></span>');
  }
  if (PHONE_ROOMS.includes(roomId)) {
    parts.push(`<span class="room-feature telephone ${state.phoneCut ? 'broken' : 'on'}" title="电话：${state.phoneCut ? '线路已中断，跨区域协调受限' : '线路正常，可进行远程求救协调'}">☎<b>电话</b></span>`);
  }
  if (RADIO_ROOMS.includes(roomId)) {
    const radioBroken = state.sabotage.includes('radio');
    parts.push(`<span class="room-feature radio ${radioBroken ? 'broken' : 'on'}" title="备用无线电：${radioBroken ? '已被破坏' : '电话中断时可进行有限范围协调'}">▣<b>无线电</b></span>`);
  }
  const executionSites = executionMethodsAtRoom(roomId);
  if (executionSites.length) parts.push(`<span class="room-feature execution-site" title="特殊处决地点：${executionSites.map((method) => escape(method.name)).join(' / ')}">☠<b>处决点 ${executionSites.length}</b></span>`);
  if (roomId === EXIT_ROOM) parts.push(`<span class="room-feature escape" title="撤离点：任务完成的撤离位置">${icon('escape', 'ui-icon tiny')}</span>`);
  if (state.escapeRooms.includes(roomId)) parts.push(`<span class="room-feature escape-npc" title="团队第4阶段开启的逃生点">${icon('escape', 'ui-icon tiny')}</span>`);
  if (TOTEM_ROOMS.includes(roomId)) parts.push(`<span class="room-feature totem" title="图腾：在此结束回合，下回合 +1 行动点">${icon('totem', 'ui-icon tiny')}<b>图腾</b></span>`);
  if (state.totems.includes(roomId)) parts.push(`<span class="room-feature totem cursed" title="厄咒图腾：支撑难逃一死；幸存者可能发现并破坏">${icon('totem', 'ui-icon tiny')}<b>厄咒</b></span>`);
  if (state.trailRevealActions > 0 && visibleTrails(state).some((trail) => trail.room === roomId || trail.to === roomId)) parts.push('<span class="room-feature trail-highlight" title="猎鹿者显现的脚印路线">👣</span>');
  if (state.scourgeShrineRoom === roomId) parts.push('<span class="room-feature shrine" title="鬼魔神龛：等待有人踏入">☠<b>神龛</b></span>');
  if (CABINET_ROOMS.includes(roomId) || (state.mapId === 'badham' && ['nursery', 'storage', 'guestroom'].includes(roomId))) parts.push(`<span class="room-feature cabinet" title="柜子：藏身者不会被引诱类卡牌锁定">${icon('cabinet', 'ui-icon tiny')}<b>柜子</b></span>`);
  if (OBSTACLE_ROOMS.includes(roomId) && !cleared) parts.push(`<span class="room-feature obstacle" title="障碍：进入多花 1 点行动点；破门能力可以直接清掉">${icon('obstacle', 'ui-icon tiny')}<b>障碍</b></span>`);
  return parts.join('');
}

function doorMarkersHtml(state: GameState): string {
  const seen = new Set<string>();
  return ROOMS.flatMap((room) => room.neighbors.map((neighborId) => {
    const key = [room.id, neighborId].sort().join('|');
    if (seen.has(key)) return '';
    seen.add(key);
    const position = doorMarkerPosition(room.id, neighborId);
    if (!position) return '';
    const adjacent = state.playerRoom === room.id || state.playerRoom === neighborId;
    const targetRoom = state.playerRoom === room.id ? neighborId : state.playerRoom === neighborId ? room.id : null;
    const locked = isLocked(state, room.id) || isLocked(state, neighborId);
    const barricaded = !!targetRoom && state.barricades.includes(targetRoom);
    const canPass = !!targetRoom && !locked && canMoveTo(state, targetRoom);
    const shortOnAp = adjacent && !locked && !canPass;
    const status = locked ? 'blocked' : barricaded ? 'barricaded' : canPass ? 'active' : shortOnAp ? 'low-ap' : 'open';
    const title = locked ? '封锁的门' : barricaded ? '堵门：通行需要额外行动点' : canPass ? '当前可通行' : shortOnAp ? '门已打开，但行动点不足' : '可通行的门';
    return `<span class="map-door-marker ${position.orientation} ${status}" style="left:${position.left.toFixed(3)}%;top:${position.top.toFixed(3)}%" title="${title}" aria-hidden="true"><i></i></span>`;
  })).join('');
}

/** 把最近发生的关键行动投射到地图上；完整记录仍保留在情报抽屉。 */
function mapEventFeedHtml(state: GameState): string {
  const important = /没能再起来|停止了呼吸|处决了|特殊处决|砸毁了|砸烂了|你砸了|立即断电|电话线被剪断|封锁了|踩中捕兽夹|报警成功|成功逃离|逃出了房子|翻出了后院|已抵达逃生点|地图出现两个逃生点|逃生点开启|大门开启|警报升高！猎场出现逃生点|被警察逮捕|被同伴救起|【环境事件】|雷雨|电话突然响起|玻璃碎裂声|灯光突然闪烁/;
  const recent = state.log.filter((line) => {
    const match = line.match(/^\[第 (\d+) 回合\]/);
    const turn = match ? Number(match[1]) : state.turn;
    return state.turn - turn <= 3 && important.test(line);
  }).slice(0, 5).reverse();
  if (!recent.length) return '';
  return `<div class="map-event-feed" aria-live="polite">
    <span class="map-event-feed-title">现场动态</span>
    ${recent.map((line, index) => `<div class="map-event ${index === recent.length - 1 ? 'latest' : ''}">${escape(line.replace(/^\[第 \d+ 回合\]\s*/, ''))}</div>`).join('')}
  </div>`;
}

function powerButtonHtml(state: GameState, killer: KillerProfile): string {
  return killer.powers.map((power) => {
    const cd = powerCooldown(state, power.id);
    const ok = canUsePower(state, power.id);
    const reason = powerBlockReason(state, power.id);
    const total = Math.max(1, power.cooldown);
    let label = power.name;
    let actionHint = cd > 0 ? '冷却 ' + cd + ' 回合' : reason || (power.ultimate ? '可以发动' : '可以使用');
    if (power.id === 'trap_set') {
      label = '布设捕兽夹';
      actionHint = reason || `携带 ${state.trapInventory}/4 · 当前房间布设（1 AP）`;
    } else if (power.id === 'nurse_blink') {
      label = state.nurseBlinkTargeting ? '取消闪现选点' : '斯宾塞的濒死之息';
      actionHint = state.nurseBlinkTargeting ? '点击地图 1–3 间房距离内的位置' : state.nurseFollowUp ? '闪现抓取窗口可用' : reason || '穿墙闪现 · 1 AP';
    } else if (power.id === 'huntress_axe') {
      label = state.huntressAiming ? '取消飞斧瞄准' : '狩猎飞斧';
      actionHint = state.huntressAiming ? '点击直线视野内的幸存者' : reason || `飞斧 ${state.hatchets}/3 · 选择目标投掷（1 AP）`;
    } else if (power.id === 'myers_gaze') {
      label = state.possessed ? '恶魔附身中' : state.stalkMeter >= 100 ? '恶魔附身' : '尾随';
      actionHint = state.possessed
        ? `爆发中 · 尾随值 ${state.stalkMeter}/100`
        : state.stalkMeter >= 100
          ? '尾随值已满 · 再次使用发动爆发'
          : reason || `观察视野内所有幸存者 · 当前 ${state.stalkMeter}/100`;
    }
    const pips = Array.from({ length: total }, (_, index) => `<i class="${index < cd ? 'on' : ''}"></i>`).join('');
    return `<button class="btn power ${power.ultimate ? 'ultimate' : 'main'} ${ok ? '' : 'cooling'} ${power.id === 'myers_gaze' && state.stalkMeter >= 100 ? 'possessed-ready' : ''}"
      data-action="power" data-power="${power.id}" ${ok ? '' : 'disabled'}
      title="${escape(power.desc)}${reason ? ` · ${escape(reason)}` : ''}">
      <span class="power-art"><img class="power-glyph" src="${killer.icon}" alt="" onerror="this.style.display='none'"></span>
      <span class="power-body"><b>${escape(label)}</b><small>${escape(actionHint)}</small></span>
      <span class="power-pips">${pips}</span>
    </button>`;
  }).join('');
}

/**
 * 威胁面板：把「他们正在做什么」直接摊开，每一行都给出一个具体的反制办法。
 * 数值全部从真实状态算，不做占位。
 */
function huntOpportunityHtml(state: GameState): string {
  const opportunities = getHuntOpportunities(state);
  if (!opportunities.length) {
    return '<div class="opportunity-empty">暂未发现可利用的窗口。观察目标的日常路线，留意落单、黑暗和设施操作时机。</div>';
  }
  return '<div class="opportunity-list">' + opportunities.map((item) =>
    '<div class="opportunity-row"><div class="opportunity-heading"><b>' + escape(item.title) + '</b><span>' + escape(item.targetName) + ' · ' + escape(roomName(item.room)) + '</span></div><p>' + escape(item.detail) + '</p></div>',
  ).join('') + '</div>';
}

function facilityOverviewHtml(state: GameState): string {
  const boxes = state.siteItems.filter((item) => item.kind === 'itemBox');
  const generators = state.siteItems.filter((item) => item.kind === 'generator');
  const workingGenerators = generators.filter((item) => !item.broken && item.jammedTurns <= 0 && !item.charged).length;
  const darkCircuits = state.powerCircuits.filter((circuit) =>
    circuit.broken || circuit.enabled === false || (circuit.generatorId && state.siteItems.some((item) =>
      item.id === circuit.generatorId && (item.broken || item.jammedTurns > 0),
    )),
  ).length;
  const radioBroken = state.sabotage.includes('radio');
  const killerSupplies = state.killer === '设陷者'
    ? `<span class="facility-pill"><i>⚒</i><b>捕兽夹</b><strong>${state.trapInventory}/4 携带 · ${state.bearTraps.filter((trap) => trap.armed).length} 已布设 · ${state.trapCaches.length} 补给点</strong></span>`
    : state.killer === '女猎手'
      ? `<span class="facility-pill"><i>➶</i><b>狩猎飞斧</b><strong>${state.hatchets}/3</strong></span>`
      : '';
  return `<section class="facility-overview" aria-label="现场设施状态">
    <div class="facility-overview-heading"><b>现场设施</b><small>地图标记与当前状态</small></div>
    <div class="facility-overview-items">
      <span class="facility-pill"><i>▣</i><b>道具箱</b><strong>${boxes.filter((item) => !item.broken && item.charges > 0).length}/${boxes.length}</strong></span>
      <span class="facility-pill"><i>⚙</i><b>发电机</b><strong>${workingGenerators}/${generators.length} 可修复</strong></span>
      <span class="facility-pill"><i>⚡</i><b>电闸</b><strong>${darkCircuits} 组断电</strong></span>
      <span class="facility-pill ${state.phoneCut ? 'offline' : ''}"><i>☎</i><b>电话线</b><strong>${state.phoneCut ? '中断' : '正常'}</strong></span>
      <span class="facility-pill ${radioBroken ? 'offline' : ''}"><i>▤</i><b>备用无线电</b><strong>${radioBroken ? '已破坏' : '可用'}</strong></span>
      ${killerSupplies}
    </div>
  </section>`;
}

function threatRowsHtml(state: GameState): string {
  const alive = state.people.filter((p) => p.role !== 'police' && p.hp > 0);
  const downed = state.people.filter((p) => p.role !== 'police' && p.hp <= 0);
  const atExit = alive.filter((p) => state.escapeRooms.includes(p.room));
  const leaving = alive.filter((p) => p.intent === 'escape');
  const calling = alive.filter((p) => p.intent === 'call');
  const caring = alive.filter((p) => p.intent === 'rescue' || p.intent === 'heal');
  const armed = alive.filter((p) => p.armed);
  const hiding = state.people.filter((p) => p.role !== 'police' && p.hidden);
  const rows: Array<{ name: string; count: number; hint: string; level: 'warn' | 'hot' }> = [];
  if (atExit.length || leaving.length) rows.push({ name: '逃生行动', count: atExit.length + leaving.length, hint: atExit.length ? atExit.length + ' 人已抵达逃生点，可能很快逃离。优先封锁出口或拦截。' : leaving.length + ' 人正在前往逃生点，查看地图上的逃生路线。', level: atExit.length ? 'hot' : 'warn' });
  if (calling.length) rows.push({ name: '通讯求救', count: calling.length, hint: state.phoneCut ? '电话线路已中断；正在尝试无线电或寻找其他求救途径。' : '有人正在使用电话或无线电。破坏通讯设施可以打断这次求救。', level: 'hot' });
  if (downed.length) rows.push({ name: '救援风险', count: downed.length, hint: caring.length ? caring.length + ' 人正在救援或治疗倒地同伴。隔离救援者，或及时处决目标。' : downed.length + ' 人倒地，暂时无人救援；同伴仍可能改变行动前来营救。', level: caring.length ? 'hot' : 'warn' });
  if (armed.length) rows.push({ name: '武装反抗', count: armed.length, hint: armed.length + ' 名幸存者持有武器，近身接触可能让你失去行动点。考虑伏击或远程手段。', level: armed.length > 1 ? 'hot' : 'warn' });
  if (hiding.length) rows.push({ name: '藏匿目标', count: hiding.length, hint: hiding.length + ' 人藏在柜子或床底，需要搜索所在房间才能发现。', level: 'warn' });
  const brokenCircuits = state.powerCircuits.filter((c) => c.broken).length;
  const activeGenerators = state.siteItems.filter((i) => i.kind === 'generator' && !i.broken && i.jammedTurns <= 0 && !i.charged).length;
  const injured = alive.filter((p) => p.hp > 0 && p.hp <= 2).length;
  const highAlert = alive.filter((p) => p.alert >= 75).length;
  const working = alive.filter((p) => p.intent === 'work').length;
  const isolated = alive.filter((p) => !state.people.some((other) =>
    other.id !== p.id && other.role !== 'police' && other.hp > 0 && !other.hidden && other.room === p.room,
  )).length;
  if (highAlert) rows.push({ name: '高度警戒', count: highAlert, hint: highAlert + ' 名幸存者已经高度警戒；贸然接近容易引发逃跑或呼救。考虑先制造干扰，或等待警戒下降。', level: highAlert >= 3 ? 'hot' : 'warn' });
  const summary = '存活 ' + alive.length + ' · 受伤 ' + injured + ' · 倒地 ' + downed.length +
    ' · 高度警戒 ' + highAlert + ' · 落单 ' + isolated +
    ' · 警报值 ' + state.alarm + '% · 断电回路 ' + brokenCircuits + '/' + state.powerCircuits.length;
  const empty = rows.length ? '' : '<div class="threat-clear"><b>当前没有正在推进的高危行动</b><span>幸存者人数、伤势、恐惧、警戒、落单情况与设施状态仍会持续更新。局势变化时，这里会列出具体威胁和反制方向。</span></div>';
  return '<div class="threat-live-summary"><b>幸存者威胁 · 实时状态</b><span>' + summary + '</span><small>' + (activeGenerators ? activeGenerators + ' 台发电机仍可被修复。' : '当前没有可继续修复的发电机。') + '</small></div>' +
    '<div class="threat-list">' + rows.map((r) => '<div class="threat-row ' + r.level + '"><span class="t-name">' + r.name + '</span><b class="t-count">' + r.count + '</b><span class="t-hint">' + escape(r.hint) + '</span></div>').join('') + empty + '</div>';
}
/**
 * 地板上的脚印：把血丝划痕素材当 mask，染成锈红，旋转到「朝下一间屋」的方向。
 *
 * 坐标直接用百分比，所以不需要跟画布/房间的像素换算，户型怎么变都对得上。
 * 只显示 visibleTrails 里的几段——跟丢了、走得久了，旧的脚印就没了。
 */
function trailOverlay(state: GameState): string {
  // 只画当前房间里的鞋印：别处的痕迹不再隔墙可见（引擎里仍保留完整线索给杀戮/追击牌用）
  const segs = state.trailRevealActions > 0
    ? visibleTrails(state)
    : visibleTrails(state).filter((t) => t.room === state.playerRoom);
  if (!segs.length) return '';
  const centerOf = (id: RoomId) => {
    const r = ROOM_MAP[id].rect;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const prints = segs
    .map((t) => {
      const a = centerOf(t.room);
      const b = centerOf(t.to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      // 脚印踩在房间中心朝门口的方向，像刚从这间屋子冲出去
      const x = a.x + ux * Math.min(len * 0.34, 7);
      const y = a.y + uy * Math.min(len * 0.34, 7);
      // 鞋印默认脚趾朝上：旋转到「朝下一间屋」的方向
      const rot = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const age = state.trailClock - t.clock;
      const cls = `footprint${t.blood ? ' blood' : ''}${age <= 0 ? ' fresh' : ''}`;
      return `<i class="${cls}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--rot:${rot.toFixed(1)}deg"></i>`;
    })
    .join('');
  return `<div class="trail-layer" aria-hidden="true">${prints}</div>`;
}

export function renderGame(state: GameState, killer: KillerProfile): string {
  const m = state.mission;
  const ground = getHuntingGround(state.mapId);
  const here = state.people.filter((p) => p.room === state.playerRoom && p.role !== 'police');
  const policeHere = state.people.some((p) => p.room === state.playerRoom && p.role === 'police');
  const redFigures = state.people.filter((person) => {
    if (person.role === 'police' || person.hp <= 0 || person.hidden || isRoomVisible(state, person.room)) return false;
    const aura = state.revealAuraActions > 0 && (person.room === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(person.room));
    return isSensing(state) || aura || (person.revealedActions ?? 0) > 0;
  });
  const redSignature = redFigures.map((person) => person.id).sort().join('|');
  if (redSignature && redSignature !== lastRedFigureSignature) playHeartbeat();
  lastRedFigureSignature = redSignature;
  const isMyers = killer.owner === '迈克尔·迈尔斯';
  if (state.turn === 1 && state.trailClock === 0) {
    lastRenderedTrapTriggerCount = state.trapTriggerCount;
    lastRedFigureSignature = '';
  } else if (lastRenderedTrapTriggerCount === null || state.trapTriggerCount < lastRenderedTrapTriggerCount) {
    lastRenderedTrapTriggerCount = state.trapTriggerCount;
    lastRedFigureSignature = '';
  } else if (state.trapTriggerCount > lastRenderedTrapTriggerCount) {
    playTrapScream();
    playHeartbeat();
    lastRenderedTrapTriggerCount = state.trapTriggerCount;
  }

  // 任务条：目标 / 达成条件 / 失败条件 / 实时进度 / 倒计时，一眼看清这一局要做什么
  const left = Math.max(0, m.turns - state.turn + 1);
  const urgent = left <= 5;
  const tasks = m.tasks ?? [];
  const markedTargets = state.people.filter((person) => person.marked && person.role !== 'police');
  const markedTargetNames = markedTargets.map((person) => person.name);
  const objectiveDone = tasks.filter((task) => !task.optional).length > 0 && tasks.filter((task) => !task.optional).every((task) => missionTaskProgress(state, task) >= task.target);
  const progress = tasks.map((task) => {
    const value = missionTaskProgress(state, task);
    const failed = task.kind === 'no_alarm' && state.npcAlarmed;
    const done = value >= task.target;
    const targetNames = task.kind === 'marked_kill'
      ? `<small class="mission-target-names">${markedTargetNames.length ? `指定目标：${markedTargetNames.map(escape).join('、')}` : `已击杀指定目标 ${state.markedKilled} 人`}</small>`
      : '';
    const progressText = task.kind === 'alarm_below' ? `警报 ${state.alarm} / ≤${task.limit ?? 35}` : task.kind === 'no_alarm' ? (failed ? '已报警' : '保持中') : `${Math.min(value, task.target)}/${task.target}`;
    const rewardText = task.optional && (task.reward ?? 0) > 0 ? `<small class="mission-task-reward">+ ${task.reward} 分</small>` : '';
    return `<span class="mission-task ${done ? 'done' : failed ? 'failed' : ''} ${task.optional ? 'optional' : 'required'}"><b>${done ? '✓' : failed ? '✕' : '○'}</b> ${escape(task.label)} <em>${progressText}</em>${rewardText}${targetNames}</span>`;
  }).join('');

  const rooms = ROOMS.map((room) => {
    const visible = isRoomVisible(state, room.id);
    const explored = isRoomExplored(state, room.id);
    // 只有看得见的房间才显示人；藏起来的人连"在不在"都不给
    const people = visible
      ? state.people.filter((p) => p.room === room.id && p.role !== 'police' && !p.hidden)
      : [];
    const police = visible
      ? state.people.find((p) => p.room === room.id && p.role === 'police')
      : undefined;
    // 离开视野后，最后确认的位置还留一个问号，逼你自己去确认
    const ghosts = !visible
      ? state.people.filter(
          (p) =>
            p.role !== 'police' &&
            p.lastSeenRoom === room.id &&
            p.lastSeenTurn > 0 &&
            state.turn - p.lastSeenTurn <= 1,
        )
      : [];
    const isPlayer = state.playerRoom === room.id;
    const reachable = canMoveTo(state, room.id);
    const blinkDistance = roomDistance(state.playerRoom, room.id);
    const blinkSelectable = state.nurseBlinkTargeting && room.id !== state.playerRoom && blinkDistance >= 1 && blinkDistance <= 3;
    const locked = isLocked(state, room.id);
    const barricaded = state.barricades.includes(room.id);
    const cost = moveCost(state, room.id);
    const adjacent = ROOM_MAP[state.playerRoom].neighbors.includes(room.id);
    const obstacleOpen = OBSTACLE_ROOMS.includes(room.id) && !state.clearedObstacles.includes(room.id);
    const isObjective = state.objectiveRooms.includes(room.id);
    const darkRoom = !isRoomLit(state, room.id);
    const noise = visibleDisturbances(state).find((d) => d.room === room.id);
    // 感知：看不见的房间也会浮出红色人影——只有影子，没有名字
    const auraReveal = state.revealAuraActions > 0 && (room.id === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(room.id));
    const sensed = !visible
      ? state.people.filter((p) => p.room === room.id && p.role !== 'police' && p.hp > 0 && !p.hidden && (isSensing(state) || auraReveal || (p.revealedActions ?? 0) > 0)).length
      : 0;
    const r = room.rect;
    const style = `left:${r.left}%;top:${r.top}%;width:${r.width}%;height:${r.height}%`;
    return `
      <div class="room ${isPlayer ? 'current' : ''} ${reachable ? 'reachable' : 'disabled'} ${adjacent ? 'adjacent' : ''} ${state.lookingAround && adjacent ? 'look-target' : ''} ${state.auraTargeting ? 'aura-target' : ''} ${blinkSelectable ? 'blink-target' : ''} ${obstacleOpen ? 'obstacle' : ''} ${isObjective ? 'objective' : ''} ${darkRoom ? 'dark-room' : 'lit-room'} ${room.id === 'garden' ? 'outdoor' : ''} room-size-${room.size} ${locked ? 'locked' : ''} ${barricaded ? 'barricaded' : ''} ${explored ? 'explored' : 'unexplored'} ${visible ? 'in-sight' : 'fogged'}"
        style="${style}" data-room="${room.id}" title="${escape(room.name)}${explored ? `：${escape(room.desc)}` : '：还没进去过'}${isObjective ? ' · 设施热点' : ''}">
        ${state.auraTargeting
          ? `<button type="button" class="room-hit aura-hit" data-action="aura-select" data-room="${room.id}" aria-label="选择${escape(room.name)}，显示其中人类的气场">显形</button>`
          : state.nurseBlinkTargeting
          ? blinkSelectable
            ? `<button type="button" class="room-hit blink-hit" data-action="blink-select" data-room="${room.id}" aria-label="闪现到${escape(room.name)}（距离 ${blinkDistance} 间房）">闪现</button>`
            : ''
          : state.lookingAround && adjacent
            ? `<button type="button" class="room-hit look-hit" data-action="look-select" data-room="${room.id}" aria-label="查看${escape(room.name)}，消耗 ${LOOK_COST} 点行动点">查看这里</button>`
            : !state.lookingAround && !state.huntressAiming && reachable
              ? `<button type="button" class="room-hit" data-action="move" data-room="${room.id}" aria-label="移动到${escape(room.name)}（需 ${cost} 点行动点）"></button>`
              : ''}
        <div class="room-head">
          <span class="room-name">${explored ? escape(room.name) : '？？？'}</span>
          ${noise ? `<span class="room-tag noise" title="${escape(noise.label)}">${icon('crow', 'crow-icon tiny')}动静</span>` : ''}
          ${isObjective ? '<span class="room-tag objective" title="幸存者要在这儿做事：进度做满你就输">目标点</span>' : ''}
          ${isPlayer
            ? '<span class="room-tag">你在</span>'
            : locked
              ? '<span class="room-tag lock">封锁 · 进不去</span>'
              : barricaded
                ? `<span class="room-tag bar">堵门 · ${cost}点</span>`
                : obstacleOpen
                  ? `<span class="room-tag obstacle">障碍 · ${cost}点</span>`
                  : reachable
                    ? `<span class="room-tag go">可进 · ${cost}点</span>`
                    : adjacent
                      ? '<span class="room-tag short">行动点不足</span>'
                      : ''}
        </div>
        ${explored
          ? `<div class="room-desc">${escape(room.desc)}</div>
             <div class="room-features">${roomFeatures(state, room.id)}</div>`
          : `<div class="room-unknown">未探索</div>
             <div class="room-features">${roomFeatures(state, room.id)}</div>`}
        <div class="room-people">
          ${people.map((p) => p.hp <= 0 && p.room === state.playerRoom && !state.carryPersonId
            ? `<div class="map-person-wrap">${personChip(p, false, false, undefined, !isRoomLit(state, p.room))}
                <div class="person-world-actions">
                  <button class="btn" data-action="carry" data-person-id="${p.id}" ${state.energy < 1 ? 'disabled' : ''}>抱起</button>
                  <button class="btn execute" data-action="execute-target" data-person-id="${p.id}" ${executeBlockReason(state) ? 'disabled' : ''}>处决</button>
                </div>
              </div>`
            : personChip(
                p,
                false,
                false,
                state.huntressAiming ? 'hatchet' : state.nurseFollowUp && p.hp > 0 && p.room === state.playerRoom ? 'nurse-grab' : undefined,
                !isRoomLit(state, p.room),
              )).join('')}
          ${police ? personChip(police) : ''}
          ${ghosts.map(() => '<span class="ghost-chip" title="最后确认位置：人可能已经走了">?</span>').join('')}
        </div>
        ${sensed ? `<div class="room-shadows" title="你感觉到这里有人，但看不清是谁">${shadowFigures(sensed)}</div>` : ''}
      </div>
    `;
  }).join('');

  const currentRect = ROOM_MAP[state.playerRoom].rect;
  const markerStyle = `left:${currentRect.left + currentRect.width / 2}%;top:${currentRect.top + currentRect.height / 2}%`;
  const playerMarker = `
    <div class="player-marker" style="${markerStyle}" title="你在这里：${escape(killer.owner)}">
      ${killerFaceHtml(killer, 'marker')}
      <span>你</span>
    </div>
  `;

  const selectingDiscards = state.hand.length > HAND_LIMIT;
  const hand = state.hand
    .map((card) => {
      const def = CARD_MAP[card.defId];
      if (!def) return '';
      const cost = effectiveCost(card.defId, state);
      const disabled = selectingDiscards ? false : cost > state.energy;
      const action = selectingDiscards ? 'discard' : 'play';
      return `
        <button class="card ${def.type} ${selectingDiscards ? 'discard-choice' : ''}" data-action="${action}" data-uid="${card.uid}" data-card-uid="${card.uid}"
          ${disabled ? 'disabled' : ''} title="${escape(selectingDiscards ? '点击弃掉这张牌' : def.desc)}">
          <span class="card-type">${escape(TYPE_NAMES[def.type] ?? def.type)}</span>
          <span class="card-cost">${cost}</span>
          ${isCardTuned(def.id) ? '<span class="card-tuned" title="这张卡使用了你在平衡调整里改过的数值">调</span>' : ''}
          ${perkIconHtml(def.id)}
          <div class="card-name">${escape(def.name)}</div>
          <div class="card-desc">${cardTextHtml(def.desc)}</div>
          <div class="card-flavor">${escape(def.flavor)}</div>
        </button>
      `;
    })
    .join('');

  const known = knownPeople(state);
  const unknownCount = state.people.filter((p) => p.role !== 'police').length - known.length;
  const roster = known
    .sort((a, b) => Number(isPersonVisible(state, b)) - Number(isPersonVisible(state, a)) || b.alert - a.alert)
    .map((p) => {
      const img = characterImage(p.id);
      const vis = isPersonVisible(state, p);
      const health = conditionOf(p);
      const stage = awarenessStage(p.alert);
      const alertClass = ['', 'mid', 'panic', 'high'][stage];
      const alertLabel = `<em class="alert-tag ${alertClass}">${awarenessLabel(p.alert)} ${p.alert}</em>`;
      const intentLabel = p.intent === 'idle' ? GOAL_LABEL[p.goal] : INTENT_LABEL[p.intent];
      const where = vis ? roomName(p.room) : `最后在${roomName(p.lastSeenRoom)}`;
      return `<button class="roster-person ${p.room === state.playerRoom ? 'here' : ''} ${p.marked ? 'marked' : ''} ${p.bloodSacrifice ? 'blood-sacrifice' : ''} ${p.intent === 'escape' ? 'escaping' : ''} ${vis ? '' : 'unknown'} ${health === 'downed' ? 'downed' : ''}"
        data-action="person" data-person-id="${p.id}"
        title="${escape(p.name)}：${escape(ARCH_LABEL[p.archetype])}，${escape(GOAL_LABEL[p.goal])}，${escape(HEALTH_LABEL[health])}${vis ? '' : '，位置待确认'}">
        ${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}
        <span><b>${escape(p.name)} ${alertLabel}</b>
          <small class="goal-line">${escape(ARCH_LABEL[p.archetype])} · ${escape(GOAL_LABEL[p.goal])}</small>
          ${p.marked ? '<small class="contract-target-tag">★ 契约指定目标</small>' : ''}
          ${p.bloodSacrifice ? '<small class="blood-sacrifice-tag">🩸 血祭品</small>' : ''}
          <small>${where} · ${HEALTH_LABEL[health]} · ${escape(intentLabel)}</small>
          ${health === 'downed' ? `<small class="roster-bleed">倒地 · 可立即处决 · ${Math.max(0, BLEEDOUT_TURNS - p.downedTurns)} 回合后流血死亡 · 同伴仍可能救起</small>` : ''}
          ${p.item ? `<small class="roster-item">携带 ${itemIconHtml(p.item)}${escape(SURVIVOR_ITEM_LABEL[p.item])} ×${p.itemUses}</small>` : ''}
          ${p.watchValue > 0 || p.watched ? `<small class="roster-watch">夜幕 ${p.watched ? '已锁定 · 下一刀击倒' : `监视 ${p.watchValue}/100`}</small>` : ''}</span>
      </button>`;
    })
    .join('');

  const meter = isMyers
    ? `<div class="stalk-meter ${state.stalkMeter >= 100 ? 'active' : ''}">
        <div class="stalk-label"><span>尾随值</span><b>${state.stalkMeter}/100</b></div>
        <div class="stalk-track"><div class="stalk-fill" style="width:${state.stalkMeter}%"></div></div>
      </div>`
    : '';
  const myersMarks = isMyers
    ? `<div class="myers-mark-strip" title="三种专属印记独立计数">
        <span>湮灭 <b>${state.myersEclipseMarks}/5</b></span>
        <span>终局 <b>${state.myersLastBestMarks}/8</b></span>
        <span>食物 <b>${state.myersFoodMarks}/8</b></span>
      </div>`
    : '';

  // 一次性把「现在到底发生了什么」摆出来：倒地倒计时、守尸、死追、夜幕、致盲
  const statusBits: string[] = [];
  if (state.blindTurns > 0)
    statusBits.push('<span class="status-badge blind">致盲 / 被击晕：动作被打断，下一回合少 1 点行动点</span>');
  if (state.nightfallActive)
    statusBits.push('<span class="status-badge nightfall">夜幕监视中 · 相邻房间的目标正在显形</span>');
  // 长时间追踪单一目标不再增加其他幸存者团队效率，该机制已由警报系统取代。
  state.people
    .filter((p) => p.role !== 'police' && p.hp <= 0)
    .forEach((p) => {
      statusBits.push(`<span class="status-badge downed">${escape(p.name)} 倒地 · 可立即处决 · 同伴仍可能救起</span>`);
    });
  if (state.nurseBlinkTargeting) statusBits.push('<span class="status-badge blink-mode">护士闪现选点中 · 选择 1–3 间房距离内的位置</span>');
  if (state.nurseFollowUp) statusBits.push('<span class="status-badge blink-mode">濒死之息 · 现在可攻击或抓取同屋幸存者；下一次行动后疲惫</span>');
  if (state.huntressAiming) statusBits.push('<span class="status-badge hatchet-mode">狩猎飞斧瞄准中 · 点击地图上的直线视野目标</span>');
  const statusHtml = statusBits.length ? `<div class="status-strip">${statusBits.join('')}</div>` : '';
  const standingHere = here.filter((person) => person.hp > 0);
  const nextTask = tasks.find((task) => missionTaskProgress(state, task) < task.target);
  const preparations: string[] = [];
  if (state.phoneCut) preparations.push('通讯已切断');
  const darkCircuits = state.powerCircuits.filter((circuit) => circuit.broken).length;
  if (darkCircuits) preparations.push(`照明区域已切断 ${darkCircuits} 处`);
  const flickeringCircuits = state.powerCircuits.filter((circuit) => !circuit.broken && (circuit.flickerTurns ?? 0) > 0).length;
  if (flickeringCircuits) preparations.push(`照明临时闪断 ${flickeringCircuits} 处`);
  if (state.barricades.length || state.exitBlockedTurns > 0) preparations.push('退路受到控制');
  if (state.bonusDamage > 0) preparations.push(`下一刀伤害 +${state.bonusDamage}`);
  if (state.ambushTurn === state.turn) preparations.push('伏击状态就绪');
  if (isMyers && state.stalkMeter > 0) preparations.push(`尾随值 ${state.stalkMeter}/100`);
  const lethalWindow = state.ambushTurn === state.turn && standingHere.length === 1 && standingHere[0].alert < 100;
  const huntPhase = lethalWindow ? '致命窗口' : standingHere.length ? '目标接触' : preparations.length ? '猎场布置' : '观察与部署';
  const huntFocus = nextTask ? nextTask.label : (m.objective ?? m.title);
  const markedAlive = state.people.find((person) => person.marked && person.role !== 'police');
  const downedHereNow = here.find((person) => person.role !== 'police' && person.hp <= 0);
  const visibleOpportunity = getHuntOpportunities(state)[0];
  let guidanceTitle = '开始侦查';
  let guidanceDetail = '先查看相邻房间，寻找标记目标、脚印和异常动静。不要盲目巡房：每次移动都应服务于确认目标、接近目标或布置猎场。';
  let guidanceRoom: RoomId | null = null;
  if (state.carryPersonId) {
    const carriedPerson = state.people.find((person) => person.id === state.carryPersonId);
    const nearestSite = executionMethodsAtRoom(state.playerRoom);
    guidanceTitle = nearestSite.length ? '选择一种特殊处决' : '把猎物运往特殊处决地点';
    guidanceDetail = nearestSite.length
      ? '你已经控制住倒地目标。选择当前场地的处决方式，完成一次有记录的特殊处决。'
      : '可以把倒地目标搬到厨房、车库、工具间、浴室或洗衣房，尝试不同的特殊处决。';
    if (carriedPerson) guidanceDetail += ` 当前搬运目标：${carriedPerson.name}。`;
  } else if (downedHereNow) {
    guidanceTitle = '猎物已经倒地';
    guidanceDetail = '现在可以立即处决，或花行动点搬运到特殊场地，尝试不同的处决方式；若拖延，同伴可能赶来救援。';
  } else if (markedAlive) {
    const targetVisible = isPersonVisible(state, markedAlive);
    guidanceRoom = targetVisible ? markedAlive.room : markedAlive.lastSeenRoom;
    if (guidanceRoom === state.playerRoom && targetVisible) {
      guidanceTitle = '指定目标就在眼前';
      guidanceDetail = '先判断目标是否落单、是否警觉，再决定直接攻击、打出控制牌，或先制造更安全的致命窗口。';
    } else if (targetVisible) {
      guidanceTitle = `接近指定目标：${roomName(guidanceRoom)}`;
      guidanceDetail = `情报已确认 ${markedAlive.name} 位于${roomName(guidanceRoom)}。规划路线靠近，不要把行动点浪费在无关房间。`;
    } else {
      guidanceTitle = `追查指定目标：${roomName(guidanceRoom)}`;
      guidanceDetail = `最后一次确认 ${markedAlive.name} 在${roomName(guidanceRoom)}。前往最后位置调查，并留意脚印、乌鸦和地板动静；情报可能已经过时。`;
    }
  } else if (visibleOpportunity) {
    guidanceTitle = `把握猎杀窗口：${visibleOpportunity.title}`;
    guidanceDetail = `${visibleOpportunity.targetName} · ${roomName(visibleOpportunity.room)}。 ${visibleOpportunity.detail}`;
    guidanceRoom = visibleOpportunity.room;
  } else if (standingHere.length) {
    guidanceTitle = '当前房间存在猎物';
    guidanceDetail = '先检查人物档案与警觉状态，选择优先目标；如果多人在场，考虑先隔离或分散他们。';
  }
  const huntPlanHtml = `<div class="hunt-plan ${lethalWindow ? 'lethal-ready' : ''}">
    <div class="hunt-plan-heading"><b>本局猎杀指令</b><span>${huntPhase}</span></div>
    <div class="hunt-plan-focus"><small>契约目标</small><strong>${escape(m.objective ?? m.title)} · ${escape(huntFocus)}</strong></div>
    <div class="hunt-plan-guidance">
      <b>${escape(guidanceTitle)}</b>
      <span>${escape(guidanceDetail)}</span>
      ${guidanceRoom ? `<em>行动地点：${escape(roomName(guidanceRoom))}</em>` : ''}
    </div>
    <div class="hunt-plan-prep"><small>猎场准备</small><span>${preparations.length ? preparations.map(escape).join(' · ') : '尚未准备。可根据目标习惯和地图设施，选择断电、切断通讯、布置陷阱或直接突袭。'}</span></div>
  </div>`;

  const atkOk = canAttack(state);
  const atkReason = attackBlockReason(state);
  const possessed = state.possessed;
  const sabotageReason = sabotageBlockReason(state);
  const lockedDoor = ROOM_MAP[state.playerRoom].neighbors.find((room) => isLocked(state, room));
  const sabotageHere = state.powerCircuits.some((c) => c.breakerRoom === state.playerRoom && !c.broken) || state.siteItems.some((item) => item.room === state.playerRoom && !item.broken) ? '破坏现场设施' : PHONE_ROOMS.includes(state.playerRoom) && !state.phoneCut ? '剪断电话线' : RADIO_ROOMS.includes(state.playerRoom) && !state.sabotage.includes('radio') ? '破坏备用无线电' : lockedDoor ? `撞开通往${roomName(lockedDoor)}的门锁` : '破坏现场设施';
  const sabotageTitle = sabotageReason ?? `${sabotageHere}。消耗 ${SABOTAGE_COST} 点行动点；强行破门会惊动屋内的人。`;
  const sabotageMeta = sabotageReason ? escape(sabotageReason) : `${SABOTAGE_COST} 点 · ${sabotageHere}`;
  const sabotageBtn = `<button class="btn sabotage ${sabotageReason ? 'spent' : ''}" data-action="sabotage" ${sabotageReason ? 'disabled' : ''}
      title="${escape(sabotageTitle)}">
      <span class="atk-name">破坏</span>
      <span class="atk-meta">${sabotageMeta}</span>
    </button>`;
  const atkTitle = possessed
    ? `恶魔附身（剩 ${state.possessTurns} 回合）：攻击站立的幸存者，每刀造成 2 点伤害。消耗 ${ATTACK_COST} 点行动点。`
    : `攻击：只对站立的幸存者造成伤害，消耗 ${ATTACK_COST} 点行动点；倒地者请使用独立的「处决」按钮。砍完要再做一件事（或花 ${WIPE_COST} 点擦刀）才能再次攻击。`;
  const attackBtn = `<button class="btn attack ${atkOk ? '' : 'spent'} ${possessed ? 'possessed' : ''}" data-action="attack" ${atkOk ? '' : 'disabled'}
      title="${escape(atkOk ? atkTitle : atkReason)}">
      <span class="atk-name">${possessed ? '附身 · 挥刀' : '挥刀攻击'}</span>
      <span class="atk-meta">${atkOk ? (possessed ? `${ATTACK_COST} AP · 2 点伤害` : `${ATTACK_COST} AP · 对站立目标`) : escape(atkReason)}</span>
    </button>`;
  const downedHere = here.filter((person) => person.role !== 'police' && person.hp <= 0);
  const executeReason = executeBlockReason(state);
  const executeTargetSummary = downedHere.length === 1 ? downedHere[0].name : downedHere.length > 1 ? `${downedHere.length} 名倒地幸存者` : '';
  const executeBtn = `<button class="btn execute-action ${executeReason ? 'spent' : 'ready'}" data-action="execute" ${executeReason ? 'disabled' : ''}
      aria-label="${escape(executeReason || `处决${executeTargetSummary}，消耗 1 点行动点`)}"
      title="${escape(executeReason || `处决${executeTargetSummary}，消耗 1 点行动点。也可以暂时放过，等待同伴前来救援。`)}">
      <span class="execute-symbol" aria-hidden="true">☠</span>
      <span class="execute-copy"><b>处决倒地者</b><small>${executeReason ? escape(executeReason) : `1 AP · ${executeTargetSummary}`}</small></span>
    </button>`;
  const wipeReason = wipeBlockReason(state);
  const wipeBtn = `<button class="btn wipe ${wipeReason ? 'spent' : ''}" data-action="wipe" ${wipeReason ? 'disabled' : ''}
      title="${escape(wipeReason || `擦刀：原地花 ${WIPE_COST} 点行动点收回刀锋，接着就能再砍 / 处决。代价是幸存者会趁这一下行动。`)}">
      <span class="atk-name">擦刀</span>
      <span class="atk-meta">${wipeReason ? escape(wipeReason) : `${WIPE_COST} 点 · 收回刀锋`}</span>
    </button>`;
  const searchOk = state.phase === 'playing' && state.energy >= SEARCH_COST;
  const cabinetHere = CABINET_ROOMS.includes(state.playerRoom) || (state.mapId === 'badham' && ['nursery', 'storage', 'guestroom'].includes(state.playerRoom));
  const hiddenHere = state.people.some((p) => p.room === state.playerRoom && p.hidden);
  const carried = state.carryPersonId ? state.people.find((p) => p.id === state.carryPersonId) : null;
  const specialExecution = carried && carried.hp <= 0
    ? executionMethodsAtRoom(state.playerRoom).map((method) =>
        `<button class="btn execution" data-action="execute-special" data-method="${method.id}" title="${escape(method.description)}">${escape(method.name)} · +35</button>`,
      ).join('')
    : '';
  const mapWorldActions = carried
    ? `<div class="map-world-actions" style="${markerStyle}" aria-label="携带目标操作">
        <button class="btn" data-action="drop-carried" ${state.energy < 1 ? 'disabled' : ''}>放下目标 · 1 AP</button>
        ${executionMethodsAtRoom(state.playerRoom).map((method) => `<button class="btn" data-action="execute-special" data-method="${method.id}" title="${escape(method.description)}">特殊处决 · ${escape(method.name)}</button>`).join('')}
      </div>`
    : '';
  const carryStatus = carried ? `<div class="status-badge carrying">抱着 ${escape(carried.name)} · 搬运 ${state.carryDistance}/3 格</div>` : '';
  const trapCacheBtn = state.killer === '设陷者' && state.trapCaches.includes(state.playerRoom)
    ? `<button class="btn search" data-action="collect-trap" ${state.energy < 1 || state.trapInventory >= 4 ? 'disabled' : ''}>收集捕兽夹补给 · +1</button>`
    : '';
  const trapRecoverBtn = state.killer === '设陷者' && state.bearTraps.some((trap) => trap.room === state.playerRoom && !trap.armed)
    ? `<button class="btn search" data-action="recover-trap" ${state.energy < 1 || state.trapInventory >= 4 ? 'disabled' : ''}>回收已触发捕兽夹</button>`
    : '';
  const hatchetRefillBtn = state.killer === '女猎手' && (CABINET_ROOMS.includes(state.playerRoom) || (state.mapId === 'badham' && ['nursery', 'storage', 'guestroom'].includes(state.playerRoom)))
    ? `<button class="btn search" data-action="refill-hatchets" ${state.energy < 1 || state.hatchets >= 3 ? 'disabled' : ''}>柜子补充飞斧 · ${state.hatchets}/3</button>`
    : '';
  const searchBtn = `<button class="btn search" data-action="search" ${searchOk ? '' : 'disabled'}
      title="${escape(searchOk ? (cabinetHere ? `搜索这间屋子的柜子：消耗 ${SEARCH_COST} 点行动点，把藏起来的人翻出来。` : `搜索这间屋子：消耗 ${SEARCH_COST} 点行动点。`) : '行动点不足')}">
      <span class="atk-name">搜索</span>
      <span class="atk-meta">${searchOk ? (hiddenHere ? '有动静 · 翻柜子' : `${SEARCH_COST} 点 · 翻柜子`) : '行动点不足'}</span>
    </button>`;
  const lookOk = state.phase === 'playing' && state.energy >= LOOK_COST;
  const lookBtn = state.lookingAround
    ? `<button class="btn search inspect selecting" data-action="look-cancel">
        <span class="atk-name">取消查看</span><span class="atk-meta">尚未消耗行动点</span>
      </button>`
    : `<button class="btn search inspect" data-action="look" ${lookOk ? '' : 'disabled'}
        title="${lookOk ? `选择一个相邻房间查看，确认后消耗 ${LOOK_COST} 点行动点。` : '行动点不足'}">
        <span class="atk-name">查看</span>
        <span class="atk-meta">${lookOk ? `${LOOK_COST} 点 · 选择一个房间` : '行动点不足'}</span>
      </button>`;

  return `
    <div class="topline">
      <div class="brand">
        <div class="sigil">†</div>
        <div><strong>暗 夜 杀 机</strong><small>NIGHT HUNT · THE HUNT BEGINS</small></div>
      </div>
      <div class="top-right">
        <div class="camera-controls" aria-label="镜头控制">
          <button class="hudbtn" data-action="camera-mode-center" data-camera-mode="center">A 居中</button>
          <button class="hudbtn active" data-action="camera-mode-smooth" data-camera-mode="smooth">B 平滑</button>
          <button class="hudbtn icon" data-action="camera-zoom-out" title="缩小">−</button>
          <span class="zoomread" data-camera-zoom>118%</span>
          <button class="hudbtn icon" data-action="camera-zoom-in" title="放大">＋</button>
          <button class="hudbtn" data-action="camera-global">全局</button>
          <button class="hudbtn" data-action="camera-follow" data-camera-follow>跟随</button>
        </div>
      </div>
    </div>
    <div class="objective" data-action="toggle-task-drawer" role="button" tabindex="0">
      <i class="dot"></i>
      <div><b>${escape(m.title)}</b><span>${escape(ground.name)} · ${state.people.filter((p) => p.role !== 'police' && p.hp > 0).length} 名幸存者仍存活 · 奖励 ${m.reward}</span></div>
    </div>
    <div class="left-hud"><div class="portrait">${killerFaceHtml(killer, 'chip')}</div><div class="meter"><i style="height:${Math.round(state.energy / Math.max(1, state.maxEnergy) * 100)}%"></i></div><div class="tiny-stat">屠夫 · ${state.energy}/${state.maxEnergy} AP</div></div>
    <div class="right-tools">
      <button class="tool" data-action="toggle-task-drawer" aria-label="任务详情"><span>☷</span><em>任务详情 · T</em></button>
      <button class="tool" data-action="toggle-intel-drawer" aria-label="现场情报"><span>⌕</span><em>现场情报</em></button>
      <button class="tool" data-action="toggle-game-hud" aria-label="隐藏界面"><span>◉</span><em>隐藏界面 · H</em></button>
    </div>
    <div class="task-pop task-detail-drawer">
      <button class="close" data-action="toggle-task-drawer" aria-label="关闭任务详情">×</button>
      <h3>当前任务 / OBJECTIVE</h3>
      <p><b>${escape(m.objective ?? m.title)}</b></p>
      <p>${escape(m.successText ?? '达成主目标')}<br>失败条件：${escape(m.failText ?? '超时或被捕')}</p>
      <p>${progress.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</p>
      <p>剩余回合：${left} · 当前猎杀阶段：${huntPhase}</p>
    </div>

    <div class="layout hunt-layout">
      <div class="main-column">
        <div class="panel map-panel">
          <div class="panel-heading"><h2>房屋平面</h2><span>门形=通道 · 绿门=当前可走 · 红叉=封锁 · 黄门=堵门/行动点不足 · 蓝框=目标点</span>
            <button class="btn ghost mini" data-action="guide">玩法指引</button>
            <button class="btn ghost mini display-control" data-action="display-setting" data-setting="interfaceScale">界面大小</button>
            <button class="btn ghost mini display-control" data-action="display-setting" data-setting="fontScale">文字大小</button>
            <button class="btn ghost mini display-control" data-action="display-setting" data-setting="mapScale">地图放大</button>
            <button class="btn ghost mini audio-toggle" data-action="mute" title="开关音效与背景音乐">${isMuted() ? '音效 关' : '音效 开'}</button>
          </div>
          ${statusHtml}${carryStatus}${huntPlanHtml}
          ${facilityOverviewHtml(state)}
          ${state.lookingAround ? '<div class="look-prompt" role="status"><b>选择要查看的房间</b><span>地图上亮起边框的房间都与当前位置相邻。点击其中一个，消耗 1 点行动点查看。</span><button class="btn ghost mini" data-action="look-cancel">取消</button></div>' : ''}
          <div class="map-viewport">
            <div class="floorplan" style="--ar:${layoutAspectNum().toFixed(4)};aspect-ratio:${layoutAspect()}">
              ${rooms}
              ${doorMarkersHtml(state)}
              ${trailOverlay(state)}
              ${playerMarker}
              ${mapWorldActions}
              ${mapEventFeedHtml(state)}
          </div>
          <div class="map-legend">
            <span>${icon('escape', 'ui-icon tiny')} 逃生点（第4阶段开启）</span>
            <span>${icon('totem', 'ui-icon tiny')} 图腾</span>
            <span>${icon('cabinet', 'ui-icon tiny')} 柜子</span>
            <span>${icon('obstacle', 'ui-icon tiny')} 障碍物</span>
            <span>⚡ 电闸 / 💡 照明</span>
            <span>☎ 电话 / ▣ 无线电</span>
            <span>⚒ 捕兽夹 / ＋ 陷阱补给（设陷者）</span>
            <span class="legend-intent"><i class="intent-dot i-flee"></i> 逃跑中 <i class="intent-dot i-call"></i> 打电话 <i class="intent-dot i-escape"></i> 翻篱笆 <i class="intent-dot i-rescue"></i> 救援</span>
            <span class="legend-fog">？ 最后确认位置</span>
            <span class="legend-trail"><i class="legend-claw"></i> 鞋印：只看得见当前房间，跟丢了就断</span>
            <span class="legend-noise">${icon('crow', 'crow-icon tiny')} 动静：乌鸦叫 / 地板响，有人刚经过（短线索）</span>
            <span class="legend-objective">蓝框：设施热点</span>
            <span class="legend-sites">${icon('itemBox', 'ui-icon tiny')} 道具箱 ${icon('generator', 'ui-icon tiny')} 发电机：幸存者可使用，你可以破坏</span>
          </div>
        </div>

        <div class="panel intel-log-panel">
          <div class="panel-heading"><h2>完整行动记录</h2><span>最新记录在最上方</span></div>
          <div class="log">${state.log.slice(0, 30).map((line) => `<div>${escape(line)}</div>`).join('')}</div>
        </div>

        <div class="statusline">
          <div class="resource-bar">
            <div class="stats">
              <div class="stat"><b>${state.turn}<i>/${m.turns}</i></b><small>回合</small></div>
              <div class="stat energy" title="当前行动点"><b>${state.energy}<i>/${state.maxEnergy}</i></b><small>行动点</small></div>
              <div class="stat alarm-stat ${state.alarm >= 70 ? 'hot' : state.alarm >= 40 ? 'warm' : ''}" title="全局警报值">
                <b>${state.alarm}<i>/${ALARM_MAX}</i></b><div class="alarm-track"><span style="width:${state.alarm}%"></span></div><small>警报</small>
              </div>
              <div class="stat"><b>${state.kills}</b><small>击杀</small></div>
              <div class="stat survivor-count"><b>${state.people.filter((p) => p.role !== 'police' && p.hp > 0).length}/${state.survivorTotal}</b><small>存活</small></div>
              <div class="stat frenzy ${state.frenzy >= FRENZY_THRESHOLD ? 'active' : ''}"><b>${state.frenzy}<i>/${FRENZY_MAX}</i></b><div class="alarm-track"><span style="width:${state.frenzy}%"></span></div><small>杀戮</small></div>
              <div class="stat score"><b>${currentScore(state)}</b><small>预计得分</small></div>
            </div>
            ${meter || myersMarks ? `<div class="bottom-special-meters">${meter}${myersMarks}</div>` : ''}
          </div>
          <div class="play-status"><b>${escape(guidanceTitle)}</b><span> · ${escape(guidanceDetail)}</span></div>
        </div>

        <div class="hint">W A S D 房间移动　E 交互　G 放下<br>方向键镜头　F 跟随　0 全局　＋ / − 缩放　T 任务　H 隐藏界面</div>
        <div class="bottom-hud" id="bottomHud">
          <div class="action-pill">
            <div class="hand-actions">
              ${attackBtn}
              ${executeBtn}
              <button class="btn draw-card" data-action="draw" ${state.energy < DRAW_CARD_COST || (state.drawPile.length === 0 && state.discardPile.length === 0) || selectingDiscards ? 'disabled' : ''} title="消耗 ${DRAW_CARD_COST} 点行动点，从牌库抽 1 张">${DRAW_CARD_COST} 点 · 抽 1 张</button>
              ${wipeBtn}
              ${searchBtn}
              ${lookBtn}
              ${sabotageBtn}${specialExecution}
              ${trapCacheBtn}${trapRecoverBtn}${hatchetRefillBtn}
              <div class="power-row">${powerButtonHtml(state, killer)}</div>
              <button class="btn search wait-action" data-action="wait" ${selectingDiscards || state.energy < 1 ? 'disabled' : ''} title="消耗 1 点行动点；幸存者各自行动一次，你继续观察当前房间与刚离开的房间。">等待 · 1 AP</button>
              <button class="btn primary end-turn" data-action="end-turn" ${selectingDiscards ? 'disabled' : ''}>结束回合</button>
              <button class="btn ghost" data-action="${m.mode === 'free' ? 'finish-free-hunt' : objectiveDone ? 'finish-contract' : 'give-up'}">${m.mode === 'free' ? '结束猎杀' : objectiveDone ? '完成主目标 · 结算' : '放弃任务'}</button>
            </div>
          </div>
          <div class="hand">
            ${selectingDiscards ? `<div class="hand-limit-warning">手牌 ${state.hand.length}/${HAND_LIMIT}：请点击要弃掉的牌，直到剩余 ${HAND_LIMIT} 张。</div>` : ''}
            <div class="hand-row">${hand || '<div class="empty-hand">手牌已空，可花行动点主动抽牌。</div>'}</div>
          </div>
          <button class="hand-toggle" data-action="toggle-hand" title="收起 / 展开手牌" aria-label="收起或展开手牌" aria-expanded="true">⌄</button>
        </div>
      </div>
      <aside class="hunt-sidebar hunt-sidebar-right">
        <details class="intel-drawer">
        <summary>
        <span>现场情报</span>
        <small>${known.length} 人已确认 · ${state.siteItems.length} 处设施 · ${state.log.length} 条记录</small>
        <em>展开 / 收起</em>
        </summary>
        <div class="intel-grid">
        <section class="panel person-dossier-panel">
          <div class="panel-heading"><h2>人物详情</h2><span>点击地图人物或悬停卡牌</span></div>
          <div id="cardDetail" class="detail-wrap">${defaultDetailHtml()}</div>
        </section>

        <div class="panel hunt-opportunities-panel">
        <div class="panel-heading"><h2>猎杀机会</h2><span>只显示当前视野中可利用的窗口</span></div>
        ${huntOpportunityHtml(state)}
        </div>
        <div class="panel threat-panel">
        <div class="panel-heading"><h2>现场威胁动态</h2><span>只显示当前正在发生的风险</span></div>
        ${threatRowsHtml(state)}
        </div>
        </div>
        </details>
      </aside>
    </div>
  `;
}

/** newCard：本局新解锁的卡牌 id（已解锁过的不会再重复提示）。 */
export function renderResult(state: GameState, newCard: string | null): string {
  const supernatural = KILLER_MAP[state.killer]?.school === 'supernatural';
  const labels: Record<string, string> = {
    win: '猎杀结束', caught: supernatural ? '力量被封印' : '被警察抓捕', timeout: '猎场终止', failed: '猎杀失败',
  };
  const killerEnding: Record<string, string> = {
    '迈克尔·迈尔斯': '白色面具在走廊尽头停了一瞬。屋里只剩下拖拽声，随后连脚步也消失了。',
    '设陷者': '铁夹在地板上缓缓合拢。清晨搜救者只找到一道拖向黑暗的血迹。',
    '护士': '一阵刺耳的风从墙壁穿过。等灯光恢复，走廊里已经没有任何人影。',
    '女猎手': '远处传来一段轻轻的摇篮曲。斧刃的回声渐渐远去，屋子重新归于寂静。',
  };
  const ending = state.result === 'win'
    ? (supernatural ? '雾气重新吞没房间，门窗在无人触碰时一扇扇合拢。' : killerEnding[state.killer] ?? '目标已经倒下，猎场终于安静下来。')
    : state.result === 'caught'
      ? (supernatural ? '猎场中的力量被某种更强大的力量压制，恶意暂时退回黑暗。' : '警笛声越来越近，退路被封锁。你最终没能逃出警方的包围。')
      : state.result === 'timeout'
        ? (supernatural ? '天光刺破雾幕，恶灵失去依附之所，猎杀被迫终止。' : '天亮了，警队封锁整条街。你不得不放弃这场猎杀。')
        : (supernatural ? '猎场的诅咒反噬了你，黑暗不再听从召唤。' : `${killerEnding[state.killer] ?? '猎场重新归于寂静。'}这一次，你没能完成猎杀。`);
  const stars = getStars(state.score);
  const win = state.result === 'win';
  const rank = win ? (state.score >= 260 ? 'S' : state.score >= 190 ? 'A' : 'B') : '—';
  const baseEarned = win ? Math.max(10, Math.round(state.score / 5)) : 0;
  const earned = baseEarned + state.huntStyleBonus;
  const darkCells = win && state.score >= 150 ? 1 : 0;
  const styleBreakdown = state.huntStyleBreakdown
    .map((line) => `<div class="style-score-line"><span>${escape(line.label)}</span><b>+${line.value}</b></div>`)
    .join('');
  const breakdown = state.scoreBreakdown
    .map((line) => `<div class="score-line ${line.value < 0 ? 'minus' : ''}">
        <span>${escape(line.label)}</span><b>${line.value >= 0 ? '+' : ''}${line.value}</b>
      </div>`)
    .join('');
  return `
    <div class="overlay">
      <div class="modal result-modal ${win ? 'is-win' : 'is-lose'}">
        <div class="result-banner ${win ? '' : 'lose'}">${win ? '契约达成 · CONTRACT COMPLETE' : '契约未完成 · CONTRACT FAILED'}</div>
        <div class="subtitle">CONTRACT REPORT</div>
        <h1>${labels[state.result ?? 'failed']}</h1>
        ${state.resultReason ? `<p class="result-reason">${escape(state.resultReason)}</p>` : ''}
        <p class="result-epilogue">${escape(ending)}</p>
        <div class="result-rank"><small>本局评级</small><b>${rank}</b></div>
        <div class="result-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <div class="result-objective ${win ? 'done' : ''}">
          <span class="result-check">${win ? '✓' : '✕'}</span>
          <div><small>${win ? '目标已达成' : '目标未完成'}</small><b>${escape(state.mission.objective ?? state.mission.title)}</b></div>
        </div>
        <div class="result-grid">
          <div><small>最终评分</small><b>${state.score}</b></div>
          <div><small>击杀人数</small><b>${state.kills}</b></div>
          <div><small>逃走人数</small><b>${state.escaped}</b></div>
          <div><small>最终暴露度</small><b>${state.alarm}/${ALARM_MAX}</b></div>
        </div>
        <section class="hunt-style-card">
          <div class="hunt-style-heading">
            <div><small>猎杀风格评价</small><b>计划、隐蔽与能力运用</b></div>
            <strong class="hunt-style-rank rank-${state.huntStyleRank.toLowerCase()}">${state.huntStyleRank}</strong>
            <span class="hunt-style-score">${state.huntStyleScore}/100</span>
          </div>
          <div class="hunt-style-breakdown">${styleBreakdown}</div>
          ${state.huntStyleBonus ? `<p class="hunt-style-reward">风格奖励 · 额外血点 +${state.huntStyleBonus}</p>` : '<p class="hunt-style-reward muted">本局未获得额外风格血点；尝试利用目标习惯、环境或杀手专属能力提升评级。</p>'}
        </section>
        <div class="score-breakdown">${breakdown}</div>
        <details class="result-log"><summary>本局日志 · ${state.log.length} 条记录</summary><div class="result-log-list">${[...state.log].reverse().map((line) => `<div>${escape(line)}</div>`).join('')}</div></details>
        ${newCard ? `<p style="color:var(--gold)">新卡牌解锁：<b>${escape(CARD_MAP[newCard]?.name ?? newCard)}</b></p>` : ''}
        ${earned ? `<p style="color:var(--gold)">${icon('bloodPoint', 'ui-icon tiny')} 获得血点：<b>+${earned}</b>${state.huntStyleBonus ? `（含风格奖励 +${state.huntStyleBonus}）` : ''}</p>` : ''}
        ${darkCells ? `<p style="color:var(--gold)">${icon('darkCell', 'ui-icon tiny')} 获得暗金细胞：<b>+${darkCells}</b></p>` : ''}
        <div class="actions">
          <button class="btn primary" data-action="again">再来一局</button>
          <button class="btn" data-action="menu">返回主菜单</button>
        </div>
      </div>
    </div>
  `;
}
