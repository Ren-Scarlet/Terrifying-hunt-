/**
 * Dedicated touch-first mobile game shell.
 * Reparents existing live game controls (no cloning) so delegated data-action handlers
 * and game state remain shared. Desktop DOM/layout is untouched on non-touch screens.
 */
const MOBILE_QUERY = '(max-width: 760px) and (pointer: coarse)';

export function applyMobileGameLayout(app: HTMLElement, active: boolean): void {
  if (!active || !window.matchMedia(MOBILE_QUERY).matches) {
    app.querySelector('.mobile-game-shell')?.remove();
    app.classList.remove('mobile-game-active');
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

  const topline = app.querySelector<HTMLElement>('.topline');
  const status = app.querySelector<HTMLElement>('.statusline');
  const mapViewport = app.querySelector<HTMLElement>('.map-viewport');
  const bottomHud = app.querySelector<HTMLElement>('#bottomHud');
  const killerPanel = app.querySelector<HTMLElement>('.killer-ability-panel');
  const rightTools = app.querySelector<HTMLElement>('.right-tools');
  const objective = app.querySelector<HTMLElement>('.objective');
  const taskDrawer = app.querySelector<HTMLElement>('.task-pop');
  const intel = app.querySelector<HTMLElement>('.hunt-sidebar-left');

  if (topline) header.appendChild(topline);
  if (status) header.appendChild(status);
  if (objective) header.appendChild(objective);
  if (mapViewport) mapArea.appendChild(mapViewport);
  if (killerPanel) bottom.appendChild(killerPanel);
  if (bottomHud) bottom.appendChild(bottomHud);
  if (rightTools) overlay.appendChild(rightTools);
  if (taskDrawer) overlay.appendChild(taskDrawer);
  if (intel) overlay.appendChild(intel);

  app.classList.add('mobile-game-active');
}
