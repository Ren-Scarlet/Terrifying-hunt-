import { CARDS, deckCardsForKiller } from '../../game/cards';
import { BASE_AP } from '../../game/engine';
import { ACTIVE_KILLERS } from '../../game/killers';
import type { SaveData } from '../../game/types';
import { currentMenuMap, mapArtSrc } from '../mapArt';
import { detailCardHtml, escape, getKiller, icon, killerFaceHtml, perkIconHtml, powerIconHtml } from './shared';

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
            <div><small>本局流程</small><b>接取契约 → 潜入布局 → 猎杀撤离</b></div>
            <p>房子里的人各有目的：报警、躲柜子、翻后院。跑掉太多人就输了。</p>
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
          <div class="guide-card">${icon('mission')}<b>1 · 接取契约</b><p>每局随机获得任务。主目标旁会显示${icon('missionTarget', 'ui-icon tiny')}标记，告诉你要击杀谁、要杀几个人，或需要收齐多少证据再撤离。</p></div>
          <div class="guide-card">${icon('darkCell')}<b>2 · 现场布局</b><p>布局牌（绿色）在行动阶段打出：剪断电话线、封死逃生点、装窃听。布局打早了才有用。</p></div>
          <div class="guide-card">${icon('escape')}<b>3 · 相邻只看轮廓，推门才是照面</b><p>隔壁房间<b>看得见名字、看不见人</b>——找人得自己走过去，或者靠侦查 / 感知牌。推门会引起注意，但<b>警觉达到 75 才会立即逃跑</b>；低警觉者会先观察、怀疑。<b>暗处能显著降低察觉速度</b>，切断照明、控制动静可以创造接近机会。先打<b>静止隐身</b>再进入，若目标独处且尚未察觉，第一刀会造成 2 点伤害，打开<b>致命窗口</b>。跑掉的人留下<b>鞋印</b>；更远的地方会传来<b>乌鸦叫、地板响</b>。</p></div>
          <div class="guide-card">${icon('bloodPoint')}<b>4 · 行动点、脚印与杀戮</b><p>每回合 <b>${BASE_AP} 点行动点</b>：走路、挥刀、出牌、<b>搜索柜子</b>全从这一个池子里扣；砍完想立刻再砍，就花 1 点<b>擦刀</b>——但擦刀时幸存者也会跟着动。攻击只针对站立目标，倒地者使用独立的<b>处决</b>按钮（1 AP），但如果你暂时放过他，同伴仍可能救援；有人钻进柜子就点<b>搜索</b>翻出来。<b>鞋印</b>只看得见当前房间（留最近两次行动），严格踩着它连续追才攒<b>杀戮</b>，随便走不涨；满 50 后每回合多 2 点行动点，<b>路你自己走，不会瞬移</b>。砍中人或被击晕清零。</p></div>
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

