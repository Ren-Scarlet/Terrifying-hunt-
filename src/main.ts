import './style.css';
import './ui/immersive.css';
import { handleImmersiveAction, installImmersiveKeys, syncImmersiveCamera } from './ui/immersive';
import { CARD_MAP, deckCardsForKiller, STARTING_DECK } from './game/cards';
import {
  attack,
  carryPerson,
  dropCarriedPerson,
  blinkPlayer,
  collectTrapCache,
  nurseGrabPerson,
  recoverBearTrap,
  refillHuntressHatchets,
  throwHuntressHatchet,
  executeCarriedPerson,
  executeDownedPerson,
  createGame,
  discardCard,
  drawCardAction,
  endTurn,
  giveUp,
  finishFreeHunt,
  finishContract,
  waitAction,
  lookAround,
  lookAtRoom,
  cancelLookSelection,
  selectAuraRoom,
  movePlayer,
  playCard,
  searchRoom,
  sabotageSiteItem,
  togglePowerCircuit,
  usePower,
  wipeBlade,
} from './game/engine';
import { loadSave, writeSave } from './game/save';
import { generateFreeHunt } from './game/missions';
import { STARTER_KILLERS } from './game/killers';
import {
  applyTuning,
  exportTuning,
  importTuning,
  resetTuning,
  setCardCost,
  setCardDesc,
  setCardName,
  setCardType,
  setCardFlavor,
  setCardPrecheck,
  createCustomCard,
  duplicateCard,
  deleteCard,
  setCardNoAction,
  addCardOp,
  removeCardOp,
  moveCardOp,
  setCardOpValue,
  setPowerCooldown,
  setPowerOpValue,
} from './game/tuning';
import { ROOM_MAP } from './game/rooms';
import type { ExecutionMethodId } from './game/executions';
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
import { initCloudAuth, loadCloudConfig, saveCloudConfig, verifyGitHubToken, clearGitHubToken } from './game/cloud';
import { mountFloorplanScene, type SceneHandle } from './ui/scene';
import { playSfx, setMusic, toggleMute, unlockAudio } from './ui/audio';
import type { SfxName } from './ui/audio';
import { currentMenuMap, rollMenuMap } from './ui/mapArt';

type Screen = 'menu' | 'game' | 'result';

// 从当前浏览器读取本地卡牌覆盖；没有个人配置时仍使用仓库默认数值。
applyTuning();
void initCloudAuth().then(async () => {
  try {
    const cloud = await loadCloudConfig();
    if (cloud) {
      const tuningModule = await import('./game/tuning');
      if (tuningModule.importTuning(JSON.stringify(cloud))) render();
    }
  } catch (error) { console.warn('云端配置暂不可用：', error); }
  if (adminOpen) render();
});

let save: SaveData = loadSave();
let game: GameState | null = null;
let screen: Screen = 'menu';
let editorOpen = false;
let shopOpen = false;
let guideOpen = false;
let adminOpen = new URLSearchParams(window.location.search).get('admin') === '1';
let editorDeck: string[] = [...save.deck];
let resultApplied = false;
/** 本局新解锁的卡牌，用于结算面板只提示真正新增的那张 */
let lastNewCard: string | null = null;
/** 信息面板当前展示的卡牌，避免同一张牌重复重绘 */
let detailCardUid: string | null = null;
/** 当前锁定的人物档案；卡牌悬停结束后仍恢复显示。 */
let selectedPersonId: string | null = null;
/** 平面图下方的场景画布 */
let scene: SceneHandle | null = null;
/** 上一次的击杀数与暴露度：用来判断这一手是得手还是暴露了 */
let lastKills = 0;
let lastWanted = 0;
/** 成功攻击后由下一次 render 消费，纯表现层，不进入存档或战斗状态。 */
let pendingMapAttackTarget: string | null = null;
let pendingMapAttackGhost: { roomId: string; element: HTMLElement; left: number; top: number; width: number; height: number } | null = null;
let heldMoveKey: string | null = null;
let heldMoveTimer = 0;
let pendingMapWalk = false;

const app = document.getElementById('app')!;

/**
 * 对局每次行动都会重绘 HUD，但地图世界本身不应被销毁。
 * 保留原有 viewport / floorplan / Canvas，只替换房间交互层和人物标记，
 * 这样房间切换时旧场景持续显示，镜头可以从旧位置平滑过渡到新位置。
 */
function captureAttackGhosts(): Map<string, { roomId: string; element: HTMLElement; left: number; top: number; width: number; height: number }> {
  const captured = new Map<string, { roomId: string; element: HTMLElement; left: number; top: number; width: number; height: number }>();
  app.querySelectorAll<HTMLElement>('.room[data-room] .person-chip[data-person-id]').forEach((chip) => {
    const id = chip.dataset.personId;
    const room = chip.closest<HTMLElement>('.room[data-room]');
    if (!id || !room) return;
    const clone = chip.cloneNode(true) as HTMLElement;
    clone.classList.add('attack-ghost');
    clone.removeAttribute('data-action');
    clone.removeAttribute('data-person-id');
    clone.removeAttribute('data-attack');
    clone.setAttribute('aria-hidden', 'true');
    clone.style.position = 'absolute';
    clone.style.pointerEvents = 'none';
    clone.style.margin = '0';
    captured.set(id, {
      roomId: room.dataset.room ?? '',
      element: clone,
      left: chip.offsetLeft,
      top: chip.offsetTop,
      width: chip.offsetWidth,
      height: chip.offsetHeight,
    });
  });
  return captured;
}

function clearHeldMovement(): void {
  heldMoveKey = null;
  if (heldMoveTimer) window.clearTimeout(heldMoveTimer);
  heldMoveTimer = 0;
}

function nextRoomInDirection(key: string): RoomId | null {
  if (!game) return null;
  const direction = key === 'w' ? { x: 0, y: -1 } : key === 's' ? { x: 0, y: 1 } : key === 'a' ? { x: -1, y: 0 } : { x: 1, y: 0 };
  const current = ROOM_MAP[game.playerRoom].rect;
  const cx = current.left + current.width / 2;
  const cy = current.top + current.height / 2;
  const candidates = ROOM_MAP[game.playerRoom].neighbors.map((id) => {
    const rect = ROOM_MAP[id].rect;
    const dx = rect.left + rect.width / 2 - cx;
    const dy = rect.top + rect.height / 2 - cy;
    const length = Math.hypot(dx, dy) || 1;
    return { id, score: (dx / length) * direction.x + (dy / length) * direction.y };
  }).sort((a, b) => b.score - a.score);
  return candidates[0] && candidates[0].score > 0.25 ? candidates[0].id : null;
}

function performHeldMovement(key: string): boolean {
  if (!game || screen !== 'game' || game.phase !== 'playing') return false;
  if (game.lookingAround || game.nurseBlinkTargeting || game.huntressAiming || game.auraTargeting) return false;
  if (game.hand.length > 6) return false;
  const nextRoom = nextRoomInDirection(key);
  if (!nextRoom || !movePlayer(game, nextRoom)) return false;
  pendingMapWalk = true;
  playSfx('step');
  afterAction();
  return true;
}

function scheduleHeldMovement(key: string): void {
  if (heldMoveKey !== key) return;
  heldMoveTimer = window.setTimeout(() => {
    heldMoveTimer = 0;
    if (heldMoveKey !== key) return;
    if (!performHeldMovement(key)) {
      clearHeldMovement();
      return;
    }
    // 一次按键对应一次跨门行动；按住时持续重复，每一步仍单独结算行动点与幸存者反应。
    scheduleHeldMovement(key);
  }, 520);
}

function renderMarkupPreservingMap(html: string): void {
  const previousViewport = app.querySelector<HTMLElement>('.map-viewport');
  const previousFloorplan = previousViewport?.querySelector<HTMLElement>('.floorplan') ?? null;
  const previousCanvas = previousFloorplan?.querySelector<HTMLCanvasElement>('.floorplan-canvas') ?? null;

  app.innerHTML = html;

  if (!previousViewport || !previousFloorplan || !previousCanvas) return;
  const nextViewport = app.querySelector<HTMLElement>('.map-viewport');
  const nextFloorplan = nextViewport?.querySelector<HTMLElement>('.floorplan');
  if (!nextViewport || !nextFloorplan) return;

  const cameraTransform = previousFloorplan.style.transform;
  previousFloorplan.className = nextFloorplan.className;
  previousFloorplan.setAttribute('style', nextFloorplan.getAttribute('style') ?? '');
  if (cameraTransform) previousFloorplan.style.transform = cameraTransform;

  const freshWorldNodes = Array.from(nextFloorplan.children);
  const freshViewportNodes = Array.from(nextViewport.childNodes).filter((node) => node !== nextFloorplan);
  previousFloorplan.replaceChildren(previousCanvas, ...freshWorldNodes);
  nextFloorplan.replaceWith(previousFloorplan);

  // 命中动画使用受击前的位置快照；即使幸存者在攻击结算中逃跑，也能在原地看到受击。
  if (pendingMapAttackGhost?.roomId) {
    const room = Array.from(previousFloorplan.querySelectorAll<HTMLElement>('.room[data-room]'))
      .find((node) => node.dataset.room === pendingMapAttackGhost?.roomId);
    const people = room?.querySelector<HTMLElement>('.room-people');
    if (people) {
      const ghost = pendingMapAttackGhost.element;
      ghost.style.left = `${pendingMapAttackGhost.left}px`;
      ghost.style.top = `${pendingMapAttackGhost.top}px`;
      ghost.style.width = `${pendingMapAttackGhost.width}px`;
      ghost.style.height = `${pendingMapAttackGhost.height}px`;
      ghost.classList.add('blood-hit');
      people.appendChild(ghost);
      window.setTimeout(() => ghost.remove(), 760);
    }
    pendingMapAttackGhost = null;
  }

  // 保留 viewport 本身和地图图例等兄弟层，避免地图卸载/重挂期间露出黑色底板。
  previousViewport.className = nextViewport.className;
  previousViewport.replaceChildren(previousFloorplan, ...freshViewportNodes);
  nextViewport.replaceWith(previousViewport);
}


type DisplayScale = 'standard' | 'large' | 'xlarge';
type DisplaySettings = { interfaceScale: DisplayScale; fontScale: DisplayScale; mapScale: DisplayScale };
const DISPLAY_SETTINGS_KEY = 'nightfall-display-settings';
const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = { interfaceScale: 'standard', fontScale: 'standard', mapScale: 'standard' };
function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = localStorage.getItem(DISPLAY_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY_SETTINGS };
    const value = JSON.parse(raw) as Partial<DisplaySettings>;
    const valid = (v: unknown): v is DisplayScale => v === 'standard' || v === 'large' || v === 'xlarge';
    return {
      interfaceScale: valid(value.interfaceScale) ? value.interfaceScale : 'standard',
      fontScale: valid(value.fontScale) ? value.fontScale : 'standard',
      mapScale: valid(value.mapScale) ? value.mapScale : 'standard',
    };
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}
let displaySettings = loadDisplaySettings();
function applyDisplaySettings(): void {
  app.dataset.interfaceScale = displaySettings.interfaceScale;
  app.dataset.fontScale = displaySettings.fontScale;
  app.dataset.mapScale = displaySettings.mapScale;
  const names: Record<keyof DisplaySettings, string> = {
    interfaceScale: '界面',
    fontScale: '文字',
    mapScale: '地图',
  };
  const values: Record<DisplayScale, string> = { standard: '标准', large: '大', xlarge: '特大' };
  app.querySelectorAll<HTMLButtonElement>('[data-action="display-setting"]').forEach((button) => {
    const key = button.dataset.setting as keyof DisplaySettings | undefined;
    if (key === 'interfaceScale' || key === 'fontScale' || key === 'mapScale') {
      button.textContent = names[key] + '：' + values[displaySettings[key]];
      button.setAttribute('aria-label', names[key] + '大小，当前' + values[displaySettings[key]] + '，点击切换');
    }
  });
}
function cycleDisplaySetting(key: keyof DisplaySettings): void {
  const levels: DisplayScale[] = ['standard', 'large', 'xlarge'];
  const index = levels.indexOf(displaySettings[key]);
  displaySettings = { ...displaySettings, [key]: levels[(index + 1) % levels.length] };
  try {
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(displaySettings));
  } catch {
    // 私密浏览模式或存储空间受限时，仍保留本次页面会话的设置。
  }
  render();
}

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
  renderMarkupPreservingMap(html);
  if (pendingMapWalk) {
    pendingMapWalk = false;
    app.classList.remove('map-walk');
    void app.offsetWidth;
    app.classList.add('map-walk');
    window.setTimeout(() => app.classList.remove('map-walk'), 520);
  }
  if (pendingMapAttackTarget !== null) {
    const targetId = pendingMapAttackTarget;
    pendingMapAttackTarget = null;
    app.classList.remove('map-attack');
    app.querySelectorAll<HTMLElement>('.attack-hit').forEach((node) => node.classList.remove('attack-hit'));
    // Reflow restarts the short animation even when two attacks happen in succession.
    void app.offsetWidth;
    app.classList.add('map-attack');
    if (targetId) {
      app.querySelectorAll<HTMLElement>('[data-person-id]').forEach((node) => {
        if (node.dataset.personId === targetId) node.classList.add('attack-hit');
      });
    }
    window.setTimeout(() => {
      app.classList.remove('map-attack');
      app.querySelectorAll<HTMLElement>('.attack-hit').forEach((node) => node.classList.remove('attack-hit'));
    }, 620);
  }
  const immersiveActive = Boolean(game && screen === 'game');
  app.classList.toggle('immersive-game', immersiveActive);
  document.body.classList.toggle('immersive-hunt', immersiveActive);
  applyDisplaySettings();
  detailCardUid = null;
  if (game && screen === 'game' && selectedPersonId) {
    const panel = document.getElementById('cardDetail');
    if (panel) panel.innerHTML = personDetailHtml(game, selectedPersonId);
  } else if (screen !== 'game') {
    selectedPersonId = null;
  }
  syncScene();
  if (immersiveActive) syncImmersiveCamera(app);
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

/** 日志里的人名做稳定哈希：同一个幸存者始终是同一种嗓音（数据层没有性别字段） */
function playVoice(head: string, kind: 'Hurt' | 'Hit' | 'Scream' | 'Startle'): void {
  let h = 0;
  for (let i = 0; i < head.length; i += 1) h = (h * 31 + head.charCodeAt(i)) | 0;
  playSfx(`voice${(h & 1) ? 'F' : 'M'}${kind}` as SfxName);
}

/** 引擎日志里刚发生的事 → 补上对应音效（不侵入纯逻辑层） */
let lastLogHead = '';
function sfxFromLogs(): void {
  if (!game) return;
  const head = game.log[0] ?? '';
  if (head === lastLogHead) return;
  lastLogHead = head;
  if (/你处决了|特殊处决[：【]/.test(head)) {
    playSfx('execute');
    window.setTimeout(() => playSfx('wipe'), 260);
  }
  else if (/你杀死了/.test(head)) playSfx('kill');
  else if (/砸毁|断电|控制箱|电闸/.test(head)) {
    playSfx('breaker');
    window.setTimeout(() => playSfx('spark'), 150);
  }
  else if (/成功逃离|已经不在房子里了/.test(head)) playSfx('flee');
  else if (/发电机重新亮了起来|用钥匙捅开|联系上了外面|修发电机/.test(head)) playSfx('objective');
  else if (/地图出现两个逃生点|第四阶段完成/.test(head)) playSfx('gate');
  else if (/幸存者团队完成第/.test(head)) playSfx('stage');
  else if (/【NPC目击】|发现了捕兽夹|发现并拆除了|忽然抬头|猛一回头|察觉到异常|发现了你/.test(head)) playVoice(head, 'Startle');
  else if (/恶魔附身：/.test(head)) playSfx('possess');
  else if (/打倒在地上|受到 \d+ 点伤害/.test(head)) playVoice(head, 'Hit');
  else if (/受伤了（|在流血/.test(head)) playVoice(head, 'Hurt');
  else if (/喊了一声|警觉升到|尖叫/.test(head)) playVoice(head, 'Scream');
  else if (/猛一回头|忽然抬头|察觉到异常|发抖/.test(head)) playVoice(head, 'Startle');
  else if (/停止了呼吸/.test(head)) playSfx('kill');
  else if (/致盲|击晕|手电筒|逼退/.test(head)) playSfx('stun');
  else if (/乌鸦|动静/.test(head)) playSfx('crow');
  else if (/翻出了|拾起|拿到了武器/.test(head)) playSfx('pickup');
  else if (/发现并破坏了|破坏了图腾/.test(head)) playSfx('smash');
  else if (/发电机/.test(head)) playSfx('generator');
}

function afterAction(): void {
  pulseFeedback();
  sfxFromLogs();
  if (game?.executionMethodsUsed.length) {
    const known = new Set(save.executionRecords ?? []);
    game.executionMethodsUsed.forEach((id) => known.add(id));
    if (known.size !== (save.executionRecords ?? []).length) {
      save = { ...save, executionRecords: [...known] };
      writeSave(save);
    }
  }
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
        credits += Math.max(10, Math.round(game.score / 5)) + game.huntStyleBonus;
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

function startGame(freeHunt = false): void {
  selectedPersonId = null;
  game = createGame(save.deck, freeHunt ? generateFreeHunt() : undefined, save.killer ?? '迈克尔·迈尔斯', currentMenuMap().id);
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
    panel.innerHTML = selectedPersonId && game ? personDetailHtml(game, selectedPersonId) : defaultDetailHtml();
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
  clearHeldMovement();
  const action = target.dataset.action;
  if (handleImmersiveAction(action)) return;
  // 浏览器要求先有用户交互才允许出声
  unlockAudio();

  // 主菜单按钮音：选角色框有专属音效，其余大厅按钮统一一个轻音
  if (screen === 'menu' && !game && action && action !== 'mute') {
    if (action === 'killer' || action === 'unlock-killer') playSfx('killerPick');
    else if (action !== 'start' && action !== 'again') playSfx('menuButton');
  }

  if (action === 'display-setting') {
    const key = target.dataset.setting as keyof DisplaySettings | undefined;
    if (key === 'interfaceScale' || key === 'fontScale' || key === 'mapScale') cycleDisplaySetting(key);
    return;
  }

  if (action === 'mute') {
    toggleMute();
    afterAction();
    return;
  }

  if (action === 'start' || action === 'again' || action === 'free-hunt') {
    // 三段串起来，避免同时响糊成一团：点击准备完成 → 进入地图 → 游戏开始
    playSfx('ready');
    window.setTimeout(() => playSfx('enterMap'), 190);
    window.setTimeout(() => playSfx('start'), 430);
    startGame(action === 'free-hunt');
    return;
  }

  if (action === 'menu') {
    selectedPersonId = null;
    screen = 'menu';
    game = null;
    editorOpen = false;
    shopOpen = false;
    adminOpen = false;
    lastNewCard = null;
    rollMenuMap();
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

  if (action === 'admin-card-new') { createCustomCard(); render(); return; }
  if (action === 'admin-card-copy' || action === 'admin-card-delete') {
    const id = target.dataset.card; if (!id) return;
    if (action === 'admin-card-copy') duplicateCard(id);
    else if (window.confirm('删除这张卡牌？删除后会从卡池和编辑器中移除。')) deleteCard(id);
    render(); return;
  }

  if (action === 'admin-op-add') {
    const id = target.dataset.card;
    const select = id ? document.getElementById(`addEffect-${id}`) as HTMLSelectElement | null : null;
    if (id && select && addCardOp(id, select.value)) render();
    return;
  }
  if (action === 'admin-op-remove' || action === 'admin-op-move') {
    const id = target.dataset.card, index = Number(target.dataset.index);
    const ok = id && Number.isInteger(index) && (action === 'admin-op-remove' ? removeCardOp(id, index) : moveCardOp(id, index, Number(target.dataset.direction) as -1 | 1));
    if (ok) render();
    return;
  }

  if (action === 'cloud-login') {
    const input = document.getElementById('githubToken') as HTMLInputElement | null;
    const status = document.getElementById('cloudStatus');
    const token = input?.value.trim();
    if (!token || !status) return;
    status.textContent = '正在验证 GitHub 密钥……';
    void verifyGitHubToken(token).then((login) => {
      if (input) input.value = '';
      status.textContent = '授权成功：GitHub 账号 ' + login + '。现在可以上传配置。';
    }).catch((error: unknown) => {
      if (status) status.textContent = error instanceof Error ? error.message : '密钥验证失败。';
    });
    return;
  }
  if (action === 'cloud-logout') {
    clearGitHubToken();
    const status = document.getElementById('cloudStatus');
    if (status) status.textContent = '已退出 GitHub 管理员授权。';
    return;
  }
  if (action === 'cloud-load') {
    const status = document.getElementById('cloudStatus');
    if (status) status.textContent = '正在读取云端配置……';
    void loadCloudConfig().then(async (config) => {
      if (!config) throw new Error('云端还没有配置，请先上传一次。');
      const tuningModule = await import('./game/tuning');
      if (!tuningModule.importTuning(JSON.stringify(config))) throw new Error('云端配置结构无效，未覆盖本地配置。');
      if (status) status.textContent = '云端配置已读取并应用。';
      render();
    }).catch((error: unknown) => { if (status) status.textContent = error instanceof Error ? error.message : '读取云端配置失败。'; });
    return;
  }
  if (action === 'cloud-save') {
    const status = document.getElementById('cloudStatus');
    if (status) status.textContent = '正在上传当前配置……';
    void saveCloudConfig(JSON.parse(exportTuning())).then(() => { if (status) status.textContent = '上传成功：其他玩家刷新游戏后会读取这份配置。'; })
      .catch((error: unknown) => { if (status) status.textContent = error instanceof Error ? error.message : '上传失败。'; });
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
    if (owner && STARTER_KILLERS.includes(owner)) {
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
    if (owner && STARTER_KILLERS.includes(owner) && !save.unlockedKillers.includes(owner) && save.darkCells >= 2) {
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
  // 目标选择模式期间锁定其他操作，避免闪现/瞄准时误触移动或卡牌。
  if (game && screen === 'game' && game.nurseBlinkTargeting &&
      !['blink-select', 'power', 'mute', 'guide'].includes(action ?? '')) return;
  if (game && screen === 'game' && game.huntressAiming &&
      !['hatchet-target', 'power', 'mute', 'guide'].includes(action ?? '')) return;
  // 查看选房期间只接受选房或取消，避免误触卡牌、移动等其他行动。
  if (game && screen === 'game' && game.lookingAround &&
      !['look-select', 'look-cancel', 'mute', 'guide'].includes(action ?? '')) return;

  if (action === 'person') {
    const personId = target.dataset.personId;
    if (personId && game && screen === 'game') {
      const panel = document.getElementById('cardDetail');
      if (selectedPersonId === personId) {
        selectedPersonId = null;
        if (panel) panel.innerHTML = defaultDetailHtml();
      } else {
        selectedPersonId = personId;
        if (panel) panel.innerHTML = personDetailHtml(game, personId);
      }
      detailCardUid = null;
    }
    return;
  }

  if (action === 'close-person-detail') {
    selectedPersonId = null;
    detailCardUid = null;
    const panel = document.getElementById('cardDetail');
    if (panel) panel.innerHTML = defaultDetailHtml();
    return;
  }

  if (action === 'attack-target') {
    if (!game || screen !== 'game') return;
    const personId = target.dataset.personId;
    if (personId) {
      const ghosts = captureAttackGhosts();
      const killsBefore = game.kills;
      const hit = attack(game, personId);
      if (hit) {
        pendingMapAttackTarget = personId;
        pendingMapAttackGhost = ghosts.get(personId) ?? null;
      }
      playSfx('attack');
      if (game.kills > killsBefore) playSfx('kill');
      lastLogHead = game.log[0] ?? '';
    }
    afterAction();
    return;
  }

  if (action === 'execute' || action === 'execute-target') {
    if (!game || screen !== 'game') return;
    const personId = action === 'execute-target' ? target.dataset.personId : undefined;
    const executed = executeDownedPerson(game, personId);
    if (executed) {
      playSfx('execute');
      window.setTimeout(() => playSfx('wipe'), 260);
      lastLogHead = game.log[0] ?? '';
    }
    afterAction();
    return;
  }

  if (action === 'drop-carried') {
    if (!game || screen !== 'game') return;
    if (dropCarriedPerson(game)) playSfx('click');
    afterAction();
    return;
  }

  if (action === 'carry') {
    if (!game || screen !== 'game') return;
    const personId = target.dataset.personId;
    if (personId) carryPerson(game, personId);
    afterAction();
    return;
  }

  if (action === 'execute-special') {
    if (!game || screen !== 'game') return;
    const method = target.dataset.method as ExecutionMethodId | undefined;
    if (method && executeCarriedPerson(game, method)) {
      playSfx('execute');
      window.setTimeout(() => playSfx('wipe'), 260);
      lastLogHead = game.log[0] ?? '';
    }
    afterAction();
    return;
  }

  if (action === 'power') {
    if (!game || screen !== 'game') return;
    const powerId = target.dataset.power;
    const wasPossessed = game.possessed;
    if (powerId) usePower(game, powerId);
    if (!wasPossessed && game.possessed && game.killer === '迈克尔·迈尔斯') {
      playSfx('possess');
      if ((game.log[0] ?? '').includes('恶魔附身：')) lastLogHead = game.log[0];
    }
    afterAction();
    return;
  }

  if (action === 'blink-select') {
    if (!game || screen !== 'game') return;
    const room = target.dataset.room as RoomId | undefined;
    if (room) blinkPlayer(game, room);
    playSfx('step');
    afterAction();
    return;
  }

  if (action === 'hatchet-target') {
    if (!game || screen !== 'game') return;
    const personId = target.dataset.personId;
    if (personId && throwHuntressHatchet(game, personId)) playSfx('attack');
    afterAction();
    return;
  }

  if (action === 'nurse-grab-target') {
    if (!game || screen !== 'game') return;
    const personId = target.dataset.personId;
    if (personId && nurseGrabPerson(game, personId)) playSfx('attack');
    afterAction();
    return;
  }

  if (action === 'collect-trap') {
    if (!game || screen !== 'game') return;
    collectTrapCache(game);
    afterAction();
    return;
  }

  if (action === 'recover-trap') {
    if (!game || screen !== 'game') return;
    recoverBearTrap(game);
    afterAction();
    return;
  }

  if (action === 'refill-hatchets') {
    if (!game || screen !== 'game') return;
    refillHuntressHatchets(game);
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
    const ghosts = captureAttackGhosts();
    const kills = game.kills;
    const hit = attack(game);
    if (hit) {
      pendingMapAttackTarget = game.lastAttackedId ?? null;
      pendingMapAttackGhost = pendingMapAttackTarget ? ghosts.get(pendingMapAttackTarget) ?? null : null;
    }
    playSfx('attack');
    if (game.kills > kills) playSfx('kill');
    lastLogHead = game.log[0] ?? '';
    afterAction();
    return;
  }

  if (action === 'wipe') {
    wipeBlade(game);
    playSfx('wipe');
    afterAction();
    return;
  }

  if (action === 'toggle-breaker') {
    const circuitId = target.dataset.circuitId;
    togglePowerCircuit(game, circuitId);
    playSfx('breaker');
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

  if (action === 'aura-select') {
    const room = target.dataset.room as RoomId | undefined;
    if (room) selectAuraRoom(game, room);
    playSfx('click');
    render();
    return;
  }

  if (action === 'play') {
    const cardUid = target.dataset.uid;
    if (cardUid) playCard(game, cardUid);
    playSfx('click');
    afterAction();
    return;
  }

  if (action === 'wait') { waitAction(game); afterAction(); return; }
  if (action === 'finish-contract') { finishContract(game); afterAction(); return; }

  if (action === 'end-turn') {
    endTurn(game);
    playSfx('endturn');
    afterAction();
    return;
  }

  if (action === 'finish-free-hunt') {
    if (!game || screen !== 'game') return;
    if (finishFreeHunt(game)) playSfx('win');
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
  const el = (event.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-tune]');
  if (!el) return;
  const key = el.dataset.tune ?? '';
  const parts = key.split('|');
  const raw = el.value;
  const isNumber = el instanceof HTMLInputElement && el.type === 'number';
  const isCheckbox = el instanceof HTMLInputElement && el.type === 'checkbox';
  // 数字框被清空时不写回，避免把可选字段（如 maxHp）误设成 0
  if (isNumber && raw.trim() === '') return;
  const value: number | string | boolean = isCheckbox ? el.checked : isNumber ? Number(raw) : raw;
  let ok = false;

  if (parts[0] === 'card' && parts.length >= 3) {
    const id = parts[1];
    const path = parts[2];
    if (path === 'name') { setCardName(id, String(value)); ok = true;
    } else if (path === 'type') { setCardType(id, String(value) as 'attack' | 'skill' | 'tactic' | 'setup'); ok = true;
    } else if (path === 'flavor') { setCardFlavor(id, String(value)); ok = true;
    } else if (path === 'precheck') { setCardPrecheck(id, String(value)); ok = true;
    } else if (path === 'cost') {
      setCardCost(id, Number(value));
      ok = true;
    } else if (path === 'desc') {
      setCardDesc(id, String(value));
      ok = true;
    } else if (path === 'noAction') {
      setCardNoAction(id, Boolean(value));
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


window.addEventListener('keydown', (event) => {
  if (!game || screen !== 'game' || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
  const key = event.key.toLowerCase();
  if (!['w', 'a', 's', 'd'].includes(key)) return;
  if (game.lookingAround || game.nurseBlinkTargeting || game.huntressAiming || game.auraTargeting) return;
  event.preventDefault();
  if (heldMoveKey === key) return;
  clearHeldMovement();
  heldMoveKey = key;
  if (!performHeldMovement(key)) {
    clearHeldMovement();
    return;
  }
  scheduleHeldMovement(key);
});

window.addEventListener('keyup', (event) => {
  if (event.key.toLowerCase() === heldMoveKey) clearHeldMovement();
});
window.addEventListener('blur', clearHeldMovement);

installImmersiveKeys();
render();
