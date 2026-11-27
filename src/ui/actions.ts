/**
 * 界面动作注册表。
 *
 * 重构前，所有 `data-action` 都在 main.ts 的同一个 click 回调里用
 * `if (action === '...')` 顺序匹配（771 行、179 个分支）。那种写法有三个问题：
 *   1. 新增动作只能往链尾追加，顺序错了会被前面的 `return` 静默吞掉；
 *   2. 无法回答「这个按钮到底有没有处理器」，死按钮只能靠肉眼发现；
 *   3. 对局状态的前置校验散落在链条中段，插件/新模块无法复用。
 *
 * 现在改为「动作名 → 处理器」的表，按界面区域分模块注册：
 *   - scope: 'any'  —— 任何界面都能触发（静音、引导、返回大厅…）
 *   - scope: 'game' —— 只在对局界面且无面板遮挡时触发（移动、出牌、处决…）
 * 分发器在调用前统一做作用域与对局状态校验，处理器内部不再重复判断。
 */

/** 一次点击动作的上下文。 */
export interface ActionContext {
  /** 触发了动作的元素（`[data-action]` 本身，或其最近的祖先）。 */
  readonly target: HTMLElement;
  /** 动作名，等于元素的 `data-action`。 */
  readonly action: string;
  /** 分数处决 QTE 的结果；其它动作恒为 undefined。 */
  readonly qteOutcome?: 'perfect' | 'miss';
}

export type ActionScope = 'any' | 'game';

export type ActionHandler = (ctx: ActionContext) => void;

export interface ActionSpec {
  readonly scope?: ActionScope;
  readonly run: ActionHandler;
}

export type ActionTable = Record<string, ActionSpec | ActionHandler>;

export class ActionRegistry {
  private readonly specs = new Map<string, ActionSpec>();

  /** 注册一批动作；重复注册视为编程错误，启动时立刻抛出。 */
  register(owner: string, table: ActionTable): void {
    for (const [name, spec] of Object.entries(table)) {
      if (this.specs.has(name)) {
        throw new Error(`界面动作重复注册：「${name}」同时出现在 ${owner} 与已注册的表中`);
      }
      this.specs.set(name, typeof spec === 'function' ? { run: spec } : spec);
    }
  }

  get(name: string): ActionSpec | undefined {
    return this.specs.get(name);
  }
}
