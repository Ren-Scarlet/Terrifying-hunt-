/**
 * Dedicated touch-first mobile game shell.
 * Reparents existing live game controls (no cloning) so delegated data-action handlers
 * and game state remain shared. Desktop DOM/layout is untouched on non-touch screens.
 *
 * The shell itself is positioned by `mobile-shell.css` as three fixed bands
 * (header / map window / bottom HUD). After every render we measure the two HUD
 * bands and publish their heights as `--mob-top` / `--mob-bottom`, so the map
 * window can leave exactly enough room instead of guessing.
 */
import { syncImmersiveCamera } from './immersive';

const MOBILE_QUERY = '(max-width: 920px) and (pointer: coarse)';

export function applyMobileGameLayout(app: HTMLElement, active: boolean): void {
  if (!active || !window.matchMedia(MOBILE_QUERY).matches) {
    app.querySelector('.mobile-game-shell')?.remove();
    app.classList.remove('mobile-game-active');
    app.style.removeProperty('--mob-top');
    app.style.removeProperty('--mob-bottom');
    return;
  }

  // Re-render builds fresh nodes. Build a fresh mobile shell each render, moving
  // actual controls into it so no duplicated IDs/actions are introduced.
  app.querySelector('.mobile-game-shell')?.remove();
  const shell = document.createElement('div');
  shell.className = 'mobile-game-shell';
  shell.setAttribute('aria-label', '手机游戏界面');

  const header = document.createElement('header');
  header.className = 'mobile-game-header';
  const mapArea = document.createElement('main');
  mapArea.className = 'mobile-game-map';
  const bottom = document.createElement('section');
  bottom.className = 'mobile-game-bottom';
  const overlay = document.createElement('div');
  overlay.className = 'mobile-game-overlay';

  shell.append(header, mapArea, bottom, overlay);
  app.appendChild(shell);

  const status = app.querySelector<HTMLElement>('.statusline');
  const mapViewport = app.querySelector<HTMLElement>('.map-viewport');
  const bottomHud = app.querySelector<HTMLElement>('#bottomHud');
  const killerPanel = app.querySelector<HTMLElement>('.killer-ability-panel');
  const rightTools = app.querySelector<HTMLElement>('.right-tools');
  const objective = app.querySelector<HTMLElement>('.objective');
  const taskDrawer = app.querySelector<HTMLElement>('.task-pop');
  const intel = app.querySelector<HTMLElement>('.hunt-sidebar-left');

  if (status) header.appendChild(status);
  if (objective) header.appendChild(objective);
  if (mapViewport) mapArea.appendChild(mapViewport);
  if (killerPanel) bottom.appendChild(killerPanel);
  if (bottomHud) bottom.appendChild(bottomHud);
  if (rightTools) overlay.appendChild(rightTools);
  if (taskDrawer) overlay.appendChild(taskDrawer);
  if (intel) overlay.appendChild(intel);

  app.classList.add('mobile-game-active');

  // 三块 HUD 都是 fixed 定位，量一次实际高度写进 CSS 变量，地图窗口据此留白。
  const publishBands = (): void => {
    const headerHeight = Math.ceil(header.getBoundingClientRect().height);
    const bottomHeight = Math.ceil(bottom.getBoundingClientRect().height);
    app.style.setProperty('--mob-top', `${headerHeight}px`);
    app.style.setProperty('--mob-bottom', `${bottomHeight}px`);
  };
  publishBands();

  // 首帧时手牌、字体和图片还没落位，量到的高度会偏大/偏小；
  // 下一帧再量一次并让镜头按新的可视区重新适配。
  window.requestAnimationFrame(() => {
    if (!app.classList.contains('mobile-game-active') || !shell.isConnected) return;
    publishBands();
    syncImmersiveCamera(app);
  });
}
