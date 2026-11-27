/**
 * 大厅会话状态：牌组编辑草稿、配件装配草稿、本次出发的模式与加注开关。
 *
 * 这些都不是存档（`SaveData`），只是「这次打开界面时正在编辑什么」的临时状态，
 * 之前和屏幕标志位一起堆在 main.ts 顶层。集中到这里后，菜单动作模块与渲染层
 * 共享同一份草稿，不需要再通过 main.ts 转发。
 */

export type PendingRun = 'contract' | 'free' | null;

let editorDeck: string[] = [];
let accessoryDraft: string[] = [];
let pendingRun: PendingRun = null;
let anteArmed = false;

export const session = {
  /** 牌组编辑器里的当前草稿（未保存前不写回存档）。 */
  get editorDeck(): string[] {
    return editorDeck;
  },
  set editorDeck(next: string[]) {
    editorDeck = next;
  },
  /** 配件装配界面的当前草稿。 */
  get accessoryDraft(): string[] {
    return accessoryDraft;
  },
  set accessoryDraft(next: string[]) {
    accessoryDraft = next;
  },
  /** 非空表示「选完配件就开打」，为空表示只是编辑装配方案。 */
  get pendingRun(): PendingRun {
    return pendingRun;
  },
  set pendingRun(next: PendingRun) {
    pendingRun = next;
  },
  /** 下一局是否加注。 */
  get anteArmed(): boolean {
    return anteArmed;
  },
  set anteArmed(next: boolean) {
    anteArmed = next;
  },
};
