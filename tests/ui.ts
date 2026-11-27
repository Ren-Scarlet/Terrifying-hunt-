/**
 * 界面层回归：屏幕/面板状态机与动作注册表，不依赖浏览器。
 *
 * 这两块是「界面统一管理」的地基：
 *   - viewState 保证面板互斥、屏幕迁移会清理浮层；
 *   - ActionRegistry 保证动作不会重复注册、scope 语义稳定。
 * 运行：npm run check（与规则回归一起跑）
 */
import { ActionRegistry } from '../src/ui/actions';
import {
  closePanel,
  inGame,
  openPanel,
  setGuideOpen,
  showGame,
  showMenu,
  showResult,
  ui,
} from '../src/ui/viewState';
import { session } from '../src/ui/session';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ---------------- 屏幕与面板 ---------------- */

showMenu();
check('初始：大厅，无面板，无浮层', ui().screen === 'menu' && ui().panel === null && ui().guide === false);

openPanel('deck');
check('打开牌组面板', ui().panel === 'deck');

openPanel('shop');
check('打开商店会顶掉牌组（面板互斥）', ui().panel === 'shop');

closePanel();
check('关闭面板回到大厅', ui().panel === null && ui().screen === 'menu');

setGuideOpen(true);
openPanel('admin');
check('打开面板不会顺手关掉引导浮层', ui().panel === 'admin' && ui().guide === true);
setGuideOpen(false);

showGame();
check('进入对局：清空面板与浮层', ui().screen === 'game' && ui().panel === null && ui().guide === false);
check('inGame()：对局且无面板', inGame() === true);

openPanel('deck');
check('对局中开面板后 inGame() 为假', inGame() === false);
closePanel();
check('关面板后 inGame() 恢复', inGame() === true);

showResult();
check('切结算不会丢掉对局屏幕', ui().screen === 'result');

showMenu();
check('回大厅：面板与浮层都清空', ui().screen === 'menu' && ui().panel === null && ui().guide === false);

/* ---------------- 动作注册表 ---------------- */

const registry = new ActionRegistry();
registry.register('测试用', {
  plain: () => {},
  inGame: { scope: 'game', run: () => {} },
});
check('注册后能取到处理器', typeof registry.get('plain')?.run === 'function');
check('scope 缺省视为 any', (registry.get('plain')?.scope ?? 'any') === 'any');
check('显式 scope 被保留', registry.get('inGame')?.scope === 'game');
check('未注册的动作返回 undefined', registry.get('not-registered') === undefined);

let duplicateThrew = false;
try {
  registry.register('重复注册', { plain: () => {} });
} catch {
  duplicateThrew = true;
}
check('同名动作重复注册会立刻抛错', duplicateThrew);

/* ---------------- 大厅会话草稿 ---------------- */

session.editorDeck = ['a', 'b'];
session.editorDeck.push('c');
check('牌组草稿支持就地追加', session.editorDeck.join(',') === 'a,b,c');

session.pendingRun = 'free';
check('出发模式可读写', session.pendingRun === 'free');
session.pendingRun = null;

session.anteArmed = true;
check('加注开关可读写', session.anteArmed === true);
session.anteArmed = false;

console.log(`\n界面状态 ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
