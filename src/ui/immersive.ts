// Camera controller for the immersive hunt map.
// The map world is kept mounted across HUD renders; camera state also survives view changes.
// Animation is event-driven: no permanent RAF loop and no layout reads per frame.
type CameraMode = 'center' | 'smooth';

let root: HTMLElement | null = null;
let mapElement: HTMLElement | null = null;
let viewportElement: HTMLElement | null = null;
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
let intelDrawerOpen = false;
let hudHidden = false;
let handOpen = true;

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

function animateCamera(x: number, y: number, scale: number, duration = 360): void {
  stopCameraAnimation();
  if (!mapElement) return;
  animationFrom = { x: cameraX, y: cameraY, zoom: cameraZoom };
  animationTo = { x, y, zoom: scale };
  if (!hasCamera || duration <= 0) {
    setCameraTransform(x, y, scale);
    hasCamera = true;
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
    else frame = 0;
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

  // Measure once per render/resize, never inside the animation frame.
  mapWidth = mapElement.offsetWidth;
  mapHeight = mapElement.offsetHeight;
  viewportWidth = viewportElement.clientWidth;
  viewportHeight = viewportElement.clientHeight;
  const point = readPlayerPoint(mapElement, marker);
  playerX = point.x;
  playerY = point.y;

  root.querySelector<HTMLElement>('.task-detail-drawer')?.classList.toggle('open', taskDrawerOpen);
  const intel = root.querySelector<HTMLDetailsElement>('.intel-drawer');
  if (intel) intel.open = intelDrawerOpen;
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

function setZoom(next: number): void {
  const oldZoom = zoom;
  const nextZoom = clamp(next, 0.55, 2.15);
  if (following) {
    zoom = nextZoom;
  } else {
    const centerWorldX = (viewportWidth / 2 - cameraX) / Math.max(0.01, cameraZoom);
    const centerWorldY = (viewportHeight / 2 - cameraY) / Math.max(0.01, cameraZoom);
    zoom = nextZoom;
    panX = viewportWidth / 2 - centerWorldX * zoom;
    panY = viewportHeight / 2 - centerWorldY * zoom;
  }
  if (oldZoom !== zoom) {
    globalView = false;
    updateCamera(true);
  }
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
    zoom = 1.18;
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
      const intel = root?.querySelector<HTMLDetailsElement>('.intel-drawer');
      if (task?.classList.contains('open')) { task.classList.remove('open'); taskDrawerOpen = false; }
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
