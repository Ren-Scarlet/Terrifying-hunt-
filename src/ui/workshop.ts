import { ACCESSORIES, ACCESSORY_RARITY_LABEL, accessoryPrice } from '../game/data/accessories';
import { ACCESSORY_MAP } from '../game/data/accessories';
import { customAccessoryList, isCustomAccessory, exportCustomAccessories } from '../game/customContent';
import { MOD_KEYS, modifierLabel } from '../game/modifiers';
import { ACTIVE_KILLERS } from '../game/data/killers';
import type { AccessoryDef, AccessoryMod, AccessoryRarity } from '../game/types';
import { accessoryImage } from '../game/assetMap';
import { addonIconHtml, escape } from './render/shared';

/**
 * 配件工坊（作者后台）
 *
 * 打开方式：地址后加 `?admin=1`，主菜单会出现「配件工坊」按钮。
 * 做的配件只存在本机 localStorage，标「自定义」；点导出会把 JSON 复制到剪贴板/下载，
 * 换电脑或发给别人用导入即可。
 */

export interface WorkshopState {
  editing: AccessoryDef | null;
  isNew: boolean;
  message: string;
}

export const workshopState: WorkshopState = { editing: null, isNew: false, message: '' };

const RARITIES = Object.keys(ACCESSORY_RARITY_LABEL) as AccessoryRarity[];

export function newAccessoryDraft(): AccessoryDef {
  return {
    id: '',
    name: '',
    owner: ACTIVE_KILLERS[0]?.owner ?? '设陷者',
    rarity: 'common',
    desc: '',
    sourceSkill: '',
    mods: [{ key: 'ap', value: 1 }],
  };
}

function modRows(def: AccessoryDef): string {
  return def.mods
    .map(
      (mod, index) => `
      <div class="ws-mod" data-mod-index="${index}">
        <select data-acc-mod-key="${index}">
          ${MOD_KEYS.map((key) => `<option value="${key}" ${mod.key === key ? 'selected' : ''}>${escape(modifierLabel(key))}</option>`).join('')}
        </select>
        <input type="number" step="1" data-acc-mod-value="${index}" value="${mod.value}" aria-label="数值">
        <button type="button" class="btn mini ghost" data-action="workshop-mod-remove" data-index="${index}">删除</button>
      </div>`,
    )
    .join('');
}

function editorHtml(def: AccessoryDef, isNew: boolean): string {
  return `
    <div class="ws-editor">
      <div class="ws-editor-head">
        <b>${isNew ? '新建配件' : `编辑：${escape(def.name || def.id)}`}</b>
        <small>id 只能用小写字母、数字、下划线；图标建议 128×128 以内</small>
      </div>
      <div class="ws-grid">
        <label>id<input type="text" data-acc="id" value="${escape(def.id)}" ${isNew ? '' : 'readonly'} placeholder="my_addon_01"></label>
        <label>名称<input type="text" data-acc="name" value="${escape(def.name)}" placeholder="自定义配件"></label>
        <label>所属杀手
          <select data-acc="owner">
            ${ACTIVE_KILLERS.map((k) => `<option value="${escape(k.owner)}" ${def.owner === k.owner ? 'selected' : ''}>${escape(k.owner)}</option>`).join('')}
          </select>
        </label>
        <label>稀有度
          <select data-acc="rarity">
            ${RARITIES.map((rarity) => `<option value="${rarity}" ${def.rarity === rarity ? 'selected' : ''}>${ACCESSORY_RARITY_LABEL[rarity]}（补货 ${accessoryPrice(rarity)} 血点）</option>`).join('')}
          </select>
        </label>
        <label class="ws-wide">效果说明（显示给玩家）<input type="text" data-acc="desc" value="${escape(def.desc)}" placeholder="每回合行动点 +1。"></label>
      </div>
      <div class="ws-icon-row">
        <div class="ws-icon-preview"><img src="${accessoryImage(def.id || 'x')}" alt="图标预览" onerror="this.style.opacity=0"></div>
        <div>
          <label class="btn mini">上传图标<input type="file" id="wsIconInput" accept="image/*" hidden></label>
          ${def.iconData ? '<button type="button" class="btn mini ghost" data-action="workshop-icon-clear">清除图标</button>' : ''}
          <small>会存成 dataURL（建议 &lt; 200KB），否则 localStorage 可能存不下</small>
        </div>
      </div>
      <div class="ws-mods">
        <div class="ws-mods-head"><b>效果数值</b><button type="button" class="btn mini" data-action="workshop-mod-add">＋ 添加效果</button></div>
        ${modRows(def)}
      </div>
      <div class="ws-actions">
        <button type="button" class="btn primary" data-action="workshop-save">保存</button>
        <button type="button" class="btn ghost" data-action="workshop-cancel">取消</button>
      </div>
    </div>
  `;
}

export function renderWorkshop(): string {
  const custom = new Set(customAccessoryList().map((def) => def.id));
  const rows = ACCESSORIES.map((def) => `
    <div class="ws-row ${custom.has(def.id) ? 'custom' : ''}">
      ${addonIconHtml(def.id, def.rarity, 'card')}
      <div class="ws-row-body">
        <b>${escape(def.name)}</b>
        <small>${escape(def.owner)} · ${ACCESSORY_RARITY_LABEL[def.rarity]} · <code>${escape(def.id)}</code>${custom.has(def.id) ? ' · 自定义' : ''}</small>
        <span>${escape(def.desc)}</span>
        <em>${def.mods.map((mod) => `${modifierLabel(mod.key)} ${mod.value > 0 ? '+' : ''}${mod.value}`).join(' · ') || '无效果'}</em>
      </div>
      <div class="ws-row-actions">
        <button type="button" class="btn mini" data-action="workshop-edit" data-id="${escape(def.id)}">编辑</button>
        <button type="button" class="btn mini ghost" data-action="workshop-duplicate" data-id="${escape(def.id)}">复制</button>
        ${custom.has(def.id) ? `<button type="button" class="btn mini ghost" data-action="workshop-delete" data-id="${escape(def.id)}">删除</button>` : ''}
      </div>
    </div>`).join('');

  return `
    <div class="overlay">
      <div class="modal workshop-modal">
        <div class="subtitle">ACCESSORY WORKSHOP</div>
        <h1>配件<span>工坊</span></h1>
        <p class="ws-summary">内置 ${ACCESSORIES.length - custom.size} 件 · 自定义 ${custom.size} 件。自定义配件只存在这台电脑的浏览器里；换设备请先「导出」。</p>
        <div class="ws-toolbar">
          <button class="btn primary" data-action="workshop-new">＋ 新建配件</button>
          <button class="btn" data-action="workshop-export">导出 JSON</button>
          <label class="btn">导入 JSON<input type="file" id="wsImportInput" accept="application/json,.json" hidden></label>
          <span class="ws-msg">${escape(workshopState.message)}</span>
          <button class="btn ghost" data-action="workshop-close">返回大厅</button>
        </div>
        ${workshopState.editing ? editorHtml(workshopState.editing, workshopState.isNew) : ''}
        <div class="ws-list">${rows}</div>
      </div>
    </div>
  `;
}

/** 读/写草稿：输入事件用 */
export function updateDraftField(field: keyof AccessoryDef, value: string | number): void {
  if (!workshopState.editing) return;
  if (field === 'id') workshopState.editing.id = String(value).trim();
  else if (field === 'name' || field === 'desc' || field === 'sourceSkill') workshopState.editing[field] = String(value);
  else if (field === 'owner') workshopState.editing.owner = String(value);
  else if (field === 'rarity') workshopState.editing.rarity = value as AccessoryRarity;
}

export function updateDraftMod(index: number, patch: { key?: AccessoryMod['key']; value?: number }): void {
  const def = workshopState.editing;
  if (!def || !def.mods[index]) return;
  if (patch.key) def.mods[index].key = patch.key;
  if (typeof patch.value === 'number') def.mods[index].value = patch.value;
}

export function addDraftMod(): void {
  if (!workshopState.editing) return;
  workshopState.editing.mods.push({ key: 'ap', value: 1 });
}

export function removeDraftMod(index: number): void {
  if (!workshopState.editing) return;
  workshopState.editing.mods.splice(index, 1);
}

export function startNewDraft(): void {
  workshopState.editing = newAccessoryDraft();
  workshopState.isNew = true;
  workshopState.message = '';
}

export function startEditDraft(id: string): void {
  const def = ACCESSORY_MAP[id];
  if (!def) return;
  workshopState.editing = JSON.parse(JSON.stringify(def));
  workshopState.isNew = false;
  workshopState.message = '';
}

export function duplicateAsDraft(id: string): void {
  const def = ACCESSORY_MAP[id];
  if (!def) return;
  const copy: AccessoryDef = JSON.parse(JSON.stringify(def));
  copy.id = `${def.id}_copy`;
  copy.name = `${def.name} 副本`;
  workshopState.editing = copy;
  workshopState.isNew = true;
  workshopState.message = '';
}

export function downloadJson(json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'custom-accessories.json';
  a.click();
  URL.revokeObjectURL(url);
}

export { exportCustomAccessories, isCustomAccessory };
