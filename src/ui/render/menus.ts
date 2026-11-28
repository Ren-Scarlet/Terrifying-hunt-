import { CARDS, deckCardsForKiller } from '../../game/cards';
import {
  ACCESSORY_MAP,
  ACCESSORY_RARITY_LABEL,
  ACCESSORY_SLOTS,
  accessoriesForKiller,
  accessoryPrice,
} from '../../game/accessories';
import {
  BASE_AP,
  ATTACK_COST,
  WIPE_COST,
  BLOOD,
  DAWN_PHASE_TURNS,
  DAWN_ALARM_GAIN,
  DAWN_ALERT_GAIN,
  DAWN_LATE_ALARM,
} from '../../game/engine';
import { SURVIVOR_MAX_HP } from '../../game/constants';
import { CONTRACT_TURNS } from '../../game/missions';
import { ACTIVE_KILLERS } from '../../game/killers';
import type { SaveData } from '../../game/types';
import type { RogueOffer, RogueRun } from '../../game/rogue';
import type { BloodwebOffer, KillerProgress } from '../../game/progress';
import { LEVELS_PER_PRESTIGE, bloodwebCost, totalLevel } from '../../game/progress';
import { currentMenuMap, mapArtSrc } from '../mapArt';
import { detailCardHtml, addonIconHtml, escape, getKiller, icon, killerFaceHtml, perkIconHtml, powerIconHtml, TYPE_NAMES } from './shared';

export function renderMenu(save: SaveData): string {
  const killer = getKiller(save.killer);
  const canAfford = save.darkCells >= 2;
  const map = currentMenuMap();
  const picker = ACTIVE_KILLERS.map((k) => {
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
        <div class="menu-map" title="${escape(map.code)}">
          <img src="${mapArtSrc(map)}" alt="今夜的猎场" loading="lazy">
          <div class="menu-map-copy">
            <small>TONIGHT'S HUNTING GROUND</small>
            <b>今夜的猎场 · ${map.name}</b>
            <span>${escape(map.description)}</span>
          </div>
        </div>
        <div class="menu-hero">
          <div>
            <div class="subtitle">A SOLO SLASHER STRATEGY GAME</div>
            <h1>暗夜<span>杀机</span></h1>
            <p class="hero-copy">你不是逃脱者。你是黑暗中精心策划猎杀的人——<br>观察、布局、切断退路，等待猎物走进致命窗口。</p>
            <div class="hero-rule" aria-hidden="true"></div>
            <div class="resource-bar">
              <span>${icon('bloodPoint')} <b>${save.credits}</b> 血点</span>
              <span>${icon('darkCell')} <b>${save.darkCells}</b> 暗金细胞</span>
              <span>${icon('shard')} 荧光裂片 <small>后续开放</small></span>
            </div>
          </div>
          <div class="menu-mission">
            ${icon('mission', 'ui-icon large')}
            <div><small>本局流程</small><b>随机契约 → 潜入布局 → 完成主目标</b></div>
            <p>点击准备开始后，系统才会随机发放本局契约；不会提前展示任务供你针对性改牌组。房子里的人会报警、躲藏、救援和寻找补给，所有幸存者成功逃离会导致失败。</p>
          </div>
        </div>

        <div class="mode-row" aria-label="选择模式">
          <button class="mode-card" data-action="start">
            <small>主模式</small><b>契约猎杀</b><span>随机契约 · 完成主目标结算</span>
          </button>
          <button class="mode-card" data-action="free-hunt">
            <small>练习</small><b>自由猎杀</b><span>没有强制契约 · 打满 Get 就走</span>
          </button>
          <button class="mode-card rogue ${save.rogue ? 'active' : ''}" data-action="rogue-start">
            <small>独立模式</small><b>肉鸽猎杀</b><span>${save.rogue ? `第 ${save.rogue.depth} 层 · 继续` : '随机卡池 / 随机配件 / 随机规则'}</span>
          </button>
        </div>        <div class="section-title">选择你的怪物 <small>力量图标取自图鉴 · 全部游戏机制原创</small></div>
        <div class="killer-picker">${picker}</div>
        <div class="detail-wrap">${detailCardHtml(
          killer.owner,
          `${killer.title} / ${killer.school === 'supernatural' ? '灵异系' : '现实系'} · 一项专属力量，围绕猎杀计划使用`,
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
          <div><small>血点余额</small><b>${save.credits}</b></div>
          <div><small>完成任务数</small><b>${save.wins}</b></div>
          <div><small>当前牌组</small><b>${save.deck.length} 张</b></div>
          <div><small>已解锁卡牌</small><b>${save.unlockedCards.filter((id) => deckCardsForKiller(killer.owner).some((card) => card.id === id)).length} / ${deckCardsForKiller(killer.owner).length}</b></div>
          <div><small>处决图鉴</small><b>${(save.executionRecords ?? []).length} / 6</b></div>
          <div><small>配件库存</small><b>${Object.values(save.accessories ?? {}).reduce((sum, n) => sum + n, 0)} 件</b></div>
        </div>

        <div class="actions">
          <button class="btn primary" data-action="start">准备开始 · 随机契约</button>
          <button class="btn" data-action="free-hunt">自由猎杀</button>
          <button class="btn" data-action="rogue-start">${save.rogue ? `肉鸽 · 继续第 ${save.rogue.depth} 层` : '肉鸽猎杀'}</button>
          ${save.rogue ? '<button class="btn ghost" data-action="rogue-abandon">放弃肉鸽进度</button>' : ''}
          <button class="btn" data-action="deck">编辑牌组</button>
          <button class="btn" data-action="accessories">配件装配</button>
          ${new URLSearchParams(location.search).get('admin') === '1' ? '<button class="btn ghost" data-action="workshop-open">配件工坊</button>' : ''}
          <button class="btn" data-action="bloodweb">血网升级</button>
          <button class="btn" data-action="shop">卡牌商店</button>
          <button class="btn ghost" data-action="guide">玩法指引</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 玩法指引：由数据生成，而不是手写文案。
 * 卡牌来自 CARDS、杀手来自 ACTIVE_KILLERS、数值来自引擎常量与血点表，
 * 所以改玩法后指南不会过期。
 */
export function renderGuide(): string {
  const cardRows = ['attack', 'skill', 'tactic', 'setup']
    .map((type) => {
      const list = CARDS.filter((card) => card.type === type);
      if (!list.length) return '';
      const items = list.map((card) => `${escape(card.name)}<i>${card.cost}费</i>`).join('');
      return `<div class="g-row"><b>${TYPE_NAMES[type] ?? type}</b><span>${items}</span></div>`;
    })
    .join('');

  const killerRows = ACTIVE_KILLERS.map((killer) => {
    const powers = killer.powers
      .map((power) => `${escape(power.name)}${power.ultimate ? '（大招）' : ''}<i>CD ${power.cooldown}</i>`)
      .join('');
    return `<div class="g-row"><b>${escape(killer.owner)}</b><span>${powers}</span></div>`;
  }).join('');

  const scoreRows: Array<[string, string]> = [
    ['首次发现幸存者', `+${BLOOD.firstDiscover}`],
    ['成功攻击 / 击倒', `+${BLOOD.attack} / +${BLOOD.down}`],
    ['击杀一名幸存者', `+${BLOOD.kill}`],
    ['特殊处决 / 场景处决', `+${BLOOD.specialExecution} / +${BLOOD.locationExecution}`],
    ['未被发现时完成击杀', `+${BLOOD.stealthKill}`],
    ['从柜子搜出 / 陷阱捕获', `+${BLOOD.cabinetFind} / +${BLOOD.trapCapture}`],
    ['破坏电闸 / 电话 / 木门', `+${BLOOD.breaker} / +${BLOOD.phone} / +${BLOOD.breakDoor}`],
    ['布置 / 触发捕兽夹', `+${BLOOD.placeTrap} / +${BLOOD.trapTrigger}`],
    ['完成主要 / 额外任务', `+${BLOOD.primaryTask} / +${BLOOD.optionalTask}`],
    ['全部主要 / 全部额外', `+${BLOOD.allPrimary} / +${BLOOD.allOptional}`],
    ['特殊表现称号', '每个 +300'],
  ];
  const scoreTable = scoreRows.map(([label, value]) => `<div class="g-tr"><span>${label}</span><b>${value}</b></div>`).join('');

  return `
    <div class="overlay">
      <div class="modal guide-modal">
        <div class="guide-head">
          <div class="subtitle">FIELD MANUAL</div>
          <h1>玩法<span>指引</span></h1>
          <p>你是这栋房子的东西，不是被追的人。目标不是"活下去"，而是<b>用最漂亮的方式完成契约，并且拿到更高的分</b>。</p>
        </div>
        <div class="guide-body">
          <section class="g-sec">
            <h2>1 · 一局怎么走</h2>
            <ol class="g-steps">
              <li><b>接契约</b>：点「准备开始」后随机抽取，主目标可能是指定击杀、累计击杀、破坏电闸，额外目标还可能有警报限制与杀手专属任务。</li>
              <li><b>潜伏接近</b>：隔壁只看得到名字、看不到人。黑暗会降低对方的察觉速度，但你也看不清。</li>
              <li><b>制造恐惧</b>：杀戮、尖叫、断电、独处都会推高幸存者的恐惧；吓崩的人会僵住或乱跑。</li>
              <li><b>收人</b>：两刀放倒，再补一次处决。处决方式、陷阱与潜行都会换成血点。</li>
              <li><b>结算</b>：主目标完成后可以立刻结算，也可以继续做额外任务——但天亮会持续推进。</li>
            </ol>
          </section>

          <section class="g-sec">
            <h2>2 · 回合、行动点与天亮</h2>
            <p>契约共 <b>${CONTRACT_TURNS} 回合</b>，每回合 <b>${BASE_AP} 点行动点</b>。走路、挥刀、擦刀、搜索、出牌、抽牌都从这一个池子里扣。</p>
            <p><b>天亮</b>：每 ${DAWN_PHASE_TURNS} 回合推进一个阶段，跨阶段时警报 +${DAWN_ALARM_GAIN}、全场警觉 +${DAWN_ALERT_GAIN}；最后 ${DAWN_PHASE_TURNS} 回合每回合再额外 +${DAWN_LATE_ALARM}。拖得越久越危险。</p>
            <p><b>杀戮值</b>：严格踩着脚印连续追才涨，满了每回合多行动点；砍中人或被击晕会清零。</p>
          </section>

          <section class="g-sec">
            <h2>3 · 挥刀与处决</h2>
            <p>幸存者 ${SURVIVOR_MAX_HP} 点生命：<b>一刀受伤、两刀倒地</b>。挥刀消耗 ${ATTACK_COST} AP，砍完要擦刀（${WIPE_COST} AP）或做别的事才能再砍。</p>
            <p>倒地后有两种处理：<b>普通处决</b>（1 AP）与<b>搬运到地点处决</b>（6 种地点，血点更多）。</p>
          </section>

          <section class="g-sec">
            <h2>4 · 恐惧：最划算的武器</h2>
            <div class="g-bands">
              <div><b>0–29 冷静</b><span>该干嘛干嘛：报警、找武器、救人</span></div>
              <div><b>30–59 不安</b><span>开始结伴、远离黑暗</span></div>
              <div><b>60–84 恐惧</b><span>只想跑，不再报警；被追时放板</span></div>
              <div><b>85+ 崩溃</b><span>僵住或尖叫乱跑，补刀极佳</span></div>
            </div>
            <p>恐惧来源：目击死亡、被攻击、<b>独处</b>、<b>黑暗</b>；结伴 + 照明会回落。恐惧崩溃时击杀会额外计入凶残血点。</p>
          </section>

          <section class="g-sec">
            <h2>5 · 卡牌（${CARDS.length} 张）</h2>
            <p>牌组 10–15 张，同名最多 3 张。费用从行动点扣，所以"这套牌能不能在同一回合连起来"比单卡强度更重要。</p>
            <div class="g-rows">${cardRows}</div>
          </section>

          <section class="g-sec">
            <h2>6 · 杀手与能力</h2>
            <div class="g-rows">${killerRows}</div>
          </section>

          <section class="g-sec">
            <h2>7 · 分数构成</h2>
            <p>HUD 里点「得分构成 · 怎么加分」可以随时看当前明细。完整规则：</p>
            <div class="g-table">${scoreTable}</div>
          </section>

          <section class="g-sec">
            <h2>8 · 经济</h2>
            <div class="g-rows">
              <div class="g-row"><b>血点</b><span>完成任务获得，用于商店解锁卡牌、解锁配件</span></div>
              <div class="g-row"><b>暗金细胞</b><span>胜利时 +1，用于解锁杀手</span></div>
            </div>
          </section>

          <section class="g-sec">
            <h2>9 · 力量配件</h2>
            <p>每位杀手都有 3 件专属配件，出发前最多装 <b>${ACCESSORY_SLOTS} 件</b>。<b>带入即永久消耗</b>：用掉就没有了，想再带得用血点补货；库存本身没有上限。</p>
            <p>配件数值统一走同一套修正层，和卡牌、能力共用一份规则，不会出现两套数字。</p>
            <div class="g-rows">${ACTIVE_KILLERS.map((killer) => {
              const items = accessoriesForKiller(killer.owner)
                .map((item) => `${escape(item.name)}<i>${escape(item.desc)}</i>`)
                .join('');
              return `<div class="g-row"><b>${escape(killer.owner)}</b><span>${items}</span></div>`;
            }).join('')}</div>
          </section>
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
  const rows = deckCardsForKiller(save.killer ?? '').filter((card) => !save.unlockedCards.includes(card.id))
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

/**
 * 出发前的配件装配界面：最多 2 个槽位，配件买过即永久拥有。
 * pendingRun=true 时由「准备开始 / 自由猎杀」进入，确认后直接开猎场。
 */
export function renderBloodweb(
  killer: string,
  progress: KillerProgress,
  credits: number,
  offers: BloodwebOffer[] | null,
  killers: readonly string[],
): string {
  const cost = bloodwebCost(progress);
  const canAfford = credits >= cost;
  return `
    <div class="overlay">
      <div class="modal bloodweb-modal">
        <div class="subtitle">BLOODWEB</div>
        <h1>血网升级</h1>
        <div class="bloodweb-killers">
          ${killers.map((name) => `<button class="bloodweb-killer ${name === killer ? 'active' : ''}" data-action="bloodweb-killer" data-id="${escape(name)}">${escape(name)}</button>`).join('')}
        </div>
        <p class="bloodweb-killer-line">${escape(killer)} · 等级 <b>${progress.level}</b> / ${LEVELS_PER_PRESTIGE}${progress.prestige > 0 ? ` · <b>${progress.prestige} 转</b>` : ''} · 累计 ${totalLevel(progress)} 级</p>
        <div class="bloodweb-buy">
          <div>
            <small>升到 ${progress.level + 1} 级需要</small>
            <b>${cost} 血点</b>
          </div>
          <span>现有 <b>${credits}</b> 血点</span>
          <button class="btn primary" data-action="bloodweb-level" ${canAfford ? '' : 'disabled'}>${canAfford ? `花 ${cost} 血点升级` : '血点不够'}</button>
        </div>
        ${offers
          ? `<div class="bloodweb-offers">${offers.map((offer, index) => `
              <button class="bloodweb-offer ${offer.kind}" data-action="bloodweb-pick" data-index="${index}">
                <small>配件</small>
                <b>${escape(offer.name)}</b>
                <span>${escape(offer.desc)}</span>
              </button>`).join('')}</div>`
          : '<p class="bloodweb-empty">花血点升一级，下面会随机出现该杀手的 3 件配件，选一件进库存。每位杀手等级独立，血点想给谁花就给谁花。</p>'}
        <div class="bloodweb-note">价格随等级上升：1 级 500，10 级 800，20 级 1,200，30 级 1,600，50 级 2,500，75 级 3,500，99 级 5,000。</div>
        <div class="bloodweb-note">每 100 级自动转生（等级回 1、转生 +1）；每累计 30 级把该杀手一张专属卡放进公共池，其他杀手也能构筑。</div>
        <div class="actions">
          <button class="btn ghost" data-action="bloodweb-close">关闭</button>
        </div>
      </div>
    </div>
  `;
}

export function renderAccessoryLoadout(save: SaveData, draft: string[], pendingRun: boolean): string {
  const killer = save.killer ?? '迈克尔·迈尔斯';
  const defs = accessoriesForKiller(killer);
  const owned = (id: string) => save.accessories?.[id] ?? 0;
  const slots = Array.from({ length: ACCESSORY_SLOTS }, (_, index) => {
    const def = ACCESSORY_MAP[draft[index] ?? ''];
    if (!def) {
      return `<div class="acc-slot empty"><b>槽位 ${index + 1}</b><small>空着 · 可从下方装配一件配件</small></div>`;
    }
    return `<div class="acc-slot filled">
      ${addonIconHtml(def.id, def.rarity, 'slot')}
      <div class="acc-slot-info">
        <small>${ACCESSORY_RARITY_LABEL[def.rarity]}</small>
        <b>${escape(def.name)}</b>
        <span>${escape(def.desc)}</span>
      </div>
      <button class="btn mini ghost" data-action="acc-remove" data-index="${index}">卸下</button>
    </div>`;
  }).join('');

  const cards = defs.map((def) => {
    const count = owned(def.id);
    const equipped = draft.includes(def.id);
    const price = accessoryPrice(def.rarity);
    const canEquip = !equipped && draft.length < ACCESSORY_SLOTS && count > 0;
    return `<div class="acc-card ${equipped ? 'equipped' : ''} ${count <= 0 ? 'out' : ''}">
      <div class="acc-card-head">
        ${addonIconHtml(def.id, def.rarity, 'card')}
        <div class="acc-card-title">
          <b>${escape(def.name)}</b>
          <small>${ACCESSORY_RARITY_LABEL[def.rarity]} · 库存 ${count}</small>
        </div>
      </div>
      <p>${escape(def.desc)}</p>
      <div class="acc-card-actions">
        <button class="btn mini ${equipped ? 'ghost' : ''}" data-action="acc-equip" data-id="${def.id}" ${canEquip || equipped ? '' : 'disabled'}>${equipped ? '已装备' : '装备'}</button>
        <button class="btn mini ghost" data-action="acc-buy" data-id="${def.id}" ${save.credits >= price ? '' : 'disabled'}>${icon('bloodPoint', 'ui-icon tiny')} ${price} 补货</button>
      </div>
    </div>`;
  }).join('');

  return `
    <div class="overlay">
      <div class="modal accessory-modal">
        <div class="subtitle">POWER ADD-ONS</div>
        <h1>力量<span>配件</span></h1>
        <p>当前杀手：<b>${escape(killer)}</b>。配件从血网升级获得，出发前最多带 <b>${ACCESSORY_SLOTS} 件</b>，<b>带入会从库存扣掉</b>；不够可以用血点补货。</p>
        <div class="acc-resource">
          <span>${icon('bloodPoint')} 血点 <b>${save.credits}</b></span>
          <span>库存 <b>${defs.reduce((sum, def) => sum + owned(def.id), 0)}</b> 件</span>
          <span>装配 <b>${draft.length}/${ACCESSORY_SLOTS}</b></span>
        </div>
        <div class="acc-slots">${slots}</div>
        <div class="section-title">配件库 <small>名称与图标取自图鉴 · 效果按本作机制简化</small></div>
        <div class="acc-grid">${cards || '<p style="color:var(--muted)">这位杀手还没有配件。</p>'}</div>
        <div class="actions">
          <button class="btn primary" data-action="acc-confirm">${pendingRun
            ? (draft.length ? `进入猎场 · 消耗 ${draft.length} 件配件` : '不携带配件进入猎场')
            : '保存装配 · 返回主菜单'}</button>
          <button class="btn ghost" data-action="acc-close">${pendingRun ? '返回主菜单' : '取消'}</button>
        </div>
      </div>
    </div>
  `;
}

export function renderDeckEditor(deck: string[], unlocked: string[], killer = '迈克尔·迈尔斯', sharedCards: string[] = []): string {
  const counts: Record<string, number> = {};
  deck.forEach((id) => (counts[id] = (counts[id] ?? 0) + 1));

  const rows = deckCardsForKiller(killer, sharedCards).map((card) => {
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
        <p>当前角色：${escape(killer)}。只能从通用初始卡与该角色专属卡中构筑；牌组需要 10–15 张，同一种卡牌最多 3 张。</p>
        <div class="deck-list">${rows}</div>
        <div class="actions">
          <button class="btn primary" data-action="deck-save" ${deck.length < 10 || deck.length > 15 ? 'disabled' : ''}>保存并返回（${deck.length} 张）</button>
          <button class="btn ghost" data-action="deck-cancel">取消</button>
        </div>
      </div>
    </div>
  `;
}


/** 肉鸽：层间三选一奖励 */
export function renderRogueReward(run: RogueRun, offers: RogueOffer[]): string {
  return `
    <div class="overlay rogue-overlay">
      <div class="modal rogue-modal">
        <div class="subtitle">ROGUELIKE HUNT</div>
        <h1>第 ${run.depth} 层 <span>通过</span></h1>
        <p>三层随机奖励，选一个带进下一层。层数越高，开局警报越高、契约回合越少。</p>
        <div class="rogue-offers">
          ${offers.map((offer, index) => `
            <button class="rogue-offer ${offer.kind}" data-action="rogue-pick" data-index="${index}">
              <small>${offer.kind === 'card' ? '卡牌' : '猎场规则'}</small>
              <b>${escape(offer.name)}</b>
              <span>${escape(offer.desc)}</span>
            </button>`).join('')}
        </div>
        <div class="rogue-run-info">
          <span>当前层数 <b>${run.depth}</b></span>
          <span>牌组 <b>${run.deck.length}</b> 张</span>
          <span>配件 <b>${run.accessories.length}</b> 件</span>
          <span>规则 <b>${run.buffs.length}</b> 条</span>
        </div>
        <div class="actions">
          <button class="btn primary" data-action="rogue-next">跳过奖励 · 直接下一层</button>
          <button class="btn ghost" data-action="rogue-end">结束这次肉鸽</button>
        </div>
      </div>
    </div>
  `;
}
