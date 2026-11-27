import { CARD_MAP } from '../../game/cards';
import { awarenessLabel, awarenessStage } from '../../game/npc/awareness';
import { characterImage, POWER_RARITY_BG, uiIcon } from '../../game/assetMap';
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
  moveBlockReason,
  canUsePower,
  conditionOf,
  currentScore,
  scoreLines,
  lootPayout,
  effectiveCost,
  getStars,
  isLocked,
  isPersonVisible,
  isRoomExplored,
  isRoomVisible,
  getHuntOpportunities,
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
  phoneWorks,
  breakerBlockReason,
  BREAKER_SWITCH_COST,
  missionTaskProgress,
  scoreExecutionBlockReason,
  SCORE_EXECUTION_THRESHOLD,
  isRoomLit,
} from '../../game/engine';
import { roomDistance } from '../../game/navigation';
import { executionMethodsAtRoom } from '../../game/executions';
import { SURVIVOR_MAP } from '../../game/survivors';
import { getHuntingGround } from '../../game/maps';
import { KILLERS, KILLER_MAP, type KillerProfile } from '../../game/killers';
import { roomName } from '../../game/missions';
import {
  CABINET_ROOMS,
  EXIT_ROOM,
  OBSTACLE_ROOMS,
  RADIO_ROOMS,
  ROOM_MAP,
  ROOMS,
  TOTEM_ROOMS,
  layoutAspect,
  layoutAspectNum,
  doorMarkerPosition,
} from '../../game/rooms';


import { isCardTuned } from '../../game/tuning';
import { ACCESSORY_MAP, ACCESSORY_SLOTS } from '../../game/accessories';
import { blinkRangeOf, hatchetMax, modifierSummary } from '../../game/modifiers';
import { isMuted, playHeartbeat, playSfx, playTrapScream } from '../audio';
import { addonIconHtml, escape, icon, itemBadge, itemIconHtml, personChip, shadowFigures, perkIconHtml, TYPE_NAMES, killerFaceHtml, defaultDetailHtml, cardTextHtml } from './shared';
import type { GameState, Person, RoomId, ScoreLine, SaveData } from '../../game/types';

/**
 * 分数明细按维度分组渲染：实时面板与结算面板共用。
 * 分组顺序固定，玩家能直观看出「这一局的分数来自哪几类」。
 */
const SCORE_GROUPS = ['契约', '猎杀', '潜行', '效率', '风格', '失分', '其他'];
function scoreGroupsHtml(lines: ScoreLine[]): string {
  return SCORE_GROUPS.map((category) => {
    const rows = lines.filter((line) => (line.category ?? '其他') === category);
    if (!rows.length) return '';
    const sum = rows.reduce((acc, line) => acc + line.value, 0);
    const body = rows.map((line) => `<div class="score-line ${line.value < 0 ? 'minus' : ''}"><span>${escape(line.label)}</span><b>${line.value >= 0 ? '+' : ''}${line.value}</b></div>`).join('');
    return `<section class="score-group"><h4>${category}<b>${sum >= 0 ? '+' : ''}${sum}</b></h4>${body}</section>`;
  }).join('');
}

let lastRenderedTrapTriggerCount: number | null = null;
let lastDiscoveryMissionId: string | null = null;
const discoveredSurvivorIds = new Set<string>();
function roomFeatures(state: GameState, roomId: RoomId): string {
  const parts: string[] = [];
  const cleared = state.clearedObstacles.includes(roomId);
  state.siteItems
    .filter((i) => i.room === roomId)
    .forEach((i) => {
      const label = SITE_ITEM_LABEL[i.kind];
      const status = i.broken ? '已被砸烂' : `还能翻 ${i.charges} 件`;
      const down = i.broken;
      const canBreakHere = state.playerRoom === roomId && !down && i.charges > 0 && !state.powerCircuits.some((c) => c.breakerRoom === roomId) && !sabotageBlockReason(state);
      const feature = `<span class="room-feature site itemBox ${down ? 'broken' : ''}" title="${label}：${status}。你用不了它，但可以花 ${SABOTAGE_COST} 点行动点砸掉">${icon('itemBox', 'ui-icon tiny')}<b>道具箱</b></span>`;
      parts.push(canBreakHere
        ? `<button type="button" class="room-feature site itemBox" data-action="sabotage" title="${label}：${status}。点击花费 ${SABOTAGE_COST} 点行动点破坏">${icon('itemBox', 'ui-icon tiny')}<b>破坏道具箱</b></button>`
        : feature);
    });
  // 房间照明由 Canvas 光照系统直接表现，不再用文字或 emoji 标记灯光状态。
  const circuitAt = state.powerCircuits.find((c) => c.breakerRoom === roomId);
  if (circuitAt) {
    const status = circuitAt.broken ? '控制箱损坏' : circuitAt.enabled === false ? '已拉闸' : '供电正常';
    const breakerTitle = `${escape(circuitAt.name)}：${status}，影响 ${circuitAt.affectedRooms.map(roomName).join('、')}`;
    const breakerBlocked = breakerBlockReason(state, circuitAt.id) ? 'disabled' : '';
    parts.push(state.playerRoom === roomId
      ? `<button type="button" class="room-feature breaker ${circuitAt.broken || circuitAt.enabled === false ? 'broken' : ''}" data-action="toggle-breaker" data-circuit-id="${circuitAt.id}" ${breakerBlocked} title="${breakerTitle}。点击切换电闸（${BREAKER_SWITCH_COST} AP）">${icon('generator', 'ui-icon tiny')}<b>切换电闸</b></button>`
      : `<span class="room-feature breaker ${circuitAt.broken || circuitAt.enabled === false ? 'broken' : ''}" title="${breakerTitle}">${icon('generator', 'ui-icon tiny')}<b>电闸</b></span>`);
  }
  const placedTraps = state.bearTraps.filter((trap) => trap.room === roomId);
  if (placedTraps.length) {
    const armedCount = placedTraps.filter((trap) => trap.armed).length;
    const triggeredCount = placedTraps.filter((trap) => !!trap.triggeredBy).length;
    const trapStatus = `${armedCount} 只待触发${triggeredCount ? ` · ${triggeredCount} 只已触发` : ''}${placedTraps.some((trap) => trap.discovered && trap.armed) ? ' · 有陷阱已被发现' : ''}`;
    const trapClass = triggeredCount ? 'triggered' : armedCount ? 'armed' : 'spent';
    parts.push(`<span class="room-feature bear-trap ${trapClass}" title="捕兽夹：${trapStatus}">${icon('bearTrap', 'ui-icon tiny')}<b>捕兽夹${placedTraps.length > 1 ? ` ×${placedTraps.length}` : ''}</b></span>`);
  }
  if (state.trapCaches.includes(roomId)) {
    parts.push('<span class="room-feature trap-cache" title="捕兽夹补给：设陷者可在此收集额外捕兽夹">＋<b>陷阱补给</b></span>');
  }
  // 电话只在已探索过的房间显示：没进去过就不该知道那儿有线
  if (state.explored.includes(roomId) && (state.phones ?? []).includes(roomId)) {
    const phoneBroken = (state.brokenPhones ?? []).includes(roomId) || state.phoneCut;
    if (phoneBroken) {
      parts.push(`<span class="room-feature telephone broken" title="电话已被砸坏：这间屋子没法报警了"><b>电话已坏</b></span>`);
    } else if (state.playerRoom === roomId) {
      parts.push(`<span class="feature-anchor"><span class="room-feature telephone on" title="这间屋子的电话还能用：幸存者会来这里报警">${icon('phone', 'ui-icon tiny')}<b>电话</b></span><button type="button" class="feature-action" data-action="break-phone" ${state.energy < 1 ? 'disabled' : ''} title="砸坏这间屋子的电话：1 AP">砸坏电话 · 1 AP</button></span>`);
    }
  }
  if (RADIO_ROOMS.includes(roomId)) {
    const radioBroken = state.sabotage.includes('radio');
    parts.push(`<span class="room-feature radio ${radioBroken ? 'broken' : 'on'}" title="备用无线电：${radioBroken ? '已被破坏' : '电话中断时可进行有限范围协调'}">▣<b>无线电</b></span>`);
  }
  const executionSites = executionMethodsAtRoom(roomId);
  if (executionSites.length) {
    const carried = state.carryPersonId ? state.people.find((person) => person.id === state.carryPersonId) : undefined;
    const downedHere = isRoomVisible(state, roomId) && state.people.some((person) => person.room === roomId && person.role !== 'police' && person.hp <= 0);
    const canExecuteHere = !!carried && carried.hp <= 0 && state.playerRoom === roomId;
    if (canExecuteHere || downedHere) {
      executionSites.forEach((method) => {
        const hint = canExecuteHere ? method.description : '先抱起这里的倒地幸存者，再将其带到此处执行地点处决。';
        parts.push(`<button type="button" class="room-feature execution-site execution-action ${state.executionSiteHint === roomId ? 'nearest' : ''}" data-action="execute-special" data-method="${method.id}" ${canExecuteHere ? '' : 'disabled'} title="${escape(hint)}"><img class="execution-site-icon" src="${uiIcon('executionSite')}" alt="" aria-hidden="true" onerror="this.style.display='none'"><b>${escape(method.name)}</b></button>`);
      });
    } else {
      parts.push(`<span class="room-feature execution-site ${state.executionSiteHint === roomId ? 'nearest' : ''}" title="地点处决地点：${executionSites.map((method) => escape(method.name)).join(' / ')}"><img class="execution-site-icon" src="${uiIcon('executionSite')}" alt="" aria-hidden="true" onerror="this.style.display='none'"><b>处决点 ${executionSites.length}</b></span>`);
    }
  }
  if ((state.crows ?? []).includes(roomId) && state.explored.includes(roomId)) {
    parts.push(`<span class="room-feature crow-room" title="这间屋里有乌鸦：幸存者在这里行动会惊起它们">${icon('crow', 'ui-icon tiny')}<b>乌鸦</b></span>`);
  }
  if (roomId === EXIT_ROOM) parts.push(`<span class="room-feature escape" title="撤离点：任务完成的撤离位置">${icon('escape', 'ui-icon tiny')}</span>`);
  if (state.playerRoom !== roomId && ROOM_MAP[state.playerRoom].neighbors.includes(roomId) && isLocked(state, roomId)) {
    parts.push(`<span class="feature-anchor"><span class="room-feature door-lock" title="电子门锁：切断对应区域电力可解除，也可在门外强行破门">🔒<b>电子门锁</b></span><button type="button" class="feature-action" data-action="break-door" data-room="${roomId}" ${state.energy < 1 ? 'disabled' : ''} title="强行撞开这扇电子门锁：1 AP">破门 · 1 AP</button></span>`);
  }
  if (state.escapeRooms.includes(roomId)) parts.push(`<span class="room-feature escape-npc" title="警报达到阈值后开放的逃生点">${icon('escape', 'ui-icon tiny')}</span>`);
  if (TOTEM_ROOMS.includes(roomId) || state.totems.includes(roomId)) {
    const alive = state.totems.includes(roomId);
    const taken = state.totemInteractions.includes(roomId);
    const label = alive ? (taken ? '已汲取' : '图腾') : '已熄灭';
    const canTake = alive && !taken && state.playerRoom === roomId;
    parts.push(`<span class="totem-anchor"><span class="room-feature totem ${alive ? 'cursed lit' : 'broken'}" title="${label}：幸存者可以拆除；杀手可从每座存续图腾领取一次奖励">${icon('totem', 'ui-icon tiny')}<b>${label}</b></span>${canTake ? `<span class="totem-actions"><button type="button" data-action="totem-draw" title="本局仅可从这座图腾领取一次奖励">抽 1 张牌</button><button type="button" data-action="totem-energy" title="本局仅可从这座图腾领取一次奖励">+1 行动点</button></span>` : ''}</span>`);
  }
  if (state.trailRevealActions > 0 && visibleTrails(state).some((trail) => trail.room === roomId || trail.to === roomId)) parts.push(`<span class="room-feature trail-highlight" title="猎鹿者显现的脚印路线">${icon('trail', 'ui-icon tiny')}</span>`);
  if (state.scourgeShrineRoom === roomId) parts.push(`<span class="room-feature shrine" title="鬼魔神龛：等待有人踏入">${icon('totem', 'ui-icon tiny')}<b>神龛</b></span>`);
  if (CABINET_ROOMS.includes(roomId) || (state.mapId === 'badham' && ['nursery', 'storage', 'guestroom'].includes(roomId))) {
    const cabinetHere = state.playerRoom === roomId;
    const cabinetLabel = state.killer === '女猎手' ? '补给飞斧' : '搜索柜子';
    parts.push(cabinetHere
      ? `<button type="button" class="room-feature cabinet cabinet-action" data-action="cabinet-interact" title="${state.killer === '女猎手' ? '从柜子补充飞斧' : '打开柜子，检查是否藏有幸存者'}">${icon('cabinet', 'ui-icon tiny')}<b>${cabinetLabel}</b></button>`
      : `<span class="room-feature cabinet" title="柜子：幸存者可以躲藏">${icon('cabinet', 'ui-icon tiny')}<b>柜子</b></span>`);
  }
  const boardBlocksRoom = state.barricades.includes(roomId) || (OBSTACLE_ROOMS.includes(roomId) && !cleared && !state.possessed);
  if (boardBlocksRoom) {
    const canBreak = ROOM_MAP[state.playerRoom].neighbors.includes(roomId);
    const fixed = !state.barricades.includes(roomId);
    const label = fixed ? '可破坏的墙壁' : '幸存者木板封门';
    const inner = `<span class="room-feature pallet" title="${fixed ? '可被破坏的墙壁：靠近后可花费 1 AP 砸开' : '木板封门：靠近后可花费 1 AP 破坏'}">${icon(fixed ? 'wall' : 'obstacle', 'ui-icon tiny')}<b>${label}</b></span>`;
    parts.push(canBreak
      ? `<span class="feature-anchor">${inner}<button type="button" class="feature-action" data-action="break-barricade" data-room="${roomId}" ${state.energy < 1 ? 'disabled' : ''} title="砸碎这扇门上的木板：1 AP">破坏木板 · 1 AP</button></span>`
      : inner);
  }

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
    const barricaded = !!targetRoom && (state.barricades.includes(targetRoom) || (OBSTACLE_ROOMS.includes(targetRoom) && !state.clearedObstacles.includes(targetRoom) && !state.possessed));
    const canPass = !!targetRoom && !locked && canMoveTo(state, targetRoom);
    const shortOnAp = adjacent && !locked && !canPass;
    const status = locked ? 'blocked' : barricaded ? 'barricaded' : canPass ? 'active' : shortOnAp ? 'low-ap' : 'open';
    // 普通门已经由 Canvas 画出墙体和门洞，DOM 只保留「与玩家这一格相关」的门：
    // 现在能走的（绿）、行动点不够的（黄）、木板封门（橙）、电子门锁（红）。
    // 远处的门不上图标——否则整张图会被门形符号糊满。
    if (status === 'open' || !adjacent) return '';
    const title = locked ? '电子门锁：切断对应区域电力可解除，也可在门外强行破门' : barricaded ? '木板封门：花费 1 AP 破坏；追逐中强行冲门可能被砸晕' : canPass ? '当前可通行' : shortOnAp ? '门已打开，但行动点不足' : '可通行的门';
    return `<span class="map-door-marker ${position.orientation} ${status}" style="left:${position.left.toFixed(3)}%;top:${position.top.toFixed(3)}%" title="${title}" aria-hidden="true"><i></i></span>`;
  })).join('');
}

/** 把最近发生的关键行动投射到地图上；完整记录仍保留在情报抽屉。 */
function mapEventFeedHtml(state: GameState): string {
  const important = /没能再起来|停止了呼吸|处决了|特殊处决|分数处决|砸毁了|砸烂了|你砸了|立即断电|电话线被剪断|封锁了|放下木板|踩中捕兽夹|报警成功|成功逃离|逃出了房子|翻出了后院|已抵达逃生点|地图出现两个逃生点|逃生点开启|大门开启|警报升高！猎场出现逃生点|被警察逮捕|被同伴救起|【环境事件】|雷雨|电话突然响起|玻璃碎裂声|灯光突然闪烁|飞斧未投出|行动点不足|未解锁|未满足|不可用|被阻|无法|不能|需要|未能|没有|尚未|不在|失败/;
  const recent = state.log.filter((line) => {
    const match = line.match(/^\[第 (\d+) 回合\]/);
    const turn = match ? Number(match[1]) : state.turn;
    return state.turn - turn <= 3 && important.test(line);
  }).slice(0, 5).reverse();
  if (!recent.length) return '';
  return `<div class="map-event-feed" aria-live="polite">
    <span class="map-event-feed-title">现场动态 · 行动反馈</span>
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
      actionHint = state.nurseBlinkTargeting ? `点击地图 1–${blinkRangeOf(state)} 间房距离内的位置` : state.nurseFollowUp ? '闪现后攻击窗口可用' : reason || '穿墙闪现 · 1 AP';
    } else if (power.id === 'huntress_axe') {
      label = state.huntressAiming ? '取消飞斧瞄准' : '狩猎飞斧';
      actionHint = state.huntressAiming ? '点击直线视野内的幸存者' : reason || `飞斧 ${state.hatchets}/${hatchetMax(state)} · 选择目标投掷（1 AP）`;
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
      <span class="power-art" aria-hidden="true"><img class="power-icon-bg" src="${POWER_RARITY_BG}" alt="" onerror="this.style.display='none'"><img class="power-icon" src="${killer.icon}" alt="" onerror="this.style.display='none'"></span>
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
  const darkCircuits = state.powerCircuits.filter((circuit) => circuit.broken || circuit.enabled === false).length;
  const radioBroken = state.sabotage.includes('radio');
  const killerSupplies = state.killer === '设陷者'
    ? `<span class="facility-pill"><i>⚒</i><b>捕兽夹</b><strong>${state.trapInventory}/4 携带 · ${state.bearTraps.filter((trap) => trap.armed).length} 已布设 · ${state.trapCaches.length} 补给点</strong></span>`
    : state.killer === '女猎手'
      ? `<span class="facility-pill"><i>➶</i><b>狩猎飞斧</b><strong>${state.hatchets}/${hatchetMax(state)}</strong></span>`
      : '';
  return `<section class="facility-overview" aria-label="现场设施状态">
    <div class="facility-overview-heading"><b>现场设施</b><small>地图标记与当前状态</small></div>
    <div class="facility-overview-items">
      <span class="facility-pill"><i>▣</i><b>道具箱</b><strong>${boxes.filter((item) => !item.broken && item.charges > 0).length}/${boxes.length}</strong></span>
      <span class="facility-pill">${icon('generator', 'ui-icon tiny')}<b>电闸</b><strong>${darkCircuits} 组断电</strong></span>
      
      <span class="facility-pill ${state.phoneCut || (state.brokenPhones ?? []).length >= (state.phones ?? []).length ? 'offline' : ''}"><b>电话线</b><strong>${state.phoneCut ? '中断' : '正常'}</strong></span>
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
  return '<div class="threat-live-summary"><b>幸存者威胁 · 实时状态</b><span>' + summary + '</span><small>' + (brokenCircuits ? '部分电闸已损坏；幸存者可能携带工具箱前往修复。' : '各区域照明由独立电闸控制。') + '</small></div>' +
    '<div class="threat-list">' + rows.map((r) => '<div class="threat-row ' + r.level + '"><span class="t-name">' + r.name + '</span><b class="t-count">' + r.count + '</b><span class="t-hint">' + escape(r.hint) + '</span></div>').join('') + empty + '</div>';
}
/**
 * 地板上的脚印：把血丝划痕素材当 mask，染成锈红，旋转到「朝下一间屋」的方向。
 *
 * 坐标直接用百分比，所以不需要跟画布/房间的像素换算，户型怎么变都对得上。
 * 只显示 visibleTrails 里的几段——跟丢了、走得久了，旧的脚印就没了。
 */
function trailOverlay(state: GameState): string {
  // 默认只画「当前房间 + 相邻房间」的鞋印：既能看见脚下的痕迹，也能顺着门追到下一间；
  // 隔了两间以上的痕迹不再透墙显示（引擎里仍保留完整线索给杀戮/追击牌用）。
  const near = new Set<RoomId>([state.playerRoom, ...ROOM_MAP[state.playerRoom].neighbors]);
  const candidates = (state.trailRevealActions > 0
    ? visibleTrails(state)
    : visibleTrails(state).filter((t) => near.has(t.room) || near.has(t.to)))
    .filter((trail) => state.trailClock - trail.clock <= 3)
    .sort((a, b) => b.clock - a.clock);
  const seenPaths = new Set<string>();
  const segs = candidates.filter((trail) => {
    const key = trail.room + '|' + trail.to;
    if (seenPaths.has(key)) return false;
    seenPaths.add(key);
    return true;
  }).slice(0, 10);
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
      const cls = `footprint age-${Math.min(3, age)}${t.blood ? ' blood' : ''}${age <= 0 ? ' fresh' : ''}`;
      const opacity = Math.max(0.18, 1 - age * 0.24);
      // 贴图 + 滤镜染红：遮罩方案在 WebP 上会整块消失，滤镜方案跨浏览器稳定。
      return `<img class="${cls}" src="${uiIcon('trail')}" alt="" aria-hidden="true" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--rot:${rot.toFixed(1)}deg;--trail-opacity:${opacity.toFixed(2)}">`;
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
    return aura || (person.revealedActions ?? 0) > 0;
  });
  if (lastDiscoveryMissionId !== m.id) {
    lastDiscoveryMissionId = m.id;
    discoveredSurvivorIds.clear();
  }
  // 发现幸存者的提示音统一交给 main.ts 的 survivorFound；这里不再额外播受惊尖叫。
  const newlyDiscovered = state.people.filter((person) => person.role !== 'police' && person.hp > 0 && !person.hidden && isRoomVisible(state, person.room) && !discoveredSurvivorIds.has(person.id));
  newlyDiscovered.forEach((person) => discoveredSurvivorIds.add(person.id));
  const isMyers = killer.owner === '迈克尔·迈尔斯';
  if (state.turn === 1 && state.trailClock === 0) {
    lastRenderedTrapTriggerCount = state.trapTriggerCount;
  } else if (lastRenderedTrapTriggerCount === null || state.trapTriggerCount < lastRenderedTrapTriggerCount) {
    lastRenderedTrapTriggerCount = state.trapTriggerCount;
  } else if (state.trapTriggerCount > lastRenderedTrapTriggerCount) {
    const trapGender = state.lastTrapTriggerId ? SURVIVOR_MAP[state.lastTrapTriggerId]?.gender ?? 'male' : 'male';
    playTrapScream(trapGender);
    playSfx('trapTrigger');
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

/**
 * 房间点位上的互动标记：能破坏 / 能互动的东西都做成按钮，
 * 和人物头上的「抱起 / 处决」同一套观感，不再依赖底部动作条。
 */
function roomActionsHtml(state: GameState, roomId: RoomId): string {
  if (state.phase !== 'playing') return '';
  const here = state.playerRoom === roomId;
  const adjacent = ROOM_MAP[state.playerRoom].neighbors.includes(roomId);
  const actions: string[] = [];

  const dynamicBoard = state.barricades.includes(roomId);
  const fixedBoard = OBSTACLE_ROOMS.includes(roomId) && !state.clearedObstacles.includes(roomId) && !state.possessed;
  if (adjacent && (dynamicBoard || fixedBoard)) {
    actions.push(`<button class="btn" data-action="break-barricade" data-room="${roomId}" ${state.energy < 1 ? 'disabled' : ''} title="砸碎这扇门上的木板：1 AP">破坏木板 · 1 AP</button>`);
  }

  if (adjacent && isLocked(state, roomId)) {
    actions.push(`<button class="btn" data-action="break-door" data-room="${roomId}" ${state.energy < 1 ? 'disabled' : ''} title="强行撞开这扇电子门锁：1 AP">破门 · 1 AP</button>`);
  }

  if (here && phoneWorks(state, roomId)) {
    actions.push(`<button class="btn" data-action="break-phone" ${state.energy < 1 ? 'disabled' : ''} title="砸坏这间屋子的电话：1 AP">砸坏电话 · 1 AP</button>`);
  }

  return actions.length ? `<div class="room-actions">${actions.join('')}</div>` : '';
}


/** 房间内的人物站位：按房间与人物 id 稳定散开，避开顶部特性区和底部动作区。 */
function personSlot(roomId: RoomId, personId: string, index: number): { x: number; y: number } {
  let hash = 0;
  for (const ch of roomId + personId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const x = 42 + (hash % 18) + (index % 3) * 3;
  const y = 52 + ((hash >> 9) % 13) + Math.floor(index / 3) * 4;
  return { x: Math.min(61, x), y: Math.min(66, y) };
}
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
    const blinkSelectable = state.nurseBlinkTargeting && room.id !== state.playerRoom && blinkDistance >= 1 && blinkDistance <= blinkRangeOf(state);
    const locked = isLocked(state, room.id);
    const barricaded = state.barricades.includes(room.id);
    const cost = moveCost(state, room.id);
    const adjacent = ROOM_MAP[state.playerRoom].neighbors.includes(room.id);
    const obstacleOpen = OBSTACLE_ROOMS.includes(room.id) && !state.clearedObstacles.includes(room.id);
    // 相邻但进不去时也要给一个可点目标：否则点击落在房间块上没有任何处理器，
    // 玩家只会觉得「点了没反应」。点了由 main.ts 用 moveBlockReason 说明原因。
    const moveHint = reachable
      ? `移动到${room.name}（需 ${cost} 点行动点）`
      : (moveBlockReason(state, room.id) ?? `走不过去`);
    const darkRoom = !isRoomLit(state, room.id);
    const noise = visibleDisturbances(state).find((d) => d.room === room.id);
    // 感知：看不见的房间也会浮出红色人影——只有影子，没有名字
    const auraReveal = state.revealAuraActions > 0 && (room.id === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(room.id));
    const sensed = !visible
      ? state.people.filter((p) => p.room === room.id && p.role !== 'police' && p.hp > 0 && !p.hidden && (auraReveal || (p.revealedActions ?? 0) > 0)).length
      : 0;
    const r = room.rect;
    const style = `left:${r.left}%;top:${r.top}%;width:${r.width}%;height:${r.height}%`;
    return `
      <div class="room ${isPlayer ? 'current' : ''} ${reachable ? 'reachable' : 'disabled'} ${adjacent ? 'adjacent' : ''} ${state.lookingAround && adjacent ? 'look-target' : ''} ${state.auraTargeting ? 'aura-target' : ''} ${blinkSelectable ? 'blink-target' : ''} ${obstacleOpen ? 'obstacle' : ''} ${darkRoom ? 'dark-room' : 'lit-room'} ${room.id === 'garden' ? 'outdoor' : ''} room-size-${room.size} ${locked ? 'locked' : ''} ${barricaded ? 'barricaded' : ''} ${adjacent && barricaded ? 'board-near' : ''} ${explored ? 'explored' : 'unexplored'} ${visible ? 'in-sight' : 'fogged'}"
        style="${style}" data-room="${room.id}" data-aura-count="${sensed}" title="${escape(room.name)}${explored ? `：${escape(room.desc)}` : '：还没进去过'}">
        ${state.auraTargeting
          ? `<button type="button" class="room-hit aura-hit" data-action="aura-select" data-room="${room.id}" aria-label="选择${escape(room.name)}，显示其中人类的气场">显形</button>`
          : state.nurseBlinkTargeting
          ? blinkSelectable
            ? `<button type="button" class="room-hit blink-hit" data-action="blink-select" data-room="${room.id}" aria-label="闪现到${escape(room.name)}（距离 ${blinkDistance} 间房）">闪现</button>`
            : ''
          : state.lookingAround && adjacent
            ? `<button type="button" class="room-hit look-hit" data-action="look-select" data-room="${room.id}" aria-label="查看${escape(room.name)}，消耗 ${LOOK_COST} 点行动点">查看这里</button>`
            : !state.lookingAround && !state.huntressAiming && adjacent && !barricaded
              ? `<button type="button" class="room-hit ${reachable ? '' : 'blocked'}" data-action="move" data-room="${room.id}" aria-label="${escape(moveHint)}" title="${escape(moveHint)}"></button>`
              : ''}
        <div class="room-head">
          <span class="room-name">${explored ? escape(room.name) : '？？？'}</span>
          ${noise ? `<span class="room-tag noise loud" title="${escape(noise.label)}">${icon('crow', 'crow-icon tiny')}${escape(noise.label)}</span>` : ''}
          ${isPlayer
            ? '<span class="room-tag">你在</span>'
            : locked
              ? '<span class="room-tag lock" title="电子门锁：断电解除或在门外强行破门">电子门锁 · 断电可解</span>'
              : barricaded
                ? '<span class="room-tag bar" title="幸存者刚刚放下木板封门；靠近后花费 1 AP 破坏">木板封门 · 幸存者放置</span>'
                : obstacleOpen
                  ? `<span class="room-tag obstacle" title="固定障碍木板：进入该房间需要额外行动点；也可在相邻房间花费 1 AP 破坏">木板障碍 · ${cost}点</span>`
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
        <div class="room-people ${adjacent && people.length ? 'adjacent-survivors' : ''}">
          ${people.map((p) => p.hp <= 0 && p.room === state.playerRoom && !state.carryPersonId
            ? `<div class="map-person-wrap ${currentScore(state) >= SCORE_EXECUTION_THRESHOLD ? 'score-unlocked' : ''}" style="left:${personSlot(room.id, p.id, people.indexOf(p)).x.toFixed(1)}%;top:${personSlot(room.id, p.id, people.indexOf(p)).y.toFixed(1)}%">${personChip(p, false, false, undefined, !isRoomLit(state, p.room))}
                <div class="person-world-actions">
                  ${currentScore(state) >= SCORE_EXECUTION_THRESHOLD ? `<button class="btn score-execution-btn" data-action="execute-score-special" data-person-id="${p.id}" ${scoreExecutionBlockReason(state, p.id) ? 'disabled' : ''} title="分数处决：猎杀评分达到 ${SCORE_EXECUTION_THRESHOLD} 分后解锁，消耗 1 AP 并触发 QTE">分数处决 · QTE</button>` : ''}
                  <button class="btn" data-action="carry" data-person-id="${p.id}" ${state.energy < 1 ? 'disabled' : ''} title="抱起倒地幸存者：消耗 1 AP；抱起后可搬运到指定地点执行地点处决">抱起</button>
                  <button class="btn execute" data-action="execute-target" data-person-id="${p.id}" ${executeBlockReason(state, p.id) ? 'disabled' : ''} title="普通处决：消耗 1 AP，立即击杀倒地目标">普通处决</button>
                </div>
              </div>`
            : personChip(
                p,
                false,
                false,
                state.huntressAiming ? 'hatchet' : undefined,
                !isRoomLit(state, p.room),
                personSlot(room.id, p.id, people.indexOf(p)),
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
          ${p.bloodSacrifice ? '<small class="blood-sacrifice-tag"><i aria-hidden="true"></i>血祭品</small>' : ''}
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
  state.people
    .filter((p) => p.role !== 'police' && p.hp <= 0)
    .forEach((p) => {
      statusBits.push(`<span class="status-badge downed">${escape(p.name)} 倒地 · 可立即处决 · 同伴仍可能救起</span>`);
    });
  if (state.nurseBlinkTargeting) statusBits.push(`<span class="status-badge blink-mode">护士闪现选点中 · 选择 1–${blinkRangeOf(state)} 间房距离内的位置</span>`);
  if (state.nurseFollowUp) statusBits.push('<span class="status-badge blink-mode">濒死之息 · 现在可对同屋站立幸存者发动普通攻击；下一次行动后疲惫</span>');
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
  // 没有具体指引时不显示提示条：常驻的「开始侦查」属于噪音，已被移除。
  let guidanceTitle = '';
  let guidanceDetail = '';
  let guidanceRoom: RoomId | null = null;
  if (state.carryPersonId) {
    const carriedPerson = state.people.find((person) => person.id === state.carryPersonId);
    const nearestSite = executionMethodsAtRoom(state.playerRoom);
    guidanceTitle = nearestSite.length ? '选择一种地点处决' : '把猎物运往地点处决区域';
    guidanceDetail = nearestSite.length
      ? '你已经控制住倒地目标。选择当前场地的处决方式，完成一次地点处决。'
      : '可以把倒地目标搬到厨房、车库、工具间、浴室或洗衣房，选择该地点对应的处决方式。';
    if (carriedPerson) guidanceDetail += ` 当前搬运目标：${carriedPerson.name}。`;
  } else if (downedHereNow) {
    guidanceTitle = '猎物已经倒地';
    guidanceDetail = '普通处决可以立即完成；也可以抱起目标，搬运到指定地点执行地点处决。当前猎杀评分 ' + currentScore(state) + ' / ' + SCORE_EXECUTION_THRESHOLD + '；达到门槛后，倒地目标头顶会出现独立的「分数处决」QTE 按钮。若拖延，同伴可能赶来救援。';
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
    ${guidanceTitle ? `<div class="hunt-plan-guidance">
      <b>${escape(guidanceTitle)}</b>
      <span>${escape(guidanceDetail)}</span>
      ${guidanceRoom ? `<em>行动地点：${escape(roomName(guidanceRoom))}</em>` : ''}
    </div>` : ''}
    <div class="hunt-plan-prep"><small>猎场准备</small><span>${preparations.length ? preparations.map(escape).join(' · ') : '尚未准备。可根据目标习惯和地图设施，选择断电、切断通讯、布置陷阱或直接突袭。'}</span></div>
  </div>`;

  const atkOk = canAttack(state);
  const atkReason = attackBlockReason(state);
  const possessed = state.possessed;
  const sabotageReason = sabotageBlockReason(state);
  const lockedDoor = ROOM_MAP[state.playerRoom].neighbors.find((room) => isLocked(state, room));
  const sabotageHere = state.powerCircuits.some((c) => c.breakerRoom === state.playerRoom && !c.broken) || state.siteItems.some((item) => item.room === state.playerRoom && !item.broken) ? '破坏现场设施' : phoneWorks(state, state.playerRoom) ? '砸坏电话' : RADIO_ROOMS.includes(state.playerRoom) && !state.sabotage.includes('radio') ? '破坏备用无线电' : lockedDoor ? `撞开通往${roomName(lockedDoor)}的门锁` : '破坏现场设施';
  const sabotageTitle = sabotageReason ?? `${sabotageHere}。消耗 ${SABOTAGE_COST} 点行动点；强行破门会惊动屋内的人。`;
  const sabotageMeta = sabotageReason ? escape(sabotageReason) : `${SABOTAGE_COST} 点 · ${sabotageHere}`;
  // 破坏类操作已经做成房间点位上的互动标记，底部不再保留「破坏」按钮。
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
      <span class="execute-symbol" aria-hidden="true">${icon('statusKill', 'ui-icon tiny')}</span>
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
  const mapWorldActions = carried
    ? `<div class="map-world-actions" style="${markerStyle}" aria-label="携带目标操作">
        <button class="btn" data-action="drop-carried" ${state.energy < 1 ? 'disabled' : ''}>放下目标 · 1 AP</button>
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
    ? `<button class="btn search" data-action="refill-hatchets" ${state.energy < 1 || state.hatchets >= hatchetMax(state) ? 'disabled' : ''}>柜子补充飞斧 · ${state.hatchets}/${hatchetMax(state)}</button>`
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
    <div class="right-tools">
      <button class="tool task-tool" data-action="toggle-task-drawer" aria-label="任务列表" title="打开任务列表（T）"><span>☷</span><em>任务列表 · T</em></button>
      <button class="tool" data-action="toggle-intel-drawer" aria-label="现场情报"><span>⌕</span><em>现场情报</em></button>
      <button class="tool" data-action="toggle-game-hud" aria-label="隐藏界面"><span>◉</span><em>隐藏界面 · H</em></button>
    </div>
    <div class="task-pop task-detail-drawer">
      <button class="close" data-action="toggle-task-drawer" aria-label="关闭任务详情">×</button>
      <h3>当前任务 / OBJECTIVE</h3>
      <p><b>${escape(m.objective ?? m.title)}</b></p>
      <p>${escape(m.successText ?? '达成主目标')}<br>失败条件：${escape(m.failText ?? '超时或被捕')}</p>
      <div class="mission-task-list"><b class="mission-task-heading">任务列表：</b>${progress}</div>
      <p>剩余回合：${left} · 当前猎杀阶段：${huntPhase}</p>
    </div>

    <div class="layout hunt-layout">
      <div class="main-column">
        <div class="panel map-panel">
          <div class="panel-heading"><h2>房屋平面</h2><span>门形=通道 · 绿门=当前可走 · 红叉=封锁 · 橙色高亮=幸存者木板封门</span>
            <button class="btn ghost mini" data-action="guide">玩法指引</button>
            <button class="btn ghost mini display-control" data-action="display-setting" data-setting="interfaceScale">界面大小</button>
            <button class="btn ghost mini display-control" data-action="display-setting" data-setting="fontScale">文字大小</button>
            <button class="btn ghost mini display-control" data-action="display-setting" data-setting="mapScale">地图放大</button>
            <button class="btn ghost mini audio-toggle" data-action="mute" title="开关音效与背景音乐">${isMuted() ? '音效 关' : '音效 开'}</button>
          </div>
          ${statusHtml}${carryStatus}${huntPlanHtml}
          ${facilityOverviewHtml(state)}
          ${state.lookingAround ? '<div class="look-prompt" role="status"><b>选择要查看的房间</b><span>地图上亮起边框的房间都与当前位置相邻。点击其中一个，消耗 1 点行动点查看。</span><button class="btn ghost mini" data-action="look-cancel">取消</button></div>' : ''}
          ${state.huntressAiming ? '<div class="look-prompt hatchet-prompt" role="status"><b>狩猎飞斧瞄准中</b><span>点击地图上可见的站立幸存者。飞斧只能命中当前房间或正前方直线房间内的目标；无法投出的原因会显示在现场反馈中。</span></div>' : ''}
          ${state.barricades.length ? `<div class="look-prompt barricade-prompt" role="status"><b>幸存者放下了木板</b><span>${state.barricades.map((room) => roomName(room)).join('、')}：地图上的橙色高亮标记就是被封住的入口。靠近该房间后点击「破坏木板 · 1 AP」即可通行。</span></div>` : ''}
          ${state.auraTargeting ? '<div class="look-prompt aura-prompt" role="status"><b>恶灵低语 · 选择房间</b><span>点击地图任意房间，包括你当前所在的房间；也可以取消，不发动显形效果。</span><button class="btn ghost mini" data-action="aura-cancel">取消选择</button></div>' : ''}
          <div class="map-viewport">
            <div class="floorplan" style="--ar:${layoutAspectNum().toFixed(4)};aspect-ratio:${layoutAspect()}">
              ${rooms}
              ${doorMarkersHtml(state)}
              ${trailOverlay(state)}
              ${playerMarker}
              ${mapWorldActions}
          </div>
       </div>

        <div class="statusline">
          <div class="resource-bar">
            <div class="stats">
              <div class="stat"><b>${state.turn}<i>/${m.turns}</i></b><small>回合</small></div>
              <div class="stat alarm-stat ${state.alarm >= 70 ? 'hot' : state.alarm >= 40 ? 'warm' : ''}" tabindex="0" role="note" aria-label="警报值说明">
  <b>${state.alarm}<i>/${ALARM_MAX}</i></b><div class="alarm-track"><span style="width:${state.alarm}%"></span></div><small>警报 ⓘ</small>
  <span class="alarm-tooltip-content"><strong>警报值（0–100）</strong><br>上升：被幸存者目击或发现、攻击/处决、成功报警或呼救，以及部分破坏和卡牌效果；电话或无线电求救会大幅增加。<br>降低：每回合结束通常 −6；本回合没有新的暴露度增加时额外 −4；部分卡牌和环境事件也能降低。<br>阈值：达到 60 会出现逃生点；达到 100 触发最终危机（普通杀手引来警察，灵异杀手迫使幸存者全面逃亡）。</span>
</div>
              <div class="stat"><b>${state.kills}</b><small>击杀</small></div>
              <div class="stat survivor-count"><b>${state.people.filter((p) => p.role !== 'police' && p.hp > 0).length}/${state.survivorTotal}</b><small>存活</small></div>
              
              <div class="stat score"><b>${currentScore(state)}</b><small>预计得分</small></div>
              <div class="stat loot-stat"><b>${state.loot}</b><small>战利品</small></div>
            </div>
            <details class="score-details">
              <summary>得分构成 · 怎么加分</summary>
              ${scoreGroupsHtml(scoreLines(state))}
              <section class="score-group score-guide">
                <h4>还能怎么加分</h4>
                <div class="score-line"><span>全程无人成功报警</span><b>+25</b></div>
                <div class="score-line"><span>结束时警报低于 30</span><b>+15</b></div>
                <div class="score-line"><span>每多一种处决方式</span><b>+10</b></div>
                <div class="score-line"><span>用满 3 种卡后，每多一种（上限 15）</span><b>+3</b></div>
                <div class="score-line"><span>每击杀 1 人</span><b>+14</b></div>
                <div class="score-line"><span>每处决 1 次</span><b>+10</b></div>
                <div class="score-line"><span>胜利结算：每剩余 1 回合</span><b>+5</b></div>
                <div class="score-line"><span>击杀已恐惧崩溃的目标</span><b>+8</b></div>
                <div class="score-line"><span>同一回合连杀（第 2 人起）</span><b>+12</b></div>
                <div class="score-line"><span>加注达成</span><b>契约分 +60%</b></div>
                <div class="score-line"><span>每逃走 1 人</span><b>-15</b></div>
              </section>
            </details>
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
              ${trapCacheBtn}${trapRecoverBtn}${hatchetRefillBtn}

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
          ${mapEventFeedHtml(state)}
          <div class="activity-log-panel">
            <button type="button" class="activity-log-toggle" data-action="toggle-activity-log" aria-expanded="false">活动日志 · ${state.log.length}</button>
            <div class="activity-log-list" hidden>${state.log.slice(0, 24).map((line) => `<div>${escape(line)}</div>`).join('')}</div>
          </div>
        </div>
        <section class="killer-ability-panel" aria-label="杀手能力 HUD">
          <div class="killer-hud-portrait">
            ${killerFaceHtml(killer, 'ability-portrait')}
            <b>${escape(killer.owner)}</b>
            <div class="killer-addon-slots" aria-label="本局带入的配件">
              ${Array.from({ length: ACCESSORY_SLOTS }, (_, index) => {
                const def = ACCESSORY_MAP[state.accessories[index] ?? ''];
                return def
                  ? `<span class="killer-addon-slot" title="${escape(`${def.name}：${def.desc}`)}">${addonIconHtml(def.id, def.rarity, 'hud')}</span>`
                  : '<span class="killer-addon-slot empty" title="空配件槽">＋</span>';
              }).join('')}
            </div>
            ${modifierSummary(state).length
              ? `<small class="killer-addon-mods" title="本局配件加成">${escape(modifierSummary(state).join(' · '))}</small>`
              : ''}
          </div>
          <div class="killer-hud-abilities" aria-label="杀手能力图标 · 按 1–4 使用">
            <div class="killer-power-grid">${powerButtonHtml(state, killer)}</div>
          </div>
          <div class="killer-hud-resources" aria-label="杀戮值与行动点">
            <div class="killer-frenzy-meter">
              <div class="killer-resource-line"><img class="killer-frenzy-icon" src="${uiIcon('statusKill')}" alt="" aria-hidden="true"><span>杀戮值：</span><b>${state.frenzy}/${FRENZY_MAX}</b></div>
              <div class="killer-frenzy-track"><i style="width:${state.frenzy / FRENZY_MAX * 100}%"></i></div>
            </div>
            <div class="ap-display killer-ap-display" aria-label="当前行动点">
              <img class="killer-ap-icon" src="${uiIcon('trail')}" alt="" aria-hidden="true">
              <span>行动点：</span><b>${state.energy}<i>/${state.maxEnergy}</i></b>
            </div>
            ${meter || myersMarks ? `<div class="killer-special-resources">${meter}${myersMarks}</div>` : ''}
          </div>
        </section>
      </div>
      <aside class="hunt-sidebar hunt-sidebar-left">
        <details class="intel-drawer">
        <div class="intel-drag-handle">
          <div><b>现场情报</b><small>${known.length} 人已确认 · ${state.siteItems.length} 处设施 · ${state.log.length} 条记录</small></div>
          <button type="button" class="intel-close" data-action="toggle-intel-drawer" aria-label="关闭现场情报">×</button>
        </div>
        <div class="intel-grid">
        <section class="panel person-dossier-panel">
          <div class="panel-heading"><h2>人物详情</h2><span>点击地图人物或悬停卡牌</span></div>
          <div id="cardDetail" class="detail-wrap">${defaultDetailHtml()}</div>
        </section>

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
  const breakdown = scoreGroupsHtml(state.scoreBreakdown);
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
          <div><small>战利品</small><b>${state.loot} → ${lootPayout(state)}</b></div>
          <div><small>击杀人数</small><b>${state.kills}</b></div>
          <div><small>逃走人数</small><b>${state.escaped}</b></div>
          <div><small>最终警报值</small><b>${state.alarm}/${ALARM_MAX}</b></div>
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
