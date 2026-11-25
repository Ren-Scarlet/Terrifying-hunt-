import { CARD_MAP } from '../../game/cards';
import { characterImage, uiIcon } from '../../game/assetMap';
import {
  ALARM_MAX,
  ARCH_LABEL,
  ATTACK_COST,
  BASE_AP,
  BLEEDOUT_TURNS,
  DOWNED_LOCK_TURNS,
  ESCAPE_ROOMS,
  FRENZY_AP_BONUS,
  FRENZY_MAX,
  FRENZY_THRESHOLD,
  GOAL_LABEL,
  HEALTH_LABEL,
  INTENT_LABEL,
  SEARCH_COST,
  TEAM_GOAL_MAX,
  attackBlockReason,
  canAttack,
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
} from '../../game/engine';
import { KILLERS, type KillerProfile } from '../../game/killers';
import { roomName } from '../../game/missions';
import {
  CABINET_ROOMS,
  EXIT_ROOM,
  OBSTACLE_ROOMS,
  ROOM_MAP,
  ROOMS,
  TOTEM_ROOMS,
  layoutAspect,
  layoutAspectNum,
} from '../../game/rooms';


import { isCardTuned } from '../../game/tuning';
import { isMuted } from '../audio';
import { escape, icon, itemBadge, itemIconHtml, personChip, intentDot, shadowFigures, perkIconHtml, TYPE_NAMES, killerFaceHtml, defaultDetailHtml } from './shared';
export { killerFaceHtml, getKiller, defaultDetailHtml, cardDetailHtml, personDetailHtml } from './render/shared';
export { renderMenu, renderGuide, shopPrice, renderShop, renderDeckEditor } from './render/menus';
import type { GameState, Person, RoomId, SaveData } from '../../game/types';

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
        `<span class="room-feature site ${i.kind} ${down ? 'broken' : ''}" title="${label}：${status}。你用不了它，但可以花 ${SABOTAGE_COST} 点行动点砸掉">${icon(i.kind === 'itemBox' ? 'itemBox' : 'generator', 'ui-icon tiny')}</span>`,
      );
    });
  if (roomId === EXIT_ROOM) parts.push(`<span class="room-feature escape" title="撤离点：任务完成的撤离位置">${icon('escape', 'ui-icon tiny')}</span>`);
  if (ESCAPE_ROOMS.includes(roomId)) parts.push(`<span class="room-feature escape-npc" title="逃生点：NPC 在这里待满一回合就会逃出去">${icon('escape', 'ui-icon tiny')}</span>`);
  if (TOTEM_ROOMS.includes(roomId)) parts.push(`<span class="room-feature totem" title="图腾：在此结束回合，下回合 +1 行动点">${icon('totem', 'ui-icon tiny')}</span>`);
  if (CABINET_ROOMS.includes(roomId)) parts.push(`<span class="room-feature cabinet" title="柜子：藏身者不会被引诱类卡牌锁定">${icon('cabinet', 'ui-icon tiny')}</span>`);
  if (OBSTACLE_ROOMS.includes(roomId) && !cleared) parts.push(`<span class="room-feature obstacle" title="障碍：进入多花 1 点行动点；破门能力可以直接清掉">${icon('obstacle', 'ui-icon tiny')}</span>`);
  return parts.join('');
}

function powerButtonHtml(state: GameState, killer: KillerProfile): string {
  return killer.powers
    .map((p) => {
      const cd = powerCooldown(state, p.id);
      const ok = canUsePower(state, p.id);
      const reason = powerBlockReason(state, p.id);
      const total = Math.max(1, p.cooldown);
      const pips = Array.from({ length: total }, (_, i) => {
        const filled = i < cd;
        return `<i class="${filled ? 'on' : ''}"></i>`;
      }).join('');
      return `<button class="btn power ${p.ultimate ? 'ultimate' : 'main'} ${ok ? '' : 'cooling'}"
        data-action="power" data-power="${p.id}" ${ok ? '' : 'disabled'}
        title="${escape(p.desc)}${reason ? ` · ${escape(reason)}` : ''}">
        <span class="power-art"><img class="power-glyph" src="${killer.icon}" alt="" onerror="this.style.display='none'"></span>
        <span class="power-body">
          <b>${escape(p.name)}${p.ultimate ? '<em>大招</em>' : ''}</b>
          <small>${cd > 0 ? `冷却 ${cd} 回合` : reason || (p.ultimate ? '可以发动' : '可以使用')}</small>
        </span>
        <span class="power-pips">${pips}</span>
      </button>`;
    })
    .join('');
}

/**
 * 威胁面板：把「他们正在做什么」直接摊开，每一行都给出一个具体的反制办法。
 * 数值全部从真实状态算，不做占位。
 */
function threatRowsHtml(state: GameState): string {
  const alive = state.people.filter((p) => p.role !== 'police' && p.hp > 0);
  const downed = state.people.filter((p) => p.role !== 'police' && p.hp <= 0);
  const atExit = alive.filter((p) => ESCAPE_ROOMS.includes(p.room));
  const leaving = alive.filter((p) => p.intent === 'escape');
  const calling = alive.filter((p) => p.intent === 'call');
  const caring = alive.filter((p) => p.intent === 'rescue' || p.intent === 'heal');
  const armed = alive.filter((p) => p.armed);
  const barricaded = state.barricades.length;
  const hiding = state.people.filter((p) => p.role !== 'police' && p.hidden);

  const rows: Array<{ name: string; count: number; hint: string; level: 'calm' | 'warn' | 'hot' }> = [
    {
      name: '逃生',
      count: atExit.length + leaving.length,
      hint: atExit.length
        ? `${atExit.length} 人已经在后院，撑过这回合就翻出去`
        : leaving.length
          ? '正往后院跑，先封门或追上去'
          : '还没人动身，后院那扇门可以先钉死',
      level: atExit.length ? 'hot' : leaving.length ? 'warn' : 'calm',
    },
    {
      name: '报警',
      count: calling.length,
      hint: state.phoneCut
        ? '电话线已经剪断，他们只能去地下室碰无线电'
        : calling.length
          ? '有人正在摸电话，报警会让暴露度暴涨'
          : '书房和大厅有电话，先剪线最省事',
      level: calling.length ? (state.phoneCut ? 'warn' : 'hot') : 'calm',
    },
    {
      name: '救援',
      count: caring.length + downed.length,
      hint: downed.length
        ? `${downed.length} 人倒地 · ${caring.length} 人正赶去救，守尸或钉住他`
        : '现在没人倒地，救不起来也就没得救',
      level: downed.length ? (caring.length ? 'hot' : 'warn') : 'calm',
    },
    {
      name: '反抗',
      count: armed.length + barricaded,
      hint: armed.length
        ? `${armed.length} 人手里有家伙，正面撞上会被逼退一步`
        : barricaded
          ? `${barricaded} 间房门被堵住，进去要多花一步`
          : '厨房、车库、温室能翻到武器，提前清掉',
      level: armed.length > 1 ? 'hot' : armed.length || barricaded ? 'warn' : 'calm',
    },
    {
      name: '躲藏',
      count: hiding.length,
      hint: hiding.length ? `${hiding.length} 人藏在柜子或床底，搜一次才揪得出来` : '没人在藏，或者你还没看见',
      level: hiding.length ? 'warn' : 'calm',
    },
  ];

  return `<div class="threat-list">${rows
    .map(
      (r) => `<div class="threat-row ${r.level}">
        <span class="t-name">${r.name}</span>
        <b class="t-count">${r.count}</b>
        <span class="t-hint">${escape(r.hint)}</span>
      </div>`,
    )
    .join('')}</div>`;
}

/**
 * 地板上的脚印：把血丝划痕素材当 mask，染成锈红，旋转到「朝下一间屋」的方向。
 *
 * 坐标直接用百分比，所以不需要跟画布/房间的像素换算，户型怎么变都对得上。
 * 只显示 visibleTrails 里的几段——跟丢了、走得久了，旧的脚印就没了。
 */
function trailOverlay(state: GameState): string {
  // 只画当前房间里的鞋印：别处的痕迹不再隔墙可见（引擎里仍保留完整线索给杀戮/追击牌用）
  const segs = visibleTrails(state).filter((t) => t.room === state.playerRoom);
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
  const here = state.people.filter((p) => p.room === state.playerRoom && p.role !== 'police');
  const policeHere = state.people.some((p) => p.room === state.playerRoom && p.role === 'police');
  const isMyers = killer.owner === '迈克尔·迈尔斯';

  // 任务条：目标 / 达成条件 / 失败条件 / 实时进度 / 倒计时，一眼看清这一局要做什么
  const need = m.targetCount ?? 2;
  const atExit = state.playerRoom === EXIT_ROOM;
  const left = Math.max(0, m.turns - state.turn + 1);
  const urgent = left <= 5;
  let progress = '';
  let objectiveDone = false;
  switch (m.kind) {
    case 'assassinate':
      progress = `名单 ${state.markedKilled}/${need} · 撤离 ${atExit ? '✓' : '✗'}`;
      objectiveDone = state.markedKilled >= need && atExit;
      break;
    case 'bodyCount':
      progress = `击杀 ${state.kills}/${need}`;
      objectiveDone = state.kills >= need;
      break;
    case 'evidence':
      progress = `证据 ${state.evidence}/${need} · 撤离 ${atExit ? '✓' : '✗'}`;
      objectiveDone = state.evidence >= need && atExit;
      break;
    case 'escape':
      progress = `标记 ${state.markedKilled}/1 · 撤离 ${atExit ? '✓' : '✗'}`;
      objectiveDone = state.markedKilled >= 1 && atExit;
      break;
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
    const locked = isLocked(state, room.id);
    const barricaded = state.barricades.includes(room.id);
    const cost = moveCost(state, room.id);
    const adjacent = ROOM_MAP[state.playerRoom].neighbors.includes(room.id);
    const obstacleOpen = OBSTACLE_ROOMS.includes(room.id) && !state.clearedObstacles.includes(room.id);
    const isObjective = state.objectiveRooms.includes(room.id);
    const noise = visibleDisturbances(state).find((d) => d.room === room.id);
    // 感知：看不见的房间也会浮出红色人影——只有影子，没有名字
    const sensed =
      !visible && isSensing(state)
        ? state.people.filter((p) => p.room === room.id && p.role !== 'police' && p.hp > 0 && !p.hidden)
            .length
        : 0;
    const r = room.rect;
    const style = `left:${r.left}%;top:${r.top}%;width:${r.width}%;height:${r.height}%`;
    return `
      <div class="room ${isPlayer ? 'current' : ''} ${reachable ? 'reachable' : 'disabled'} ${adjacent ? 'adjacent' : ''} ${obstacleOpen ? 'obstacle' : ''} ${isObjective ? 'objective' : ''} ${room.id === 'garden' ? 'outdoor' : ''} ${locked ? 'locked' : ''} ${barricaded ? 'barricaded' : ''} ${explored ? 'explored' : 'unexplored'} ${visible ? 'in-sight' : 'fogged'}"
        style="${style}" data-room="${room.id}" title="${escape(room.name)}${explored ? `：${escape(room.desc)}` : '：还没进去过'}${isObjective ? ' · 他们的目标点' : ''}">
        ${reachable ? `<button type="button" class="room-hit" data-action="move" data-room="${room.id}"
          aria-label="移动到${escape(room.name)}（需 ${cost} 点行动点）"></button>` : ''}
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
          ${people.map((p) => personChip(p, isPlayer && canAttack(state, p.id))).join('')}
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

  const hand = state.hand
    .map((card) => {
      const def = CARD_MAP[card.defId];
      if (!def) return '';
      const cost = effectiveCost(card.defId, state);
      const disabled = cost > state.energy;
      return `
        <button class="card ${def.type}" data-action="play" data-uid="${card.uid}" data-card-uid="${card.uid}"
          ${disabled ? 'disabled' : ''} title="${escape(def.desc)}">
          <span class="card-type">${escape(TYPE_NAMES[def.type] ?? def.type)}</span>
          <span class="card-cost">${cost}</span>
          ${isCardTuned(def.id) ? '<span class="card-tuned" title="这张卡使用了你在平衡调整里改过的数值">调</span>' : ''}
          ${perkIconHtml(def.id)}
          <div class="card-name">${escape(def.name)}</div>
          <div class="card-desc">${escape(def.desc)}</div>
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
      const alertLabel = `<em class="alert-tag ${p.alert >= 70 ? 'high' : p.alert >= 35 ? 'mid' : ''}">警觉 ${p.alert}</em>`;
      const intentLabel = p.intent === 'idle' ? GOAL_LABEL[p.goal] : INTENT_LABEL[p.intent];
      const where = vis ? roomName(p.room) : `最后在${roomName(p.lastSeenRoom)}`;
      return `<button class="roster-person ${p.room === state.playerRoom ? 'here' : ''} ${p.marked ? 'marked' : ''} ${p.intent === 'escape' ? 'escaping' : ''} ${vis ? '' : 'unknown'} ${health === 'downed' ? 'downed' : ''}"
        data-action="person" data-person-id="${p.id}"
        title="${escape(p.name)}：${escape(ARCH_LABEL[p.archetype])}，${escape(GOAL_LABEL[p.goal])}，${escape(HEALTH_LABEL[health])}${vis ? '' : '，位置待确认'}">
        ${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}
        <span><b>${escape(p.name)} ${alertLabel}</b>
          <small class="goal-line">${escape(ARCH_LABEL[p.archetype])} · ${escape(GOAL_LABEL[p.goal])}</small>
          <small>${where} · ${HEALTH_LABEL[health]} · ${escape(intentLabel)}</small>
          ${health === 'downed' ? `<small class="roster-bleed">倒地 · ${p.downedTurns >= DOWNED_LOCK_TURNS ? `可以补刀处决，${Math.max(0, BLEEDOUT_TURNS - p.downedTurns)} 回合后自己流干` : `还要等 ${DOWNED_LOCK_TURNS - p.downedTurns} 回合才能补刀`} · 可能被救起</small>` : ''}
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

  // 一次性把「现在到底发生了什么」摆出来：倒地倒计时、守尸、死追、夜幕、致盲
  const statusBits: string[] = [];
  if (state.blindTurns > 0)
    statusBits.push('<span class="status-badge blind">致盲 / 被击晕：动作被打断，下一回合少 1 点行动点</span>');
  if (state.nightfallActive)
    statusBits.push('<span class="status-badge nightfall">夜幕监视中 · 相邻房间的目标正在显形</span>');
  if (state.chaseTurns >= 2)
    statusBits.push(`<span class="status-badge chase">死追同一人 ${state.chaseTurns} 回合 · 其他幸存者效率 +${Math.round(Math.min(1, state.chaseTurns * 0.25) * 100)}%</span>`);
  if (state.guardingTurns > 0)
    statusBits.push('<span class="status-badge guard">守尸中：团队进度正在飞涨，别站着等</span>');
  state.people
    .filter((p) => p.role !== 'police' && p.hp <= 0)
    .forEach((p) => {
      statusBits.push(`<span class="status-badge downed">${escape(p.name)} 倒地 · ${p.downedTurns >= DOWNED_LOCK_TURNS ? '现在可以补刀处决' : `还要等 ${DOWNED_LOCK_TURNS - p.downedTurns} 回合才能补刀`} · 可能被同伴救起</span>`);
    });
  const statusHtml = statusBits.length ? `<div class="status-strip">${statusBits.join('')}</div>` : '';

  const atkOk = canAttack(state);
  const atkReason = attackBlockReason(state);
  const possessed = state.possessed;
  const sabotageReason = sabotageBlockReason(state);
  const sabotageTitle = sabotageReason ?? `破坏：砸掉这间屋子的道具箱 / 发电机，消耗 ${SABOTAGE_COST} 点行动点。会惊动乌鸦，把人引过来。`;
  const sabotageMeta = sabotageReason ? escape(sabotageReason) : `${SABOTAGE_COST} 点 · 砸设施`;
  const sabotageBtn = `<button class="btn sabotage ${sabotageReason ? 'spent' : ''}" data-action="sabotage" ${sabotageReason ? 'disabled' : ''}
      title="${escape(sabotageTitle)}">
      <span class="atk-name">破坏</span>
      <span class="atk-meta">${sabotageMeta}</span>
    </button>`;
  const atkTitle = possessed
    ? `恶魔附身（剩 ${state.possessTurns} 回合）：每一刀都直接把还站着的人放倒。消耗 ${ATTACK_COST} 点行动点。`
    : `挥刀：消耗 ${ATTACK_COST} 点行动点，健康→受伤→倒地；倒地后要隔 ${DOWNED_LOCK_TURNS} 回合才能补刀处决。砍完要再做一件事（或花 ${WIPE_COST} 点擦刀）才能砍第二刀。`;
  const attackBtn = `<button class="btn attack ${atkOk ? '' : 'spent'} ${possessed ? 'possessed' : ''}" data-action="attack" ${atkOk ? '' : 'disabled'}
      title="${escape(atkOk ? atkTitle : atkReason)}">
      <span class="atk-name">${possessed ? '附身 · 挥刀' : '挥刀'}</span>
      <span class="atk-meta">${atkOk ? (possessed ? `${ATTACK_COST} 点 · 一刀倒地` : `${ATTACK_COST} 点 · 砍下去`) : escape(atkReason)}</span>
    </button>`;
  const wipeReason = wipeBlockReason(state);
  const wipeBtn = `<button class="btn wipe ${wipeReason ? 'spent' : ''}" data-action="wipe" ${wipeReason ? 'disabled' : ''}
      title="${escape(wipeReason || `擦刀：原地花 ${WIPE_COST} 点行动点收回刀锋，接着就能再砍 / 处决。代价是幸存者会趁这一下行动。`)}">
      <span class="atk-name">擦刀</span>
      <span class="atk-meta">${wipeReason ? escape(wipeReason) : `${WIPE_COST} 点 · 收回刀锋`}</span>
    </button>`;
  const searchOk = state.phase === 'playing' && state.energy >= SEARCH_COST;
  const cabinetHere = CABINET_ROOMS.includes(state.playerRoom);
  const hiddenHere = state.people.some((p) => p.room === state.playerRoom && p.hidden);
  const searchBtn = `<button class="btn search" data-action="search" ${searchOk ? '' : 'disabled'}
      title="${escape(searchOk ? (cabinetHere ? `搜索这间屋子的柜子：消耗 ${SEARCH_COST} 点行动点，把藏起来的人翻出来。` : `搜索这间屋子：消耗 ${SEARCH_COST} 点行动点。`) : '行动点不足')}">
      <span class="atk-name">搜索</span>
      <span class="atk-meta">${searchOk ? (hiddenHere ? '有动静 · 翻柜子' : `${SEARCH_COST} 点 · 翻柜子`) : '行动点不足'}</span>
    </button>`;

  return `
    <div class="topbar">
      <div class="topbar-identity">
        <div class="brand">夜猎<span>档案</span></div>
        <div class="killer-chip">
          ${killerFaceHtml(killer, 'chip')}
          <span>${escape(killer.owner)} · ${escape(killer.title)}</span>
        </div>
        ${meter}
      </div>
      <div class="mission-strip ${urgent ? 'urgent' : ''}">
        <div class="mission-icon">${icon('missionTarget', 'ui-icon')}</div>
        <div class="mission-content">
          <div class="mission-title">${escape(m.title)}<em>奖励 ${m.reward}</em></div>
          <div class="mission-objective"><b>目标</b>${escape(m.objective ?? m.desc)}</div>
          <div class="mission-rules">
            <span class="mission-ok">✓ 成功：${escape(m.successText ?? '达成主目标')}</span>
            <span class="mission-fail">✕ 失败：${escape(m.failText ?? '超时或被捕')}</span>
          </div>
        </div>
        <div class="mission-meta">
          <span class="mission-progress ${objectiveDone ? 'done' : ''}">${progress}</span>
          <span class="mission-clock ${urgent ? 'hot' : ''}">剩余 <b>${left}</b> 回合</span>
          <span class="mission-team ${state.teamProgress >= TEAM_GOAL_MAX * 0.7 ? 'hot' : ''}" title="他们在${escape(state.teamGoalLabel)}；进度做满他们就集体逃走，你直接失败">他们在赶工 <b>${state.teamProgress}%</b></span>
        </div>
      </div>
    </div>

    <div class="layout">
      <div class="main-column">
        <div class="panel map-panel">
          <div class="panel-heading"><h2>房屋平面</h2><span>绿边=能走（标行动点） · 黄=障碍多1点 · 蓝框=他们的目标点 · ！动静=有人刚经过 · ？？？=没进去过</span>
            <button class="btn ghost mini" data-action="guide">玩法指引</button>
            <button class="btn ghost mini audio-toggle" data-action="mute" title="开关音效与背景音乐">${isMuted() ? '音效 关' : '音效 开'}</button>
          </div>
          ${statusHtml}
          <div class="floorplan" style="--ar:${layoutAspectNum().toFixed(4)};aspect-ratio:${layoutAspect()}">
            ${rooms}
            ${trailOverlay(state)}
            ${playerMarker}
          </div>
          <div class="map-legend">
            <span>${icon('escape', 'ui-icon tiny')} 撤离点/后院</span>
            <span>${icon('totem', 'ui-icon tiny')} 图腾</span>
            <span>${icon('cabinet', 'ui-icon tiny')} 柜子</span>
            <span>${icon('obstacle', 'ui-icon tiny')} 障碍物</span>
            <span class="legend-intent"><i class="intent-dot i-flee"></i> 逃跑中 <i class="intent-dot i-call"></i> 打电话 <i class="intent-dot i-escape"></i> 翻篱笆 <i class="intent-dot i-rescue"></i> 救援</span>
            <span class="legend-fog">？ 最后确认位置</span>
            <span class="legend-trail"><i class="legend-claw"></i> 鞋印：只看得见当前房间，跟丢了就断</span>
            <span class="legend-noise">${icon('crow', 'crow-icon tiny')} 动静：乌鸦叫 / 地板响，有人刚经过（短线索）</span>
            <span class="legend-objective">蓝框：他们的团队目标点</span>
            <span class="legend-sites">${icon('itemBox', 'ui-icon tiny')} 道具箱 ${icon('generator', 'ui-icon tiny')} 发电机：他们能用，你只能砸</span>
          </div>
        </div>

        <div class="bottom-dock">
        <div class="panel resource-bar">
          <div class="stats">
            <div class="stat"><b>${state.turn}<i>/${m.turns}</i></b><small>回合</small></div>
            <div class="stat energy" title="走路、挥刀、出牌、搜索柜子，全都从这一个池子里扣"><b>${state.energy}<i>/${state.maxEnergy}</i></b><small>行动点</small></div>
            <div class="stat alarm-stat ${state.alarm >= 70 ? 'hot' : state.alarm >= 40 ? 'warm' : ''}" title="暴露度：你的动作（挥刀、破坏、被目击、袭警、报警）会推高它，每回合自动回落；满 ${ALARM_MAX} 就会被捕，灵异鬼怪则是被符咒驱散。它和「他们的进度」是两回事。">
              <b>${state.alarm}<i>/${ALARM_MAX}</i></b>
              <div class="alarm-track"><span style="width:${state.alarm}%"></span></div>
              <small>暴露度</small>
            </div>
            <div class="stat"><b>${state.kills}</b><small>击杀</small></div>
            <div class="stat ${state.escaped > 0 ? 'escaped' : ''}" title="每逃走一人结算扣 15 分；幸存者全跑光契约作废"><b>${state.escaped}</b><small>逃走</small></div>
            <div class="stat frenzy ${state.frenzy >= FRENZY_THRESHOLD ? 'active' : ''}" title="杀戮：严格踩着脚印连续追才涨；满 ${FRENZY_THRESHOLD} 后每回合多 ${FRENZY_AP_BONUS} 点行动点，路自己走。砍中人或被击晕清零。">
              <b>${state.frenzy}<i>/${FRENZY_MAX}</i></b>
              <div class="alarm-track"><span style="width:${state.frenzy}%"></span></div>
              <small>杀戮</small>
            </div>
            <div class="stat team ${state.teamProgress >= TEAM_GOAL_MAX * 0.7 ? 'hot' : ''}" title="幸存者的团队目标：${escape(state.teamGoalLabel)}。进度做满他们集体逃走，你直接失败。">
              <b>${state.teamProgress}<i>/${TEAM_GOAL_MAX}</i></b>
              <div class="alarm-track"><span style="width:${state.teamProgress}%"></span></div>
              <small>他们的进度</small>
            </div>
            <div class="stat score"><b>${currentScore(state)}</b><small>预计得分</small></div>
          </div>
        </div>

        <div class="panel hand">
          <div class="hand-actions">
            ${attackBtn}
            ${wipeBtn}
            ${searchBtn}
            ${sabotageBtn}
            <div class="power-row">${powerButtonHtml(state, killer)}</div>
            <button class="btn primary end-turn" data-action="end-turn">结束回合</button>
            <button class="btn ghost" data-action="give-up">放弃任务</button>
          </div>
          <div class="hand-row">${hand || '<div style="color:var(--muted);font-size:13px">手牌已空，结束回合重新抽牌。</div>'}</div>
        </div>
        </div>
      </div>

      <div class="side-column">
        <div class="panel">
          <h2>信息面板</h2>
          <div id="cardDetail" class="detail-wrap">${defaultDetailHtml()}</div>
        </div>
        <div class="panel roster-panel">
          <div class="panel-heading"><h2>在场人物</h2><span>${here.length} 人在你的房间${policeHere ? ' · 警察也在' : ''}</span></div>
          <div class="roster">${roster || '<div class="roster-empty">还没有确认任何人的位置。走进房间，或者用侦查卡。</div>'}</div>
          ${unknownCount > 0 ? `<div class="roster-unknown">还有 ${unknownCount} 个人没有被确认</div>` : ''}
        </div>
        <div class="panel facility-panel">
          <div class="panel-heading"><h2>现场设施</h2><span>他们能用 · 你只能砸</span></div>
          <div class="facility-list">
            ${state.siteItems.map((i) => {
              const status = i.kind === 'itemBox'
                ? i.broken ? '已被砸烂 · 不再发道具' : `还能翻 ${i.charges} 件道具`
                : i.jammedTurns > 0 ? `停机 ${i.jammedTurns} 回合` : i.charged ? '已通电 · 进度已计入' : `修复 ${i.progress}%`;
              const cls = i.broken ? 'broken' : i.jammedTurns > 0 ? 'jammed' : '';
              const canSmash = i.room === state.playerRoom && !i.broken && (i.kind === 'itemBox' ? i.charges > 0 : true) && !sabotageReason;
              return `<div class="facility-row ${i.kind} ${cls}">
                <img class="facility-icon" src="${uiIcon(i.kind === 'itemBox' ? 'itemBox' : 'generator')}" alt="" onerror="this.style.display='none'">
                <div class="facility-info"><b>${SITE_ITEM_LABEL[i.kind]}</b><small>${escape(roomName(i.room))} · ${status}</small></div>
                ${canSmash ? `<button class="btn mini" data-action="sabotage" title="花 ${SABOTAGE_COST} 点行动点砸掉">砸掉</button>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="panel threat-panel">
          <div class="panel-heading"><h2>威胁</h2><span>他们正在做什么 · 怎么反制</span></div>
          ${threatRowsHtml(state)}
        </div>
        <div class="panel">
          <h2>行动日志</h2>
          <div class="log">${state.log.slice(0, 10).map((line) => `<div>${escape(line)}</div>`).join('')}</div>
        </div>
      </div>
    </div>
  `;
}

/** newCard：本局新解锁的卡牌 id（已解锁过的不会再重复提示）。 */
export function renderResult(state: GameState, newCard: string | null): string {
  const labels: Record<string, string> = {
    win: '任务完成', caught: '被警察抓捕', timeout: '任务超时', failed: '任务失败',
  };
  const stars = getStars(state.score);
  const win = state.result === 'win';
  const rank = win ? (state.score >= 260 ? 'S' : state.score >= 190 ? 'A' : 'B') : '—';
  const earned = win ? Math.max(10, Math.round(state.score / 5)) : 0;
  const darkCells = win && state.score >= 150 ? 1 : 0;
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
        <div class="score-breakdown">${breakdown}</div>
        ${newCard ? `<p style="color:var(--gold)">新卡牌解锁：<b>${escape(CARD_MAP[newCard]?.name ?? newCard)}</b></p>` : ''}
        ${earned ? `<p style="color:var(--gold)">${icon('bloodPoint', 'ui-icon tiny')} 获得血点：<b>+${earned}</b></p>` : ''}
        ${darkCells ? `<p style="color:var(--gold)">${icon('darkCell', 'ui-icon tiny')} 获得暗金细胞：<b>+${darkCells}</b></p>` : ''}
        <div class="actions">
          <button class="btn primary" data-action="again">再来一局</button>
          <button class="btn" data-action="menu">返回主菜单</button>
        </div>
      </div>
    </div>
  `;
}
