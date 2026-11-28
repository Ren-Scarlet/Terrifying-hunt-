import './style.css';
import './ui/immersive.css';
import './ui/mobile-shell.css';
import { applyMobileGameLayout } from './ui/mobile-layout';
import { cancelQte, handleQteInput, isQteActive, startQte, syncQtePanel } from './ui/qte';
import { handleImmersiveAction, installImmersiveKeys, openIntelDrawer, syncImmersiveCamera } from './ui/immersive';
import { CARD_MAP, deckCardsForKiller, STARTING_DECK } from './game/cards';
import {
  attack,
  carryPerson,
  dropCarriedPerson,
  blinkPlayer,
  recoverBearTrap,
  refillHuntressHatchets,
  throwHuntressHatchet,
  executeCarriedPerson,
  executeDownedPerson,
  executeQtePerson,
  qteExecutionBlockReason,
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
  interactCabinet,
  interactTotem,
  breakBarricade,
  movePlayer,
  moveBlockReason,
  noteToPlayer,
  bloodPointTotal,
  playCard,
  searchRoom,
  sabotageSiteItem,
  destroyItemBox,
  sadakoTeleport,
  breakPhone,
  breakDoor,
  togglePowerCircuit,
  usePower,
  wipeBlade,
} from './game/engine';
import { applyAchievements } from './game/achievements';
import type { AchievementDef } from './game/achievements';
import { renderAchievements } from './ui/render/achievements';
import { loadSave, writeSave } from './game/save';
import { bootCustomAccessories, customAccessoriesForPublish, importCustomAccessories, isCustomAccessory, removeCustomAccessory, upsertCustomAccessory } from './game/customContent';
import { publishAccessoryPack, verifyGitHubToken } from './game/cloud';
import { ACCESSORY_MAP } from './game/data/accessories';
import { generateFreeHunt, generateMission, roomName } from './game/missions';
import { applyTuning } from './game/tuning';
import { advanceRogue, applyRogueFloor, rollRogueOffers, startRogueRun } from './game/rogue';
import { addLevel, bloodwebCost, progressOf, rollBloodweb, syncSharedCards } from './game/progress';
import type { BloodwebOffer } from './game/progress';
import type { RogueOffer, RogueRun } from './game/rogue';
import { CABINET_ROOMS, ROOM_MAP } from './game/rooms';
import { SURVIVOR_MAP } from './game/survivors';
import type { ExecutionMethodId } from './game/execution';
import type { GameState, RoomId, SaveData } from './game/types';
import {
  cardDetailHtml,
  defaultDetailHtml,
  getKiller,
  personDetailHtml,
  renderDeckEditor,
  renderAccessoryLoadout,
  renderGame,
  renderGuide,
  renderMenu,
  renderResult,
  renderRogueReward,
  renderBloodweb,
  renderShop,
} from './ui/render';
import { renderAdmin } from './ui/admin';
import {
  addDraftMod, addDraftEffect, downloadJson, duplicateAsDraft, exportCustomAccessories, renderWorkshop, removeDraftMod, removeDraftEffect,
  startEditDraft, startNewDraft, updateDraftField, updateDraftMod, updateDraftEffect, workshopState,
} from './ui/workshop';
import { initCloudAuth, loadCloudConfig } from './game/cloud';
import { mountFloorplanScene, type SceneHandle } from './ui/scene';
import { playHeartbeat, playSfx, playStep, playSurvivorHit, playSurvivorDeath, preloadAudio, setMusic, toggleMute, unlockAudio } from './ui/audio';
import type { SfxName } from './ui/audio';
import { currentMenuMap, rollMenuMap } from './ui/mapArt';
import { ActionRegistry, type ActionContext, type ActionTable } from './ui/actions';
import { applyTuneChange, createAdminActions } from './ui/adminActions';
import { createMenuActions } from './ui/menuActions';
import { session } from './ui/session';
import { closePanel, inGame, openPanel, showGame, showMenu, showResult, ui } from './ui/viewState';

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
  if (ui().panel === 'admin') render();
});

bootCustomAccessories();
let save: SaveData = loadSave();
let game: GameState | null = null;
// `?admin=1` 是平衡面板唯一的启动入口；其余界面切换全部走 viewState 的具名迁移。
if (new URLSearchParams(window.location.search).get('admin') === '1') openPanel('admin');
session.editorDeck = [...save.deck];
let resultApplied = false;
/** 本局新解锁的卡牌，用于结算面板只提示真正新增的那张 */
let lastNewCard: string | null = null;
let lastUnlockedAchievements: AchievementDef[] = [];
let lastExecuteAt = 0;
/** 信息面板当前展示的卡牌，避免同一张牌重复重绘 */
let detailCardUid: string | null = null;
/** 当前锁定的人物档案；卡牌悬停结束后仍恢复显示。 */
let selectedPersonId: string | null = null;
/** 杀手面板是否收起（收起后只留立绘与行动点，不挡地图）。 */
let killerPanelCollapsed = localStorage.getItem('nightfall-panel-collapsed') === '1';
/** 肉鸽：层间三选一的待选项 */
let rogueOffers: RogueOffer[] | null = null;
/** 当前这一局是不是肉鸽层；普通模式就算存档里残留 rogue 也不能弹三选一 */
let rogueGame = false;
/** 血网升级面板：是否打开 + 当前三选一 */
let bloodwebOpen = false;
let bloodwebKiller: string | null = null;
let bloodwebOffers: BloodwebOffer[] | null = null;
/** 平面图下方的场景画布 */
let scene: SceneHandle | null = null;
/** 上一次的击杀数与暴露度：用来判断这一手是得手还是暴露了 */
let lastKills = 0;
let lastWanted = 0;
/** 成功攻击后由下一次 render 消费，纯表现层，不进入存档或战斗状态。 */
type AttackGhost = { roomId: string; element: HTMLElement; left: number; top: number; width: number; height: number; escapeAngle: number; trailClock: number };
let pendingMapAttackTarget: string | null = null;
let pendingMapAttackGhost: AttackGhost | null = null;
let heldMoveKey: string | null = null;
let heldMoveTimer = 0;
let pendingMapWalk = false;
let lastShownExecutionSeq = 0;

const app = document.getElementById('app')!;

function showLatestExecutionScene(): void {
  if (!game || !game.executionScene) return;
  const event = game.executionScene;
  if (event.seq <= lastShownExecutionSeq) return;
  lastShownExecutionSeq = event.seq;
  const room = app.querySelector<HTMLElement>('.room[data-room="' + event.room + '"]');
  if (!room) return;
  const spot = event.victimId ? personRoomPercent(event.victimId) : null;
  room.querySelector('.execution-scene-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'execution-scene-overlay execution-style-' + event.motion;
  // 血光跟着目标头像的位置走，而不是永远在房间正中（作者反馈动画和头像对不上）
  overlay.style.setProperty('--exec-x', `${(spot?.x ?? 50).toFixed(1)}%`);
  overlay.style.setProperty('--exec-y', `${(spot?.y ?? 54).toFixed(1)}%`);
  overlay.setAttribute('aria-hidden', 'true');
  const flash = document.createElement('div');
  flash.className = 'execution-scene-flash';
  const bubble = document.createElement('div');
  bubble.className = 'execution-scene-bubble';
  const heading = document.createElement('b');
  heading.textContent = event.title;
  const description = document.createElement('p');
  description.textContent = event.description;
  bubble.append(heading, description);
  if (event.line) {
    const line = document.createElement('span');
    line.className = 'execution-scene-line';
    line.textContent = event.line;
    bubble.append(line);
  }
  // 2026-11-28：删掉原来的“倒下人影”占位（CSS 画的口袋形状，像一颗导弹），
  // 只保留血光闪白 + 文案，避免角色脚下突然冒出一个图标。
  overlay.append(flash);
  room.appendChild(overlay);
  // 桌面端：处决文案做成画面底部字幕，留在房间里会被房名、描述和头像压住（图3）。
  // 手机端仍是紧凑卡片，直接跟随房间，避免与手机 HUD 叠在一起。
  if (app.classList.contains('mobile-game-active')) {
    overlay.append(bubble);
  } else {
    bubble.classList.add('execution-scene-caption');
    app.appendChild(bubble);
  }
  window.setTimeout(() => overlay.remove(), 4600);
  window.setTimeout(() => bubble.remove(), 4600);
}

/* ------------------------------------------------------------------ */
/* QTE：通过通用输入系统接入处决；其他玩法也可以直接调用 startQte()     */
/* ------------------------------------------------------------------ */

function startExecutionQte(personId: string): void {
  if (!game || isQteActive()) return;
  lastExecuteAt = Date.now();
  const reason = qteExecutionBlockReason(game, personId);
  if (reason) {
    noteToPlayer(game, reason);
    render();
    return;
  }
  unlockAudio();
  startQte({
    label: '处决时机',
    mode: 'random',
    length: 4,
    anchor: () => app.querySelector<HTMLElement>('.player-marker'),
    onComplete: ({ success }) => {
      const current = currentGame();
      const executed = executeQtePerson(current, personId, success);
      if (executed) {
        pendingMapAttackTarget = personId;
        if (success) playSfx('execute');
        playSfx(SURVIVOR_MAP[personId]?.gender === 'female' ? 'voiceFScream' : 'voiceMScream', 0.96);
        window.setTimeout(() => playSfx('wipe'), 260);
        lastLogHead = current.log[0] ?? '';
      }
      afterAction();
    },
  });
  render();
}


/**
 * 对局每次行动都会重绘 HUD，但地图世界本身不应被销毁。
 * 保留原有 viewport / floorplan / Canvas，只替换房间交互层和人物标记，
 * 这样房间切换时旧场景持续显示，镜头可以从旧位置平滑过渡到新位置。
 */
function captureAttackGhosts(): Map<string, AttackGhost> {
  const captured = new Map<string, AttackGhost>();
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
    const person = game?.people.find((candidate) => candidate.id === id);
    const trails = person && game ? [...game.trails].sort((a, b) => b.clock - a.clock) : [];
    const lastTrail = person ? (trails.find((trail) => trail.to === person.room) ?? trails.find((trail) => trail.room === person.room)) : undefined;
    let escapeAngle = 0;
    if (lastTrail) {
      const from = ROOM_MAP[lastTrail.room].rect;
      const to = ROOM_MAP[lastTrail.to].rect;
      escapeAngle = Math.atan2((to.top + to.height / 2) - (from.top + from.height / 2), (to.left + to.width / 2) - (from.left + from.width / 2));
    }
    captured.set(id, {
      roomId: room.dataset.room ?? '', element: clone,
      left: chip.offsetLeft, top: chip.offsetTop,
      width: chip.offsetWidth, height: chip.offsetHeight, escapeAngle,
      trailClock: game?.trailClock ?? 0,
    });
  });
  return captured;
}

function updateAttackGhostEscapeDirection(ghost: AttackGhost | null, personId: string): void {
  if (!ghost || !game) return;
  const person = game.people.find((candidate) => candidate.id === personId);
  if (!person) return;
  const freshTrails = [...game.trails].reverse()
    .filter((trail) => trail.clock >= ghost.trailClock && trail.to === person.room);
  const trail = freshTrails.find((candidate) => candidate.room === ghost.roomId) ?? freshTrails[0];
  if (!trail) return;
  const from = ROOM_MAP[trail.room].rect;
  const to = ROOM_MAP[trail.to].rect;
  ghost.escapeAngle = Math.atan2(
    (to.top + to.height / 2) - (from.top + from.height / 2),
    (to.left + to.width / 2) - (from.left + from.width / 2),
  );
}

function playKillerAttackSound(state: GameState): void {
  if (state.killer === '护士') playSfx('nurseAttack');
  else if (state.killer === '迈克尔·迈尔斯') playSfx('myersAttack');
  else playSfx('attack');
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
  if (!game || !inGame() || game.phase !== 'playing') return false;
  if (game.lookingAround || game.nurseBlinkTargeting || game.huntressAiming || game.auraTargeting) return false;
  if (game.hand.length > 6) return false;
  const nextRoom = nextRoomInDirection(key);
  const previousRoom = game.playerRoom;
  if (!nextRoom || !movePlayer(game, nextRoom)) return false;
  noteRoomEntry(previousRoom);
  pendingMapWalk = true;
  playStep();
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

  // 2026-11-28：删掉「受击残影」——处决时它会瞬移到房间角落抖动消失，作者反馈很违和。
  pendingMapAttackGhost = null;

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
  const view = ui();
  // 菜单（含商店/牌组/平衡面板）放角色选择曲，进入对局换背景曲；同一首不会重播
  setMusic(view.screen === 'menu' || !game ? 'menu' : 'bgm');
  let html = '';
  // 面板最多只有一个（viewState 保证互斥），因此这里不需要再比较哪个布尔量优先。
  if (view.panel === 'workshop') {
    html = renderWorkshop();
  } else if (view.panel === 'admin') {
    html = renderAdmin();
  } else if (view.panel === 'accessories') {
    html = renderAccessoryLoadout(save, session.accessoryDraft, session.pendingRun !== null);
  } else if (view.panel === 'deck') {
    html = renderDeckEditor(session.editorDeck, save.unlockedCards, save.killer ?? '迈克尔·迈尔斯', save.sharedCards ?? []);
  } else if (view.panel === 'achievements') {
    html = renderAchievements(save);
  } else if (view.panel === 'shop') {
    html = renderShop(save);
  } else if (view.screen === 'menu' || !game) {
    html = renderMenu(save);
    if (bloodwebOpen) {
      const killer = bloodwebKiller ?? save.killer ?? '迈克尔·迈尔斯';
      html += renderBloodweb(
        killer,
        progressOf(save.progress, killer),
        save.credits,
        bloodwebOffers,
        save.unlockedKillers,
      );
    }
  } else {
    html = renderGame(game, getKiller(save.killer));
    if (view.screen === 'result') html += renderResult(game, lastNewCard, lastUnlockedAchievements);
    if (rogueOffers && save.rogue) html += renderRogueReward(save.rogue, rogueOffers);
  }
  if (view.guide) html += renderGuide();
  renderMarkupPreservingMap(html);
  showLatestExecutionScene();
  syncQtePanel();
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
  const immersiveActive = Boolean(game && view.screen === 'game');
  app.classList.toggle('immersive-game', immersiveActive);
  app.classList.toggle('panel-collapsed', killerPanelCollapsed && immersiveActive);
  const panelToggle = app.querySelector<HTMLElement>('.killer-panel-toggle');
  if (panelToggle) panelToggle.setAttribute('aria-expanded', String(!killerPanelCollapsed));
  document.body.classList.toggle('immersive-hunt', immersiveActive);
  applyMobileGameLayout(app, immersiveActive);
  publishBottomHudHeight();
  applyDisplaySettings();
  detailCardUid = null;
  if (game && view.screen === 'game' && selectedPersonId) {
    const panel = document.getElementById('cardDetail');
    if (panel) panel.innerHTML = personDetailHtml(game, selectedPersonId);
  } else if (view.screen !== 'game') {
    selectedPersonId = null;
  }
  syncScene();
  if (immersiveActive) syncImmersiveCamera(app);
  syncHuntAlerts();
}

/* ------------------------------------------------------------------ */
/* 对局中的强提示：有人逃走 / 逃生点开启 / 最终危机 / 回合快用完        */
/* ------------------------------------------------------------------ */
let hudHeightObserver: ResizeObserver | null = null;
let lastEscaped = 0;
let lastEscapeRoomCount = 0;
let lastTotemCount = -1;
let lastEmergency = false;
let lastTurnsLeft = 99;
let lastLogTop = '';
let alertGameRef: GameState | null = null;

function huntAlertHost(): HTMLElement {
  let host = document.getElementById('huntAlerts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'huntAlerts';
    host.className = 'hunt-alert-host';
    host.setAttribute('aria-live', 'assertive');
    document.body.appendChild(host);
  }
  return host;
}

/** 顶部居中的大字提示，4.6 秒后自动消失；最多同时显示 3 条。 */
function pushHuntAlert(text: string, tone: 'info' | 'warn' | 'danger' = 'warn'): void {
  const host = huntAlertHost();
  const node = document.createElement('div');
  node.className = `hunt-alert ${tone}`;
  node.textContent = text;
  host.appendChild(node);
  while (host.children.length > 3) host.firstElementChild?.remove();
  window.setTimeout(() => node.remove(), 4600);
}

function syncHuntAlerts(): void {
  if (!game || ui().screen !== 'game') {
    alertGameRef = game;
    lastEscaped = game?.escaped ?? 0;
    lastEscapeRoomCount = game?.escapeRooms.length ?? 0;
    lastEmergency = game?.emergencyActive ?? false;
    lastTurnsLeft = 99;
    lastLogTop = '';
    return;
  }
  if (alertGameRef !== game) {
    alertGameRef = game;
    lastEscaped = game.escaped;
    lastEscapeRoomCount = game.escapeRooms.length;
    lastTotemCount = game.totems.length;
    lastEmergency = game.emergencyActive;
    lastTurnsLeft = Math.max(0, game.mission.turns - game.turn + 1);
    lastLogTop = game.log[0] ?? '';
    return;
  }
  if (game.escaped > lastEscaped) {
    // 2026-11-28：逃跑不再放 bgm/音效，只在顶部给一条文字提示。
    pushHuntAlert(`有幸存者逃出去了！累计逃走 ${game.escaped} 人`, 'danger');
  }
  lastEscaped = game.escaped;
  if (lastTotemCount >= 0 && game.totems.length < lastTotemCount) {
    pushHuntAlert(
      game.totems.length === 0
        ? '最后一尊图腾被拆毁：厄咒效果全部消失'
        : `图腾被幸存者拆毁！还剩 ${game.totems.length} 座`,
      'danger',
    );
  }
  lastTotemCount = game.totems.length;
  if (game.escapeRooms.length > lastEscapeRoomCount) {
    const names = game.escapeRooms.map((id) => ROOM_MAP[id]?.name ?? id).join('、');
    pushHuntAlert(`逃生点开启：${names}（幸存者会往这里跑）`, 'warn');
    playSfx('gate');
  }
  lastEscapeRoomCount = game.escapeRooms.length;
  if (game.emergencyActive && !lastEmergency) {
    pushHuntAlert('最终危机：警报拉满，所有逃生点全部开放！', 'danger');
    playSfx('gate');
  }
  lastEmergency = game.emergencyActive;
  const top = game.log[0] ?? '';
  if (top !== lastLogTop && /已抵达逃生点/.test(top)) {
    pushHuntAlert('有人已经跑到逃生点，下回合就会逃走！', 'warn');
  }
  if (top !== lastLogTop && /攻击被躲开了/.test(top)) {
    pushHuntAlert('攻击被躲开了', 'warn');
  }
  if (top !== lastLogTop && /乌鸦.*振翅/.test(top)) {
    pushHuntAlert(top, 'warn');
  }
  lastLogTop = top;
  const turnsLeft = Math.max(0, game.mission.turns - game.turn + 1);
  if (turnsLeft <= 3 && turnsLeft < lastTurnsLeft) {
    pushHuntAlert(
      turnsLeft <= 0
        ? '契约回合已经耗尽！'
        : game.missionPrimaryCompleted
          ? `还剩 ${turnsLeft} 个回合；主目标已完成，可以继续狩猎或直接结算。`
          : `只剩 ${turnsLeft} 个回合，主目标还没完成！`,
      turnsLeft <= 1 ? 'danger' : 'warn',
    );
  }
  lastTurnsLeft = turnsLeft;
}

/** 把底部动作条 / 顶部状态条的实际高度写进 CSS 变量，杀手面板据此在两者之间定位。 */
function publishBottomHudHeight(): void {
  if (!app.classList.contains('immersive-game') || app.classList.contains('mobile-game-active')) {
    hudHeightObserver?.disconnect();
    hudHeightObserver = null;
    return;
  }
  const hud = app.querySelector<HTMLElement>('#bottomHud');
  if (!hud) return;
  const write = (): void => {
    const height = Math.ceil(hud.getBoundingClientRect().height);
    if (height > 0) app.style.setProperty('--hud-h', `${height}px`);
    const status = app.querySelector<HTMLElement>('.statusline');
    const statusHeight = status ? Math.ceil(status.getBoundingClientRect().height) : 0;
    if (statusHeight > 0) app.style.setProperty('--status-h', `${statusHeight}px`);
    // 动作条如果居中/靠右，左边这块是空的，杀手面板就可以贴到底部；
    // 只有当动作条压到左边（宽屏）时才需要抬到动作条上方。
    const hudLeft = hud.getBoundingClientRect().left;
    const panel = app.querySelector<HTMLElement>('.killer-ability-panel');
    const panelRight = panel ? panel.getBoundingClientRect().right : 400;
    const bottom = hudLeft > panelRight + 8 ? 18 : height + 36;
    app.style.setProperty('--panel-bottom', `${bottom}px`);
  };
  write();
  window.requestAnimationFrame(write);
  // 手牌张数、字体和图片落位都会改变动作条高度，用 ResizeObserver 持续跟随。
  if (typeof ResizeObserver !== 'undefined') {
    hudHeightObserver?.disconnect();
    hudHeightObserver = new ResizeObserver(write);
    hudHeightObserver.observe(hud);
  }
}

/** 把场景画布挂到新的平面图节点上；离开对局时销毁 */
function syncScene(): void {
  const host = app.querySelector<HTMLElement>('.floorplan');
  if (!game || !host || ui().screen === 'menu') {
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

/** 从行动日志中的真实人物姓名查回角色资料，按固定性别选择对应音轨。 */
function playVoice(head: string, kind: 'Hurt' | 'Hit' | 'Scream' | 'Startle'): void {
  const survivor = Object.values(SURVIVOR_MAP).find((person) => head.includes(person.name));
  if (!survivor) return;
  playSfx(`voice${survivor.gender === 'female' ? 'F' : 'M'}${kind}` as SfxName);
}

/** 引擎日志里刚发生的事 → 补上对应音效（不侵入纯逻辑层） */
let lastLogHead = '';
const playedDeathLogMessages = new Set<string>();
function sfxFromLogs(): void {
  if (!game) return;
  // 死亡记录可能被目击/结算日志顶到第二行以后，不能只检查 log[0]。
  for (const line of game.log.slice(0, 24)) {
    if (/停止了呼吸/.test(line) && !playedDeathLogMessages.has(line)) {
      playedDeathLogMessages.add(line);
      playSfx('kill');
      playVoice(line, 'Scream');
    }
  }
  const head = game.log[0] ?? '';
  if (head === lastLogHead) return;
  lastLogHead = head;
  if (/你处决了|特殊处决[：【]/.test(head)) {
    playSfx('execute');
    window.setTimeout(() => playSfx('wipe'), 260);
  }
  else if (/你杀死了/.test(head)) { playSfx('kill'); playVoice(head, 'Scream'); }
  else if (/砸晕|木板突然向你砸来/.test(head)) playSfx('palletStun');
  else if (/放下木板/.test(head)) playSfx('palletDrop');
  else if (/木板砸碎|砸碎.*木板/.test(head)) playSfx('barricadeSmash');
  else if (/踩中捕兽夹|捕兽夹.*咬|触发.*捕兽夹/.test(head)) playSfx('trapTrigger');
  else if (/电话突然响起|正在尝试报警|已经被报警|电话线/.test(head)) playSfx('phone');
  else if (/砸毁|断电|控制箱|电闸/.test(head)) {
    playSfx('breaker');
    window.setTimeout(() => playSfx('spark'), 150);
  }
  // 2026-11-28：逃跑不再放 bgm/音效，只保留顶部文字提示
  else if (/发电机重新亮了起来|用钥匙捅开|联系上了外面|修发电机/.test(head)) playSfx('objective');
  else if (/地图出现两个逃生点|第四阶段完成/.test(head)) playSfx('gate');
    else if (!suppressVoiceBeat && freshSightings === 0 && /【NPC目击】|发现了捕兽夹|发现并拆除了|忽然抬头|猛一回头|察觉到异常|发现了你/.test(head)) playVoice(head, 'Startle');
  else if (/恶魔附身：/.test(head)) playSfx('possess');
  else if (!suppressVoiceBeat && /打倒在地上|受到 \d+ 点伤害/.test(head)) playVoice(head, 'Hit');
  else if (!suppressVoiceBeat && /受伤了（|在流血/.test(head)) playVoice(head, 'Hurt');
  else if (!suppressVoiceBeat && /喊了一声|警觉升到|尖叫/.test(head)) playVoice(head, 'Scream');
  else if (!suppressVoiceBeat && freshSightings === 0 && /猛一回头|忽然抬头|察觉到异常|发抖/.test(head)) playVoice(head, 'Startle');
  else if (/致盲|击晕|手电筒|逼退/.test(head)) playSfx('stun');
  else if (/乌鸦被惊起|乌鸦扑棱|一阵乌鸦/.test(head)) playSfx('crow');
  else if (/翻出了|拾起|拿到了武器/.test(head)) playSfx('pickup');
  else if (/发现并破坏了|破坏了图腾/.test(head)) playSfx('smash');
  else if (/发电机/.test(head)) playSfx('generator');
}

/** 本轮新发现的幸存者数量：用来决定「发现幸存者」提示音，并压掉同一拍的受惊尖叫。 */
let freshSightings = 0;
/** 上一次「气场显形」的幸存者签名与全局气场计数：心跳只在气场出现/刷新时响一次。 */
let lastAuraSignature = '';
let lastPalletDropCount = 0;
let lastCrowAlertCount = 0;

/** 事件音效：用计数器触发，不依赖日志位置。 */
function flushEventSounds(): void {
  if (!game) return;
  if ((game.palletDropCount ?? 0) > lastPalletDropCount) {
    lastPalletDropCount = game.palletDropCount ?? 0;
    playSfx('palletDrop');
  }
  if ((game.crowAlertCount ?? 0) > lastCrowAlertCount) {
    lastCrowAlertCount = game.crowAlertCount ?? 0;
    playSfx('crow');
  }
}
let lastAuraActions = 0;

/**
 * 气场心跳：只有「新的人被显形」或「气场被重新施放」时才播放，
 * 回合结束、普通重绘都不会再误响。
 */
function pulseAuraHeartbeat(): void {
  const state = game;
  if (!state) return;
  const signature = state.people
    .filter((person) => person.role !== 'police' && person.hp > 0 && (
      (person.revealedActions ?? 0) > 0
      || (state.revealAuraActions > 0 && (person.room === state.playerRoom || ROOM_MAP[state.playerRoom].neighbors.includes(person.room)))
    ))
    .map((person) => person.id)
    .sort()
    .join('|');
  const refreshed = state.revealAuraActions > lastAuraActions;
  if (signature && (signature !== lastAuraSignature || refreshed)) playHeartbeat();
  lastAuraSignature = signature;
  lastAuraActions = state.revealAuraActions;
}
/** 已经见过的幸存者：只在第一次看见时播放发现音效。 */
let knownSurvivorIds = new Set<string>();

/**
 * 第一次看见某个幸存者时播放「发现幸存者」提示音。
 *
 * 之前这盘音效虽然配好了文件（audio.ts 的 survivorFound），却从来没有被触发；
 * 玩家第一次遇到某人时听到的是受惊尖叫（日志规则命中 Startle）。
 * 现在改为：新面孔给发现音，尖叫只留给真正受惊/受伤的事件。
 */
function announceNewSightings(): void {
  if (!game) return;
  const seen = game.people.filter((person) => person.role !== 'police' && person.hp > 0 && (person.lastSeenTurn ?? 0) > 0);
  const fresh = seen.filter((person) => !knownSurvivorIds.has(person.id));
  knownSurvivorIds = new Set(seen.map((person) => person.id));
  freshSightings = fresh.length;
  if (fresh.length) playSfx('survivorFound');
}

/**
 * 屠夫走进有人的房间时：只播「发现幸存者」，不再放幸存者的受惊尖叫/喊叫。
 * 2026-11-28 作者要求：进房间的叫声换成文件里的「发现幸存者」。
 */
let entryWithSurvivors = false;
let suppressVoiceBeat = false;

function noteRoomEntry(previousRoom: RoomId): void {
  if (!game || game.playerRoom === previousRoom) return;
  const room = game.playerRoom;
  entryWithSurvivors = game.people.some(
    (person) => person.role !== 'police' && person.hp > 0 && !person.hidden && person.room === room,
  );
}

function afterAction(): void {
  pulseFeedback();
  flushEventSounds();
  announceNewSightings();
  // 走进有人的房间：统一播“发现幸存者”，并压掉这一拍的受惊叫声。
  if (entryWithSurvivors) {
    if (freshSightings === 0) playSfx('survivorFound');
    suppressVoiceBeat = true;
  }
  pulseAuraHeartbeat();
  sfxFromLogs();
  entryWithSurvivors = false;
  suppressVoiceBeat = false;
  freshSightings = 0;
  if (game?.executionMethodsUsed.length) {
    const known = new Set(save.executionRecords ?? []);
    game.executionMethodsUsed.forEach((id) => known.add(id));
    if (known.size !== (save.executionRecords ?? []).length) {
      save = { ...save, executionRecords: [...known] };
      writeSave(save);
    }
  }
  if (game && game.phase === 'gameover' && ui().screen !== 'result') {
    // 肉鸽：过关不结算，先给三选一奖励；失败则清掉本轮进度。
    if (save.rogue && rogueGame) {
      if (game.result === 'win') {
        playSfx('win');
        rogueOffers = rollRogueOffers(save.rogue);
        render();
        return;
      }
      playSfx('lose');
      const depth = save.rogue.depth;
      save = { ...save, rogue: null };
      writeSave(save);
      showResult();
      resultApplied = true;
      pushHuntAlert(`肉鸽结束：倒在第 ${depth} 层`, 'danger');
      render();
      return;
    }
    playSfx(game.result === 'win' ? 'win' : 'lose');
    showResult();
    if (!resultApplied) {
      resultApplied = true;
      const earned = bloodPointTotal(game);
      const unlocked = [...save.unlockedCards];
      let wins = save.wins;
      let darkCells = save.darkCells;
      if (game.result === 'win') {
        wins += 1;
        darkCells += 1;
      }
      save = { ...save, wins, credits: save.credits + earned, darkCells, unlockedCards: unlocked };
      const settled = applyAchievements(save, game);
      save = settled.save;
      lastUnlockedAchievements = settled.unlocked;
      writeSave(save);
    }
  }
  render();
}


function startGame(freeHunt = false, loadout: string[] = []): void {
  rogueGame = false;
  playedDeathLogMessages.clear();
  knownSurvivorIds = new Set();
  freshSightings = 0;
  lastAuraSignature = '';
  lastAuraActions = 0;
  lastPalletDropCount = 0;
  lastCrowAlertCount = 0;
  lastShownExecutionSeq = 0;
  cancelQte();
  selectedPersonId = null;
  // 三段串起来，避免同时响糊成一团：装配完成 → 进入地图 → 游戏开始
  playSfx('ready');
  window.setTimeout(() => playSfx('enterMap'), 190);
  window.setTimeout(() => playSfx('start'), 430);
  const killer = save.killer ?? '迈克尔·迈尔斯';
  const mission = freeHunt ? generateFreeHunt() : generateMission(killer);
  game = createGame(save.deck, mission, killer, currentMenuMap().id, loadout);
  showGame();
  lastKills = game.kills;
  lastWanted = game.wanted;
  resultApplied = false;
  lastNewCard = null;
  lastUnlockedAchievements = [];
  render();
}

let cardPreviewUid: string | null = null;
let cardPreviewTimer: number | null = null;

/** 进入肉鸽的某一层：用 run 里的随机牌组 / 配件开局，再套上已获得的规则与层数压力。 */
function startRogueFloor(run: RogueRun): void {
  playedDeathLogMessages.clear();
  knownSurvivorIds = new Set();
  freshSightings = 0;
  lastAuraSignature = '';
  lastAuraActions = 0;
  lastPalletDropCount = 0;
  lastCrowAlertCount = 0;
  lastShownExecutionSeq = 0;
  cancelQte();
  selectedPersonId = null;
  rogueOffers = null;
  save = { ...save, rogue: run };
  rogueGame = true;
  writeSave(save);
  playSfx('ready');
  window.setTimeout(() => playSfx('enterMap'), 190);
  window.setTimeout(() => playSfx('start'), 430);
  game = createGame(run.deck, generateMission(run.killer), run.killer, currentMenuMap().id, run.accessories);
  applyRogueFloor(game, run);
  showGame();
  lastKills = game.kills;
  lastWanted = game.wanted;
  resultApplied = false;
  lastNewCard = null;
  lastUnlockedAchievements = [];
  render();
}

/** 肉鸽：开局 / 继续。 */
function enterRogue(): void {
  const run = save.rogue ?? startRogueRun(save.killer ?? '迈克尔·迈尔斯');
  startRogueFloor({ ...run, depth: save.rogue ? run.depth : 1 });
}

/** 肉鸽：过关后带着奖励进入下一层。 */
function rogueNextFloor(offer: RogueOffer | null): void {
  const run = save.rogue;
  if (!run) { rogueOffers = null; render(); return; }
  startRogueFloor(advanceRogue(run, offer));
}

/** 肉鸽：中途结束 / 失败，清掉进度。 */
function endRogue(): void {
  rogueOffers = null;
  save = { ...save, rogue: null };
  writeSave(save);
  render();
}

function hideCardPreview(): void {
  const preview = document.getElementById('card-hover-preview');
  preview?.classList.remove('visible');
  cardPreviewUid = null;
  if (cardPreviewTimer !== null) {
    window.clearInterval(cardPreviewTimer);
    cardPreviewTimer = null;
  }
}

function showCardPreview(uid: string | null, anchor: HTMLElement | null): void {
  if (!uid || !anchor || !game || !inGame()) {
    hideCardPreview();
    return;
  }
  let preview = document.getElementById('card-hover-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'card-hover-preview';
    preview.className = 'card-hover-preview';
    preview.setAttribute('aria-live', 'polite');
    document.body.appendChild(preview);
  }
  preview.classList.add('visible');
  if (cardPreviewUid !== uid) {
    if (cardPreviewTimer !== null) window.clearInterval(cardPreviewTimer);
    preview.innerHTML = cardDetailHtml(game, uid);
    cardPreviewUid = uid;
    const body = preview.querySelector<HTMLElement>('.detail-body');
    if (body && body.scrollHeight > body.clientHeight + 4) {
      let pause = 0;
      cardPreviewTimer = window.setInterval(() => {
        if (!body.isConnected) return;
        if (body.scrollTop + body.clientHeight >= body.scrollHeight - 2) {
          pause += 1;
          if (pause >= 30) { body.scrollTop = 0; pause = 0; }
        } else {
          body.scrollTop += 0.45;
          pause = 0;
        }
      }, 40);
    } else {
      cardPreviewTimer = null;
    }
  }
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth * 0.38);
  const height = Math.min(470, window.innerHeight * 0.72);
  let left = rect.right + 14;
  if (left + width > window.innerWidth - 10) left = rect.left - width - 14;
  left = Math.max(10, Math.min(left, window.innerWidth - width - 10));
  const top = Math.max(10, Math.min(rect.top + rect.height / 2 - height / 2, window.innerHeight - height - 10));
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
  preview.style.width = `${width}px`;
  preview.style.maxHeight = `${height}px`;
  preview.classList.add('visible');
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

/* ------------------------------------------------------------------ */
/* 界面动作：动作名 → 处理器                                            */
/* ------------------------------------------------------------------ */

/**
 * 分发层已保证 `scope === 'game'` 时对局存在，这里只做类型收敛，
 * 避免每个处理器都重复写 `if (!game) return`。
 */
function currentGame(): GameState {
  if (!game) throw new Error('对局动作在对局之外被触发');
  return game;
}

/** 当前房间是否有柜子：搜索音效和「翻柜子」判定保持一致。 */
function isCabinetRoom(state: GameState): boolean {
  return (
    CABINET_ROOMS.includes(state.playerRoom) ||
    (state.mapId === 'badham' && ['nursery', 'storage', 'guestroom'].includes(state.playerRoom))
  );
}

/** 幸存者头像在所属房间里的相对位置（百分比）：处决血光要跟着头像走。 */
function personRoomPercent(personId: string): { x: number; y: number } | null {
  const chip = app.querySelector<HTMLElement>(`.person-chip[data-person-id="${personId}"]`);
  const room = chip?.closest<HTMLElement>('.room');
  if (!chip || !room) return null;
  const chipRect = chip.getBoundingClientRect();
  const roomRect = room.getBoundingClientRect();
  if (!roomRect.width || !roomRect.height) return null;
  return {
    x: ((chipRect.left + chipRect.width / 2 - roomRect.left) / roomRect.width) * 100,
    y: ((chipRect.top + chipRect.height / 2 - roomRect.top) / roomRect.height) * 100,
  };
}

/** 返回大厅：丢弃对局，并重置只属于表现层的选择状态。 */
function leaveToMenu(): void {
  game = null;
  selectedPersonId = null;
  lastNewCard = null;
  lastUnlockedAchievements = [];
  session.pendingRun = null;
  showMenu();
  rollMenuMap();
  render();
}

/**
 * 对局动作的附加校验：手牌超限、以及四种「选目标」模式期间只放行各自的动作。
 * 这些规则原先散落在 if 链中段，现在集中在一个函数里，处理器不必重复判断。
 */
function blockedByGameMode(action: string): boolean {
  if (!game) return true;
  if (isQteActive()) return true;
  // 被警察枪击压制：只能结束回合，不能做其他动作。
  if (game.playerSkipTurn) return action !== 'end-turn';
  // 超过手牌上限时，必须先逐张选择弃牌；禁止用结束回合或其他动作绕过。
  if (game.hand.length > 6) return action !== 'discard';
  if (game.nurseBlinkTargeting) return !['blink-select', 'power'].includes(action);
  if (game.huntressAiming) return !['hatchet-target', 'power'].includes(action);
  if (game.lookingAround) return !['look-select', 'look-cancel'].includes(action);
  if (game.auraTargeting) return action !== 'aura-select';
  return false;
}

/** 当前杀手的处决演出文案由 execution 模块解析，界面不再单独维护。 */

function createGameActions(): ActionTable {
  const handlers: Record<string, (ctx: ActionContext) => void> = {
    person: ({ target }) => {
      const game = currentGame();
      const personId = target.dataset.personId;
      if (!personId) return;
      const panel = document.getElementById('cardDetail');
      selectedPersonId = personId;
      if (panel) panel.innerHTML = personDetailHtml(game, personId);
      openIntelDrawer();
      detailCardUid = null;
    },

    'close-person-detail': () => {
      selectedPersonId = null;
      detailCardUid = null;
      const panel = document.getElementById('cardDetail');
      if (panel) panel.innerHTML = defaultDetailHtml();
    },

    'attack-target': ({ target }) => {
      const game = currentGame();
      const personId = target.dataset.personId;
      if (!personId) return;
      const ghosts = captureAttackGhosts();
      const victimIsSurvivor = game.people.some((person) => person.id === personId && person.role !== 'police');
      const killsBefore = game.kills;
      const hit = attack(game, personId);
      if (hit) {
        pendingMapAttackTarget = personId;
        pendingMapAttackGhost = ghosts.get(personId) ?? null;
        updateAttackGhostEscapeDirection(pendingMapAttackGhost, personId);
        if (victimIsSurvivor) playSurvivorHit(SURVIVOR_MAP[personId]?.gender ?? 'male');
      }
      playKillerAttackSound(game);
      if (game.kills > killsBefore) playSurvivorDeath(SURVIVOR_MAP[personId]?.gender ?? 'male');
      lastLogHead = game.log[0] ?? '';
      afterAction();
    },

    execute: (ctx) => runExecute(ctx),
    'execute-target': (ctx) => runExecute(ctx),
    'execute-qte': ({ target }) => {
      const personId = target.dataset.personId;
      if (personId) startExecutionQte(personId);
    },

    'drop-carried': () => {
      const game = currentGame();
      if (dropCarriedPerson(game)) playSfx('click');
      afterAction();
    },

    carry: ({ target }) => {
      const game = currentGame();
      const personId = target.dataset.personId;
      if (personId) carryPerson(game, personId);
      afterAction();
    },

    'execute-special': ({ target }) => {
      lastExecuteAt = Date.now();
      const game = currentGame();
      playSfx('executionSite');
      const method = target.dataset.method as ExecutionMethodId | undefined;
      const carriedId = game.carryPersonId;
      const carried = carriedId ? game.people.find((person) => person.id === carriedId) : undefined;
      if (method && executeCarriedPerson(game, method)) {
        playSfx('execute');
        if (carried) playSfx(SURVIVOR_MAP[carried.id]?.gender === 'female' ? 'voiceFScream' : 'voiceMScream', 0.96);
        window.setTimeout(() => playSfx('wipe'), 260);
        lastLogHead = game.log[0] ?? '';
      }
      afterAction();
    },

    power: ({ target }) => {
      const game = currentGame();
      const powerId = target.dataset.power;
      const wasPossessed = game.possessed;
      const used = powerId ? usePower(game, powerId) : false;
      if (used && powerId === 'trap_set') playSfx('trapSet');
      if (used && (powerId === 'wraith_bell' || powerId === 'wraith_rush')) playSfx('wraithPower');
      if (!wasPossessed && game.possessed && game.killer === '迈克尔·迈尔斯') {
        playSfx('possess');
        if ((game.log[0] ?? '').includes('恶魔附身：')) lastLogHead = game.log[0];
      }
      afterAction();
    },

    'blink-select': ({ target }) => {
      const game = currentGame();
      const room = target.dataset.room as RoomId | undefined;
      const previousRoom = game.playerRoom;
      if (room && blinkPlayer(game, room)) {
        playSfx('nurseBlink');
        noteRoomEntry(previousRoom);
      }
      afterAction();
    },

    'hatchet-target': ({ target }) => {
      const game = currentGame();
      const personId = target.dataset.personId;
      const ghosts = captureAttackGhosts();
      const victimIsSurvivor = !!personId && game.people.some((person) => person.id === personId && person.role !== 'police');
      const killsBefore = game.kills;
      if (personId && throwHuntressHatchet(game, personId)) {
        pendingMapAttackTarget = personId;
        pendingMapAttackGhost = ghosts.get(personId) ?? null;
        updateAttackGhostEscapeDirection(pendingMapAttackGhost, personId);
        playSfx('huntressAxe');
        if (victimIsSurvivor) playSurvivorHit(personId ? SURVIVOR_MAP[personId]?.gender ?? 'male' : 'male');
        if (game.kills > killsBefore) playSurvivorDeath(SURVIVOR_MAP[personId]?.gender ?? 'male');
        lastLogHead = game.log[0] ?? '';
      }
      afterAction();
    },

    'recover-trap': () => {
      recoverBearTrap(currentGame());
      afterAction();
    },

    'refill-hatchets': () => {
      refillHuntressHatchets(currentGame());
      afterAction();
    },

    draw: () => {
      drawCardAction(currentGame());
      afterAction();
    },

    move: ({ target }) => {
      const game = currentGame();
      const room = target.dataset.room as RoomId | undefined;
      if (!room) return;
      // 走不过去时说清楚原因，而不是静默失败；只有真的走成了才播放脚步声，
      // 否则「有脚步声但画面没动」会被当成渲染 bug。
      const reason = moveBlockReason(game, room);
      if (reason) {
        noteToPlayer(game, reason);
      } else {
        const previousRoom = game.playerRoom;
        movePlayer(game, room);
        noteRoomEntry(previousRoom);
        playStep();
      }
      afterAction();
    },

    attack: () => {
      const game = currentGame();
      const ghosts = captureAttackGhosts();
      const survivorIdsBefore = new Set(game.people.filter((person) => person.role !== 'police').map((person) => person.id));
      const kills = game.kills;
      const hit = attack(game);
      if (hit) {
        pendingMapAttackTarget = game.lastAttackedId ?? null;
        pendingMapAttackGhost = pendingMapAttackTarget ? ghosts.get(pendingMapAttackTarget) ?? null : null;
        if (pendingMapAttackTarget) updateAttackGhostEscapeDirection(pendingMapAttackGhost, pendingMapAttackTarget);
        if (pendingMapAttackTarget && survivorIdsBefore.has(pendingMapAttackTarget)) playSurvivorHit(SURVIVOR_MAP[pendingMapAttackTarget]?.gender ?? 'male');
      }
      playKillerAttackSound(game);
      if (game.kills > kills) playSurvivorDeath(SURVIVOR_MAP[game.lastAttackedId ?? '']?.gender ?? 'male');
      lastLogHead = game.log[0] ?? '';
      afterAction();
    },

    wipe: () => {
      wipeBlade(currentGame());
      playSfx('wipe');
      afterAction();
    },

    'toggle-breaker': ({ target }) => {
      const game = currentGame();
      const circuit = game.powerCircuits.find((item) => item.id === target.dataset.circuitId);
      if (togglePowerCircuit(game, target.dataset.circuitId) && circuit) {
        pushHuntAlert(
          circuit.enabled
            ? `${circuit.name}：供电恢复 · ${circuit.affectedRooms.map(roomName).join('、')}`
            : `${circuit.name}：已断电 · ${circuit.affectedRooms.map(roomName).join('、')}陷入黑暗`,
          circuit.enabled ? 'info' : 'warn',
        );
        playSfx('breaker');
      }
      afterAction();
    },

    'break-phone': () => {
      if (breakPhone(currentGame())) playSfx('smash');
      afterAction();
    },

    sabotage: () => {
      if (sabotageSiteItem(currentGame())) {
        const game = currentGame();
        pushHuntAlert(game.log[0] ?? '设施已被破坏', 'warn');
        playSfx('sabotage');
      }
      afterAction();
    },

    'destroy-item-box': ({ target }) => {
      if (destroyItemBox(currentGame(), target.dataset.boxId)) playSfx('smash');
      afterAction();
    },

    'sadako-tv': ({ target }) => {
      const room = target.dataset.room;
      if (room && sadakoTeleport(currentGame(), room as RoomId)) playSfx('spark');
      afterAction();
    },

    'break-door': ({ target }) => {
      const room = target.dataset.room as RoomId | undefined;
      if (!room) return;
      if (breakDoor(currentGame(), room)) playSfx('smash');
      afterAction();
    },

    search: () => {
      const state = currentGame();
      const energyBefore = state.energy;
      searchRoom(state);
      // 翻柜子统一用柜子音效：以前不管房里有柜子没柜子都是“点击声”，和开柜子两套声音。
      if (state.energy < energyBefore) {
        playSfx(isCabinetRoom(state) ? 'cabinet' : 'click');
      }
      afterAction();
    },

    look: () => {
      lookAround(currentGame());
      playSfx('click');
      render();
    },

    'look-cancel': () => {
      cancelLookSelection(currentGame());
      playSfx('click');
      render();
    },

    'look-select': ({ target }) => {
      const game = currentGame();
      const room = target.dataset.room as RoomId | undefined;
      if (room) {
        lookAtRoom(game, room);
        scene?.faceToward(room);
      }
      playSfx('click');
      afterAction();
    },

    'aura-select': ({ target }) => {
      const game = currentGame();
      const room = target.dataset.room as RoomId | undefined;
      if (room) selectAuraRoom(game, room);
      playSfx('click');
      render();
      pulseAuraHeartbeat();
    },


    'cabinet-interact': () => {
      interactCabinet(currentGame());
      playSfx('cabinet');
      afterAction();
    },

    'toggle-killer-panel': () => {
      killerPanelCollapsed = !killerPanelCollapsed;
      try {
        localStorage.setItem('nightfall-panel-collapsed', killerPanelCollapsed ? '1' : '0');
      } catch {
        /* 私密模式下忽略 */
      }
      render();
    },

    'totem-draw': (ctx) => runTotem(ctx, 'draw'),
    'totem-energy': (ctx) => runTotem(ctx, 'energy'),

    'break-barricade': ({ target }) => {
      const game = currentGame();
      const room = target.dataset.room as RoomId | undefined;
      if (room && breakBarricade(game, room)) playSfx('barricadeSmash');
      afterAction();
    },

    play: ({ target }) => {
      const game = currentGame();
      const ghosts = captureAttackGhosts();
      const killsBefore = game.kills;
      const survivorIdsBefore = new Set(game.people.filter((person) => person.role !== 'police').map((person) => person.id));
      const oldLogs = new Set(game.log);
      const cardUid = target.dataset.uid;
      if (cardUid) playCard(game, cardUid);
      if (game.kills > killsBefore) {
        const deadId = [...survivorIdsBefore].find((id) => !game.people.some((person) => person.id === id));
        if (deadId) playSurvivorDeath(SURVIVOR_MAP[deadId]?.gender ?? 'male');
        lastLogHead = game.log[0] ?? '';
      }
      const newLogs = game.log.filter((line) => !oldLogs.has(line));
      if (game.lastAttackedId && newLogs.some((line) => line.includes('你挥刀砍向') || line.includes('你俯身补上一刀'))) {
        pendingMapAttackTarget = game.lastAttackedId;
        pendingMapAttackGhost = ghosts.get(game.lastAttackedId) ?? null;
        updateAttackGhostEscapeDirection(pendingMapAttackGhost, game.lastAttackedId);
        if (survivorIdsBefore.has(game.lastAttackedId)) playSurvivorHit(SURVIVOR_MAP[game.lastAttackedId]?.gender ?? 'male');
        playKillerAttackSound(game);
      }
      playSfx('click');
      afterAction();
    },

    wait: () => {
      waitAction(currentGame());
      afterAction();
    },

    'finish-contract': () => {
      finishContract(currentGame());
      afterAction();
    },

    'end-turn': () => {
      endTurn(currentGame());
      playSfx('endturn');
      afterAction();
    },

    'finish-free-hunt': () => {
      if (finishFreeHunt(currentGame())) playSfx('win');
      afterAction();
    },

    'give-up': () => {
      giveUp(currentGame());
      afterAction();
    },

    discard: ({ target }) => {
      const game = currentGame();
      const cardUid = target.dataset.uid;
      if (cardUid) discardCard(game, cardUid);
      afterAction();
    },
  };

  /** 普通处决与指定目标处决只差一个 data-person-id。 */
  function runExecute({ target, action }: ActionContext): void {
    lastExecuteAt = Date.now();
    const game = currentGame();
    const personId = action === 'execute-target' ? target.dataset.personId : undefined;
    const ghosts = captureAttackGhosts();
    const downedId = personId ?? game.people.find((person) => person.role !== 'police' && person.hp <= 0 && person.room === game.playerRoom)?.id;
    const executed = executeDownedPerson(game, personId);
    if (executed) {
      if (downedId) {
        pendingMapAttackTarget = downedId;
        pendingMapAttackGhost = ghosts.get(downedId) ?? null;
      }
      playSfx('execute');
      if (downedId) playSfx(SURVIVOR_MAP[downedId]?.gender === 'female' ? 'voiceFScream' : 'voiceMScream', 0.96);
      window.setTimeout(() => playSfx('wipe'), 260);
      lastLogHead = game.log[0] ?? '';
    }
    afterAction();
  }

  /** 图腾互动：抽牌或补能量。 */
  function runTotem(_ctx: ActionContext, reward: 'draw' | 'energy'): void {
    interactTotem(currentGame(), reward);
    playSfx('click');
    afterAction();
  }

  const table: ActionTable = {};
  for (const [name, run] of Object.entries(handlers)) table[name] = { scope: 'game', run };
  return table;
}

const registry = new ActionRegistry();
registry.register('菜单与面板', createMenuActions({
  getSave: () => save,
  setSave: (next) => { save = next; },
  render,
  startGame,
  leaveToMenu,
}));
registry.register('平衡面板', createAdminActions({ render }));
registry.register('配件工坊', {
  'workshop-open': () => { openPanel('workshop'); render(); },
  'workshop-close': () => { workshopState.editing = null; closePanel(); render(); },
  'workshop-new': () => { startNewDraft(); render(); },
  'workshop-edit': ({ target }) => { const id = target.dataset.id; if (id) { startEditDraft(id); render(); } },
  'workshop-duplicate': ({ target }) => { const id = target.dataset.id; if (id) { duplicateAsDraft(id); render(); } },
  'workshop-delete': ({ target }) => {
    const id = target.dataset.id;
    if (!id) return;
    removeCustomAccessory(id);
    workshopState.message = `已删除 ${id}`;
    render();
  },
  'workshop-save': () => {
    const def = workshopState.editing;
    if (!def) return;
    if (!/^[a-z0-9_]{2,40}$/.test(def.id)) { workshopState.message = 'id 只能用小写字母/数字/下划线，2-40 位'; render(); return; }
    if (!def.name.trim()) { workshopState.message = '名称不能为空'; render(); return; }
    if (!def.mods.length) { workshopState.message = '至少留一条效果'; render(); return; }
    if (ACCESSORY_MAP[def.id] && !isCustomAccessory(def.id)) { workshopState.message = '这个 id 和内置配件重名了，换一个'; render(); return; }
    upsertCustomAccessory({ ...def, name: def.name.trim(), desc: def.desc.trim() });
    workshopState.message = `已保存 ${def.name}`;
    workshopState.editing = null;
    render();
  },
  'workshop-cancel': () => { workshopState.editing = null; render(); },
  'workshop-mod-add': () => { addDraftMod(); render(); },
  'workshop-mod-remove': ({ target }) => { removeDraftMod(Number(target.dataset.index) || 0); render(); },
  'workshop-effect-add': () => { addDraftEffect(); render(); },
  'workshop-effect-remove': ({ target }) => { removeDraftEffect(Number(target.dataset.index) || 0); render(); },
  'workshop-icon-clear': () => { if (workshopState.editing) { delete workshopState.editing.iconData; render(); } },
  'workshop-login': () => {
    const token = workshopState.token.trim();
    if (!token) { workshopState.status = '先粘贴 GitHub 密钥'; render(); return; }
    workshopState.status = '验证中…';
    render();
    void verifyGitHubToken(token)
      .then((login) => { workshopState.status = '已授权：' + login + '，可以点发布了'; })
      .catch((error: unknown) => { workshopState.status = '验证失败：' + (error instanceof Error ? error.message : '未知错误'); })
      .finally(() => render());
  },
  'workshop-publish': () => {
    const list = customAccessoriesForPublish();
    if (!list.length) { workshopState.status = '还没有自定义配件，先做一个再发布'; render(); return; }
    workshopState.status = '发布中…';
    render();
    void publishAccessoryPack(list as unknown as Array<Record<string, unknown>>)
      .then((result) => {
        workshopState.status = '已提交 ' + result.count + ' 件（图标 ' + result.icons + ' 张）。等 1-2 分钟 Actions 部署完成，刷新页面所有玩家就能看到。';
      })
      .catch((error: unknown) => { workshopState.status = '发布失败：' + (error instanceof Error ? error.message : '未知错误'); })
      .finally(() => render());
  },
  'workshop-export': () => {
    downloadJson(exportCustomAccessories());
    workshopState.message = '已导出 custom-accessories.json';
    render();
  },
});
registry.register('血网', {
  bloodweb: () => {
    bloodwebKiller = save.killer ?? '迈克尔·迈尔斯';
    bloodwebOpen = true;
    bloodwebOffers = null;
    render();
  },
  'bloodweb-killer': ({ target }) => {
    const id = target.dataset.id;
    if (!id || !(save.unlockedKillers ?? []).includes(id)) return;
    bloodwebKiller = id;
    bloodwebOffers = null;
    render();
  },
  'bloodweb-level': () => {
    const killer = bloodwebKiller ?? save.killer ?? '迈克尔·迈尔斯';
    const progress = progressOf(save.progress, killer);
    const cost = bloodwebCost(progress);
    if (save.credits < cost) {
      pushHuntAlert('血点不够，先打一局吧', 'warn');
      return;
    }
    const nextProgress = addLevel(progress);
    save = {
      ...save,
      credits: save.credits - cost,
      progress: { ...(save.progress ?? {}), [killer]: nextProgress },
      sharedCards: syncSharedCards({ ...(save.progress ?? {}), [killer]: nextProgress }, save.sharedCards),
    };
    writeSave(save);
    playSfx('stage');
    bloodwebOffers = rollBloodweb(killer);
    render();
  },
  'bloodweb-pick': ({ target }) => {
    const killer = bloodwebKiller ?? save.killer ?? '迈克尔·迈尔斯';
    const index = Number(target.dataset.index);
    const offer = bloodwebOffers?.[Number.isInteger(index) ? index : -1];
    if (!offer) return;
    if (offer.kind === 'accessory') {
      save = {
        ...save,
        accessories: { ...(save.accessories ?? {}), [offer.id]: (save.accessories?.[offer.id] ?? 0) + 1 },
      };
    } else if (offer.kind === 'card') {
      if (!save.unlockedCards.includes(offer.id)) save = { ...save, unlockedCards: [...save.unlockedCards, offer.id] };
    } else {
      const amount = Number(offer.id.replace('credits_', '')) || 40;
      save = { ...save, credits: save.credits + amount };
    }
    writeSave(save);
    playSfx('pickup');
    bloodwebOffers = null;
    render();
  },
  'bloodweb-close': () => {
    bloodwebOpen = false;
    bloodwebOffers = null;
    bloodwebKiller = null;
    render();
  },
});
registry.register('肉鸽猎杀', {
  'rogue-start': () => enterRogue(),
  'rogue-pick': ({ target }) => {
    const index = Number(target.dataset.index);
    rogueNextFloor(Number.isInteger(index) ? rogueOffers?.[index] ?? null : null);
  },
  'rogue-next': () => rogueNextFloor(null),
  'rogue-end': () => {
    endRogue();
    leaveToMenu();
  },
  'rogue-abandon': () => {
    endRogue();
    leaveToMenu();
  },
});
registry.register('对局', createGameActions());
registry.register('通用', {
  mute: () => {
    toggleMute();
    afterAction();
  },
  'display-setting': ({ target }) => {
    const key = target.dataset.setting as keyof DisplaySettings | undefined;
    if (key === 'interfaceScale' || key === 'fontScale' || key === 'mapScale') cycleDisplaySetting(key);
  },
});

app.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  clearHeldMovement();
  const action = target.dataset.action;
  if (!action) return;
  // 处决后 DOM 立刻重绘，双击的第二下容易落到刚出现的房间移动按钮上。
  if (action === 'move' && Date.now() - lastExecuteAt < 420) return;

  // 分数处决 QTE 已删除；所有处决走普通处决 / 地点处决。
  if (handleImmersiveAction(action)) return;

  // 浏览器要求先有用户交互才允许出声
  unlockAudio();

  // 主菜单按钮音：选角色框有专属音效，其余大厅按钮统一一个轻音
  if (ui().screen === 'menu' && !game && action !== 'mute') {
    if (action === 'killer' || action === 'unlock-killer') playSfx('killerPick');
    else if (action !== 'start' && action !== 'again') playSfx('menuButton');
  }

  const spec = registry.get(action);
  if (!spec) {
    // 渲染层产出了没人接的按钮时留下证据，而不是静默无响应。
    console.warn('未注册的界面动作：', action);
    return;
  }

  if ((spec.scope ?? 'any') === 'game') {
    if (!game || !inGame()) return;
    if (blockedByGameMode(action)) return;
  }

  spec.run({ target, action });
});

/* 平衡调整：任何输入/下拉变化都直接写回运行中的数据（写回逻辑见 adminActions） */
app.addEventListener('change', (event) => {
  const el = (event.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-tune],[data-addon]');
  if (!el) return;
  if (!applyTuneChange(el)) return;
  el.classList.add('tune-saved');
  window.setTimeout(() => el.classList.remove('tune-saved'), 700);
});

/* 卡牌详情：鼠标悬停、键盘聚焦、触屏点按都能看见 */
app.addEventListener('pointerover', (event) => {
  if (!game || !inGame()) return;
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-uid]');
  if (card) {
    showCardDetail(card.dataset.cardUid ?? null);
    showCardPreview(card.dataset.cardUid ?? null, card);
  }
});

app.addEventListener('pointerout', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-uid]');
  if (!card) return;
  const to = event.relatedTarget as HTMLElement | null;
  if (to && to.closest('[data-card-uid]')) return;
  showCardDetail(null);
  hideCardPreview();
});

app.addEventListener('focusin', (event) => {
  if (!game || !inGame()) return;
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-uid]');
  if (card) {
    showCardDetail(card.dataset.cardUid ?? null);
    showCardPreview(card.dataset.cardUid ?? null, card);
  }
});

app.addEventListener('focusout', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card-uid]');
  if (!card) return;
  const to = event.relatedTarget as HTMLElement | null;
  if (to && to.closest('[data-card-uid]')) return;
  showCardDetail(null);
  hideCardPreview();
});


window.addEventListener('keydown', (event) => {
  if (handleQteInput(event.key)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (!game || !inGame() || event.altKey || event.ctrlKey || event.metaKey) return;
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
// 窗口尺寸变化时底部动作条高度会变，杀手面板的位置跟着重新量一次。
// 配件工坊：文本框、效果行、图标与 JSON 导入
document.addEventListener('input', (event) => {
  const el = event.target as HTMLInputElement | HTMLSelectElement | null;
  if (!el || !document.querySelector('.workshop-modal')) return;
  if (el.hasAttribute('data-ws-token')) { workshopState.token = (el as HTMLInputElement).value; return; }
  const field = el.getAttribute('data-acc');
  if (field) { updateDraftField(field as never, el.value); return; }
  const modKey = el.getAttribute('data-acc-mod-key');
  if (modKey !== null) { updateDraftMod(Number(modKey), { key: el.value as never }); return; }
  const modValue = el.getAttribute('data-acc-mod-value');
  if (modValue !== null) { updateDraftMod(Number(modValue), { value: Number(el.value) || 0 }); return; }
  const effectTrigger = el.getAttribute('data-acc-effect-trigger');
  if (effectTrigger !== null) { updateDraftEffect(Number(effectTrigger), { trigger: el.value as never }); return; }
  const effectAction = el.getAttribute('data-acc-effect-action');
  if (effectAction !== null) { updateDraftEffect(Number(effectAction), { action: el.value as never }); return; }
  const effectValue = el.getAttribute('data-acc-effect-value');
  if (effectValue !== null) { updateDraftEffect(Number(effectValue), { value: Number(el.value) || 0 }); }
});
document.addEventListener('change', (event) => {
  const el = event.target as HTMLInputElement | null;
  if (!el || !document.querySelector('.workshop-modal')) return;
  if (el.id === 'wsIconInput' && el.files?.[0] && workshopState.editing) {
    const file = el.files[0];
    if (file.size > 300 * 1024) { workshopState.message = '图标太大（>300KB），请压缩后再传'; render(); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (workshopState.editing) workshopState.editing.iconData = String(reader.result);
      render();
    };
    reader.readAsDataURL(file);
    return;
  }
  if (el.id === 'wsImportInput' && el.files?.[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const list = importCustomAccessories(String(reader.result));
        workshopState.message = `导入成功：${list.length} 件`;
      } catch (error) {
        workshopState.message = `导入失败：${error instanceof Error ? error.message : '格式不对'}`;
      }
      render();
    };
    reader.readAsText(el.files[0]);
  }
});
window.addEventListener('resize', () => publishBottomHudHeight());

installImmersiveKeys();

// 启动即预加载音效与两条背景音乐，避免第一次播放时临时请求导致“玩着玩着才有声音”。
preloadAudio();

// 离线支持：首次联网打开后，Service Worker 会把整包资源缓存到本地，之后断网也能继续玩。
// 只在生产构建里注册（vite dev 没有 sw.js），并且失败时静默忽略。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).toString(), { scope: './' })
      .catch(() => undefined);
  });
}

render();
