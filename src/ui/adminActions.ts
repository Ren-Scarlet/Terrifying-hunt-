/**
 * 平衡面板（`?admin=1`）与云端配置相关的界面动作。
 *
 * 这些动作只跟调参数据、GitHub 授权状态和 DOM 表单有关，不碰对局状态，
 * 因此从 main.ts 的动作长链里独立出来，依赖只有「请求重绘」一项。
 */
import { setAdminTab, type AdminTab } from './admin';
import {
  addCardOp,
  createCustomCard,
  deleteCard,
  duplicateCard,
  exportTuning,
  importTuning,
  moveCardOp,
  removeCardOp,
  resetTuning,
  setAddonDesc,
  setAddonModValue,
  setCardCost,
  setCardDesc,
  setCardFlavor,
  setCardName,
  setCardNoAction,
  setCardOpValue,
  setCardPrecheck,
  setCardType,
  setPowerCooldown,
  setPowerOpValue,
} from '../game/tuning';
import { clearGitHubToken, loadCloudConfig, saveCloudConfig, verifyGitHubToken } from '../game/cloud';
import type { AccessoryModKey } from '../game/types';
import type { ActionTable } from './actions';
import { closePanel } from './viewState';

export interface AdminActionDeps {
  render(): void;
}

export function createAdminActions(deps: AdminActionDeps): ActionTable {
  const status = (id: string): HTMLElement | null => document.getElementById(id);

  return {
    'admin-tab': ({ target }) => {
      const tab = target.dataset.tab;
      if (tab === 'cards' || tab === 'powers' || tab === 'addons') setAdminTab(tab as AdminTab);
      deps.render();
    },

    'admin-close': () => {
      closePanel();
      deps.render();
    },

    'admin-card-new': () => {
      createCustomCard();
      deps.render();
    },

    'admin-card-copy': ({ target }) => {
      const id = target.dataset.card;
      if (!id) return;
      duplicateCard(id);
      deps.render();
    },

    'admin-card-delete': ({ target }) => {
      const id = target.dataset.card;
      if (!id) return;
      if (window.confirm('删除这张卡牌？删除后会从卡池和编辑器中移除。')) deleteCard(id);
      deps.render();
    },

    'admin-op-add': ({ target }) => {
      const id = target.dataset.card;
      const select = id ? document.getElementById(`addEffect-${id}`) as HTMLSelectElement | null : null;
      if (id && select && addCardOp(id, select.value)) deps.render();
    },

    'admin-op-remove': ({ target }) => {
      const id = target.dataset.card;
      const index = Number(target.dataset.index);
      if (id && Number.isInteger(index) && removeCardOp(id, index)) deps.render();
    },

    'admin-op-move': ({ target }) => {
      const id = target.dataset.card;
      const index = Number(target.dataset.index);
      const direction = Number(target.dataset.direction) as -1 | 1;
      if (id && Number.isInteger(index) && moveCardOp(id, index, direction)) deps.render();
    },

    'cloud-login': () => {
      const input = document.getElementById('githubToken') as HTMLInputElement | null;
      const panelStatus = status('cloudStatus');
      const token = input?.value.trim();
      if (!token || !panelStatus) return;
      panelStatus.textContent = '正在验证 GitHub 密钥……';
      void verifyGitHubToken(token).then((login) => {
        if (input) input.value = '';
        panelStatus.textContent = '授权成功：GitHub 账号 ' + login + '。现在可以上传配置。';
      }).catch((error: unknown) => {
        panelStatus.textContent = error instanceof Error ? error.message : '密钥验证失败。';
      });
    },

    'cloud-logout': () => {
      clearGitHubToken();
      const panelStatus = status('cloudStatus');
      if (panelStatus) panelStatus.textContent = '已退出 GitHub 管理员授权。';
    },

    'cloud-load': () => {
      const panelStatus = status('cloudStatus');
      if (panelStatus) panelStatus.textContent = '正在读取云端配置……';
      void loadCloudConfig().then(async (config) => {
        if (!config) throw new Error('云端还没有配置，请先上传一次。');
        const tuningModule = await import('../game/tuning');
        if (!tuningModule.importTuning(JSON.stringify(config))) throw new Error('云端配置结构无效，未覆盖本地配置。');
        if (panelStatus) panelStatus.textContent = '云端配置已读取并应用。';
        deps.render();
      }).catch((error: unknown) => {
        if (panelStatus) panelStatus.textContent = error instanceof Error ? error.message : '读取云端配置失败。';
      });
    },

    'cloud-save': () => {
      const panelStatus = status('cloudStatus');
      if (panelStatus) panelStatus.textContent = '正在上传当前配置……';
      void saveCloudConfig(JSON.parse(exportTuning())).then(() => {
        if (panelStatus) panelStatus.textContent = '上传成功：其他玩家刷新游戏后会读取这份配置。';
      }).catch((error: unknown) => {
        if (panelStatus) panelStatus.textContent = error instanceof Error ? error.message : '上传失败。';
      });
    },

    'admin-reset': () => {
      resetTuning();
      deps.render();
    },

    'admin-import': () => {
      const input = document.getElementById('adminImportText') as HTMLTextAreaElement | null;
      const panelStatus = status('adminImportStatus');
      if (!input || !panelStatus) return;
      const ok = importTuning(input.value);
      panelStatus.textContent = ok
        ? '导入成功，配置已保存。'
        : '导入失败：JSON 格式或数据结构不合法，当前配置未改变。';
      panelStatus.setAttribute('class', ok ? 'tune-import-success' : 'tune-import-error');
      if (ok) deps.render();
    },

    'admin-export': () => {
      const box = document.getElementById('adminExport') as HTMLElement | null;
      const text = document.getElementById('adminExportText') as HTMLTextAreaElement | null;
      if (box) box.hidden = false;
      if (text) {
        text.value = exportTuning();
        text.focus();
        text.select();
      }
    },

    'admin-hide-export': () => {
      const box = document.getElementById('adminExport') as HTMLElement | null;
      if (box) box.hidden = true;
    },

    'admin-copy': () => {
      const text = document.getElementById('adminExportText') as HTMLTextAreaElement | null;
      if (text) {
        text.select();
        void navigator.clipboard?.writeText(text.value);
      }
    },
  };
}

/** 把一次表单变化写回调参数据；返回是否真的写入了。 */
export function applyTuneChange(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
  const key = el.dataset.tune ?? '';
  const addonKey = el.dataset.addon ?? '';
  if (!key && !addonKey) return false;
  const raw = el.value;
  const isNumber = el instanceof HTMLInputElement && el.type === 'number';
  const isCheckbox = el instanceof HTMLInputElement && el.type === 'checkbox';
  // 数字框被清空时不写回，避免把可选字段（如 maxHp）误设成 0
  if (isNumber && raw.trim() === '') return false;
  const value: number | string | boolean = isCheckbox ? el.checked : isNumber ? Number(raw) : raw;

  if (addonKey) {
    const [id, path] = addonKey.split('|');
    if (path === 'desc') setAddonDesc(id, String(value));
    else setAddonModValue(id, path as AccessoryModKey, Number(value));
    return true;
  }

  const parts = key.split('|');
  if (parts[0] === 'card' && parts.length >= 3) {
    const id = parts[1];
    const path = parts[2];
    if (path === 'name') { setCardName(id, String(value)); return true; }
    if (path === 'type') { setCardType(id, String(value) as 'attack' | 'skill' | 'tactic' | 'setup'); return true; }
    if (path === 'flavor') { setCardFlavor(id, String(value)); return true; }
    if (path === 'precheck') { setCardPrecheck(id, String(value)); return true; }
    if (path === 'cost') { setCardCost(id, Number(value)); return true; }
    if (path === 'desc') { setCardDesc(id, String(value)); return true; }
    if (path === 'noAction') { setCardNoAction(id, Boolean(value)); return true; }
    return setCardOpValue(id, path, value);
  }

  if (parts[0] === 'power' && parts.length >= 4) {
    const owner = parts[1];
    const powerId = parts[2];
    const path = parts.slice(3).join('|');
    if (path === 'cooldown') {
      setPowerCooldown(owner, powerId, Number(value));
      return true;
    }
    return setPowerOpValue(owner, powerId, path, value);
  }

  return false;
}
