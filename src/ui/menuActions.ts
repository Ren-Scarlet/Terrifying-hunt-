/**
 * 大厅 / 面板类界面动作：杀手选择、牌组编辑、商店、配件装配、引导、返回大厅。
 *
 * 全部通过 `ActionRegistry` 注册，处理器只负责「改状态 + 请求重绘」，
 * 不再依赖 main.ts 里 if 链的顺序。
 */
import { CARD_MAP, STARTING_DECK, deckCardsForKiller } from '../game/cards';
import { shopPrice } from './render/menus';
import {
  ACCESSORY_SLOTS,
  buyAccessory,
  consumeAccessories,
  loadoutForRun,
  sanitizeAccessoryLoadout,
} from '../game/accessories';
import { STARTER_KILLERS } from '../game/killers';
import { writeSave } from '../game/save';
import { playSfx } from './audio';
import type { ActionContext, ActionTable } from './actions';
import type { SaveData } from '../game/types';
import { session } from './session';
import { closePanel, openPanel, setGuideOpen } from './viewState';

/** 尚未选择杀手时使用的默认角色。 */
const FALLBACK_KILLER = '迈克尔·迈尔斯';

export interface MenuActionDeps {
  getSave(): SaveData;
  setSave(next: SaveData): void;
  /** 请求重新渲染当前界面。 */
  render(): void;
  /** 开局（配件确认后调用）。 */
  startGame(freeHunt: boolean, loadout: string[]): void;
  /** 丢弃对局并回到大厅（含菜单背景、角色档案等表现层重置）。 */
  leaveToMenu(): void;
}

export function createMenuActions(deps: MenuActionDeps): ActionTable {
  const save = (): SaveData => deps.getSave();
  const killerOf = (): string => save().killer ?? FALLBACK_KILLER;

  // 出发前先选配件：配件买过即永久拥有，这一步只是从已拥有里挑两件带上。
  const beginRun = (ctx: ActionContext): void => {
    session.pendingRun = ctx.action === 'free-hunt' ? 'free' : 'contract';
    session.accessoryDraft = loadoutForRun(save(), killerOf());
    openPanel('accessories');
    deps.render();
  };

  return {
    start: beginRun,
    again: beginRun,
    'free-hunt': beginRun,

    accessories: () => {
      session.pendingRun = null;
      session.accessoryDraft = sanitizeAccessoryLoadout(save().accessoryLoadout, killerOf());
      openPanel('accessories');
      deps.render();
    },

    'acc-equip': ({ target }) => {
      const id = target.dataset.id;
      if (id && !session.accessoryDraft.includes(id) && session.accessoryDraft.length < ACCESSORY_SLOTS && (save().accessories?.[id] ?? 0) > 0) {
        session.accessoryDraft = [...session.accessoryDraft, id];
        playSfx('pickup');
        deps.render();
      }
    },

    'acc-remove': ({ target }) => {
      const index = Number(target.dataset.index);
      if (Number.isInteger(index) && index >= 0 && index < session.accessoryDraft.length) {
        session.accessoryDraft = session.accessoryDraft.filter((_, i) => i !== index);
        deps.render();
      }
    },

    'acc-buy': ({ target }) => {
      const id = target.dataset.id;
      const next = id ? buyAccessory(save(), id) : null;
      if (next) {
        deps.setSave(next);
        writeSave(next);
        playSfx('pickup');
      }
      deps.render();
    },

    'acc-close': () => {
      session.pendingRun = null;
      session.accessoryDraft = [];
      closePanel();
      deps.render();
    },

    'acc-confirm': () => {
      const current = save();
      const killer = current.killer ?? FALLBACK_KILLER;
      // 装配栏可能留着还没解锁的配件：进局前按「是否已拥有」再过滤一次。
      const loadout = sanitizeAccessoryLoadout(session.accessoryDraft, killer)
        .filter((id) => (current.accessories?.[id] ?? 0) > 0);
      const mode = session.pendingRun;
      if (mode) {
        deps.setSave(consumeAccessories(current, loadout));
        writeSave(deps.getSave());
        session.pendingRun = null;
        session.accessoryDraft = [];
        deps.startGame(mode === 'free', loadout);
        return;
      }
      deps.setSave({ ...current, accessoryLoadout: loadout });
      writeSave(deps.getSave());
      session.accessoryDraft = [];
      closePanel();
      deps.render();
    },

    menu: () => deps.leaveToMenu(),

    admin: () => {
      openPanel('admin');
      deps.render();
    },

    guide: () => {
      setGuideOpen(true);
      deps.render();
    },

    'guide-close': () => {
      setGuideOpen(false);
      deps.render();
    },

    shop: () => {
      openPanel('shop');
      deps.render();
    },

    'shop-back': () => {
      closePanel();
      deps.render();
    },

    buy: ({ target }) => {
      const current = save();
      const id = target.dataset.id;
      const price = id ? shopPrice(CARD_MAP[id]?.cost ?? 0) : Infinity;
      if (id && CARD_MAP[id] && !current.unlockedCards.includes(id) && current.credits >= price) {
        deps.setSave({
          ...current,
          credits: current.credits - price,
          unlockedCards: [...current.unlockedCards, id],
        });
        writeSave(deps.getSave());
      }
      deps.render();
    },

    killer: ({ target }) => {
      const owner = target.dataset.owner;
      if (!owner || !STARTER_KILLERS.includes(owner)) return;
      const current = save();
      const allowed = new Set(deckCardsForKiller(owner).map((card) => card.id));
      const compatibleDeck = current.deck.filter((id) => allowed.has(id));
      deps.setSave({
        ...current,
        killer: owner,
        deck: compatibleDeck.length >= 10 ? compatibleDeck : [...STARTING_DECK],
        accessoryLoadout: sanitizeAccessoryLoadout(current.accessoryLoadout, owner),
      });
      writeSave(deps.getSave());
      deps.render();
    },

    'unlock-killer': ({ target }) => {
      const owner = target.dataset.owner;
      const current = save();
      if (owner && STARTER_KILLERS.includes(owner) && !current.unlockedKillers.includes(owner) && current.darkCells >= 2) {
        deps.setSave({
          ...current,
          darkCells: current.darkCells - 2,
          unlockedKillers: [...current.unlockedKillers, owner],
          killer: owner,
        });
        writeSave(deps.getSave());
      }
      deps.render();
    },

    deck: () => {
      session.editorDeck = [...save().deck];
      openPanel('deck');
      deps.render();
    },

    'deck-add': ({ target }) => {
      const id = target.dataset.id;
      if (!id) return;
      const count = session.editorDeck.filter((card) => card === id).length;
      const allowed = deckCardsForKiller(killerOf()).some((card) => card.id === id);
      if (allowed && save().unlockedCards.includes(id) && count < 3 && session.editorDeck.length < 15) {
        session.editorDeck.push(id);
      }
      deps.render();
    },

    'deck-remove': ({ target }) => {
      const id = target.dataset.id;
      if (!id) return;
      const index = session.editorDeck.indexOf(id);
      if (index >= 0) session.editorDeck.splice(index, 1);
      deps.render();
    },

    'deck-save': () => {
      if (session.editorDeck.length >= 10 && session.editorDeck.length <= 15) {
        deps.setSave({ ...save(), deck: [...session.editorDeck] });
        writeSave(deps.getSave());
        closePanel();
        deps.render();
      }
    },

    'deck-cancel': () => {
      closePanel();
      deps.render();
    },
  };
}
