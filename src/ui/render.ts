import { CARDS, CARD_MAP } from '../game/cards';
import { PERK_RARITY_BG, POWER_RARITY_BG, cardImage, characterImage } from '../game/assetMap';
import { canMoveTo, effectiveCost, getStars } from '../game/engine';
import { KILLERS, type KillerProfile } from '../game/killers';
import { roomName } from '../game/missions';
import { getPersonProfile, type PersonProfile } from '../game/people';
import { ROOM_MAP, ROOMS } from '../game/rooms';
import { SETUP_MAP } from '../game/setupCards';
import type { GameState, Person, SaveData } from '../game/types';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const TYPE_NAMES: Record<string, string> = {
  attack: '攻击',
  skill: '技能',
  tactic: '战术',
};

const TYPE_RARITY: Record<string, string> = {
  attack: 'visceral',
  skill: 'very-rare',
  tactic: 'rare',
};

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

function perkIconHtml(defId: string): string {
  const src = cardImage(defId);
  return `
    <div class="dbd-perk">
      <img class="dbd-perk-bg" src="${PERK_RARITY_BG}" alt="" onerror="this.style.display='none'">
      ${src ? `<img class="dbd-perk-glyph" src="${src}" alt="" onerror="this.style.display='none'">` : ''}
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
  return detailCardHtml('信息面板', '悬停卡牌或点击人物查看资料', '资料', [
    '将鼠标移到手牌上，这里会显示卡牌名称、费用、类型与完整效果。',
    '点击房间里的人物标记，可以查看他的档案、立绘与当前状态。',
    '面板样式参考图鉴站的信息面板：稀有度渐变标题栏 + 正文说明。',
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
    [def.desc, def.flavor, '注：卡牌名称、描述与效果均为本项目原创，图中技能名仅作图标来源标注。'],
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
  const portrait = img
    ? `<img class="person-portrait" src="${img}" alt="" onerror="this.style.display='none'">`
    : '';
  const badge = person.role === 'police' ? '警' : person.marked ? '标' : person.role === 'target' ? '目' : '民';
  return `<span class="person-chip ${cls}" role="button" tabindex="0" data-action="person" data-person-id="${person.id}"
    title="点击查看 ${escape(person.name)} 的档案 · 生命 ${person.hp}">${portrait}${badge}${escape(person.name)}</span>`;
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
          <defs>
            <linearGradient id="personSilhouette" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#535965" />
              <stop offset="1" stop-color="#202329" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="37" r="20" fill="url(#personSilhouette)" />
          <path d="M10 120 C10 83 27 66 50 66 C73 66 90 83 90 120 Z" fill="url(#personSilhouette)" />
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
    ? `当前位置：${roomName(person.room)} · 生命 ${person.hp}${person.marked ? ' · 已被标记' : ''}`
    : '档案状态：已从现场消失。';
  return detailCardHtml(
    profile.name,
    `${roleName} / ${profile.occupation} / ${profile.age} 岁 · ${profile.tags.join(' · ')}`,
    rarityLabel,
    [...profile.bio, `习惯：${profile.habit}`, `秘密：${profile.secret}`, status],
    rarityKey,
    personPortraitHtml(profile),
  );
}

export function renderMenu(save: SaveData): string {
  const killer = getKiller(save.killer);
  const picker = KILLERS.map(
    (k) => `<button class="btn ${k.owner === killer.owner ? 'primary' : ''}" data-action="killer" data-owner="${escape(k.owner)}">${escape(k.owner)}</button>`,
  ).join('');

  return `
    <div class="overlay">
      <div class="modal">
        <div class="subtitle">A SOLO DECKBUILDING HUNT</div>
        <h1>夜猎<span>档案</span></h1>
        <p>你是这座城市里最安静的猎手。每局开始会随机接到一份契约：清除名单、销毁证据、完成仪式，或在警察赶到前脱身。</p>
        <p>俯视地图中点击相邻房间移动；每张卡牌都有能量费用，每回合能量和步数都会恢复。任务完成得越漂亮，评分越高，并解锁新的卡牌。</p>

        <h2 style="margin:18px 0 8px;font-size:14px;color:var(--muted)">杀手档案 · 图标与力量名取自图鉴，游戏机制全部原创</h2>
        <div class="killer-picker">${picker}</div>
        <div class="detail-wrap">${detailCardHtml(
          killer.mechanic.name,
          `${killer.owner} · ${killer.title} / 原创机制`,
          '力量',
          [killer.mechanic.short, ...killer.mechanic.detail, killer.sourceNote],
          'common',
          `<div class="killer-detail-lead">${killerPortraitHtml(killer)}${powerIconHtml(killer)}</div>`,
        )}</div>

        <div class="result-grid">
          <div><small>历史最高分</small><b>${save.bestScore}</b></div>
          <div><small>完成任务数</small><b>${save.wins}</b></div>
          <div><small>当前牌组</small><b>${save.deck.length} 张</b></div>
          <div><small>已解锁卡牌</small><b>${save.unlockedCards.length} / ${CARDS.length}</b></div>
          <div><small>积分</small><b style="color:var(--gold)">${save.credits}</b></div>
        </div>
        <div class="actions">
          <button class="btn primary" data-action="start">开始任务</button>
          <button class="btn" data-action="deck">编辑牌组</button>
          <button class="btn" data-action="shop">卡牌商店</button>
        </div>
      </div>
    </div>
  `;
}

export function renderSetup(state: GameState, killer: KillerProfile): string {
  const m = state.mission;
  const cards = state.setupHand
    .map((id) => {
      const def = SETUP_MAP[id];
      if (!def) return '';
      const disabled = def.cost > state.setupPoints;
      return `
        <button class="setup-card ${def.school}" data-action="setup-play" data-setup-id="${id}" ${disabled ? 'disabled' : ''}>
          <span class="setup-cost">${def.cost}</span>
          <div class="setup-name">${escape(def.name)}</div>
          <div class="setup-desc">${escape(def.desc)}</div>
          <div class="setup-flavor">${escape(def.flavor)}</div>
        </button>
      `;
    })
    .join('');

  return `
    <div class="overlay">
      <div class="modal">
        <div class="subtitle">PREPARATION PHASE</div>
        <h1>布局<span>阶段</span></h1>
        <p>契约：${escape(m.title)} —— ${escape(m.desc)}</p>
        <p>你扮演 ${escape(killer.owner)}（${killer.school === 'supernatural' ? '灵异系' : '现实系'}）。原创机制「${escape(killer.mechanic.name)}」：${escape(killer.mechanic.short)}</p>
        <div class="setup-points">剩余布局点：<b>${state.setupPoints}</b></div>
        <div class="setup-row">${cards || '<p style="color:var(--muted)">布局牌已用完。</p>'}</div>
        <div class="actions">
          <button class="btn primary" data-action="begin">开始行动</button>
        </div>
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
          <div class="deck-icon">${perkIconHtml(card.id)}</div>
          <div class="shop-info">
            <b>${escape(card.name)} <span style="color:var(--accent)">${card.cost}</span></b>
            <small>${escape(card.desc)}${card.sourceSkill ? ` · 图标原型 ${escape(card.sourceSkill)}` : ''}</small>
          </div>
          <button class="btn primary" data-action="buy" data-id="${card.id}" ${save.credits < price ? 'disabled' : ''}>购买 ${price}</button>
        </div>
      `;
    })
    .join('');

  return `
    <div class="overlay">
      <div class="modal">
        <div class="subtitle">BLACK MARKET</div>
        <h1>卡牌<span>商店</span></h1>
        <p>完成任务可获得积分。购买后卡牌永久解锁，可加入牌组。当前积分：<b style="color:var(--gold)">${save.credits}</b></p>
        <div class="shop-list">${rows || '<p style="color:var(--muted)">所有卡牌都已解锁。</p>'}</div>
        <div class="actions">
          <button class="btn ghost" data-action="shop-back">返回主菜单</button>
        </div>
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
        <div class="deck-icon">${perkIconHtml(card.id)}</div>
        <div class="deck-row-info">
          <b>${escape(card.name)} <span style="color:var(--accent)">${card.cost}</span></b>
          <small>${isUnlocked ? escape(card.desc) : '未解锁 · 完成任务可获得'}${card.sourceSkill ? `<br><span class="source-skill">图标原型：${escape(card.sourceSkill)} · 效果原创</span>` : ''}</small>
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
      <div class="modal">
        <h1>牌组构筑</h1>
        <p>牌组需要 10–15 张牌，同一种卡牌最多 3 张。图标采用杀手技能图鉴样式，点击加减号调整，保存后才会生效。</p>
        <div class="deck-list">${rows}</div>
        <div class="actions">
          <button class="btn primary" data-action="deck-save" ${deck.length < 10 || deck.length > 15 ? 'disabled' : ''}>保存并返回（${deck.length} 张）</button>
          <button class="btn ghost" data-action="deck-cancel">取消</button>
        </div>
      </div>
    </div>
  `;
}

export function renderGame(state: GameState, killer: KillerProfile): string {
  const m = state.mission;
  const killerBadge = killer.portrait
    ? `<img class="killer-mini-portrait" src="${killer.portrait}" alt="">`
    : `<span class="killer-mini-icon">${escape(killer.owner.slice(0, 1))}</span>`;
  const rooms = ROOMS.map((room) => {
    const here = state.people.filter((p) => p.room === room.id && p.role !== 'police');
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
        const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
        return `<span class="door door-${side}" aria-hidden="true"></span>`;
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
        <div class="room-people">
          ${here.map(personChip).join('')}
          ${police ? personChip(police) : ''}
        </div>
      </div>
    `;
  }).join('');

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

  return `
    <div class="topbar">
      <div>
        <div class="brand">夜猎<span>档案</span></div>
        <div class="subtitle">Night Hunt Dossier</div>
        <div class="killer-chip">
          ${killerBadge}
          ${escape(killer.owner)} · ${escape(killer.title)}
        </div>
        <div class="killer-mechanic">原创机制「${escape(killer.mechanic.name)}」：${escape(killer.mechanic.short)}</div>
      </div>
      <div class="stats">
        <div class="stat"><b>${state.turn}/${m.turns}</b><small>回合</small></div>
        <div class="stat"><b>${state.energy}/${state.maxEnergy}</b><small>能量</small></div>
        <div class="stat"><b>${state.steps}</b><small>步数</small></div>
        <div class="stat"><b style="color:var(--accent)">${state.wanted}/10</b><small>通缉值</small></div>
        <div class="stat"><b>${state.kills}</b><small>击杀</small></div>
        <div class="stat"><b>${state.score}</b><small>当前分</small></div>
      </div>
    </div>

    <div class="layout">
      <div>
        <div class="panel">
          <div class="mission-card">
            <div class="mission-title">${escape(m.title)}</div>
            <div class="mission-desc">${escape(m.desc)}</div>
            <div class="mission-meta">
              <span>奖励 ${m.reward}</span>
              <span>标记击杀 ${state.markedKilled}</span>
              <span>证据 ${state.evidence}</span>
              ${m.kind === 'ritual' ? `<span>仪式 ${state.ritualStreak}/${m.targetCount ?? 2}</span>` : ''}
            </div>
          </div>
          <h2>房屋平面 · 点击相邻房间移动，点击人物查看档案（墙上的缺口为门）</h2>
          <div class="floorplan">
            <div class="house-wall" aria-hidden="true"></div>
            ${rooms}
          </div>
        </div>

        <div class="panel hand">
          <h2>手牌 · 悬停查看信息面板，点击打出</h2>
          <div class="hand-row">${hand || '<div style="color:var(--muted);font-size:13px">手牌已空，结束回合重新抽牌。</div>'}</div>
          <div class="actions">
            <button class="btn primary" data-action="end-turn">结束回合</button>
            <button class="btn ghost" data-action="give-up">放弃任务</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <h2>信息面板</h2>
        <div id="cardDetail" class="detail-wrap">${defaultDetailHtml()}</div>
        <h2 style="margin-top:16px">行动日志</h2>
        <div class="log">${state.log.map((line) => `<div>${escape(line)}</div>`).join('')}</div>
      </div>
    </div>
  `;
}

export function renderResult(state: GameState): string {
  const labels: Record<string, string> = {
    win: '任务完成',
    caught: '被警察抓捕',
    timeout: '任务超时',
    failed: '任务失败',
  };
  const stars = getStars(state.score);
  const reward = state.rewardCards[0] ? CARD_MAP[state.rewardCards[0]]?.name : null;
  const earned = state.result === 'win' ? Math.max(10, Math.round(state.score / 5)) : 0;
  return `
    <div class="overlay">
      <div class="modal">
        <div class="subtitle">CONTRACT REPORT</div>
        <h1>${labels[state.result ?? 'failed']}</h1>
        <div class="result-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <div class="result-grid">
          <div><small>最终评分</small><b>${state.score}</b></div>
          <div><small>击杀人数</small><b>${state.kills}</b></div>
          <div><small>剩余回合</small><b>${Math.max(0, state.mission.turns - state.turn)}</b></div>
          <div><small>最终通缉值</small><b>${state.wanted}/10</b></div>
        </div>
        ${reward ? `<p style="color:var(--gold)">新卡牌解锁：<b>${escape(reward)}</b></p>` : ''}
        ${earned ? `<p style="color:var(--gold)">获得积分：<b>+${earned}</b></p>` : ''}
        <div class="actions">
          <button class="btn primary" data-action="again">再来一局</button>
          <button class="btn" data-action="menu">返回主菜单</button>
        </div>
      </div>
    </div>
  `;
}
