import { CARDS, CARD_MAP } from '../game/cards';
import {
  PERK_RARITY_BG,
  POWER_RARITY_BG,
  cardImage,
  characterImage,
  uiIcon,
} from '../game/assetMap';
import { canEnterPossession, canMoveTo, canUseKillerAbility, effectiveCost, getStars } from '../game/engine';
import { KILLERS, type KillerProfile } from '../game/killers';
import { roomName } from '../game/missions';
import {
  CABINET_ROOMS,
  EXIT_ROOM,
  OBSTACLE_ROOMS,
  ROOM_MAP,
  ROOMS,
  TOTEM_ROOMS,
} from '../game/rooms';
import { getPersonProfile, type PersonProfile } from '../game/people';
import type { GameState, Person, RoomId, SaveData } from '../game/types';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const TYPE_NAMES: Record<string, string> = { attack: '攻击', skill: '技能', tactic: '战术', setup: '布局' };
const TYPE_RARITY: Record<string, string> = { attack: 'visceral', skill: 'very-rare', tactic: 'rare', setup: 'uncommon' };

const icon = (name: Parameters<typeof uiIcon>[0], cls = 'ui-icon') =>
  `<img class="${cls}" src="${uiIcon(name)}" alt="" aria-hidden="true">`;

function detailCardHtml(
  title: string,
  subtitle: string,
  rarityLabel: string,
  paragraphs: string[],
  rarityKey = 'common',
  leadingHtml = '',
): string {
  return `
    <article class="detail-card">
      <header class="detail-header" data-rarity="${rarityKey}">
        <div>
          <h2>${escape(title)}</h2>
          <p>${escape(subtitle)}</p>
        </div>
        <span class="rarity-label">${escape(rarityLabel)}</span>
      </header>
      <div class="detail-body">
        ${leadingHtml}
        ${paragraphs.map((p) => `<p>${escape(p)}</p>`).join('')}
      </div>
    </article>
  `;
}

function perkIconHtml(defId: string, size = ''): string {
  return `
    <div class="dbd-perk ${size}">
      <img class="dbd-perk-bg" src="${PERK_RARITY_BG}" alt="" onerror="this.style.display='none'">
      ${cardImage(defId) ? `<img class="dbd-perk-glyph" src="${cardImage(defId)}" alt="" onerror="this.style.display='none'">` : ''}
    </div>
  `;
}

function powerIconHtml(killer: KillerProfile): string {
  return `
    <div class="dbd-power">
      <img class="dbd-power-bg" src="${POWER_RARITY_BG}" alt="" onerror="this.style.display='none'">
      <img class="dbd-power-glyph" src="${killer.icon}" alt="" onerror="this.style.display='none'">
    </div>
  `;
}

function killerPortraitHtml(killer: KillerProfile): string {
  if (!killer.portrait) return '';
  return `<img class="killer-portrait" src="${killer.portrait}" alt="${escape(killer.owner)}立绘" onerror="this.style.display='none'">`;
}

export function getKiller(owner?: string): KillerProfile {
  return KILLERS.find((k) => k.owner === owner) ?? KILLERS[0];
}

export function defaultDetailHtml(): string {
  return detailCardHtml('信息面板', '悬停卡牌或点击人物查看资料', '档案', [
    '点击手牌查看卡牌的完整效果；点击房间中的头像查看人物档案与立绘。',
    '攻击只能依靠卡牌。人物会警觉、躲避和逃跑，先布局再下手。',
    '每回合可使用一次杀手能力；移动、出牌都受能量和步数限制。',
  ]);
}

export function cardDetailHtml(state: GameState, cardUid: string): string {
  const card = state.hand.find((c) => c.uid === cardUid);
  if (!card) return defaultDetailHtml();
  const def = CARD_MAP[card.defId];
  if (!def) return defaultDetailHtml();
  const cost = effectiveCost(card.defId, state);
  return detailCardHtml(
    def.name,
    `费用 ${cost} / ${TYPE_NAMES[def.type] ?? def.type} / 原创机制${def.sourceSkill ? ` · 图标原型 ${def.sourceSkill}` : ''}`,
    TYPE_NAMES[def.type] ?? def.type,
    [def.desc, def.flavor, '注：卡牌名称、描述与效果均为本项目原创，技能名仅作图标来源标注。'],
    TYPE_RARITY[def.type] ?? 'rare',
    perkIconHtml(def.id),
  );
}

function personChip(person: Person): string {
  const cls =
    person.role === 'police'
      ? 'police'
      : person.role === 'target'
        ? person.marked
          ? 'marked'
          : 'target'
        : 'civilian';
  const img = characterImage(person.id);
  const alertMark = person.alert >= 70 ? '<span class="chip-alert high">!</span>' : person.alert >= 35 ? '<span class="chip-alert">?</span>' : '';
  return `<button type="button" class="person-chip ${cls}" data-action="person" data-person-id="${person.id}"
    title="${escape(person.name)} · 生命 ${person.hp} · 警觉 ${person.alert}/100 · 正在${escape(person.activity)} · 点击查看档案">
    ${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}
    <span>${escape(person.name)}</span>${alertMark}
  </button>`;
}

function personPortraitHtml(profile: PersonProfile): string {
  const img = profile.portrait
    ? `<img class="person-detail-img" src="${profile.portrait}" alt="${escape(profile.name)}立绘"
        onerror="this.style.display='none'">`
    : '';
  return `
    <div class="person-detail-portrait">
      <div class="portrait-silhouette" aria-hidden="true">
        <svg viewBox="0 0 100 120">
          <circle cx="50" cy="37" r="20" fill="#3b3f48" />
          <path d="M10 120 C10 83 27 66 50 66 C73 66 90 83 90 120 Z" fill="#3b3f48" />
        </svg>
      </div>
      ${img}
    </div>
  `;
}

export function personDetailHtml(state: GameState, personId: string): string {
  const person = state.people.find((p) => p.id === personId);
  const profile = getPersonProfile(personId, person?.role);
  const roleName = profile.role === 'police' ? '警察' : profile.role === 'target' ? '目标' : '平民';
  const rarityKey = profile.role === 'police' ? 'rare' : profile.role === 'target' ? 'visceral' : 'common';
  const rarityLabel = person?.marked ? '标记目标' : roleName;
  const status = person
    ? `当前位置：${roomName(person.room)} · 生命 ${person.hp} · 警觉 ${person.alert}/100 · 正在${person.activity}${person.marked ? ' · 已被标记' : ''}`
    : '档案状态：已从现场消失。';
  return detailCardHtml(
    profile.name,
    `${roleName} / ${profile.occupation} / ${profile.age} 岁 · ${profile.tags.join(' · ')}`,
    rarityLabel,
    [...profile.bio, `习惯：${profile.habit}`, `秘密：${profile.secret}`, status],
    rarityKey,
    `<div class="person-detail-lead">${personPortraitHtml(profile)}</div>`,
  );
}

export function renderMenu(save: SaveData): string {
  const killer = getKiller(save.killer);
  const picker = KILLERS.map((k) => {
    const unlocked = save.unlockedKillers.includes(k.owner);
    return `<button class="killer-choice ${k.owner === killer.owner ? 'selected' : ''} ${unlocked ? '' : 'locked'}"
      data-action="${unlocked ? 'killer' : 'unlock-killer'}" data-owner="${escape(k.owner)}">
      ${k.portrait ? `<img src="${k.portrait}" alt="">` : `<img src="${k.icon}" alt="">`}
      <span>${escape(k.owner)}</span>
      ${unlocked ? '' : `<em>${icon('darkCell', 'ui-icon tiny')} 2</em>`}
    </button>`;
  }).join('');

  return `
    <div class="overlay menu-overlay">
      <div class="modal menu-modal">
        <div class="menu-hero">
          <div>
            <div class="subtitle">A SOLO DECKBUILDING HUNT</div>
            <h1>夜猎<span>档案</span></h1>
            <p class="hero-copy">你不是逃脱者。你是那扇门后不该存在的东西——<br>接下契约，布置现场，然后在警察赶到前完成它。</p>
            <div class="resource-bar">
              <span>${icon('bloodPoint')} <b>${save.credits}</b> 血点</span>
              <span>${icon('darkCell')} <b>${save.darkCells}</b> 暗金细胞</span>
              <span>${icon('shard')} 荧光裂片 <small>后续开放</small></span>
            </div>
          </div>
          <div class="menu-mission">
            ${icon('mission', 'ui-icon large')}
            <div><small>本局流程</small><b>接取契约 → 潜入布局 → 猎杀撤离</b></div>
            <p>布局牌在行动阶段打出。完成任务获得血点与暗金细胞。</p>
          </div>
        </div>

        <div class="section-title">选择你的怪物 <small>力量图标取自图鉴 · 全部游戏机制原创</small></div>
        <div class="killer-picker">${picker}</div>
        <div class="detail-wrap">${detailCardHtml(
          killer.mechanic.name,
          `${killer.owner} · ${killer.title} / ${killer.school === 'supernatural' ? '灵异系' : '现实系'}`,
          '力量',
          [killer.mechanic.short, ...killer.mechanic.detail, killer.sourceNote],
          'common',
          `<div class="killer-detail-lead">${killerPortraitHtml(killer)}${powerIconHtml(killer)}</div>`,
        )}</div>

        <div class="menu-stats">
          <div><small>历史最高分</small><b>${save.bestScore}</b></div>
          <div><small>完成任务数</small><b>${save.wins}</b></div>
          <div><small>当前牌组</small><b>${save.deck.length} 张</b></div>
          <div><small>已解锁卡牌</small><b>${save.unlockedCards.length} / ${CARDS.length}</b></div>
        </div>
        <div class="actions">
          <button class="btn primary" data-action="start">开始任务</button>
          <button class="btn" data-action="deck">编辑牌组</button>
          <button class="btn" data-action="shop">卡牌商店</button>
          <button class="btn ghost" data-action="guide">玩法指引</button>
        </div>
      </div>
    </div>
  `;
}

export function renderGuide(): string {
  return `
    <div class="overlay">
      <div class="modal guide-modal">
        <div class="subtitle">FIELD MANUAL</div>
        <h1>玩法<span>指引</span></h1>
        <div class="guide-grid">
          <div class="guide-card">${icon('mission')}<b>1 · 接取契约</b><p>每局随机获得任务。主目标旁会显示${icon('missionTarget', 'ui-icon tiny')}标记，告诉你要击杀谁、需要多少证据或仪式进度。</p></div>
          <div class="guide-card">${icon('darkCell')}<b>2 · 现场布局</b><p>布局牌（绿色）和别的卡牌一样在行动阶段打出：剪断电话线、引开注意、安装窃听、拉闸断电。布局也能成为牌组的一部分。</p></div>
          <div class="guide-card">${icon('escape')}<b>3 · 追踪与猎杀</b><p>点击亮起的相邻房间移动（发光的门就是通道）。点击人物查看${icon('missionTarget', 'ui-icon tiny')}档案。NPC 会警觉、躲避、逃跑，先用潜行或布局降低警觉，再用攻击卡下手。</p></div>
          <div class="guide-card">${icon('bloodPoint')}<b>4 · 卡牌与评分</b><p>手牌每张都有费用，每回合恢复 3 能量与 2 步数。悬停卡牌查看完整效果。胜利按评分发放血点，可去商店买卡。</p></div>
        </div>
        <div class="guide-note">${icon('totem', 'ui-icon tiny')} 图腾房间：在此结束回合，下回合 +1 能量。 ${icon('cabinet', 'ui-icon tiny')} 柜子房间：藏身者不会被引诱类卡牌锁定。 ${icon('obstacle', 'ui-icon tiny')} 障碍房间：需要「破门而入」或恶魔附身才能进入。</div>
        <div class="actions"><button class="btn primary" data-action="guide-close">知道了</button></div>
      </div>
    </div>
  `;
}

export function shopPrice(cardCost: number): number {
  return 20 + cardCost * 15;
}

export function renderShop(save: SaveData): string {
  const rows = CARDS.filter((card) => !save.unlockedCards.includes(card.id))
    .map((card) => {
      const price = shopPrice(card.cost);
      return `
        <div class="shop-row">
          ${perkIconHtml(card.id, 'compact')}
          <div class="shop-info">
            <b>${escape(card.name)} <span style="color:var(--accent)">${card.cost}</span></b>
            <small>${escape(card.desc)}${card.sourceSkill ? ` · 图标原型 ${escape(card.sourceSkill)}` : ''}</small>
          </div>
          <button class="btn primary" data-action="buy" data-id="${card.id}" ${save.credits < price ? 'disabled' : ''}>${icon('bloodPoint', 'ui-icon tiny')} ${price}</button>
        </div>
      `;
    })
    .join('');

  return `
    <div class="overlay">
      <div class="modal">
        <div class="subtitle">BLACK MARKET</div>
        <h1>卡牌<span>商店</span></h1>
        <p>完成任务可获得血点。购买后卡牌永久解锁。当前血点：<b style="color:var(--gold)">${save.credits}</b></p>
        <div class="shop-list">${rows || '<p style="color:var(--muted)">所有卡牌都已解锁。</p>'}</div>
        <div class="actions"><button class="btn ghost" data-action="shop-back">返回主菜单</button></div>
      </div>
    </div>
  `;
}

export function renderDeckEditor(deck: string[], unlocked: string[]): string {
  const counts: Record<string, number> = {};
  deck.forEach((id) => (counts[id] = (counts[id] ?? 0) + 1));

  const rows = CARDS.map((card) => {
    const count = counts[card.id] ?? 0;
    const isUnlocked = unlocked.includes(card.id);
    return `
      <div class="deck-row ${isUnlocked ? '' : 'locked'}">
        ${perkIconHtml(card.id, 'compact')}
        <div class="deck-row-info">
          <b>${escape(card.name)} <span style="color:var(--accent)">${card.cost}</span></b>
          <small>${isUnlocked ? escape(card.desc) : '未解锁 · 可在商店购买'}${card.sourceSkill ? `<br><span class="source-skill">图标原型：${escape(card.sourceSkill)} · 效果原创</span>` : ''}</small>
        </div>
        <div class="counter">
          <button data-action="deck-remove" data-id="${card.id}" ${count === 0 ? 'disabled' : ''}>−</button>
          <span>${count}</span>
          <button data-action="deck-add" data-id="${card.id}" ${!isUnlocked || count >= 3 || deck.length >= 15 ? 'disabled' : ''}>＋</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="overlay">
      <div class="modal deck-modal">
        <button class="btn back-top" data-action="deck-cancel">← 返回主菜单</button>
        <h1>牌组<span>构筑</span></h1>
        <p>牌组需要 10–15 张牌，同一种卡牌最多 3 张。点击加减号调整，保存后才会生效。</p>
        <div class="deck-list">${rows}</div>
        <div class="actions">
          <button class="btn primary" data-action="deck-save" ${deck.length < 10 || deck.length > 15 ? 'disabled' : ''}>保存并返回（${deck.length} 张）</button>
          <button class="btn ghost" data-action="deck-cancel">取消</button>
        </div>
      </div>
    </div>
  `;
}

function roomFeatures(roomId: RoomId): string {
  const parts: string[] = [];
  if (roomId === EXIT_ROOM) parts.push(`<span class="room-feature escape" title="逃生点：任务完成的撤离位置">${icon('escape', 'ui-icon tiny')}</span>`);
  if (TOTEM_ROOMS.includes(roomId)) parts.push(`<span class="room-feature totem" title="图腾：在此结束回合，下回合 +1 能量">${icon('totem', 'ui-icon tiny')}</span>`);
  if (CABINET_ROOMS.includes(roomId)) parts.push(`<span class="room-feature cabinet" title="柜子：藏身者不会被引诱类卡牌锁定">${icon('cabinet', 'ui-icon tiny')}</span>`);
  if (OBSTACLE_ROOMS.includes(roomId)) parts.push(`<span class="room-feature obstacle" title="障碍物：需破门或恶魔附身才能进入">${icon('obstacle', 'ui-icon tiny')}</span>`);
  return parts.join('');
}

export function renderGame(state: GameState, killer: KillerProfile): string {
  const m = state.mission;
  const here = state.people.filter((p) => p.room === state.playerRoom);
  const isStalker = killer.mechanic.id === 'stalker';
  const abilityDisabled = !canUseKillerAbility(state);
  const abilityLabel = state.possessed ? '恶魔附身 · 处决' : `杀手能力 · ${killer.mechanic.name}`;

  const rooms = ROOMS.map((room) => {
    const people = state.people.filter((p) => p.room === room.id && p.role !== 'police');
    const police = state.people.find((p) => p.room === room.id && p.role === 'police');
    const isPlayer = state.playerRoom === room.id;
    const reachable = canMoveTo(state, room.id);
    const locked = state.lockedRooms.includes(room.id);
    const r = room.rect;
    const style = `left:${r.left}%;top:${r.top}%;width:${r.width}%;height:${r.height}%`;
    const doors = room.neighbors
      .map((nid) => {
        const nr = ROOM_MAP[nid].rect;
        const dx = nr.left + nr.width / 2 - (r.left + r.width / 2);
        const dy = nr.top + nr.height / 2 - (r.top + r.height / 2);
        let side: 'top' | 'bottom' | 'left' | 'right';
        let p = 50;
        if (Math.abs(dx) > Math.abs(dy)) {
          side = dx > 0 ? 'right' : 'left';
          const top = Math.max(r.top, nr.top);
          const bottom = Math.min(r.top + r.height, nr.top + nr.height);
          if (bottom > top) p = (((top + bottom) / 2 - r.top) / r.height) * 100;
        } else {
          side = dy > 0 ? 'bottom' : 'top';
          const left = Math.max(r.left, nr.left);
          const right = Math.min(r.left + r.width, nr.left + nr.width);
          if (right > left) p = (((left + right) / 2 - r.left) / r.width) * 100;
        }
        return `<span class="door door-${side}" style="--door-p:${Math.max(8, Math.min(92, p)).toFixed(1)}%" aria-hidden="true"></span>`;
      })
      .join('');
    return `
      <div class="room ${isPlayer ? 'current' : ''} ${reachable ? 'reachable' : 'disabled'} ${room.id === 'garden' ? 'outdoor' : ''}"
        role="button" tabindex="${reachable ? 0 : -1}" style="${style}"
        data-action="move" data-room="${room.id}" title="${escape(room.desc)}">
        ${doors}
        <div class="room-head">
          <span class="room-name">${escape(room.name)}</span>
          ${isPlayer ? '<span class="room-tag">你在</span>' : locked ? '<span class="room-tag">封锁</span>' : ''}
        </div>
        <div class="room-desc">${escape(room.desc)}</div>
        <div class="room-features">${roomFeatures(room.id)}</div>
        <div class="room-people">
          ${people.map(personChip).join('')}
          ${police ? personChip(police) : ''}
        </div>
      </div>
    `;
  }).join('');

  const currentRect = ROOM_MAP[state.playerRoom].rect;
  const markerStyle = `left:${currentRect.left + currentRect.width / 2}%;top:${currentRect.top + currentRect.height / 2}%`;
  const playerMarker = `
    <div class="player-marker" style="${markerStyle}" title="你在这里：${escape(killer.owner)}">
      ${killer.portrait ? `<img src="${killer.portrait}" alt="">` : `<img src="${killer.icon}" alt="">`}
      <span>你</span>
    </div>
  `;

  const hand = state.hand
    .map((card) => {
      const def = CARD_MAP[card.defId];
      const cost = effectiveCost(card.defId, state);
      const disabled = cost > state.energy;
      return `
        <button class="card ${def.type}" data-action="play" data-uid="${card.uid}" data-card-uid="${card.uid}" ${disabled ? 'disabled' : ''}>
          <span class="card-cost">${cost}</span>
          ${perkIconHtml(def.id)}
          <div class="card-name">${escape(def.name)}</div>
          <div class="card-desc">${escape(def.desc)}</div>
          <div class="card-flavor">${escape(def.flavor)}</div>
        </button>
      `;
    })
    .join('');

  const roster = state.people
    .filter((p) => p.role !== 'police')
    .map((p) => {
      const profile = getPersonProfile(p.id, p.role);
      const img = characterImage(p.id);
      const alertLabel = p.alert >= 70
        ? '<em class="alert-tag high">警觉</em>'
        : p.alert >= 35 ? '<em class="alert-tag">留意</em>' : '';
      return `<button class="roster-person ${p.room === state.playerRoom ? 'here' : ''} ${p.marked ? 'marked' : ''}"
        data-action="person" data-person-id="${p.id}" title="点击查看档案">
        ${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}
        <span><b>${escape(p.name)} ${alertLabel}</b><small>${roomName(p.room)} · ${p.hp} HP · ${escape(p.activity)}</small></span>
      </button>`;
    })
    .join('');

  const meter = isStalker
    ? `<div class="stalk-meter ${state.possessed ? 'active' : ''}">
        <div class="stalk-label"><span>${state.possessed ? '恶魔附身中' : '尾随值'}</span><b>${state.stalkMeter}/100</b></div>
        <div class="stalk-track"><div class="stalk-fill" style="width:${state.stalkMeter}%"></div></div>
        ${canEnterPossession(state) ? '<button class="btn primary possess" data-action="possess">进入恶魔附身</button>' : ''}
      </div>`
    : '';

  return `
    <div class="topbar">
      <div class="topbar-identity">
        <div class="brand">夜猎<span>档案</span> <small>${icon('mission', 'ui-icon tiny')} ${escape(m.title)}</small></div>
        <div class="killer-chip">
          ${killer.portrait ? `<img src="${killer.portrait}" alt="">` : `<img src="${killer.icon}" alt="">`}
          <span>${escape(killer.owner)} · ${escape(killer.title)}</span>
        </div>
        ${meter}
      </div>
      <div class="stats">
        <div class="stat"><b>${state.turn}/${m.turns}</b><small>回合</small></div>
        <div class="stat energy"><b>${state.energy}/${state.maxEnergy}</b><small>能量</small></div>
        <div class="stat"><b>${state.steps}</b><small>步数</small></div>
        <div class="stat wanted"><b>${state.wanted}/10</b><small>通缉值</small></div>
        <div class="stat"><b>${state.kills}</b><small>击杀</small></div>
        <div class="stat score"><b>${state.score}</b><small>当前分</small></div>
      </div>
    </div>

    <div class="layout">
      <div class="main-column">
        <div class="panel mission-panel">
          <div class="mission-icon">${icon('missionTarget', 'ui-icon large')}</div>
          <div class="mission-content">
            <div class="mission-title">${escape(m.title)}</div>
            <div class="mission-desc">${escape(m.desc)}</div>
            <div class="mission-meta">
              <span>奖励 ${m.reward}</span><span>标记击杀 ${state.markedKilled}</span><span>证据 ${state.evidence}</span>
              ${m.kind === 'ritual' ? `<span>仪式 ${state.ritualStreak}/${m.targetCount ?? 2}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="panel map-panel">
          <div class="panel-heading"><h2>房屋平面</h2><span>点击亮起的房间移动 · 发光的长条是门 · 人物会警觉和逃跑</span>
            <button class="btn ghost mini" data-action="guide">玩法指引</button>
          </div>
          <div class="floorplan">
            <div class="house-wall" aria-hidden="true"></div>
            ${rooms}
            ${playerMarker}
          </div>
          <div class="map-legend">
            <span>${icon('escape', 'ui-icon tiny')} 逃生点</span>
            <span>${icon('totem', 'ui-icon tiny')} 图腾</span>
            <span>${icon('cabinet', 'ui-icon tiny')} 柜子</span>
            <span>${icon('obstacle', 'ui-icon tiny')} 障碍物</span>
          </div>
        </div>

        <div class="panel hand">
          <div class="panel-heading"><h2>手牌</h2><span>悬停查看完整效果 · 点击打出</span></div>
          <div class="hand-actions">
            <button class="btn ability" data-action="ability" ${abilityDisabled ? 'disabled' : ''}
              title="${escape(killer.mechanic.short)}">${escape(abilityLabel)}</button>
            <small class="ability-hint">${escape(killer.mechanic.short)}</small>
            <button class="btn primary" data-action="end-turn">结束回合</button>
            <button class="btn ghost" data-action="give-up">放弃任务</button>
          </div>
          <div class="hand-row">${hand || '<div style="color:var(--muted);font-size:13px">手牌已空，结束回合重新抽牌。</div>'}</div>
        </div>
      </div>

      <div class="side-column">
        <div class="panel roster-panel">
          <div class="panel-heading"><h2>在场人物</h2><span>${here.length} 人在你的房间</span></div>
          <div class="roster">${roster}</div>
        </div>
        <div class="panel">
          <h2>信息面板</h2>
          <div id="cardDetail" class="detail-wrap">${defaultDetailHtml()}</div>
        </div>
        <div class="panel">
          <h2>行动日志</h2>
          <div class="log">${state.log.map((line) => `<div>${escape(line)}</div>`).join('')}</div>
        </div>
      </div>
    </div>
  `;
}

export function renderResult(state: GameState): string {
  const labels: Record<string, string> = {
    win: '任务完成', caught: '被警察抓捕', timeout: '任务超时', failed: '任务失败',
  };
  const stars = getStars(state.score);
  const reward = state.rewardCards[0] ? CARD_MAP[state.rewardCards[0]]?.name : null;
  const earned = state.result === 'win' ? Math.max(10, Math.round(state.score / 5)) : 0;
  const darkCells = state.result === 'win' && state.score >= 150 ? 1 : 0;
  return `
    <div class="overlay">
      <div class="modal result-modal">
        <div class="subtitle">CONTRACT REPORT</div>
        <h1>${labels[state.result ?? 'failed']}</h1>
        <div class="result-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <div class="result-grid">
          <div><small>最终评分</small><b>${state.score}</b></div>
          <div><small>击杀人数</small><b>${state.kills}</b></div>
          <div><small>剩余回合</small><b>${Math.max(0, state.mission.turns - state.turn)}</b></div>
          <div><small>最终通缉值</small><b>${state.wanted}/10</b></div>
        </div>
        <div class="bonus-row">
          <span>${icon('bonusBrutal')} 凶残 +${state.kills * 10}</span>
          <span>${icon('bonusHunt')} 捕猎 +${state.markedKilled * 15}</span>
          <span>${icon('bonusCunning')} 阴险 +${Math.max(0, 10 - state.wanted) * 2}</span>
        </div>
        ${reward ? `<p style="color:var(--gold)">新卡牌解锁：<b>${escape(reward)}</b></p>` : ''}
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
