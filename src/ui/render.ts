/**
 * UI 渲染公共入口。
 *
 * 具体页面与游戏 HUD 分模块维护；保留旧路径导出，避免主程序和插件调用方迁移。
 */
export { renderGame, renderResult } from './render/game';
export { renderMenu, renderGuide, shopPrice, renderShop, renderDeckEditor } from './render/menus';
export {
  killerFaceHtml, getKiller, defaultDetailHtml, cardDetailHtml, personDetailHtml,
} from './render/shared';
