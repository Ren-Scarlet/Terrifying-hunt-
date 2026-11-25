import './style.css';
import { CARD_MAP } from './game/cards';
import {
  createGame,
  endTurn,
  enterPossession,
  giveUp,
  movePlayer,
  playCard,
  useKillerAbility,
} from './game/engine';
import { loadSave, writeSave } from './game/save';
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

type Screen = 'menu' | 'game' | 'result';

let save: SaveData = loadSave();
let game: GameState | null = null;
let screen: Screen = 'menu';
let editorOpen = false;
let shopOpen = false;
let guideOpen = false;
let editorDeck: string[] = [...save.deck];
let resultApplied = false;

const app = document.getElementById('app')!;

function render(): void {
  let html = '';
  if (editorOpen) {
    html = renderDeckEditor(editorDeck, save.unlockedCards);
  } else if (shopOpen) {
    html = renderShop(save);
  } else if (screen === 'menu' || !game) {
    html = renderMenu(save);
  } else {
    html = renderGame(game, getKiller(save.killer));
    if (screen === 'result') html += renderResult(game);
  }
  if (guideOpen) html += renderGuide();
  app.innerHTML = html;
}

function afterAction(): void {
  if (game && game.phase === 'gameover' && screen !== 'result') {
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
          if (CARD_MAP[id] && !unlocked.includes(id)) unlocked.push(id);
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
  resultApplied = false;
  render();
}

app.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'start' || action === 'again') {
    startGame();
    return;
  }

  if (action === 'menu') {
    screen = 'menu';
    game = null;
    editorOpen = false;
    shopOpen = false;
    render();
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
      save = { ...save, killer: owner };
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
      if (save.unlockedCards.includes(id) && count < 3 && editorDeck.length < 15) editorDeck.push(id);
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

  if (action === 'person') {
    const personId = target.dataset.personId;
    if (personId && game && screen === 'game') {
      const panel = document.getElementById('cardDetail');
      if (panel) panel.innerHTML = personDetailHtml(game, personId);
    }
    return;
  }

  if (action === 'ability' || action === 'possess') {
    if (!game || screen !== 'game') return;
    if (action === 'possess') enterPossession(game);
    else useKillerAbility(game);
    afterAction();
    return;
  }

  if (!game || screen !== 'game') return;

  if (action === 'move') {
    const room = target.dataset.room as RoomId | undefined;
    if (room) movePlayer(game, room);
    render();
    return;
  }

  if (action === 'play') {
    const cardUid = target.dataset.uid;
    if (cardUid) playCard(game, cardUid);
    afterAction();
    return;
  }

  if (action === 'end-turn') {
    endTurn(game);
    afterAction();
    return;
  }

  if (action === 'give-up') {
    giveUp(game);
    afterAction();
  }
});

app.addEventListener('pointerover', (event) => {
  if (!game || screen !== 'game') return;
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-uid]');
  const panel = document.getElementById('cardDetail');
  if (card && panel) panel.innerHTML = cardDetailHtml(game, card.dataset.cardUid!);
});

app.addEventListener('pointerout', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-uid]');
  if (!card) return;
  const to = event.relatedTarget as HTMLElement | null;
  if (to && to.closest('[data-card-uid]')) return;
  const panel = document.getElementById('cardDetail');
  if (panel) panel.innerHTML = defaultDetailHtml();
});

app.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action][role="button"]');
  if (!target) return;
  event.preventDefault();
  target.click();
});

render();
