import { CARDS } from '../game/data/cards';
import { ACTIVE_KILLERS } from '../game/data/killers';
import { ACCESSORIES, ACCESSORY_RARITY_LABEL } from '../game/data/accessories';
import type { Op } from '../game/effect';
import { exportTuning, hasTuning, createCustomCard, duplicateCard, deleteCard, isAddonTuned } from '../game/tuning';
import { isCloudSignedIn } from '../game/cloud';
import { DEST_OPTIONS, EFFECT_OPS, FLAG_OPTIONS, SABOTAGE_OPTIONS, STATUS_OPTIONS, WHO_OPTIONS, type EffectFieldType } from '../game/effectCatalog';
import { ADDON_RARITY_BG, PERK_RARITY_BG, accessoryImage, cardImage } from '../game/assetMap';
import { modifierLabel } from '../game/modifiers';

/**
 * ============================================================================
 *  平衡调整界面
 * ============================================================================
 *
 *  主菜单 →「平衡调整」打开。所有输入框的 data-tune 形如：
 *    card|卡牌id|cost            卡牌费用
 *    card|卡牌id|0.amount        第 1 条指令的 amount
 *    card|卡牌id|0.then.1.turns  条件分支里的第 2 条指令
 *    power|杀手|能力id|cooldown  能力冷却
 *  改动会写回运行中的数据表，下一局立刻生效，同时存进 localStorage。
 */

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function options(list: ReadonlyArray<readonly [string, string]>, current: unknown): string {
  return list
    .map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function fieldHtml(op: Op, field: string, type: EffectFieldType, tuneKey: string): string {
  const record = op as unknown as Record<string, unknown>;
  const value = record[field];
  if (type === 'text') {
    return `<input type="text" data-tune="${tuneKey}.${field}" value="${escape(String(value ?? ''))}" aria-label="${field}">`;
  }
  if (type === 'who' || type === 'dest' || type === 'flag' || type === 'sabotage' || type === 'status') {
    const list =
      type === 'who' ? WHO_OPTIONS : type === 'dest' ? DEST_OPTIONS : type === 'flag' ? FLAG_OPTIONS : type === 'status' ? STATUS_OPTIONS : SABOTAGE_OPTIONS;
    return `<select data-tune="${tuneKey}.${field}">${options(list, value)}</select>`;
  }
  // 没定义的字段留空，不要显示一个会误伤的 0（比如 maxHp: 0）
  return `<input type="number" step="1" min="0" max="30" data-tune="${tuneKey}.${field}"
    value="${typeof value === 'number' ? value : ''}" placeholder="—" aria-label="${field}">`;
}

function opRow(op: Op, tuneKey: string, depth = 0): string {
  const meta = EFFECT_OPS[op.op];
  const fields = meta.fields;
  const head = `<code class="tune-op-name">${meta.label}</code>`;
  const inputs = fields.map(([field, type]) => fieldHtml(op, field, type, tuneKey)).join('');
  const nested =
    op.op === 'if'
      ? `<div class="tune-nested">
          <span class="tune-cond">条件：${escape(JSON.stringify(op.cond))}</span>
          <div class="tune-branch"><em>满足</em>${op.then.map((o, i) => opRow(o, `${tuneKey}.then.${i}`, depth + 1)).join('')}</div>
          ${op.else?.length ? `<div class="tune-branch"><em>否则</em>${op.else.map((o, i) => opRow(o, `${tuneKey}.else.${i}`, depth + 1)).join('')}</div>` : ''}
        </div>`
      : '';
  return `<div class="tune-op" style="--depth:${depth}">${head}${inputs}</div>${nested}`;
}

function opsHtml(ops: Op[], prefix: string, cardId?: string): string {
  if (!ops.length) return '<div class="tune-empty">没有指令，使用下方菜单添加效果。</div>';
  return ops.map((op, i) => {
    const controls = cardId ? '<div class="tune-op-controls">' +
      '<button type="button" data-action="admin-op-move" data-card="' + cardId + '" data-index="' + i + '" data-direction="-1" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
      '<button type="button" data-action="admin-op-move" data-card="' + cardId + '" data-index="' + i + '" data-direction="1" ' + (i === ops.length - 1 ? 'disabled' : '') + '>↓</button>' +
      '<button type="button" data-action="admin-op-remove" data-card="' + cardId + '" data-index="' + i + '">删除</button></div>' : '';
    return '<div class="tune-op-editor">' + opRow(op, prefix + i) + controls + '</div>';
  }).join('');
}

function effectOptionsHtml(): string {
  return Object.entries(EFFECT_OPS).filter(([key]) => key !== 'if').map(([key, meta]) => `<option value="${key}">${meta.label}</option>`).join('');
}

function cardBlock(): string {
  return CARDS.map((card) => {
    const img = cardImage(card.id);
    return `<div class="tune-card">
      <div class="tune-head">
        <span class="tune-perk">
          <img src="${PERK_RARITY_BG}" alt="" onerror="this.style.display='none'">
          ${img ? `<img class="tune-glyph" src="${img}" alt="" onerror="this.style.display='none'">` : ''}
        </span>
        <b>${escape(card.name)}</b>
        <label class="tune-cost">费 <input type="number" min="0" max="6" data-tune="card|${card.id}|cost" value="${card.cost}"></label>
        <button type="button" class="btn mini ghost" data-action="admin-card-copy" data-card="${card.id}">复制</button>
        <button type="button" class="btn mini ghost" data-action="admin-card-delete" data-card="${card.id}">删除</button>
      </div>
      <label class="tune-description">卡牌名称<input type="text" maxlength="60" data-tune="card|${card.id}|name" value="${escape(card.name)}"></label>
      <label class="tune-description">卡牌类型<select data-tune="card|${card.id}|type">${options([['attack','攻击'],['skill','技能'],['tactic','战术'],['setup','布置']], card.type)}</select></label>
      <label class="tune-description">卡牌描述<textarea rows="3" data-tune="card|${card.id}|desc">${escape(card.desc)}</textarea></label>
      <label class="tune-description">风味文字<input type="text" maxlength="160" data-tune="card|${card.id}|flavor" value="${escape(card.flavor)}"></label>
      <label class="tune-no-action"><input type="checkbox" data-tune="card|${card.id}|noAction" ${card.noAction ? 'checked' : ''}> 不推进幸存者行动（不消耗世界行动）</label>
      <div class="tune-ops">${opsHtml(card.ops, `card|${card.id}|`, card.id)}</div>
      <div class="tune-add-row"><select aria-label="选择要添加的效果" id="addEffect-${card.id}">${effectOptionsHtml()}</select><button type="button" class="btn mini" data-action="admin-op-add" data-card="${card.id}">＋ 添加效果</button></div>
      <label class="tune-description">出牌条件<select data-tune="card|${card.id}|precheck">${options([['none','无条件'],['victimHere','当前房间有可攻击目标'],['downedHere','当前房间有倒地目标'],['injuredHere','当前房间有受伤目标'],['targetAway','有目标在其他房间'],['visibleSurvivor','视野内有存活幸存者'],['survivorNearby','当前或相邻房间有幸存者'],['carryingPerson','正在抱着幸存者'],['currentDestructible','当前房间有可破坏物品']], card.precheck?.cond.c ?? 'none')}</select></label>
      ${card.precheck ? `<div class="tune-pre">条件提示：${escape(card.precheck.hint)}</div>` : ''}
    </div>`;
  }).join('');
}

function powerBlock(): string {
  return ACTIVE_KILLERS.map((killer) => {
    const powers = killer.powers
      .map(
        (power) => `<div class="tune-card">
          <div class="tune-head">
            <span class="tune-power-icon"><img src="${killer.icon}" alt="" onerror="this.style.display='none'"></span>
            <b>${escape(power.name)}</b>
            <label class="tune-cost">CD <input type="number" min="1" max="8" data-tune="power|${killer.owner}|${power.id}|cooldown" value="${power.cooldown}"></label>
            ${power.ultimate ? '<em class="tune-ult">大招</em>' : ''}
          </div>
          <div class="tune-ops">${opsHtml(power.ops, `power|${killer.owner}|${power.id}|`)}</div>
        </div>`,
      )
      .join('');
    return `<div class="tune-killer"><h3>${escape(killer.owner)} <small>${escape(killer.title)}</small></h3>
      <div class="tune-killer-powers">${powers}</div></div>`;
  }).join('');
}

/** 后台的「配件」标签页：只调说明和已定义修正键的数值，保持名称与图标不变。 */
function addonBlock(): string {
  return ACCESSORIES.map((item) => `
    <div class="tune-card">
      <div class="tune-head">
        <span class="tune-perk">
          <img src="${ADDON_RARITY_BG[item.rarity]}" alt="" onerror="this.style.display='none'">
          <img class="tune-glyph" src="${accessoryImage(item.id)}" alt="" onerror="this.style.display='none'">
        </span>
        <b>${escape(item.name)}</b>
        <em class="tune-ult">${ACCESSORY_RARITY_LABEL[item.rarity]}</em>
        ${isAddonTuned(item.id) ? '<span class="admin-state dirty">已改</span>' : ''}
      </div>
      <label class="tune-description">效果说明<input type="text" maxlength="500" data-addon="${item.id}|desc" value="${escape(item.desc)}"></label>
      <div class="tune-mods">
        ${item.mods.map((mod) => `<label class="tune-mod">${modifierLabel(mod.key)}<input type="number" step="1" min="-1000" max="1000" data-addon="${item.id}|${mod.key}" value="${mod.value}"></label>`).join('')}
      </div>
      <div class="tune-pre">${escape(item.owner)} · 图鉴：${escape(item.sourceSkill)}${item.sourceText ? ` · ${escape(item.sourceText)}` : ''}</div>
    </div>
  `).join('');
}

const IS_OFFLINE_DESKTOP = window.location.protocol === 'file:';

export type AdminTab = 'cards' | 'powers' | 'addons';

let adminTab: AdminTab = 'cards';

export function setAdminTab(tab: AdminTab): void {
  adminTab = tab;
}

export function renderAdmin(): string {
  const tab = adminTab;
  return `
    <div class="overlay admin-overlay">
      <div class="modal admin-modal">
        <div class="subtitle">BALANCE WORKBENCH</div>
        <h1>平衡<span>调整</span></h1>
        <p class="admin-lead">本地卡牌工作台：改动只保存在当前浏览器，不会自动上传或影响其他玩家。可直接调整费用、描述、行动规则，以及现有效果指令的参数与状态类型；配置可导出备份。</p>
        <div class="admin-toolbar">
          <span class="admin-state ${hasTuning() ? 'dirty' : ''}">${hasTuning() ? '正在使用本地改动' : '使用原始数值'}</span>
          <button class="btn mini" data-action="admin-export">导出数据</button>
          <button class="btn mini ghost" data-action="admin-reset">恢复默认</button>
          <button class="btn" data-action="workshop-open">配件工坊</button>
          <button class="btn primary" data-action="admin-close">返回菜单</button>
        </div>
        <div class="admin-cloud" style="${IS_OFFLINE_DESKTOP ? 'display:none' : ''}"><h2>云端同步</h2><p id="cloudStatus" role="status">${isCloudSignedIn() ? "GitHub 管理员已授权" : "尚未验证 GitHub 管理密钥"}</p><div class="admin-cloud-actions"><input id="githubToken" type="password" autocomplete="off" placeholder="粘贴 Fine-grained Personal Access Token"><button class="btn mini" data-action="cloud-login">验证密钥</button><button class="btn mini ghost" data-action="cloud-logout">退出授权</button><button class="btn mini" data-action="cloud-load">读取云端配置</button><button class="btn mini primary" data-action="cloud-save">上传当前配置</button></div><p>密钥只保存在当前页面内存中，刷新页面后需要重新验证。玩家无需密钥即可读取公开配置。</p></div><div class="admin-export admin-import">
          <label for="adminImportText">导入 JSON 备份</label>
          <textarea id="adminImportText" rows="5" placeholder="把之前导出的 JSON 粘贴到这里"></textarea>
          <div class="admin-export-actions">
            <button class="btn mini" data-action="admin-import">校验并导入</button>
            <span id="adminImportStatus" role="status" aria-live="polite"></span>
          </div>
          <p>导入前会检查卡牌 / 能力 ID、效果指令结构和数值范围；不合法的文件不会覆盖当前配置。</p>
        </div>
        <div class="admin-export" id="adminExport" hidden>
          <p>把下面这段发给我，就能固化进代码；也可以自己存成备份，下次用「导入」贴回来。</p>
          <textarea id="adminExportText" readonly rows="8">${escape(exportTuning())}</textarea>
          <div class="admin-export-actions">
            <button class="btn mini" data-action="admin-copy">复制</button>
            <button class="btn mini ghost" data-action="admin-hide-export">收起</button>
          </div>
        </div>
        <div class="admin-tabs" role="tablist" aria-label="平衡调整分类">
          <button type="button" role="tab" aria-selected="${tab === 'cards'}" class="btn mini ${tab === 'cards' ? 'primary' : 'ghost'}" data-action="admin-tab" data-tab="cards">卡牌 <small>${CARDS.length}</small></button>
          <button type="button" role="tab" aria-selected="${tab === 'powers'}" class="btn mini ${tab === 'powers' ? 'primary' : 'ghost'}" data-action="admin-tab" data-tab="powers">杀手能力 <small>${ACTIVE_KILLERS.length}</small></button>
          <button type="button" role="tab" aria-selected="${tab === 'addons'}" class="btn mini ${tab === 'addons' ? 'primary' : 'ghost'}" data-action="admin-tab" data-tab="addons">配件 <small>${ACCESSORIES.length}</small></button>
        </div>
        <div class="admin-sections">
          ${tab === 'cards' ? `<section>
            <h2>卡牌 <small>${CARDS.length} 张 · 可新建、复制、删除并编辑完整效果</small></h2>
            <p class="admin-lead">新卡默认加入通用卡池。攻击步骤可设置命中后流血次数和状态持续次数；0 表示不施加。</p>
            <button type="button" class="btn primary" data-action="admin-card-new">＋ 新建卡牌</button>
            <div class="admin-grid">${cardBlock()}</div>
          </section>` : ''}
          ${tab === 'powers' ? `<section>
            <h2>杀手能力 <small>${ACTIVE_KILLERS.length} 位 · 冷却与效果数值</small></h2>
            ${powerBlock()}
          </section>` : ''}
          ${tab === 'addons' ? `<section>
            <h2>力量配件 <small>${ACCESSORIES.length} 件 · 说明与统一修正层数值</small></h2>
            <p class="admin-lead">配件名称与图标取自图鉴，这里只改说明和数值。改动写进同一套修正层，下一局立刻生效；负数表示反向效果（例如冷却 +1 写成 1，冷却 -1 写成 -1）。</p>
            <div class="admin-grid">${addonBlock()}</div>
          </section>` : ''}
        </div>
      </div>
    </div>
  `;
}
