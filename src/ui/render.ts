import { CARDS, CARD_MAP } from '../game/cards';
import {
  PERK_RARITY_BG,
  POWER_RARITY_BG,
  cardImage,
  characterImage,
  uiIcon,
} from '../game/assetMap';
import {
  ALARM_MAX,
  ARCH_LABEL,
  ESCAPE_ROOMS,
  GOAL_LABEL,
  HEALTH_LABEL,
  INTENT_LABEL,
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
  knownPeople,
  moveCost,
  powerBlockReason,
  powerCooldown,
} from '../game/engine';
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
import { SURVIVOR_MAP } from '../game/survivors';
import { isCardTuned } from '../game/tuning';
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

/** 杀手头像：有立绘用立绘，没有就退回力量图标，统一装进同一个框里 */
export function killerFaceHtml(killer: KillerProfile, cls = ''): string {
  if (killer.portrait) {
    return `<span class="killer-face art ${cls}"><img src="${killer.portrait}" alt="" onerror="this.style.display='none'"></span>`;
  }
  return `<span class="killer-face glyph ${cls}">
      <img class="face-bg" src="${POWER_RARITY_BG}" alt="" onerror="this.style.display='none'">
      <img class="face-icon" src="${killer.icon}" alt="" onerror="this.style.display='none'">
    </span>`;
}

function powerIconHtml(killer: KillerProfile): string {
  return `
    <div class="dbd-power">
      <img class="dbd-power-bg" src="${POWER_RARITY_BG}" alt="" onerror="this.style.display='none'">
      <img class="dbd-power-glyph" src="${killer.icon}" alt="" onerror="this.style.display='none'">
    </div>
  `;
}

export function getKiller(owner?: string): KillerProfile {
  return KILLERS.find((k) => k.owner === owner) ?? KILLERS[0];
}

export function defaultDetailHtml(): string {
  return detailCardHtml('信息面板', '悬停或选中卡牌、点击人物查看资料', '档案', [
    '地图分三层：没进过的房间只看得见轮廓；进过的房间看得见家具和出口；只有你现在所在的房间和相邻房间，才看得见里面的人。',
    '每个人都会先躲、先跑、先报警。点人物头像能看到他的行为类型和目的——警觉型会喊人，求救型会摸向电话，救援型会去拉倒地的人。',
    '伤害只能把人从健康打成受伤，再打成倒地。倒地的人不会自己死：再补一次伤害或用处决牌，否则他会被同伴救起来。',
    '想先手就先伏击：「静止隐身」让你这一回合推门进去不惊动任何人；人已经跑了就用「疾速残暴」立刻贴到他身后补刀。',
    '顶部「警戒」是整栋房子的紧张程度，满 100 直接失败。剪电话、拉电闸、制造噪声、锁门隔离，都是在压这个数字。',
  ]);
}

export function cardDetailHtml(state: GameState, cardUid: string): string {
  const card = state.hand.find((c) => c.uid === cardUid);
  if (!card) return defaultDetailHtml();
  const def = CARD_MAP[card.defId];
  if (!def) return defaultDetailHtml();
  const cost = effectiveCost(card.defId, state);
  const paras = [def.desc, def.flavor];
  if (def.sourceText) paras.push(`图鉴原效果：${def.sourceText}`);
  return detailCardHtml(
    def.name,
    `费用 ${cost} / ${TYPE_NAMES[def.type] ?? def.type} / 图标取自 ${def.sourceSkill}`,
    TYPE_NAMES[def.type] ?? def.type,
    paras,
    TYPE_RARITY[def.type] ?? 'rare',
    perkIconHtml(def.id),
  );
}

function intentDot(person: Person): string {
  if (person.intent === 'idle') return '';
  return `<i class="intent-dot i-${person.intent}" title="${escape(INTENT_LABEL[person.intent])}"></i>`;
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
  const health = conditionOf(person);
  const alertMark =
    person.alert >= 70 ? '<span class="chip-alert high">!</span>'
      : person.alert >= 35 ? '<span class="chip-alert">?</span>' : '';
  const stateMark =
    health === 'downed'
      ? '<span class="chip-state downed" title="倒地：可以处决，也可能被救起">倒</span>'
      : health === 'injured'
        ? '<span class="chip-state injured" title="受伤：再挨一下就会倒地">伤</span>'
        : '';
  const label = person.intent === 'idle' ? person.activity : INTENT_LABEL[person.intent];
  return `<button type="button" class="person-chip ${cls} ${health === 'downed' ? 'is-downed' : ''}" data-action="person" data-person-id="${person.id}"
    title="${escape(person.name)} · ${HEALTH_LABEL[health]} · 警觉 ${person.alert}/100 · ${escape(ARCH_LABEL[person.archetype])} · ${escape(GOAL_LABEL[person.goal])} · 正在${escape(label)}">
    ${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}
    <span>${escape(person.name)}</span>${intentDot(person)}${stateMark}${alertMark}
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
  const threat = SURVIVOR_MAP[personId]?.threat;
  const paras = [...profile.bio, `习惯：${profile.habit}`, `秘密：${profile.secret}`];
  if (person) {
    const health = conditionOf(person);
    paras.push(
      `状态：${HEALTH_LABEL[health]}（${person.hp}/2）。行为类型：${ARCH_LABEL[person.archetype]}。`,
      `目的：${GOAL_LABEL[person.goal]}。警觉 ${person.alert}/100，当前${INTENT_LABEL[person.intent]}。`,
    );
    if (isPersonVisible(state, person)) {
      paras.push(`位置：${roomName(person.room)}。`);
    } else {
      paras.push(`位置：${roomName(person.lastSeenRoom)}（最后确认于第 ${person.lastSeenTurn} 回合，现在不知道在哪）。`);
    }
    if (person.hidden) paras.push('他躲起来了：不搜索这间屋子，你打不到他。');
    if (person.armed) paras.push('他手里有武器：进门时可能反击，让你下回合少走一步。');
    if (health === 'downed') paras.push('倒地：本回合内可以被处决，也可能被同伴救起。');
    if (threat) paras.push(`威胁：这名角色会主动对抗你，别把他当普通平民。`);
  } else {
    paras.push('档案状态：已从现场消失。');
  }
  return detailCardHtml(
    profile.name,
    `${roleName} / ${profile.occupation} / ${profile.age} 岁 · ${profile.tags.join(' · ')}`,
    rarityLabel,
    paras,
    rarityKey,
    `<div class="person-detail-lead">${personPortraitHtml(profile)}</div>`,
  );
}

export function renderMenu(save: SaveData): string {
  const killer = getKiller(save.killer);
  const canAfford = save.darkCells >= 2;
  const picker = KILLERS.map((k) => {
    const unlocked = save.unlockedKillers.includes(k.owner);
    const disabled = !unlocked && !canAfford;
    return `<button class="killer-choice ${k.owner === killer.owner ? 'selected' : ''} ${unlocked ? '' : 'locked'}"
      data-action="${unlocked ? 'killer' : 'unlock-killer'}" data-owner="${escape(k.owner)}"
      ${disabled ? 'disabled' : ''}
      title="${escape(k.owner)}${unlocked ? '' : ` · 需要 2 暗金细胞解锁`}">
      ${killerFaceHtml(k)}
      <span>${escape(k.owner)}</span>
      ${unlocked ? '' : `<em>${icon('darkCell', 'ui-icon tiny')} 2</em>`}
    </button>`;
  }).join('');

  const powerLines = killer.powers.map(
    (p) => `${p.name}（${p.ultimate ? `大招 · CD ${p.cooldown}` : `CD ${p.cooldown}`}）：${p.desc}`,
  );

  return `
    <div class="overlay menu-overlay">
      <div class="modal menu-modal">
        <div class="menu-hero">
          <div>
            <div class="subtitle">A SOLO DECKBUILDING HUNT</div>
            <h1>夜猎<span>档案</span></h1>
            <p class="hero-copy">你不是逃脱者。你是那扇门后不该存在的东西——<br>接下契约，布置现场，然后在警察赶到前完成它。</p>
            <div class="hero-rule" aria-hidden="true"></div>
            <div class="resource-bar">
              <span>${icon('bloodPoint')} <b>${save.credits}</b> 血点</span>
              <span>${icon('darkCell')} <b>${save.darkCells}</b> 暗金细胞</span>
              <span>${icon('shard')} 荧光裂片 <small>后续开放</small></span>
            </div>
          </div>
          <div class="menu-mission">
            ${icon('mission', 'ui-icon large')}
            <div><small>本局流程</small><b>接取契约 → 潜入布局 → 猎杀撤离</b></div>
            <p>房子里的人各有目的：报警、躲柜子、翻后院。跑掉太多人就输了。</p>
          </div>
        </div>

        <div class="section-title">选择你的怪物 <small>力量图标取自图鉴 · 全部游戏机制原创</small></div>
        <div class="killer-picker">${picker}</div>
        <div class="detail-wrap">${detailCardHtml(
          killer.owner,
          `${killer.title} / ${killer.school === 'supernatural' ? '灵异系' : '现实系'} · 两个能力分开冷却`,
          '力量',
          [
            ...(killer.passive ? [`被动 · ${killer.passive.name}：${killer.passive.short}`] : []),
            ...powerLines,
            killer.sourceNote,
          ],
          'common',
          `<div class="killer-detail-lead">${
            killer.portrait
              ? `<img class="killer-portrait" src="${killer.portrait}" alt="${escape(killer.owner)}立绘" onerror="this.style.display='none'">`
              : ''
          }${powerIconHtml(killer)}</div>`,
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
          <button class="btn ghost mini admin-entry" data-action="admin">平衡调整</button>
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
          <div class="guide-card">${icon('darkCell')}<b>2 · 现场布局</b><p>布局牌（绿色）在行动阶段打出：剪断电话线、封死逃生点、装窃听。布局打早了才有用。</p></div>
          <div class="guide-card">${icon('escape')}<b>3 · 他们想跑</b><p>点人物头像能看到他的<b>目的</b>和<b>行为原型</b>：想打电话的会往书房摸，想逃的会往${icon('escape', 'ui-icon tiny')}后院跑。想在他们跑掉之前动手，就先打<b>静止隐身</b>伏击进门；人已经跑了，就用<b>疾速残暴</b>立刻贴到身后补刀。顶栏的<b>团队警戒</b>满了直接判负。</p></div>
          <div class="guide-card">${icon('bloodPoint')}<b>4 · 伤害与评分</b><p>每回合恢复 3 能量与 3 步数，结束回合弃掉手牌重抽 5 张。<b>伤害只能推进一档</b>：健康 → 受伤 → 倒地，倒地的人要再补一次才会死。跑掉的人会扣分，标记目标跑掉直接判负。</p></div>
        </div>
        <div class="guide-note">
          ${icon('totem', 'ui-icon tiny')} 图腾：在此结束回合，下回合 +1 能量。
          ${icon('cabinet', 'ui-icon tiny')} 柜子：躲进去的人不会被引诱类卡牌锁定。
          ${icon('obstacle', 'ui-icon tiny')} 障碍：需要「所向无敌」或杀手能力破开。
          堵门的房间进入要多花 1 步。
        </div>
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
            <small>${escape(card.desc)} · 图标取自 ${escape(card.sourceSkill)}</small>
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
          <span class="deck-desc">${isUnlocked ? escape(card.desc) : '未解锁 · 可在商店购买'}</span>
          <span class="source-skill" title="图标原型：${escape(card.sourceSkill)}">${escape(card.sourceSkill)}</span>
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
  if (roomId === EXIT_ROOM) parts.push(`<span class="room-feature escape" title="撤离点：任务完成的撤离位置">${icon('escape', 'ui-icon tiny')}</span>`);
  if (ESCAPE_ROOMS.includes(roomId)) parts.push(`<span class="room-feature escape-npc" title="逃生点：NPC 在这里待满一回合就会逃出去">${icon('escape', 'ui-icon tiny')}</span>`);
  if (TOTEM_ROOMS.includes(roomId)) parts.push(`<span class="room-feature totem" title="图腾：在此结束回合，下回合 +1 能量">${icon('totem', 'ui-icon tiny')}</span>`);
  if (CABINET_ROOMS.includes(roomId)) parts.push(`<span class="room-feature cabinet" title="柜子：藏身者不会被引诱类卡牌锁定">${icon('cabinet', 'ui-icon tiny')}</span>`);
  if (OBSTACLE_ROOMS.includes(roomId)) parts.push(`<span class="room-feature obstacle" title="障碍物：需所向无敌或杀手能力破开">${icon('obstacle', 'ui-icon tiny')}</span>`);
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

export function renderGame(state: GameState, killer: KillerProfile): string {
  const m = state.mission;
  const here = state.people.filter((p) => p.room === state.playerRoom && p.role !== 'police');
  const policeHere = state.people.some((p) => p.room === state.playerRoom && p.role === 'police');
  const isMyers = killer.owner === '迈克尔·迈尔斯';
  const maxEscaped = m.maxEscaped ?? 2;

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
    const r = room.rect;
    const style = `left:${r.left}%;top:${r.top}%;width:${r.width}%;height:${r.height}%`;
    return `
      <div class="room ${isPlayer ? 'current' : ''} ${reachable ? 'reachable' : 'disabled'} ${room.id === 'garden' ? 'outdoor' : ''} ${locked ? 'locked' : ''} ${barricaded ? 'barricaded' : ''} ${explored ? 'explored' : 'unexplored'} ${visible ? 'in-sight' : 'fogged'}"
        style="${style}" data-room="${room.id}" title="${escape(room.name)}${explored ? `：${escape(room.desc)}` : '：还没进去过'}">
        ${reachable ? `<button type="button" class="room-hit" data-action="move" data-room="${room.id}"
          aria-label="移动到${escape(room.name)}${cost > 1 ? `（堵门，需 ${cost} 步）` : ''}"></button>` : ''}
        <div class="room-head">
          <span class="room-name">${explored ? escape(room.name) : '？？？'}</span>
          ${isPlayer ? '<span class="room-tag">你在</span>' : locked ? '<span class="room-tag lock">封锁</span>' : barricaded ? `<span class="room-tag bar">堵门 ${cost}步</span>` : ''}
        </div>
        ${explored
          ? `<div class="room-desc">${escape(room.desc)}</div>
             <div class="room-features">${roomFeatures(room.id)}</div>`
          : `<div class="room-unknown">未探索</div>`}
        <div class="room-people">
          ${people.map(personChip).join('')}
          ${police ? personChip(police) : ''}
          ${ghosts.map(() => '<span class="ghost-chip" title="最后确认位置：人可能已经走了">?</span>').join('')}
        </div>
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
      const alertLabel = p.alert >= 70
        ? '<em class="alert-tag high">警觉</em>'
        : p.alert >= 35 ? '<em class="alert-tag">留意</em>' : '';
      const intentLabel = p.intent === 'idle' ? GOAL_LABEL[p.goal] : INTENT_LABEL[p.intent];
      const where = vis ? roomName(p.room) : `最后在${roomName(p.lastSeenRoom)}`;
      return `<button class="roster-person ${p.room === state.playerRoom ? 'here' : ''} ${p.marked ? 'marked' : ''} ${p.intent === 'escape' ? 'escaping' : ''} ${vis ? '' : 'unknown'} ${health === 'downed' ? 'downed' : ''}"
        data-action="person" data-person-id="${p.id}"
        title="${escape(p.name)}：${escape(ARCH_LABEL[p.archetype])}，${escape(GOAL_LABEL[p.goal])}，${escape(HEALTH_LABEL[health])}${vis ? '' : '，位置待确认'}">
        ${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}
        <span><b>${escape(p.name)} ${alertLabel}</b>
          <small class="goal-line">${escape(ARCH_LABEL[p.archetype])} · ${escape(GOAL_LABEL[p.goal])}</small>
          <small>${where} · ${HEALTH_LABEL[health]} · ${escape(intentLabel)}</small></span>
      </button>`;
    })
    .join('');

  const meter = isMyers
    ? `<div class="stalk-meter ${state.stalkMeter >= 100 ? 'active' : ''}">
        <div class="stalk-label"><span>尾随值</span><b>${state.stalkMeter}/100</b></div>
        <div class="stalk-track"><div class="stalk-fill" style="width:${state.stalkMeter}%"></div></div>
      </div>`
    : '';

  return `
    <div class="topbar">
      <div class="topbar-identity">
        <div class="brand">夜猎<span>档案</span> <small>${icon('mission', 'ui-icon tiny')} ${escape(m.title)}</small></div>
        <div class="killer-chip">
          ${killerFaceHtml(killer, 'chip')}
          <span>${escape(killer.owner)} · ${escape(killer.title)}</span>
        </div>
        ${meter}
      </div>
      <div class="stats">
        <div class="stat"><b>${state.turn}/${m.turns}</b><small>回合</small></div>
        <div class="stat energy"><b>${state.energy}/${state.maxEnergy}</b><small>能量</small></div>
        <div class="stat"><b>${state.steps}</b><small>步数</small></div>
        <div class="stat wanted"><b>${state.wanted}/${state.arrestThreshold}</b><small>通缉/逮捕</small></div>
        <div class="stat"><b>${state.kills}</b><small>击杀</small></div>
        <div class="stat ${state.escaped > 0 ? 'escaped' : ''}"><b>${state.escaped}/${maxEscaped}</b><small>逃走</small></div>
        <div class="stat alarm-stat ${state.alarm >= 70 ? 'hot' : state.alarm >= 40 ? 'warm' : ''}" title="团队警戒：满 ${ALARM_MAX} 任务失败。剪电话、断电、制造噪声、锁门都能压低它。">
          <b>${state.alarm}<i>/${ALARM_MAX}</i></b>
          <div class="alarm-track"><span style="width:${state.alarm}%"></span></div>
          <small>团队警戒</small>
        </div>
        <div class="stat score"><b>${currentScore(state)}</b><small>预计得分</small></div>
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
              <span>奖励 ${m.reward}</span><span>标记击杀 ${state.markedKilled}/${m.kind === 'assassinate' ? (m.targetCount ?? 2) : 1}</span><span>证据 ${state.evidence}</span>
              ${m.kind === 'ritual' ? `<span>仪式 ${state.ritualStreak}/${m.targetCount ?? 2}</span>` : ''}
              <span class="escape-quota">允许逃走 ${state.escaped}/${maxEscaped}</span>
            </div>
          </div>
        </div>

        <div class="panel map-panel">
          <div class="panel-heading"><h2>房屋平面</h2><span>点击亮起的房间移动 · 注意每个人的意图 · 后院是他们的逃生点</span>
            <button class="btn ghost mini" data-action="guide">玩法指引</button>
          </div>
          <div class="floorplan">
            ${rooms}
            ${playerMarker}
          </div>
          <div class="map-legend">
            <span>${icon('escape', 'ui-icon tiny')} 撤离点</span>
            <span>${icon('totem', 'ui-icon tiny')} 图腾</span>
            <span>${icon('cabinet', 'ui-icon tiny')} 柜子</span>
            <span>${icon('obstacle', 'ui-icon tiny')} 障碍物</span>
            <span class="legend-intent"><i class="intent-dot i-flee"></i> 逃跑中 <i class="intent-dot i-call"></i> 打电话 <i class="intent-dot i-escape"></i> 翻篱笆 <i class="intent-dot i-rescue"></i> 救援</span>
            <span class="legend-fog">？？？ 未探索 · ? 最后确认位置</span>
          </div>
        </div>

        <div class="panel hand">
          <div class="panel-heading"><h2>手牌</h2><span>悬停或选中查看完整效果 · 点击打出 · 结束回合重抽</span></div>
          <div class="hand-actions">
            <div class="power-row">${powerButtonHtml(state, killer)}</div>
            <button class="btn primary end-turn" data-action="end-turn">结束回合</button>
            <button class="btn ghost" data-action="give-up">放弃任务</button>
          </div>
          <div class="hand-row">${hand || '<div style="color:var(--muted);font-size:13px">手牌已空，结束回合重新抽牌。</div>'}</div>
        </div>
      </div>

      <div class="side-column">
        <div class="panel roster-panel">
          <div class="panel-heading"><h2>在场人物</h2><span>${here.length} 人在你的房间${policeHere ? ' · 警察也在' : ''}</span></div>
          <div class="roster">${roster || '<div class="roster-empty">还没有确认任何人的位置。走进房间，或者用侦查卡。</div>'}</div>
          ${unknownCount > 0 ? `<div class="roster-unknown">还有 ${unknownCount} 个人没有被确认</div>` : ''}
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

/** newCard：本局新解锁的卡牌 id（已解锁过的不会再重复提示）。 */
export function renderResult(state: GameState, newCard: string | null): string {
  const labels: Record<string, string> = {
    win: '任务完成', caught: '被警察抓捕', timeout: '任务超时', failed: '任务失败',
  };
  const stars = getStars(state.score);
  const earned = state.result === 'win' ? Math.max(10, Math.round(state.score / 5)) : 0;
  const darkCells = state.result === 'win' && state.score >= 150 ? 1 : 0;
  const breakdown = state.scoreBreakdown
    .map((line) => `<div class="score-line ${line.value < 0 ? 'minus' : ''}">
        <span>${escape(line.label)}</span><b>${line.value >= 0 ? '+' : ''}${line.value}</b>
      </div>`)
    .join('');
  return `
    <div class="overlay">
      <div class="modal result-modal">
        <div class="subtitle">CONTRACT REPORT</div>
        <h1>${labels[state.result ?? 'failed']}</h1>
        ${state.resultReason ? `<p class="result-reason">${escape(state.resultReason)}</p>` : ''}
        <div class="result-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <div class="result-grid">
          <div><small>最终评分</small><b>${state.score}</b></div>
          <div><small>击杀人数</small><b>${state.kills}</b></div>
          <div><small>逃走人数</small><b>${state.escaped}</b></div>
          <div><small>最终通缉值</small><b>${state.wanted}/10</b></div>
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
