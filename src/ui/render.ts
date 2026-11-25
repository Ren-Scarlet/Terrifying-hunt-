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
  layoutAspect,
  layoutAspectNum,
} from '../game/rooms';
import { getPersonProfile, type PersonProfile } from '../game/people';
import { SURVIVOR_MAP } from '../game/survivors';
import { isCardTuned } from '../game/tuning';
import { isMuted } from './audio';
import type { GameState, Person, RoomId, SaveData } from '../game/types';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const TYPE_NAMES: Record<string, string> = { attack: '攻击', skill: '技能', tactic: '战术', setup: '布局' };
const TYPE_RARITY: Record<string, string> = { attack: 'visceral', skill: 'very-rare', tactic: 'rare', setup: 'uncommon' };

const icon = (name: Parameters<typeof uiIcon>[0], cls = 'ui-icon') =>
  `<img class="${cls}" src="${uiIcon(name)}" alt="" aria-hidden="true">`;

/** 三件道具按你的设计各配一张图；其余道具仍用文字角标 */
const ITEM_ICONS: Partial<Record<NonNullable<Person['item']>, Parameters<typeof uiIcon>[0]>> = {
  medkit: 'medkit',
  toolbox: 'toolbox',
  flashlight: 'flashlight',
};
const itemIconHtml = (item: NonNullable<Person['item']>): string => {
  const key = ITEM_ICONS[item];
  return key ? `<img class="item-icon" src="${uiIcon(key)}" alt="" aria-hidden="true">` : '';
};
const itemBadge = (item: NonNullable<Person['item']>, uses: number): string =>
  `<i class="chip-item" title="手里拿着${escape(SURVIVOR_ITEM_LABEL[item])} · 还能用 ${uses} 次">${itemIconHtml(item)}${escape(SURVIVOR_ITEM_LABEL[item])}×${uses}</i>`;

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
  return detailCardHtml('信息面板', '悬停卡牌看完整效果 · 点人物看他的打算', '档案', [
    `每回合 ${BASE_AP} 点行动点：走路、挥刀、出牌、搜索柜子全从这一个池子里扣。想多追几间屋就少出牌，想连砍就别乱跑。`,
    '伤害只有一个来源：左下角的「挥刀」（1 点行动点）。健康 → 受伤 → 倒地；倒地后要隔 2 回合才能补刀处决，这期间同伴可能把人救走。砍完要么做别的事、要么花 1 点「擦刀」，才能砍第二刀。卡牌只负责功能，不造成伤害。',
    '相邻房间只看得见轮廓，看不见人。推门就是照面，人当场跑；追不上就低头看鞋印（只看得见当前房间、只留最近两次行动），或者听哪间屋传来乌鸦叫——那是有人刚经过。',
    '屋里的道具箱会给他们发道具（医疗包 / 工具箱 / 信号弹 / 钥匙 / 武器 / 烟雾弹），发电机会被他们修好、直接推一大截团队进度。你用不了这些，但可以花 1 点行动点砸掉：道具箱砸烂就再也发不出东西，发电机被砸会掉进度并停机两回合。',
    '严格踩着脚印连续追才攒【杀戮】；随便走不涨。满 50 后每回合多 2 点行动点，路怎么走你自己点，不会替你瞬移。',
    '他们也在忙自己的事：修电闸、凑钥匙、找后门。团队进度一旦做满，幸存者集体逃走，你就输了。有人藏进柜子时，点「搜索」翻出来（1 点行动点）。',
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

function personChip(person: Person, attackable = false): string {
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
  // 头顶上的警戒值：不用再翻日志判断这个人现在有多怕
  const alertLevel = person.alert >= 70 ? 'high' : person.alert >= 35 ? 'mid' : 'low';
  const alertMark =
    person.role === 'police'
      ? ''
      : `<span class="chip-alert ${alertLevel}" title="警觉 ${person.alert}/100：越高越可能立刻逃跑">${person.alert}</span>`;
  const bleedLeft = Math.max(0, BLEEDOUT_TURNS - person.downedTurns);
  const lockLeft = Math.max(0, DOWNED_LOCK_TURNS - person.downedTurns);
  const stateMark =
    health === 'downed'
      ? `<span class="chip-state downed" title="${lockLeft > 0 ? '刚倒下：还要等 ' + lockLeft + ' 回合才能补刀，同伴可能把他救走' : '可以补刀处决了；再过 ' + bleedLeft + ' 回合会自己流干'}">${lockLeft > 0 ? `锁 ${lockLeft}` : `倒 ${bleedLeft}`}</span>`
      : health === 'injured'
        ? '<span class="chip-state injured" title="受伤：再挨一下就会倒地">伤</span>'
        : '';
  const watchMark = person.watched
    ? '<span class="chip-watch locked" title="夜幕锁定：持续显形，下一刀直接击倒">锁定</span>'
    : person.watchValue > 0
      ? `<span class="chip-watch" title="夜幕监视值 ${person.watchValue}/100">监视 ${person.watchValue}</span>`
      : '';
  const label = person.intent === 'idle' ? person.activity : INTENT_LABEL[person.intent];
  const note =
    person.role === 'police'
      ? ' · 警察：不能攻击，他会循着现场追你'
      : attackable
        ? ' · 点击对他挥刀'
        : '';
  return `<button type="button" class="person-chip ${cls} ${health === 'downed' ? 'is-downed' : ''} ${attackable ? 'can-hit' : ''}" data-action="person" data-person-id="${person.id}"${attackable ? ' data-attack="1"' : ''}
    title="${escape(person.name)} · ${HEALTH_LABEL[health]} · 警觉 ${person.alert}/100 · ${escape(ARCH_LABEL[person.archetype])} · ${escape(GOAL_LABEL[person.goal])} · 正在${escape(label)}${note}">
    ${img ? `<img src="${img}" alt="" onerror="this.style.display='none'">` : ''}
    <span>${escape(person.name)}</span>${intentDot(person)}${stateMark}${alertMark}${watchMark}${person.item ? itemBadge(person.item, person.itemUses) : ''}
  </button>`;
}

/** 感知到的红色人影：看得出「有人」，看不出是谁 */
function shadowFigures(count: number): string {
  return Array.from({ length: Math.min(3, count) }, () => '<span class="shadow-figure"></span>').join('');
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
    if (person.hidden) paras.push('他躲起来了：点左下角的「搜索」翻柜子（1 点行动点），不然打不到他。');
    if (person.sneaky) paras.push('老练：有时会踮着脚走路，不留鞋印、也不惊动乌鸦——但不会一直这样。');
    if (person.goal === 'objective' || person.goal === 'key') paras.push('他正为团队目标忙：进度做满，幸存者会集体从后门逃走，你直接失败。');
    if (person.armed) paras.push('他手里有武器：进门时可能反击，让你下回合少走一步。');
    if (health === 'downed') paras.push(person.downedTurns >= DOWNED_LOCK_TURNS ? '倒地：已经可以补刀处决，但同伴仍可能把他救起。' : `倒地：还要等 ${DOWNED_LOCK_TURNS - person.downedTurns} 回合才能补刀，这是同伴的救援窗口。`);
    if (threat) paras.push(`威胁：这名角色会主动对抗你，别把他当普通平民。`);
    if (profile.role === 'police') {
      paras.push(
        '警察可以攻击，但代价极高。他循着「新鲜现场」追你，同屋越久你的暴露度涨得越快——满 100 就会被捕（灵异鬼怪则是被驱散）。剪电话、制造假现场、或者干脆离开这条街，才能甩掉他。',
      );
    }
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
          <div class="guide-card">${icon('mission')}<b>1 · 接取契约</b><p>每局随机获得任务。主目标旁会显示${icon('missionTarget', 'ui-icon tiny')}标记，告诉你要击杀谁、要杀几个人，或需要收齐多少证据再撤离。</p></div>
          <div class="guide-card">${icon('darkCell')}<b>2 · 现场布局</b><p>布局牌（绿色）在行动阶段打出：剪断电话线、封死逃生点、装窃听。布局打早了才有用。</p></div>
          <div class="guide-card">${icon('escape')}<b>3 · 相邻只看轮廓，推门才是照面</b><p>隔壁房间<b>看得见名字、看不见人</b>——找人得自己走过去，或者靠侦查 / 感知牌。只要没打伏击，屋里的人<b>门一开就转身跑</b>；想拿先手先打<b>静止隐身</b>。跑掉的人留下<b>鞋印</b>；更远的地方会传来<b>乌鸦叫、地板响</b>，房间上亮起「动静」角标，那是有人刚经过。</p></div>
          <div class="guide-card">${icon('bloodPoint')}<b>4 · 行动点、脚印与杀戮</b><p>每回合 <b>${BASE_AP} 点行动点</b>：走路、挥刀、出牌、<b>搜索柜子</b>全从这一个池子里扣；砍完想立刻再砍，就花 1 点<b>擦刀</b>——但擦刀时幸存者也会跟着动。伤害只从「挥刀」来（1 点），同屋多人<b>点谁砍谁</b>；有人钻进柜子就点<b>搜索</b>翻出来。<b>鞋印</b>只看得见当前房间（留最近两次行动），严格踩着它连续追才攒<b>杀戮</b>，随便走不涨；满 50 后每回合多 2 点行动点，<b>路你自己走，不会瞬移</b>。砍中人或被击晕清零。</p></div>
          <div class="guide-card">${icon('missionTarget')}<b>5 · 他们也在赶进度</b><p>幸存者各有目的：修电闸、凑钥匙、报警、躲柜子。<b>蓝框房间</b>是他们的目标点，谁在那儿做事都会弄出动静。资源栏的<b>团队目标</b>一旦做满，他们集体从后门逃走，<b>你直接失败</b>——你追得越凶，他们越没空干活。老练的家伙偶尔会踮着脚走，不留脚印也不惊动乌鸦。</p></div>
        </div>
        <div class="guide-note">
          ${icon('totem', 'ui-icon tiny')} 图腾：在此结束回合，下回合 +1 行动点。
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
