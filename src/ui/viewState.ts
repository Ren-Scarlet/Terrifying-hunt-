/**
 * 界面状态：当前屏幕 / 当前面板 / 引导浮层。
 *
 * 重构前，这些状态是 main.ts 里的 `screen` 加上 `editorOpen`、`shopOpen`、
 * `guideOpen`、`accessoryOpen`、`adminOpen` 五个布尔量，谁盖在谁身上完全靠
 * render() 里 if/else 的书写顺序保证——漏掉一次复位就会两个界面同时渲染。
 *
 * 现在改为「屏幕 + 单个面板槽位」：
 *   - 面板互斥由数据结构保证（一个槽位，开了新的自然替换旧的）；
 *   - 屏幕切换收敛成四个具名迁移函数，任何人不需要知道该清哪些标志位；
 *   - 引导是独立浮层，可以叠在任意屏幕/面板之上。
 */

/** 主屏幕：大厅 / 对局 / 结算（结算仍然走对局界面，只是在后面追加结算面板）。 */
export type Screen = 'menu' | 'game' | 'result';

/** 面板：同一时刻最多只能开一个，打开即覆盖主屏幕。 */
export type Panel = 'deck' | 'shop' | 'accessories' | 'admin';

export interface UiState {
  readonly screen: Screen;
  readonly panel: Panel | null;
  readonly guide: boolean;
}

const INITIAL: UiState = { screen: 'menu', panel: null, guide: false };

let state: UiState = INITIAL;

/** 当前界面状态（只读视图，修改必须走下面的迁移函数）。 */
export function ui(): UiState {
  return state;
}

/** 回到大厅：关掉所有面板与浮层。 */
export function showMenu(): void {
  state = { screen: 'menu', panel: null, guide: false };
}

/** 进入对局。 */
export function showGame(): void {
  state = { screen: 'game', panel: null, guide: false };
}

/** 对局结束，切到结算（仍然保留 game，结算面板叠在 HUD 之后）。 */
export function showResult(): void {
  state = { ...state, screen: 'result' };
}

/** 打开面板；面板互斥由这唯一一个槽位保证。 */
export function openPanel(panel: Panel): void {
  state = { ...state, panel };
}

/** 关闭当前面板，回到它背后的屏幕。 */
export function closePanel(): void {
  state = { ...state, panel: null };
}

/** 打开/关闭玩法引导浮层（不改变屏幕与面板）。 */
export function setGuideOpen(open: boolean): void {
  state = { ...state, guide: open };
}

/** 是否处于「对局且没有面板遮挡」的状态。 */
export function inGame(): boolean {
  return state.screen === 'game' && state.panel === null;
}
