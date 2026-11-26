import { CARDS } from '../game/data/cards';
import { ACTIVE_KILLERS } from '../game/data/killers';
import type { Op } from '../game/effect';
import { exportTuning, hasTuning } from '../game/tuning';
import { DEST_OPTIONS, EFFECT_OPS, FLAG_OPTIONS, SABOTAGE_OPTIONS, STATUS_OPTIONS, WHO_OPTIONS, type EffectFieldType } from '../game/effectCatalog';
import { PERK_RARITY_BG, cardImage } from '../game/assetMap';

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
      </div>
      <label class="tune-description">卡牌描述<textarea rows="3" data-tune="card|${card.id}|desc">${escape(card.desc)}</textarea></label>
      <label class="tune-no-action"><input type="checkbox" data-tune="card|${card.id}|noAction" ${card.noAction ? 'checked' : ''}> 不推进幸存者行动（不消耗世界行动）</label>
      <div class="tune-ops">${opsHtml(card.ops, `card|${card.id}|`, card.id)}</div>
      <div class="tune-add-row"><select aria-label="选择要添加的效果" id="addEffect-${card.id}">${effectOptionsHtml()}</select><button type="button" class="btn mini" data-action="admin-op-add" data-card="${card.id}">＋ 添加效果</button></div>
      ${card.precheck ? `<div class="tune-pre">前置：${escape(card.precheck.hint)}</div>` : ''}
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

export function renderAdmin(): string {
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
          <button class="btn primary" data-action="admin-close">返回菜单</button>
        </div>
        <div class="admin-export admin-import">
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
        <div class="admin-sections">
          <section>
            <h2>卡牌 <small>${CARDS.length} 张 · 费用、描述、行动规则与效果参数</small></h2>
            <div class="admin-grid">${cardBlock()}</div>
          </section>
          <section>
            <h2>杀手能力 <small>${ACTIVE_KILLERS.length} 位 · 冷却与效果数值</small></h2>
            ${powerBlock()}
          </section>
        </div>
      </div>
    </div>
  `;
}
