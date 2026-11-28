/**
 * 通用 QTE 输入系统。
 *
 * 任何玩法都可以调用 startQte() 接入一段「按顺序输入数字」的快速反应：
 *   startQte({
 *     label: '撬锁',
 *     length: 5,
 *     durationMs: 5000,
 *     anchor: () => document.querySelector('.lock-marker'),
 *     onComplete: ({ success, input, elapsedMs }) => { ... },
 *   });
 *
 * 模块只负责：生成数字、计时、面板显示、键盘/触屏输入、成功/失败回调。
 * 它不依赖对局状态，也不决定失败后发生什么——这些由接入方在 onComplete 里处理。
 * 同一时间只允许一个 QTE；需要取消时调用 cancelQte()。
 */

export interface QteResult {
  success: boolean;
  input: string;
  elapsedMs: number;
}

export interface QteOptions {
  /** 面板标题，默认「快速反应」。 */
  label?: string;
  /** 需要输入几位数字，默认 4。 */
  length?: number;
  /** 限时毫秒，默认 4200。 */
  durationMs?: number;
  /** 面板跟随的界面元素；不传则使用地图上的杀手头像。 */
  anchor?: () => HTMLElement | null;
  /** 结束回调：成功 / 超时 / 输错都会调用一次。 */
  onComplete: (result: QteResult) => void;
}

interface QteState {
  digits: string[];
  index: number;
  startedAt: number;
  deadline: number;
  timer: number;
  input: string;
  options: QteOptions;
  panel: HTMLDivElement | null;
}

let state: QteState | null = null;

function defaultAnchor(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.player-marker');
}

function removePanel(): void {
  state?.panel?.remove();
  if (state) state.panel = null;
}

function ensurePanel(): HTMLDivElement | null {
  if (!state) return null;
  if (state.panel?.isConnected) return state.panel;
  const panel = document.createElement('div');
  panel.className = 'qte-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', state.options.label ?? '快速反应');
  document.body.appendChild(panel);
  state.panel = panel;
  return panel;
}

function paintPanel(): void {
  if (!state) return;
  const panel = ensurePanel();
  if (!panel) return;
  const remaining = Math.max(0, state.deadline - performance.now());
  panel.innerHTML = `
    <b>${state.options.label ?? '快速反应'} · 按顺序输入</b>
    <div class="qte-digits">${state.digits.map((digit, index) => `<span class="${index < state!.index ? 'done' : index === state!.index ? 'current' : ''}">${digit}</span>`).join('')}</div>
    <i class="qte-timer" style="animation-duration:${remaining}ms"></i>
  `;
}

/** 把面板移动到锚点元素下方；界面每次重绘或缩放时调用。 */
export function syncQtePanel(): void {
  if (!state) {
    document.querySelector('.qte-panel')?.remove();
    return;
  }
  const panel = ensurePanel();
  if (!panel) return;
  const anchor = (state.options.anchor ?? defaultAnchor)();
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(260, window.innerWidth - 24);
  panel.style.width = `${width}px`;
  panel.style.left = `${Math.min(window.innerWidth - width - 8, Math.max(8, rect.left + rect.width / 2 - width / 2))}px`;
  panel.style.top = `${Math.min(window.innerHeight - 180, rect.bottom + 8)}px`;
}

function finish(success: boolean): void {
  const current = state;
  if (!current) return;
  state = null;
  window.clearTimeout(current.timer);
  current.panel?.remove();
  current.options.onComplete({
    success,
    input: current.input,
    elapsedMs: Math.max(0, Math.round(performance.now() - current.startedAt)),
  });
}

/** 开始一段 QTE；已有 QTE 进行中时返回 false。 */
export function startQte(options: QteOptions): boolean {
  if (state) return false;
  if (typeof document === 'undefined') return false;
  const length = Math.max(1, Math.min(8, options.length ?? 4));
  const durationMs = Math.max(800, options.durationMs ?? 4200);
  const digits = Array.from({ length }, () => String(Math.floor(Math.random() * 10)));
  const timer = window.setTimeout(() => finish(false), durationMs);
  state = {
    digits,
    index: 0,
    startedAt: performance.now(),
    deadline: performance.now() + durationMs,
    timer,
    input: '',
    options,
    panel: null,
  };
  paintPanel();
  syncQtePanel();
  return true;
}

/** 输入一位数字；返回是否被 QTE 消费。 */
export function handleQteInput(key: string): boolean {
  const current = state;
  if (!current || !/^\d$/.test(key)) return false;
  current.input += key;
  if (key !== current.digits[current.index]) {
    finish(false);
    return true;
  }
  current.index += 1;
  if (current.index >= current.digits.length) {
    finish(true);
    return true;
  }
  paintPanel();
  return true;
}

export function cancelQte(): void {
  if (!state) return;
  window.clearTimeout(state.timer);
  state.panel?.remove();
  state = null;
}

export function isQteActive(): boolean {
  return state !== null;
}
