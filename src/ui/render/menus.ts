import { CARDS, deckCardsForKiller } from '../../game/cards';
import {
  BASE_AP,
  ATTACK_COST,
  WIPE_COST,
  SCORE_EXECUTION_THRESHOLD,
  SCORE_RULES,
  DAWN_PHASE_TURNS,
  DAWN_ALARM_GAIN,
  DAWN_ALERT_GAIN,
  DAWN_LATE_ALARM,
} from '../../game/engine';
import { SURVIVOR_MAX_HP } from '../../game/constants';
import { CONTRACT_TURNS } from '../../game/missions';
import { ACTIVE_KILLERS } from '../../game/killers';
import type { SaveData } from '../../game/types';
import { currentMenuMap, mapArtSrc } from '../mapArt';
import { detailCardHtml, escape, getKiller, icon, killerFaceHtml, perkIconHtml, powerIconHtml, TYPE_NAMES } from './shared';

export function renderMenu(save: SaveData, ante = false): string {
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

        <div class="section-title">选择你的怪物 <small>力量图标取自图鉴 · 全部游戏机制原创</small></div>
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
          <div><small>历史最高分</small><b>${save.bestScore}</b></div>
          <div><small>完成任务数</small><b>${save.wins}</b></div>
          <div><small>当前牌组</small><b>${save.deck.length} 张</b></div>
          <div><small>已解锁卡牌</small><b>${save.unlockedCards.filter((id) => deckCardsForKiller(killer.owner).some((card) => card.id === id)).length} / ${deckCardsForKiller(killer.owner).length}</b></div>
          <div><small>处决图鉴</small><b>${(save.executionRecords ?? []).length} / 6</b></div>
        </div>
        <div class="actions">
          <button class="btn primary" data-action="start">准备开始 · 随机契约</button>
          <button class="btn ${ante ? 'primary' : ''}" data-action="ante" title="多接一个高难目标：达成契约分 +60%，未达成 −50%">加注 · ${ante ? '已开启' : '关闭'}</button>
          <button class="btn" data-action="free-hunt">自由猎杀</button>
          <button class="btn" data-action="deck">编辑牌组</button>
          <button class="btn" data-action="shop">卡牌商店</button>
          <button class="btn ghost" data-action="guide">玩法指引</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * 玩法指引：由数据生成，而不是手写文案。
 * 卡牌来自 CARDS、杀手来自 ACTIVE_KILLERS、数值来自引擎常量与 SCORE_RULES，
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

  const R = SCORE_RULES;
  const scoreRows: Array<[string, string]> = [
    ['击杀 1 人', `+${R.kill}`],
    ['处决 1 次', `+${R.execution}`],
    ['处决方式每多 1 种', `+${R.executionVariety}`],
    ['连杀（同回合第 2 人起）', `+${R.comboKill}`],
    ['击杀已恐惧崩溃的目标', `+${R.terrorKill}`],
    ['全程无人成功报警', `+${R.noAlarm}`],
    [`结束时警报低于 ${R.lowAlarmBelow}`, `+${R.lowAlarm}`],
    ['无目击猎杀', `+${R.quietKill}/次，上限 ${R.quietKillCap}`],
    ['用过 3 种卡后，每多 1 种', `+${R.cardVarietyStep}，上限 ${R.cardVarietyCap}`],
    ['胜利结算每剩余 1 回合', `+${R.efficiencyPerTurn}`],
    ['加注达成', '契约分 +60%'],
    ['逃走 1 人', `−${R.escapePenalty}`],
    ['被警察抓捕 / 超时 / 失败', `−${R.caught} / −${R.timeout} / −${R.failed}`],
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
              <li><b>接契约</b>：点「准备开始」后随机抽取，主目标可能是指定击杀、累计击杀、处决、破坏电闸或阻止报警。</li>
              <li><b>潜伏接近</b>：隔壁只看得到名字、看不到人。黑暗会降低对方的察觉速度，但你也看不清。</li>
              <li><b>制造恐惧</b>：杀戮、尖叫、断电、独处都会推高幸存者的恐惧；吓崩的人会僵住或乱跑。</li>
              <li><b>收人</b>：两刀放倒，再补一次处决。处决方式越多样，分数越高。</li>
              <li><b>结算</b>：主目标完成后可以立刻结算，也可以继续做额外挑战——但天亮会持续推进。</li>
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
            <p>倒地后有三种处理：<b>普通处决</b>（1 AP）、<b>搬运到地点处决</b>（6 种地点，加分更多）、以及评分达到 ${SCORE_EXECUTION_THRESHOLD} 后的<b>分数处决</b>（独立按钮 + QTE）。</p>
          </section>

          <section class="g-sec">
            <h2>4 · 恐惧：最划算的武器</h2>
            <div class="g-bands">
              <div><b>0–29 冷静</b><span>该干嘛干嘛：报警、找武器、救人</span></div>
              <div><b>30–59 不安</b><span>开始结伴、远离黑暗</span></div>
              <div><b>60–84 恐惧</b><span>只想跑，不再报警；被追时放板</span></div>
              <div><b>85+ 崩溃</b><span>僵住或尖叫乱跑，补刀极佳</span></div>
            </div>
            <p>恐惧来源：目击死亡、被攻击、<b>独处</b>、<b>黑暗</b>；结伴 + 照明会回落。恐惧崩溃时补刀每次额外 +${R.terrorKill}。</p>
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
              <div class="g-row"><b>血点</b><span>完成任务获得，用于商店解锁卡牌</span></div>
              <div class="g-row"><b>暗金细胞</b><span>胜利且评分 ≥150 时 +1，用于解锁杀手</span></div>
            </div>
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

export function renderDeckEditor(deck: string[], unlocked: string[], killer = '迈克尔·迈尔斯'): string {
  const counts: Record<string, number> = {};
  deck.forEach((id) => (counts[id] = (counts[id] ?? 0) + 1));

  const rows = deckCardsForKiller(killer).map((card) => {
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

