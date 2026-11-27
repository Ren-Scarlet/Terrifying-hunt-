import { CARDS, CARD_MAP } from '../../game/cards';
import { ADDON_RARITY_BG, PERK_RARITY_BG, POWER_RARITY_BG, accessoryImage, cardImage, characterImage, uiIcon } from '../../game/assetMap';
import {
  ARCH_LABEL, BASE_AP, BLEEDOUT_TURNS, GOAL_LABEL, HEALTH_LABEL,
  INTENT_LABEL, SURVIVOR_ITEM_LABEL, conditionOf, effectiveCost, isPersonVisible,
  attackBlockReason, executeBlockReason,
} from '../../game/engine';
import { KILLERS, type KillerProfile } from '../../game/killers';
import { roomName } from '../../game/missions';
import { getPersonProfile, type PersonProfile } from '../../game/people';
import { ROUTINE_PROFILE } from '../../game/npc/catalog';
import { SURVIVOR_MAP } from '../../game/survivors';
import { awarenessLabel, awarenessStage } from '../../game/npc/awareness';
import type { AccessoryDef, GameState, Person, SaveData } from '../../game/types';

export const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 卡牌描述中的机制名与状态名统一使用金色强调，方便快速扫读。 */
export function cardTextHtml(text: string): string {
  const terms = ['无法侦测', '无法行动', '不可侦测', '深度伤口', '浑然不觉', '被诅咒', '行动点', '血祭品', '尾随值', '恐惧值', '警觉值', '暴露度', '气场', '图腾', '倒地', '受伤', '重伤', '流血', '障目', '危险', '不治', '处决', '逃生者', '幸存者', '视野', '视线', '报警', '治疗', '救援', '攻击', '击倒', '移动'];
  const pattern = new RegExp(terms.sort((a, b) => b.length - a.length).join('|'), 'g');
  return escape(text).replace(pattern, (match) => `<span class="card-keyword">${match}</span>`);
}

export const TYPE_NAMES: Record<string, string> = { attack: '攻击', skill: '技能', tactic: '战术', setup: '布局' };
export const TYPE_RARITY: Record<string, string> = { attack: 'visceral', skill: 'very-rare', tactic: 'rare', setup: 'uncommon' };

export const icon = (name: Parameters<typeof uiIcon>[0], cls = 'ui-icon') =>
  `<img class="${cls}" src="${uiIcon(name)}" alt="" aria-hidden="true">`;

/** 三件道具按你的设计各配一张图；其余道具仍用文字角标 */
const ITEM_ICONS: Partial<Record<NonNullable<Person['item']>, Parameters<typeof uiIcon>[0]>> = {
  medkit: 'medkit',
  toolbox: 'toolbox',
  flashlight: 'flashlight',
};
export const itemIconHtml = (item: NonNullable<Person['item']>): string => {
  const key = ITEM_ICONS[item];
  return key ? `<img class="item-icon" src="${uiIcon(key)}" alt="" aria-hidden="true">` : '';
};
export const itemBadge = (item: NonNullable<Person['item']>, uses: number): string =>
  `<i class="chip-item" title="手里拿着${escape(SURVIVOR_ITEM_LABEL[item])} · 还能用 ${uses} 次">${itemIconHtml(item)}${escape(SURVIVOR_ITEM_LABEL[item])}×${uses}</i>`;

export function detailCardHtml(
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
        ${paragraphs.map((p) => `<p>${cardTextHtml(p)}</p>`).join('')}
      </div>
    </article>
  `;
}

export function perkIconHtml(defId: string, size = ''): string {
  return `
    <div class="dbd-perk ${size}">
      <img class="dbd-perk-bg" src="${PERK_RARITY_BG}" alt="" onerror="this.style.display='none'">
      ${cardImage(defId) ? `<img class="dbd-perk-glyph" src="${cardImage(defId)}" alt="" onerror="this.style.display='none'">` : '<span class="dbd-perk-fallback" aria-hidden="true">✦</span>'}
    </div>
  `;
}

/** 配件图标：稀有度底框 + 图鉴裁切图标，尺寸由 CSS 类控制。 */
export function addonIconHtml(id: string, rarity: AccessoryDef['rarity'], size = ''): string {
  return `
    <div class="dbd-addon ${size}">
      <img class="dbd-addon-bg" src="${ADDON_RARITY_BG[rarity]}" alt="" onerror="this.style.display='none'">
      <img class="dbd-addon-glyph" src="${accessoryImage(id)}" alt="" onerror="this.style.display='none'">
    </div>
  `;
}

/** 杀手头像：有立绘用立绘，没有就退回力量图标，统一装进同一个框里 */
export function killerFaceHtml(killer: KillerProfile, cls = ''): string {
  if (killer.portrait) {
    return `<span class="killer-face art ${cls}"><img src="${killer.portrait}" alt="" onerror="this.style.display='none'"></span>`;
  }
  // 地图上的玩家标记只显示杀手本身；不叠加力量稀有度底图，避免头像周围出现细小装饰点。
  if (cls === 'marker') {
    return `<span class="killer-face glyph marker">
      <img class="face-icon" src="${killer.icon}" alt="" onerror="this.style.display='none'">
    </span>`;
  }
  return `<span class="killer-face glyph ${cls}">
      <img class="face-bg" src="${POWER_RARITY_BG}" alt="" onerror="this.style.display='none'">
      <img class="face-icon" src="${killer.icon}" alt="" onerror="this.style.display='none'">
    </span>`;
}

export function powerIconHtml(killer: KillerProfile): string {
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
    '普通攻击消耗 1 AP，卡牌与杀手能力也会影响战斗。幸存者倒地后可以立即普通处决，也可以抱起搬运到指定地点执行地点处决；猎杀评分达到 200 分后，还会解锁头顶独立的分数处决 QTE。若暂时放过，同伴可能把人救起。',
    '相邻房间通常只能看到轮廓。进入房间会暴露位置，警觉较高的幸存者可能立刻逃跑；警觉较低的幸存者会先观察或怀疑。留意当前房间的鞋印、乌鸦和其他环境线索，判断幸存者最近的行动。',
    '屋里的道具箱会给他们发道具（医疗包 / 工具箱 / 信号弹 / 武器 / 烟雾弹），电闸控制各区域照明；你可以拉闸或砸毁控制箱，幸存者也可能用工具箱修复它。道具箱砸烂后就再也发不出东西。',
    '连续追踪可积累【杀戮】资源；达到阈值后会强化行动点收益。转向、攻击或失去追踪线索都会影响追击节奏。',
    '幸存者会根据性格报警、躲藏、寻找武器、救援同伴、修复断电区域或寻找补给；他们的行动会改变现场局势并制造线索。有人藏进柜子时，点「搜索」翻出来（1 点行动点）。',
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

export function intentDot(person: Person): string {
  if (person.intent === 'idle') return '';
  return `<i class="intent-dot i-${person.intent}" title="${escape(INTENT_LABEL[person.intent])}"></i>`;
}

export function personChip(person: Person, attackable = false, carryable = false, targetMode?: 'hatchet', darkRoom = false, slotStyle?: string): string {
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
  const contractTargetMark = person.marked
    ? '<span class="chip-contract-target" title="本局契约指定击杀目标">★ 契约目标</span>'
    : '';
  const avatarHtml = img
    ? `<span class="person-avatar-wrap"><img class="person-avatar" src="${img}" alt="" onerror="this.style.display='none'">${person.bloodSacrifice ? `<img class="chip-sacrifice-mark" src="${uiIcon('obsession')}" alt="血祭品" title="本局血祭品">` : ''}</span>`
    : '';
  const trapHitMark = person.trapTriggered
    ? '<span class="shadow-figure trap-hit-figure" title="刚刚踩中捕兽夹并发出尖叫"></span>'
    : '';
  // 头顶上的警戒值：不用再翻日志判断这个人现在有多怕
  const alertLevel = (['low', 'mid', 'panic', 'high'] as const)[awarenessStage(person.alert)];
  const alertMark =
    person.role === 'police'
      ? ''
      : `<span class="chip-alert ${alertLevel}" title="警戒度：${awarenessLabel(person.alert)}（${person.alert}/100）；恐惧值：${person.fear}/100。恐惧满值后再次受击会倒地"><b>警戒 ${person.alert}</b><i>恐惧 ${person.fear}</i></span>`;
  const bleedLeft = Math.max(0, BLEEDOUT_TURNS - person.downedTurns);
  const stateMark =
    health === 'downed'
      ? `<span class="chip-state downed" title="倒地：可以立即处决；若暂时放过，同伴仍可能救起，${bleedLeft} 回合后流血死亡"><img class="chip-state-icon" src="${uiIcon('statusDowned')}" alt="倒地" onerror="this.src='assets/ui/倒地状态.webp'"><b>${bleedLeft}</b></span>`
      : health === 'injured'
        ? `<span class="chip-state injured" title="受伤：再挨一下就会倒地"><img class="chip-state-icon" src="${uiIcon('statusInjured')}" alt="受伤" onerror="this.style.display='none'"></span>`
        : '';
  const effects = person.statusEffects ?? {};
  const statusIcons = [
    ...(health === 'injured' ? [['statusInjured', '重伤', '重伤：逃跑速度降低']] : []),
    ...(darkRoom || (effects.blind ?? 0) > 0 ? [['statusBlind', '障目', '障目：在黑暗中无法察觉杀手']] : []),
    ...((effects.undetectable ?? 0) > 0 ? [['statusUndetectable', '无法侦测', '无法侦测：明亮房间也无法发现杀手']] : []),
    ...(person.blockedTurns > 0 ? [['statusBlocked', '无法行动', '无法行动：被限制移动']] : []),
    ...(person.fear >= 100 || (effects.danger ?? 0) > 0 ? [['statusDanger', '危险', '危险状态：恐慌值已满，下一次受到攻击立即倒地']] : []),
    ...((effects.deepWound ?? 0) > 0 ? [['statusDeepWound', '深度伤口', '深度伤口：持续流血，需治疗处理']] : []),
    ...(person.bleed > 0 ? [['statusBleed', '流血', '流血：回合结束持续失去生命']] : []),
    ...((effects.oblivious ?? 0) > 0 ? [['statusOblivious', '浑然不觉', '浑然不觉：暂时不会主动察觉危险']] : []),
    ...((effects.incurable ?? 0) > 0 ? [['statusIncurable', '不治', '不治：无法治疗至健康状态']] : []),
    ...((effects.cursed ?? 0) > 0 ? [['statusCursed', '被诅咒', '被诅咒：图腾存在时恐惧持续增加']] : []),
  ].map(([asset, name, desc]) => `<span class="person-status-icon" title="${desc}"><img src="${uiIcon(asset as Parameters<typeof uiIcon>[0])}" alt="${name}" onerror="this.style.display='none'"></span>`).join('');
  const watchMark = person.watched
    ? '<span class="chip-watch locked" title="夜幕锁定：持续显形，下一刀直接击倒">锁定</span>'
    : person.watchValue > 0
      ? `<span class="chip-watch" title="夜幕监视值 ${person.watchValue}/100">监视 ${person.watchValue}</span>`
      : '';
  const label = person.intent === 'idle' ? person.activity : INTENT_LABEL[person.intent];
  const dialogue = person.dialogue ? `<span class="person-dialogue" aria-hidden="true">${escape(person.dialogue)}</span>` : '';
  const action = targetMode === 'hatchet'
    ? 'hatchet-target'
    : carryable ? 'carry' : 'person';
  const note =
    targetMode === 'hatchet'
      ? ' · 点击投掷狩猎飞斧'
      : person.role === 'police'
          ? ' · 警察：不能攻击，他会循着现场追你'
          : attackable
            ? ' · 点击对他挥刀'
            : '';
  const slotStyleAttr = slotStyle ? ` style="${slotStyle}"` : '';
  return `<button type="button" class="person-chip ${cls} ${person.bloodSacrifice ? 'blood-sacrifice' : ''} ${person.trapTriggered ? 'trap-triggered' : ''} ${health === 'downed' ? 'is-downed' : ''} ${attackable ? 'can-hit' : ''} ${targetMode ? 'targeting-' + targetMode : ''}"${slotStyleAttr} data-action="${action}" data-person-id="${person.id}"${attackable ? ' data-attack="1"' : ''}
    title="${escape(person.name)} · ${HEALTH_LABEL[health]} · ${awarenessLabel(person.alert)} ${person.alert}/100 · ${escape(ARCH_LABEL[person.archetype])} · ${escape(GOAL_LABEL[person.goal])} · 正在${escape(label)}${note}">
    ${avatarHtml}${trapHitMark}
    ${dialogue}<span>${escape(person.name)}</span>${contractTargetMark}${stateMark}<span class="person-status-row">${statusIcons}</span>${alertMark}${watchMark}
  </button>`;
}

/** 感知到的红色人影：看得出「有人」，看不出是谁 */
export function shadowFigures(count: number): string {
  return Array.from({ length: Math.min(3, count) }, () => '<span class="shadow-figure"></span>').join('');
}

export function personPortraitHtml(profile: PersonProfile): string {
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
  const routine = person ? ROUTINE_PROFILE[person.archetype] : null;
  const habit = person?.goal === 'routine' && routine
    ? person.routineObserved
      ? `${routine.label}已确认；常去路线：${routine.rooms.map(roomName).join(' → ')}。`
      : `${routine.hint}（重复观察两次可确认完整路线。）`
    : profile.habit;
  const paras = [...profile.bio, `习惯：${habit}`, `秘密：${profile.secret}`];
  if (person) {
    const health = conditionOf(person);
    paras.push(
      `状态：${HEALTH_LABEL[health]}（${person.hp}/4）。行为类型：${ARCH_LABEL[person.archetype]}。`,
      `目的：${GOAL_LABEL[person.goal]}。当前状态：${INTENT_LABEL[person.intent]}。`,
      `警戒值：${awarenessLabel(person.alert)}（${person.alert}/100）。恐惧值：${person.fear}/100${person.fear >= 100 ? '（精神崩溃）' : person.fear >= 70 ? '（濒临崩溃）' : ''}。行为：${person.activity || '暂无明显动作'}。`,
    );
    if (person.dialogue) paras.push(`听见他说：“${person.dialogue}”`);
    if (person.item) paras.push(`携带物品：${SURVIVOR_ITEM_LABEL[person.item]}（剩余 ${person.itemUses} 次）。`);
    if (person.marked) paras.push('契约情报：这是本局指定目标。');
    if (person.bloodSacrifice) paras.push('特殊身份：本局血祭品。');
    if (isPersonVisible(state, person)) {
      paras.push(`位置：${roomName(person.room)}。`);
    } else {
      paras.push(`位置：${roomName(person.lastSeenRoom)}（最后确认于第 ${person.lastSeenTurn} 回合，现在不知道在哪）。`);
    }
    if (person.hidden) paras.push('他躲起来了：点左下角的「搜索」翻柜子（1 点行动点），不然打不到他。');
    if (person.sneaky) paras.push('老练：有时会踮着脚走路，鞋印仍会留下，但不会惊动乌鸦——这种状态不会一直持续。');
    if (person.armed) paras.push('他手里有武器：进门时可能反击，让你下回合少走一步。');
    if (health === 'downed') paras.push(`倒地：现在即可处决；如果暂时放过他，同伴仍可能赶来救援，${Math.max(0, BLEEDOUT_TURNS - person.downedTurns)} 回合后会因失血死亡。`);
    if (threat) paras.push(`威胁：这名角色会主动对抗你，别把他当普通平民。`);
    if (profile.role === 'police') {
      paras.push(
        '警察可以攻击，但代价极高。他循着「新鲜现场」追你，同屋越久你的暴露度涨得越快——满 100 就会被捕（灵异鬼怪则是被驱散）。剪电话、制造假现场、或者干脆离开这条街，才能甩掉他。',
      );
    }
  } else {
    paras.push('档案状态：已从现场消失。');
  }
  const localAction = person && person.room === state.playerRoom && person.role !== 'police'
    ? person.hp <= 0
      ? (() => {
          const reason = executeBlockReason(state, person.id);
          const carry = !state.carryPersonId
            ? `<button class="btn ghost" data-action="carry" data-person-id="${escape(person.id)}">抱起搬运</button>`
            : '';
          return `<div class="person-detail-actions">
            <button class="btn execute-action" data-action="execute-target" data-person-id="${escape(person.id)}" ${reason ? 'disabled' : ''}>处决 · 1 AP</button>
            ${carry}
            <small>${reason ? escape(reason) : '现在可以处决；若放过他，同伴仍可能赶来救援。'}</small>
          </div>`;
        })()
      : (() => {
          const reason = attackBlockReason(state, person.id);
          return `<div class="person-detail-actions">
            <button class="btn attack" data-action="attack-target" data-person-id="${escape(person.id)}" ${reason ? 'disabled' : ''}>攻击 · 1 AP</button>
            <small>${reason ? escape(reason) : '对这名幸存者发动攻击。'}</small>
          </div>`;
        })()
    : '';
  return `<div class="person-detail-view">
    <div class="person-detail-toolbar">
      <span>幸存者档案</span>
      <button type="button" class="btn ghost mini" data-action="close-person-detail" aria-label="关闭人物档案">收起 ×</button>
    </div>
    ${detailCardHtml(
    profile.name,
    `${roleName} / ${profile.occupation} / ${profile.age ? `${profile.age} 岁` : '年龄不详'} · ${profile.tags.join(' · ')}`,
    rarityLabel,
    paras,
    rarityKey,
    `<div class="person-detail-lead">${personPortraitHtml(profile)}</div>${person?.item ? `<div class="person-item-detail">${itemIconHtml(person.item)}<span><b>${escape(SURVIVOR_ITEM_LABEL[person.item])}</b><small>剩余 ${person.itemUses} 次</small></span></div>` : ''}`,
  )}${localAction}</div>`;
}

