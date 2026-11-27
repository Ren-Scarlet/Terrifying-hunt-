// Camera controller for the immersive hunt map.
// The map world is kept mounted across HUD renders; camera state also survives view changes.
// Animation is event-driven: no permanent RAF loop and no layout reads per frame.
type CameraMode = 'center' | 'smooth';

/** 手机端布局：地图窗口只有中间一条，镜头固定为「整张地图缩放到窗口内」。 */
const MOBILE_LAYOUT_QUERY = '(max-width: 920px) and (pointer: coarse)';

function isMobileLayout(): boolean {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

/** 手机端跟随视角的默认放大倍率：房间约 60px，能看清名字也点得准。 */
const MOBILE_FOLLOW_ZOOM = 1.5;


let root: HTMLElement | null = null;
let mapElement: HTMLElement | null = null;
let viewportElement: HTMLElement | null = null;
let wheelBoundViewport: HTMLElement | null = null;
let zoom = 1.18;
let mode: CameraMode = 'smooth';
let globalView = false;
let following = true;
let panX = 0;
let panY = 0;
let cameraX = 0;
let cameraY = 0;
let cameraZoom = 1.18;
let mapWidth = 0;
let mapHeight = 0;
let viewportWidth = 0;
let viewportHeight = 0;
let playerX = 0;
let playerY = 0;
let frame = 0;
let heldPanFrame = 0;
let heldPanLastTime = 0;
const heldPanKeys = new Set<string>();
let animationStart = 0;
let animationFrom = { x: 0, y: 0, zoom: 1.18 };
let animationTo = { x: 0, y: 0, zoom: 1.18 };
let hasCamera = false;
let taskDrawerOpen = false;
let activityLogOpen = false;
let intelDrawerOpen = false;
let hudHidden = false;
let handOpen = true;
/** 手机端只在首次进入对局时套用「跟随 + 放大」视角，之后交给玩家用顶部按钮切换。 */
let mobileCameraReady = false;
let intelPanelPosition: { left: number; top: number } | null = null;

function bindIntelPanelDrag(): void {
  const panel = root?.querySelector<HTMLElement>('.hunt-sidebar-left');
  const handle = panel?.querySelector<HTMLElement>('.intel-drag-handle');
  if (!panel || !handle || handle.dataset.dragBound === 'true') return;
  handle.dataset.dragBound = 'true';
  let activePointer: number | null = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  const move = (event: PointerEvent): void => {
    if (activePointer !== event.pointerId) return;
    const left = startLeft + event.clientX - startX;
    const top = startTop + event.clientY - startY;
    const nextLeft = clamp(left, 8, Math.max(8, window.innerWidth - panel.offsetWidth - 8));
    const nextTop = clamp(top, 8, Math.max(8, window.innerHeight - panel.offsetHeight - 8));
    intelPanelPosition = { left: nextLeft, top: nextTop };
    panel.style.position = 'fixed';
    panel.style.left = String(nextLeft) + 'px';
    panel.style.top = String(nextTop) + 'px';
    panel.style.right = 'auto';
    panel.style.transform = 'none';
  };
  const stop = (event: PointerEvent): void => {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    try { handle.releasePointerCapture(event.pointerId); } catch { /* Pointer capture may already be released. */ }
  };
  handle.addEventListener('pointerdown', (event: PointerEvent) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = panel.getBoundingClientRect();
    activePointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    try { handle.setPointerCapture(event.pointerId); } catch { /* Window listeners still handle dragging. */ }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    event.preventDefault();
  });
}
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readPlayerPoint(map: HTMLElement, marker: HTMLElement): { x: number; y: number } {
  const left = Number.parseFloat(marker.style.left) || 50;
  const top = Number.parseFloat(marker.style.top) || 50;
  return { x: mapWidth * left / 100, y: mapHeight * top / 100 };
}

function setCameraTransform(x: number, y: number, scale: number): void {
  cameraX = x;
  cameraY = y;
  cameraZoom = scale;
  if (mapElement) {
    mapElement.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${scale.toFixed(4)})`;
  }
}

function stopCameraAnimation(): void {
  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;
}

/** 跟随视角时，把视野外已显形的幸存者转换成屏幕边缘方向提示。只在镜头停稳后读取布局。 */
function updateAuraEdgeIndicators(): void {
  if (!viewportElement || !mapElement) return;
  let layer = viewportElement.querySelector<HTMLElement>('.aura-edge-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'aura-edge-layer';
    layer.setAttribute('aria-hidden', 'true');
    viewportElement.appendChild(layer);
  }
  layer.replaceChildren();
  if (!following || globalView || !root?.classList.contains('immersive-game')) return;
  const viewport = viewportElement.getBoundingClientRect();
  const centerX = viewport.left + viewport.width / 2;
  const centerY = viewport.top + viewport.height / 2;
  const inset = 26;
  mapElement.querySelectorAll<HTMLElement>('.room[data-aura-count]').forEach((room) => {
    const count = Number(room.dataset.auraCount ?? 0);
    if (count <= 0) return;
    const rect = room.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    if (Math.abs(dx) <= viewport.width / 2 - inset && Math.abs(dy) <= viewport.height / 2 - inset) return;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const scale = Math.min(
      (viewport.width / 2 - inset) / Math.max(1, Math.abs(dx)),
      (viewport.height / 2 - inset) / Math.max(1, Math.abs(dy)),
    );
    const x = viewport.width / 2 + dx * scale;
    const y = viewport.height / 2 + dy * scale;
    const indicator = document.createElement('div');
    indicator.className = 'aura-edge-indicator';
    indicator.style.left = String(x) + 'px';
    indicator.style.top = String(y) + 'px';
    indicator.style.setProperty('--aura-angle', String(Math.atan2(dy, dx) * 180 / Math.PI) + 'deg');
    indicator.title = '气场方向：视野外有 ' + count + ' 名幸存者';
    const arrow = document.createElement('span');
    arrow.className = 'aura-edge-arrow';
    arrow.textContent = '➤';
    const label = document.createElement('b');
    label.textContent = count > 1 ? String(count) : '';
    indicator.append(arrow, label);
    layer?.appendChild(indicator);
  });
}

function animateCamera(x: number, y: number, scale: number, duration = 360): void {
  stopCameraAnimation();
  if (!mapElement) return;
  animationFrom = { x: cameraX, y: cameraY, zoom: cameraZoom };
  animationTo = { x, y, zoom: scale };
  if (!hasCamera || duration <= 0) {
    setCameraTransform(x, y, scale);
    hasCamera = true;
    updateAuraEdgeIndicators();
    return;
  }
  animationStart = performance.now();
  const tick = (now: number): void => {
    const raw = clamp((now - animationStart) / duration, 0, 1);
    // Smoothstep cubic: begin and end gently so room-to-room camera travel feels continuous.
    const eased = raw < 0.5
      ? 4 * raw * raw * raw
      : 1 - Math.pow(-2 * raw + 2, 3) / 2;
    setCameraTransform(
      animationFrom.x + (animationTo.x - animationFrom.x) * eased,
      animationFrom.y + (animationTo.y - animationFrom.y) * eased,
      animationFrom.zoom + (animationTo.zoom - animationFrom.zoom) * eased,
    );
    if (raw < 1) frame = window.requestAnimationFrame(tick);
    else {
      frame = 0;
      updateAuraEdgeIndicators();
    }
  };
  frame = window.requestAnimationFrame(tick);
}

function cameraTarget(): { x: number; y: number; zoom: number } {
  if (globalView) {
    const fit = Math.min(viewportWidth / mapWidth, viewportHeight / mapHeight) * 0.94;
    zoom = fit;
    return {
      x: (viewportWidth - mapWidth * zoom) / 2,
      y: (viewportHeight - mapHeight * zoom) / 2,
      zoom,
    };
  }
  if (following) {
    return {
      x: viewportWidth / 2 - playerX * zoom,
      y: viewportHeight / 2 - playerY * zoom,
      zoom,
    };
  }
  return { x: panX, y: panY, zoom };
}

function updateCamera(animate = true): void {
  if (!mapElement || mapWidth < 1 || mapHeight < 1 || viewportWidth < 1 || viewportHeight < 1) return;
  const target = cameraTarget();
  animateCamera(target.x, target.y, target.zoom, animate && mode === 'smooth' && !globalView ? 480 : animate ? 300 : 0);
  updateCameraControls();
}

function updateCameraControls(): void {
  if (!root) return;
  const readout = root.querySelector<HTMLElement>('[data-camera-zoom]');
  if (readout) readout.textContent = globalView ? '全局' : `${Math.round(zoom * 100)}%`;
  root.querySelectorAll<HTMLElement>('[data-camera-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.cameraMode === mode);
  });
  root.querySelector<HTMLElement>('[data-camera-follow]')?.classList.toggle('active', following && !globalView);
}

export function syncImmersiveCamera(nextRoot: HTMLElement): void {
  root = nextRoot;
  viewportElement = root.querySelector<HTMLElement>('.map-viewport');
  mapElement = root.querySelector<HTMLElement>('.floorplan');
  const marker = root.querySelector<HTMLElement>('.player-marker');
  if (!viewportElement || !mapElement || !marker) return;
  // 手机端默认「跟随 + 放大」：整图适配会让房间只有 30px，看不清也点不准。
  // 玩家随时可以用顶部「全局」按钮切到整图俯瞰。
  if (isMobileLayout() && !mobileCameraReady) {
    mobileCameraReady = true;
    globalView = false;
    following = true;
    zoom = MOBILE_FOLLOW_ZOOM;
  }
  if (!isMobileLayout() && wheelBoundViewport !== viewportElement) {
    wheelBoundViewport = viewportElement;
    viewportElement.addEventListener('wheel', (event: WheelEvent) => {
      if (!root?.classList.contains('immersive-game')) return;
      event.preventDefault();
      const rect = viewportElement?.getBoundingClientRect();
      if (!rect) return;
      const direction = event.deltaY > 0 ? -1 : 1;
      const step = Math.max(0.06, Math.min(0.16, Math.abs(event.deltaY) * 0.0012));
      setZoom(zoom + direction * step, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
  }

  // Measure once per render/resize, never inside the animation frame.
  mapWidth = mapElement.offsetWidth;
  mapHeight = mapElement.offsetHeight;
  viewportWidth = viewportElement.clientWidth;
  viewportHeight = viewportElement.clientHeight;
  const point = readPlayerPoint(mapElement, marker);
  playerX = point.x;
  playerY = point.y;

  root.querySelector<HTMLElement>('.task-detail-drawer')?.classList.toggle('open', taskDrawerOpen);
  const activityPanel = root.querySelector<HTMLElement>('.activity-log-panel');
  const activityButton = root.querySelector<HTMLButtonElement>('[data-action="toggle-activity-log"]');
  const activityList = root.querySelector<HTMLElement>('.activity-log-list');
  activityPanel?.classList.toggle('open', activityLogOpen);
  if (activityButton) activityButton.setAttribute('aria-expanded', String(activityLogOpen));
  if (activityList) activityList.hidden = !activityLogOpen;
  const intel = root.querySelector<HTMLDetailsElement>('.intel-drawer');
  if (intel) intel.open = intelDrawerOpen;
  bindIntelPanelDrag();
  const intelPanel = root.querySelector<HTMLElement>('.hunt-sidebar-left');
  if (intelPanel && intelPanelPosition && !isMobileLayout()) {
    intelPanel.style.left = String(intelPanelPosition.left) + 'px';
    intelPanel.style.top = String(intelPanelPosition.top) + 'px';
    intelPanel.style.right = 'auto';
    intelPanel.style.transform = 'none';
  }
  root.classList.toggle('hud-hidden', hudHidden);
  root.classList.toggle('hand-collapsed', !handOpen);
  const handToggle = root.querySelector<HTMLButtonElement>('[data-action="toggle-hand"]');
  if (handToggle) {
    handToggle.textContent = handOpen ? '⌄' : '⌃';
    handToggle.setAttribute('aria-expanded', String(handOpen));
    handToggle.setAttribute('aria-label', handOpen ? '收起手牌' : '展开手牌');
  }

  // A newly rendered map element has no transform, but cameraX/Y retain the
  // previous view. Seed it with that view before animating toward the new target.
  if (hasCamera) {
    mapElement.style.transform = `translate3d(${cameraX}px,${cameraY}px,0) scale(${cameraZoom})`;
  }
  updateCameraControls();
  updateCamera(hasCamera);
}

function pan(dx: number, dy: number): void {
  globalView = false;
  following = false;
  panX = cameraX + dx;
  panY = cameraY + dy;
  updateCamera(true);
}

function setZoom(next: number, anchorX?: number, anchorY?: number): void {
  const oldZoom = zoom;
  const nextZoom = clamp(next, 0.55, 2.15);
  if (following) {
    zoom = nextZoom;
  } else {
    const focusX = anchorX ?? viewportWidth / 2;
    const focusY = anchorY ?? viewportHeight / 2;
    const focusWorldX = (focusX - cameraX) / Math.max(0.01, cameraZoom);
    const focusWorldY = (focusY - cameraY) / Math.max(0.01, cameraZoom);
    zoom = nextZoom;
    panX = focusX - focusWorldX * zoom;
    panY = focusY - focusWorldY * zoom;
  }
  if (oldZoom !== zoom) {
    globalView = false;
    updateCamera(true);
  }
}

export function openIntelDrawer(): void {
  intelDrawerOpen = true;
  const drawer = root?.querySelector<HTMLDetailsElement>('.intel-drawer');
  if (drawer) drawer.open = true;
}

export function handleImmersiveAction(action: string | undefined): boolean {
  if (!action) return false;
  if (action === 'camera-zoom-in') { setZoom(zoom + 0.12); return true; }
  if (action === 'camera-zoom-out') { setZoom(zoom - 0.12); return true; }
  if (action === 'camera-global') {
    globalView = true;
    following = false;
    updateCamera(false);
    return true;
  }
  if (action === 'camera-follow') {
    globalView = false;
    following = true;
    zoom = isMobileLayout() ? MOBILE_FOLLOW_ZOOM : 1.18;
    panX = 0;
    panY = 0;
    updateCamera(true);
    return true;
  }
  if (action === 'camera-mode-center' || action === 'camera-mode-smooth') {
    mode = action === 'camera-mode-center' ? 'center' : 'smooth';
    following = true;
    globalView = false;
    updateCamera(mode === 'smooth');
    return true;
  }
  if (action === 'toggle-task-drawer') {
    const drawer = root?.querySelector<HTMLElement>('.task-detail-drawer');
    if (drawer) {
      taskDrawerOpen = !taskDrawerOpen;
      drawer.classList.toggle('open', taskDrawerOpen);
    }
    return true;
  }
  if (action === 'toggle-activity-log') {
    activityLogOpen = !activityLogOpen;
    const panel = root?.querySelector<HTMLElement>('.activity-log-panel');
    const button = root?.querySelector<HTMLButtonElement>('[data-action="toggle-activity-log"]');
    const list = root?.querySelector<HTMLElement>('.activity-log-list');
    panel?.classList.toggle('open', activityLogOpen);
    if (button) button.setAttribute('aria-expanded', String(activityLogOpen));
    if (list) list.hidden = !activityLogOpen;
    return true;
  }
  if (action === 'toggle-intel-drawer') {
    const drawer = root?.querySelector<HTMLDetailsElement>('.intel-drawer');
    if (drawer) { intelDrawerOpen = !intelDrawerOpen; drawer.open = intelDrawerOpen; }
    return true;
  }
  if (action === 'toggle-game-hud') {
    hudHidden = !hudHidden;
    root?.classList.toggle('hud-hidden', hudHidden);
    return true;
  }
  if (action === 'toggle-hand') {
    handOpen = !handOpen;
    root?.classList.toggle('hand-collapsed', !handOpen);
    const toggle = root?.querySelector<HTMLButtonElement>('[data-action="toggle-hand"]');
    if (toggle) {
      toggle.textContent = handOpen ? '⌄' : '⌃';
      toggle.setAttribute('aria-expanded', String(handOpen));
      toggle.setAttribute('aria-label', handOpen ? '收起手牌' : '展开手牌');
    }
    return true;
  }
  return false;
}


function stopHeldCameraPan(): void {
  heldPanKeys.clear();
  heldPanLastTime = 0;
  if (heldPanFrame) window.cancelAnimationFrame(heldPanFrame);
  heldPanFrame = 0;
}

function startHeldCameraPan(key: string): void {
  if (!['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) return;
  if (!heldPanKeys.has(key)) {
    heldPanKeys.add(key);
    following = false;
    globalView = false;
    stopCameraAnimation();
  }
  if (heldPanFrame) return;
  const tick = (now: number): void => {
    if (!heldPanKeys.size || !mapElement) { heldPanFrame = 0; return; }
    const elapsed = heldPanLastTime ? Math.min(0.05, (now - heldPanLastTime) / 1000) : 0;
    heldPanLastTime = now;
    const speed = 680;
    let dx = 0;
    let dy = 0;
    if (heldPanKeys.has('arrowleft')) dx += speed * elapsed;
    if (heldPanKeys.has('arrowright')) dx -= speed * elapsed;
    if (heldPanKeys.has('arrowup')) dy += speed * elapsed;
    if (heldPanKeys.has('arrowdown')) dy -= speed * elapsed;
    panX = cameraX + dx;
    panY = cameraY + dy;
    setCameraTransform(panX, panY, zoom);
    heldPanFrame = window.requestAnimationFrame(tick);
  };
  heldPanFrame = window.requestAnimationFrame(tick);
}

let keysInstalled = false;
export function installImmersiveKeys(): void {
  if (keysInstalled) return;
  keysInstalled = true;
  window.addEventListener('keydown', (event) => {
    if (!root?.classList.contains('immersive-game')) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    const key = event.key.toLowerCase();
    if (/^[1-4]$/.test(key) && !event.repeat) {
      const ability = root?.querySelectorAll<HTMLButtonElement>('.killer-power-grid .btn.power')[Number(key) - 1];
      if (ability && !ability.disabled) { event.preventDefault(); ability.click(); }
    }
    if (key === '+' || key === '=') { event.preventDefault(); setZoom(zoom + 0.12); }
    else if (key === '-') { event.preventDefault(); setZoom(zoom - 0.12); }
    else if (key === '0') { event.preventDefault(); handleImmersiveAction('camera-global'); }
    else if (key === 'f') { event.preventDefault(); handleImmersiveAction('camera-follow'); }
    else if (key === 't') { event.preventDefault(); handleImmersiveAction('toggle-task-drawer'); }
    else if (key === 'h') { event.preventDefault(); handleImmersiveAction('toggle-game-hud'); }
    else if (key === 'e') { event.preventDefault(); root?.querySelector<HTMLButtonElement>('.person-world-actions button:not(:disabled), .map-world-actions button:not(:disabled)')?.click(); }
    else if (key === 'g') { event.preventDefault(); root?.querySelector<HTMLButtonElement>('[data-action="drop-carried"]:not(:disabled)')?.click(); }
    else if (/^[1-6]$/.test(key)) { event.preventDefault(); root?.querySelectorAll<HTMLButtonElement>('.hand-row [data-action="play"]')[Number(key) - 1]?.click(); }
    else if (key === ' ') { event.preventDefault(); root?.querySelector<HTMLButtonElement>('[data-action="end-turn"]:not(:disabled)')?.click(); }
    else if (key === 'escape') {
      const task = root?.querySelector<HTMLElement>('.task-detail-drawer');
      const activity = root?.querySelector<HTMLElement>('.activity-log-panel');
      const intel = root?.querySelector<HTMLDetailsElement>('.intel-drawer');
      if (activityLogOpen) {
        activityLogOpen = false;
        activity?.classList.remove('open');
        const button = root?.querySelector<HTMLButtonElement>('[data-action="toggle-activity-log"]');
        const list = root?.querySelector<HTMLElement>('.activity-log-list');
        if (button) button.setAttribute('aria-expanded', 'false');
        if (list) list.hidden = true;
      } else if (task?.classList.contains('open')) { task.classList.remove('open'); taskDrawerOpen = false; }
      else if (intel?.open) { intel.open = false; intelDrawerOpen = false; }
    } else if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      event.preventDefault();
      startHeldCameraPan(key);
    }
  });
  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (heldPanKeys.has(key)) {
      heldPanKeys.delete(key);
      if (!heldPanKeys.size) {
        if (heldPanFrame) window.cancelAnimationFrame(heldPanFrame);
        heldPanFrame = 0;
        heldPanLastTime = 0;
      }
    }
  });
  window.addEventListener('blur', stopHeldCameraPan);
  window.addEventListener('resize', () => {
    if (!root) return;
    const viewport = root.querySelector<HTMLElement>('.map-viewport');
    const map = root.querySelector<HTMLElement>('.floorplan');
    const marker = root.querySelector<HTMLElement>('.player-marker');
    if (!viewport || !map || !marker) return;
    viewportElement = viewport;
    mapElement = map;
    mapWidth = map.offsetWidth;
    mapHeight = map.offsetHeight;
    viewportWidth = viewport.clientWidth;
    viewportHeight = viewport.clientHeight;
    const point = readPlayerPoint(map, marker);
    playerX = point.x;
    playerY = point.y;
    updateCamera(false);
  });
}
