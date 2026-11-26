type CameraMode = 'center' | 'smooth';

let root: HTMLElement | null = null;
let zoom = 1.18;
let mode: CameraMode = 'smooth';
let globalView = false;
let following = true;
let panX = 0;
let panY = 0;
let focusX = 0;
let focusY = 0;
let frame = 0;
let previousFrameTime = 0;
let taskDrawerOpen = false;
let intelDrawerOpen = false;
let hudHidden = false;
let handOpen = true;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function elements(): { viewport: HTMLElement; map: HTMLElement; marker: HTMLElement } | null {
  if (!root) return null;
  const viewport = root.querySelector<HTMLElement>('.map-viewport');
  const map = root.querySelector<HTMLElement>('.floorplan');
  const marker = root.querySelector<HTMLElement>('.player-marker');
  return viewport && map && marker ? { viewport, map, marker } : null;
}

function readPlayerPoint(map: HTMLElement, marker: HTMLElement): { x: number; y: number } {
  const left = Number.parseFloat(marker.style.left) || 50;
  const top = Number.parseFloat(marker.style.top) || 50;
  return { x: map.offsetWidth * left / 100, y: map.offsetHeight * top / 100 };
}

function applyTransform(deltaSeconds = 1 / 60): void {
  const found = elements();
  if (!found) return;
  const { viewport, map, marker } = found;
  const width = map.offsetWidth;
  const height = map.offsetHeight;
  const viewWidth = viewport.clientWidth;
  const viewHeight = viewport.clientHeight;
  const point = readPlayerPoint(map, marker);
  let x: number;
  let y: number;

  if (globalView) {
    const fit = Math.min(viewWidth / width, viewHeight / height) * 0.94;
    zoom = fit;
    x = (viewWidth - width * zoom) / 2;
    y = (viewHeight - height * zoom) / 2;
  } else {
    if (following) {
      const desiredX = viewWidth / 2 - point.x * zoom;
      const desiredY = viewHeight / 2 - point.y * zoom;
      if (mode === 'center') {
        focusX = desiredX;
        focusY = desiredY;
      } else {
        const alpha = 1 - Math.exp(-clamp(deltaSeconds, 0.001, 0.05) * 9);
        focusX += (desiredX - focusX) * clamp(alpha, 0.08, 0.24);
        focusY += (desiredY - focusY) * clamp(alpha, 0.08, 0.24);
      }
    }
    x = focusX + panX;
    y = focusY + panY;
  }
  map.style.transform = `translate3d(${x}px,${y}px,0) scale(${zoom})`;
  const readout = root?.querySelector<HTMLElement>('[data-camera-zoom]');
  if (readout) readout.textContent = globalView ? '全局' : `${Math.round(zoom * 100)}%`;
  root?.querySelectorAll<HTMLElement>('[data-camera-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.cameraMode === mode);
  });
  root?.querySelector<HTMLElement>('[data-camera-follow]')?.classList.toggle('active', following && !globalView);
}

function loop(time: number): void {
  if (!root) { frame = 0; return; }
  const delta = previousFrameTime ? (time - previousFrameTime) / 1000 : 1 / 60;
  previousFrameTime = time;
  if (!globalView) applyTransform(delta);
  frame = window.requestAnimationFrame(loop);
}

export function syncImmersiveCamera(nextRoot: HTMLElement): void {
  root = nextRoot;
  const map = root.querySelector<HTMLElement>('.floorplan');
  if (!map) return;
  root.querySelector<HTMLElement>('.task-detail-drawer')?.classList.toggle('open', taskDrawerOpen);
  const intel = root.querySelector<HTMLDetailsElement>('.intel-drawer');
  if (intel) intel.open = intelDrawerOpen;
  root.classList.toggle('hud-hidden', hudHidden);
  root.classList.toggle('hand-collapsed', !handOpen);
  if (!frame) frame = window.requestAnimationFrame(loop);
  applyTransform();
}

function pan(dx: number, dy: number): void {
  globalView = false;
  following = false;
  panX += dx;
  panY += dy;
  applyTransform();
}

function setZoom(next: number): void {
  globalView = false;
  zoom = clamp(next, 0.55, 2.15);
  applyTransform();
}

export function handleImmersiveAction(action: string | undefined): boolean {
  if (!action) return false;
  if (action === 'camera-zoom-in') { setZoom(zoom + 0.12); return true; }
  if (action === 'camera-zoom-out') { setZoom(zoom - 0.12); return true; }
  if (action === 'camera-global') {
    globalView = true;
    following = false;
    applyTransform();
    return true;
  }
  if (action === 'camera-follow') {
    globalView = false;
    following = true;
    zoom = 1.18;
    panX = 0;
    panY = 0;
    applyTransform();
    return true;
  }
  if (action === 'camera-mode-center' || action === 'camera-mode-smooth') {
    mode = action === 'camera-mode-center' ? 'center' : 'smooth';
    following = true;
    globalView = false;
    applyTransform();
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
      const amount = 54;
      pan(key === 'arrowleft' ? amount : key === 'arrowright' ? -amount : 0, key === 'arrowup' ? amount : key === 'arrowdown' ? -amount : 0);
    }
  });
  window.addEventListener('resize', () => applyTransform());
}
