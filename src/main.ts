import './style.css';
import { CARD_MAP, deckCardsForKiller, STARTING_DECK } from './game/cards';
import {
  attack,
  carryPerson,
  executeCarriedPerson,
  createGame,
  discardCard,
  drawCardAction,
  endTurn,
  giveUp,
  lookAround,
  lookAtRoom,
  cancelLookSelection,
  movePlayer,
  playCard,
  searchRoom,
  sabotageSiteItem,
  usePower,
  wipeBlade,
} from './game/engine';
import { loadSave, writeSave } from './game/save';
import {
  applyTuning,
  exportTuning,
  importTuning,
  resetTuning,
  setCardCost,
  setCardOpValue,
  setPowerCooldown,
  setPowerOpValue,
} from './game/tuning';
import { ROOM_MAP } from './game/rooms';
import type { GameState, RoomId, SaveData } from './game/types';
import {
  cardDetailHtml,
  defaultDetailHtml,
  getKiller,
  personDetailHtml,
  renderDeckEditor,
  renderGame,
  renderGuide,
  renderMenu,
  renderResult,
  renderShop,
  shopPrice,
} from './ui/render';
import { renderAdmin } from './ui/admin';
import { mountFloorplanScene, type SceneHandle } from './ui/scene';
import { playSfx, setMusic, toggleMute, unlockAudio } from './ui/audio';

type Screen = 'menu' | 'game' | 'result';

// 先把手动调的平衡数据套进卡牌与能力，之后任何界面读到的都是最新值
applyTuning();

let save: SaveData = loadSave();
let game: GameState | null = null;
let screen: Screen = 'menu';
let editorOpen = false;
let shopOpen = false;
let guideOpen = false;
let adminOpen = false;
let editorDeck: string[] = [...save.deck];
let resultApplied = false;
/** 本局新解锁的卡牌，用于结算面板只提示真正新增的那张 */
let lastNewCard: string | null = null;
/** 信息面板当前展示的卡牌，避免同一张牌重复重绘 */
let detailCardUid: string | null = null;
/** 平面图下方的场景画布 */
let scene: SceneHandle | null = null;
/** 上一次的击杀数与暴露度：用来判断这一手是得手还是暴露了 */
let lastKills = 0;
let lastWanted = 0;

const app = document.getElementById('app')!;

function render(): void {
  // 菜单（含商店/牌组/平衡面板）放角色选择曲，进入对局换背景曲；同一首不会重播
  setMusic(screen === 'menu' || !game ? 'menu' : 'bgm');
  let html = '';
  if (adminOpen) {
    html = renderAdmin();
  } else if (editorOpen) {
    html = renderDeckEditor(editorDeck, save.unlockedCards, save.killer ?? '迈克尔·迈尔斯');
  } else if (shopOpen) {
    html = renderShop(save);
  } else if (screen === 'menu' || !game) {
    html = renderMenu(save);
  } else {
    html = renderGame(game, getKiller(save.killer));
    if (screen === 'result') html += renderResult(game, lastNewCard);
  }
  if (guideOpen) html += renderGuide();
  app.innerHTML = html;
  detailCardUid = null;
  syncScene();
}

/** 把场景画布挂到新的平面图节点上；离开对局时销毁 */
function syncScene(): void {
  const host = app.querySelector<HTMLElement>('.floorplan');
  if (!game || !host || screen === 'menu') {
    if (scene) {
      scene.destroy();
      scene = null;
    }
    document.body.classList.remove('danger');
    return;
  }
  scene = mountFloorplanScene(host, game);

  const here = game.playerRoom;
  const policeNear = game.people.some(
    (p) => p.role === 'police' && (p.room === here || ROOM_MAP[here].neighbors.includes(p.room)),
  );
  document.body.classList.toggle('danger', policeNear || game.wanted >= 7);
}

function pulseFeedback(): void {
  if (!game) return;
  const kills = game.kills;
  const wanted = game.wanted;
  if (kills > lastKills) flash('hit-kill');
  else if (wanted > lastWanted) flash('hit-alert');
  lastKills = kills;
  lastWanted = wanted;
}

/** 屏幕边缘闪一下：得手是暗红，暴露是土黄，0.5s 后自动收起 */
function flash(cls: 'hit-kill' | 'hit-alert'): void {
  document.body.classList.remove(cls);
  // 强制重排，让同一个动画能连续触发两次
  void document.body.offsetWidth;
  document.body.classList.add(cls);
  window.setTimeout(() => document.body.classList.remove(cls), 520);
}

/** 引擎日志里刚发生的事 → 补上对应音效（不侵入纯逻辑层） */
let lastLogHead = '';
function sfxFromLogs(): void {
  if (!game) return;
  const head = game.log[0] ?? '';
  if (head === lastLogHead) return;
  lastLogHead = head;
  if (/恶魔附身：/.test(head)) playSfx('possess');
  else if (/停止了呼吸|处决了/.test(head)) playSfx('kill');
  else if (/致盲|击晕|手电筒|逼退/.test(head)) playSfx('stun');
  else if (/乌鸦|动静/.test(head)) playSfx('crow');
  else if (/翻出了/.test(head)) playSfx('pickup');
  else if (/发电机/.test(head)) playSfx('generator');
}

function afterAction(): void {
  pulseFeedback();
  sfxFromLogs();
  if (game && game.phase === 'gameover' && screen !== 'result') {
    playSfx(game.result === 'win' ? 'win' : 'lose');
    screen = 'result';
    if (!resultApplied) {
      resultApplied = true;
      const newBest = Math.max(save.bestScore, game.score);
      const unlocked = [...save.unlockedCards];
      let wins = save.wins;
      let credits = save.credits;
      let darkCells = save.darkCells;
      if (game.result === 'win') {
        wins += 1;
        credits += Math.max(10, Math.round(game.score / 5));
        if (game.score >= 150) darkCells += 1;
        game.rewardCards.forEach((id) => {
          if (CARD_MAP[id] && !unlocked.includes(id)) {
            unlocked.push(id);
            lastNewCard = lastNewCard ?? id;
          }
        });
      }
      save = { ...save, bestScore: newBest, wins, credits, darkCells, unlockedCards: unlocked };
      writeSave(save);
    }
  }
  render();
}

function startGame(): void {
  game = createGame(save.deck, undefined, save.killer ?? '迈克尔·迈尔斯');
  screen = 'game';
  lastKills = game.kills;
  lastWanted = game.wanted;
  resultApplied = false;
  lastNewCard = null;
  render();
}

function showCardDetail(uid: string | null): void {
  const panel = document.getElementById('cardDetail');
  if (!panel) return;
  if (!uid) {
    panel.innerHTML = defaultDetailHtml();
    detailCardUid = null;
    return;
  }
  if (detailCardUid === uid) return;
  detailCardUid = uid;
  if (game) panel.innerHTML = cardDetailHtml(game, uid);
}

app.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  // 浏览器要求先有用户交互才允许出声
  unlockAudio();

  if (action === 'mute') {
    toggleMute();
    afterAction();
    return;
  }

  if (action === 'start' || action === 'again') {
    startGame();
    playSfx('start');
    return;
  }

  if (action === 'menu') {
    screen = 'menu';
    game = null;
    editorOpen = false;
    shopOpen = false;
    adminOpen = false;
    lastNewCard = null;
    render();
    return;
  }

  if (action === 'admin') {
    adminOpen = true;
    render();
    return;
  }

  if (action === 'admin-close') {
    adminOpen = false;
    render();
    return;
  }

  if (action === 'admin-reset') {
    resetTuning();
    render();
    return;
  }

  if (action === 'admin-import') {
    const input = document.getElementById('adminImportText') as HTMLTextAreaElement | null;
    const status = document.getElementById('adminImportStatus');
    if (!input || !status) return;
    const ok = importTuning(input.value);
    status.textContent = ok
      ? '导入成功，配置已保存。'
      : '导入失败：JSON 格式或数据结构不合法，当前配置未改变。';
    status.setAttribute('class', ok ? 'tune-import-success' : 'tune-import-error');
    if (ok) render();
    return;
  }

  if (action === 'admin-export') {
    const box = document.getElementById('adminExport') as HTMLElement | null;
    const text = document.getElementById('adminExportText') as HTMLTextAreaElement | null;
    if (box) box.hidden = false;
    if (text) {
      text.value = exportTuning();
      text.focus();
      text.select();
    }
    return;
  }

  if (action === 'admin-hide-export') {
    const box = document.getElementById('adminExport') as HTMLElement | null;
    if (box) box.hidden = true;
    return;
  }

  if (action === 'admin-copy') {
    const text = document.getElementById('adminExportText') as HTMLTextAreaElement | null;
    if (text) {
      text.select();
      void navigator.clipboard?.writeText(text.value);
    }
    return;
  }

  if (action === 'discard') {
    if (!game || screen !== 'game') return;
    const cardUid = target.dataset.uid;
    if (cardUid) discardCard(game, cardUid);
    afterAction();
    return;
  }

  if (action === 'guide') {
    guideOpen = true;
    render();
    return;
  }

  if (action === 'guide-close') {
    guideOpen = false;
    render();
    return;
  }

  if (action === 'shop') {
    shopOpen = true;
    render();
    return;
  }

  if (action === 'shop-back') {
    shopOpen = false;
    render();
    return;
  }

  if (action === 'buy') {
    const id = target.dataset.id;
    const price = id ? shopPrice(CARD_MAP[id]?.cost ?? 0) : Infinity;
    if (id && CARD_MAP[id] && !save.unlockedCards.includes(id) && save.credits >= price) {
      save = {
        ...save,
        credits: save.credits - price,
        unlockedCards: [...save.unlockedCards, id],
      };
      writeSave(save);
    }
    render();
    return;
  }

  if (action === 'killer') {
    const owner = target.dataset.owner;
    if (owner) {
      const allowed = new Set(deckCardsForKiller(owner).map((card) => card.id));
      const compatibleDeck = save.deck.filter((id) => allowed.has(id));
      save = { ...save, killer: owner, deck: compatibleDeck.length >= 10 ? compatibleDeck : [...STARTING_DECK] };
      writeSave(save);
      render();
    }
    return;
  }

  if (action === 'unlock-killer') {
    const owner = target.dataset.owner;
    if (owner && !save.unlockedKillers.includes(owner) && save.darkCells >= 2) {
      save = {
        ...save,
        darkCells: save.darkCells - 2,
        unlockedKillers: [...save.unlockedKillers, owner],
        killer: owner,
      };
      writeSave(save);
    }
    render();
    return;
  }

  if (action === 'deck') {
    editorDeck = [...save.deck];
    editorOpen = true;
    render();
    return;
  }

  if (action === 'deck-add' || action === 'deck-remove') {
    const id = target.dataset.id;
    if (!id) return;
    if (action === 'deck-add') {
      const count = editorDeck.filter((c) => c === id).length;
      const allowed = deckCardsForKiller(save.killer ?? '迈克尔·迈尔斯').some((card) => card.id === id);
      if (allowed && save.unlockedCards.includes(id) && count < 3 && editorDeck.length < 15) editorDeck.push(id);
    } else {
      const index = editorDeck.indexOf(id);
      if (index >= 0) editorDeck.splice(index, 1);
    }
    render();
    return;
  }

  if (action === 'deck-save') {
    if (editorDeck.length >= 10 && editorDeck.length <= 15) {
      save = { ...save, deck: [...editorDeck] };
      writeSave(save);
      editorOpen = false;
      render();
    }
    return;
  }

  if (action === 'deck-cancel') {
    editorOpen = false;
    render();
    return;
  }

  // 超过手牌上限时，必须先逐张选择弃牌；禁止用结束回合或其他动作绕过。
  if (game && screen === 'game' && game.hand.length > 6 && action !== 'discard' && action !== 'mute') {
    return;
  }
  // 查看选房期间只接受选房或取消，避免误触卡牌、移动等其他行动。
  if (game && screen === 'game' && game.lookingAround &&
      !['look-select', 'look-cancel', 'mute', 'guide'].includes(action ?? '')) return;

  if (action === 'person') {
    const personId = target.dataset.personId;
    if (personId && game && screen === 'game') {
      // 地图房间里点人头 = 直接对他挥刀；右侧名单 / 不可攻击时 = 看档案
      if (target.dataset.attack === '1') {
        attack(game, personId);
        afterAction();
        return;
      }
      const panel = document.getElementById('cardDetail');
      if (panel) {
        panel.innerHTML = personDetailHtml(game, personId);
        detailCardUid = null;
      }
    }
    return;
  }

  if (action === 'carry') {
    if (!game || screen !== 'game') return;
    const personId = target.dataset.personId;
    if (personId) carryPerson(game, personId);
    afterAction();
    return;
  }

  if (action === 'execute-fridge' || action === 'execute-microwave') {
    if (!game || screen !== 'game') return;
    executeCarriedPerson(game, action === 'execute-fridge' ? 'fridge' : 'microwave');
    playSfx('kill');
    afterAction();
    return;
  }

  if (action === 'power') {
    if (!game || screen !== 'game') return;
    const powerId = target.dataset.power;
    if (powerId) usePower(game, powerId);
    afterAction();
    return;
  }

  if (!game || screen !== 'game') return;

  if (action === 'draw') {
    drawCardAction(game);
    afterAction();
    return;
  }

  if (action === 'move') {
    const room = target.dataset.room as RoomId | undefined;
    if (room) movePlayer(game, room);
    playSfx('step');
    afterAction();
    return;
  }

  if (action === 'attack') {
    const kills = game.kills;
    attack(game);
    playSfx('attack');
    if (game.kills > kills) playSfx('kill');
    afterAction();
    return;
  }

  if (action === 'wipe') {
    wipeBlade(game);
    playSfx('wipe');
    afterAction();
    return;
  }

  if (action === 'sabotage') {
    sabotageSiteItem(game);
    playSfx('sabotage');
    afterAction();
    return;
  }

  if (action === 'search') {
    searchRoom(game);
    playSfx('click');
    afterAction();
    return;
  }

  if (action === 'look') {
    lookAround(game);
    playSfx('click');
    render();
    return;
  }

  if (action === 'look-cancel') {
    cancelLookSelection(game);
    playSfx('click');
    render();
    return;
  }

  if (action === 'look-select') {
    const room = target.dataset.room as RoomId | undefined;
    if (room) lookAtRoom(game, room);
    playSfx('click');
    afterAction();
    return;
  }

  if (action === 'play') {
    const cardUid = target.dataset.uid;
    if (cardUid) playCard(game, cardUid);
    playSfx('click');
    afterAction();
    return;
  }

  if (action === 'end-turn') {
    endTurn(game);
    playSfx('endturn');
    afterAction();
    return;
  }

  if (action === 'give-up') {
    giveUp(game);
    afterAction();
  }
});

/* 平衡调整：任何输入/下拉变化都直接写回运行中的数据 */
app.addEventListener('change', (event) => {
  const el = (event.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement>('[data-tune]');
  if (!el) return;
  const key = el.dataset.tune ?? '';
  const parts = key.split('|');
  const raw = el.value;
  const isNumber = el instanceof HTMLInputElement && el.type === 'number';
  // 数字框被清空时不写回，避免把可选字段（如 maxHp）误设成 0
  if (isNumber && raw.trim() === '') return;
  const value: number | string = isNumber ? Number(raw) : raw;
  let ok = false;

  if (parts[0] === 'card' && parts.length >= 3) {
    const id = parts[1];
    const path = parts[2];
    if (path === 'cost') {
      setCardCost(id, Number(value));
      ok = true;
    } else {
      ok = setCardOpValue(id, path, value);
    }
  } else if (parts[0] === 'power' && parts.length >= 4) {
    const owner = parts[1];
    const powerId = parts[2];
    const path = parts.slice(3).join('|');
    if (path === 'cooldown') {
      setPowerCooldown(owner, powerId, Number(value));
      ok = true;
    } else {
      ok = setPowerOpValue(owner, powerId, path, value);
    }
  }

  if (ok) {
    el.classList.add('tune-saved');
    window.setTimeout(() => el.classList.remove('tune-saved'), 700);
  }
});

/* 卡牌详情：鼠标悬停、键盘聚焦、触屏点按都能看见 */
app.addEventListener('pointerover', (event) => {
  if (!game || screen !== 'game') return;
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-uid]');
  if (card) showCardDetail(card.dataset.cardUid ?? null);
});

app.addEventListener('pointerout', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-uid]');
  if (!card) return;
  const to = event.relatedTarget as HTMLElement | null;
  if (to && to.closest('[data-card-uid]')) return;
  showCardDetail(null);
});

app.addEventListener('focusin', (event) => {
  if (!game || screen !== 'game') return;
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-uid]');
  if (card) showCardDetail(card.dataset.cardUid ?? null);
});

app.addEventListener('focusout', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-uid]');
  if (!card) return;
  const to = event.relatedTarget as HTMLElement | null;
  if (to && to.closest('[data-card-uid]')) return;
  showCardDetail(null);
});

render();
