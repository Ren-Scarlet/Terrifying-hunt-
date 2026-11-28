/**
 * 通用 QTE 输入系统。
 *
 * 支持两种随机模式：
 *   digits：按顺序输入随机数字（默认 4 位）
 *   timing：左右摆动的光标，在绿色区域按下空格 / 点击
 *
 * 任何玩法都可以接入：
 *   startQte({
 *     label: '撬锁',
 *     mode: 'random',            // 'digits' | 'timing' | 'random'
 *     length: 5,                 // 仅 digits
 *     durationMs: 3000,
 *     anchor: () => document.querySelector('.lock-marker'),
 *     onComplete: ({ success, mode }) => { ... },
 *   });
 *
 * 模块只负责输入与表现，不读写对局状态；成功/失败后果由接入方处理。
 * 同一时间只允许一个 QTE；取消用 cancelQte()。
 */

export type QteMode = 'digits' | 'timing';

export interface QteResult {
  success: boolean;
  mode: QteMode;
  input: string;
  elapsedMs: number;
}

export interface QteOptions {
  label?: string;
  /** 指定模式；'random' 每次随机选一种，默认 random。 */
  mode?: QteMode | 'random';
  /** digits 模式的位数，默认 4。 */
  length?: number;
  /** 限时毫秒；不传时 digits 默认 2600，timing 默认 4200。 */
  durationMs?: number;
  anchor?: () => HTMLElement | null;
  onComplete: (result: QteResult) => void;
}

interface TimingState {
  zoneStart: number;
  zoneEnd: number;
  speed: number;
  phase: number;
  pos: number;
  cursor: HTMLElement | null;
}

interface QteState {
  mode: QteMode;
  digits: string[];
  index: number;
  startedAt: number;
  deadline: number;
  timer: number;
  raf: number;
  input: string;
  options: QteOptions;
  panel: HTMLDivElement | null;
  timing: TimingState | null;
}

let state: QteState | null = null;

export const DIGITS_DURATION_MS = 2600;
export const TIMING_DURATION_MS = 4200;

/** 纯函数：判断 timing 光标是否落在目标区。 */
export function timingHit(position: number, zoneStart: number, zoneEnd: number): boolean {
  return position >= zoneStart && position <= zoneEnd;
}

function defaultAnchor(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.player-marker');
}

function ensurePanel(): HTMLDivElement | null {
  if (!state) return null;
  if (state.panel?.isConnected) return state.panel;
  const panel = document.createElement('div');
  panel.className = `qte-panel qte-mode-${state.mode}`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', state.options.label ?? '快速反应');
  panel.addEventListener('click', () => {
    if (state?.mode === 'timing') stopTiming();
  });
  document.body.appendChild(panel);
  state.panel = panel;
  return panel;
}

function paintDigits(): void {
  if (!state) return;
  const panel = ensurePanel();
  if (!panel) return;
  panel.innerHTML = `
    <b>${state.options.label ?? '快速反应'} · 按顺序输入</b>
    <div class="qte-digits">${state.digits.map((digit, index) => `<span class="${index < state!.index ? 'done' : index === state!.index ? 'current' : ''}">${digit}</span>`).join('')}</div>
    <i class="qte-timer" style="animation-duration:${Math.max(0, state.deadline - performance.now())}ms"></i>
  `;
}

function paintTiming(): void {
  if (!state?.timing) return;
  const panel = ensurePanel();
  if (!panel) return;
  const timing = state.timing;
  panel.innerHTML = `
    <b>${state.options.label ?? '快速反应'} · 在绿色区域停下</b>
    <div class="qte-timing">
      <span class="qte-zone" style="left:${(timing.zoneStart * 100).toFixed(1)}%;width:${((timing.zoneEnd - timing.zoneStart) * 100).toFixed(1)}%"></span>
      <i class="qte-cursor"></i>
    </div>
    <small class="qte-hint">空格 / 回车 / 点击面板</small>
    <i class="qte-timer" style="animation-duration:${Math.max(0, state.deadline - performance.now())}ms"></i>
  `;
  timing.cursor = panel.querySelector<HTMLElement>('.qte-cursor');
}

function frame(): void {
  const current = state;
  if (!current?.timing) return;
  const elapsed = (performance.now() - current.startedAt) / 1000;
  current.timing.pos = 0.5 + 0.5 * Math.sin(elapsed * current.timing.speed + current.timing.phase);
  if (current.timing.cursor) current.timing.cursor.style.left = `${(current.timing.pos * 100).toFixed(2)}%`;
  current.raf = window.requestAnimationFrame(frame);
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
  const width = Math.min(300, window.innerWidth - 24);
  panel.style.width = `${width}px`;
  panel.style.left = `${Math.min(window.innerWidth - width - 8, Math.max(8, rect.left + rect.width / 2 - width / 2))}px`;
  panel.style.top = `${Math.min(window.innerHeight - 180, rect.bottom + 8)}px`;
}

function finish(success: boolean): void {
  const current = state;
  if (!current) return;
  state = null;
  window.clearTimeout(current.timer);
  window.cancelAnimationFrame(current.raf);
  current.panel?.remove();
  current.options.onComplete({
    success,
    mode: current.mode,
    input: current.input,
    elapsedMs: Math.max(0, Math.round(performance.now() - current.startedAt)),
  });
}

function stopTiming(): void {
  const current = state;
  if (!current?.timing) return;
  const hit = timingHit(current.timing.pos, current.timing.zoneStart, current.timing.zoneEnd);
  current.input = hit ? 'timing-hit' : 'timing-miss';
  finish(hit);
}

/** 开始一段 QTE；已有 QTE 进行中时返回 false。 */
export function startQte(options: QteOptions): boolean {
  if (state) return false;
  if (typeof document === 'undefined') return false;
  const requested = options.mode ?? 'random';
  const mode: QteMode = requested === 'random' ? (Math.random() < 0.5 ? 'digits' : 'timing') : requested;
  const length = Math.max(1, Math.min(8, options.length ?? 4));
  const durationMs = Math.max(1200, options.durationMs ?? (mode === 'digits' ? DIGITS_DURATION_MS : TIMING_DURATION_MS));
  const digits = Array.from({ length }, () => String(Math.floor(Math.random() * 10)));
  const now = performance.now();
  const timer = window.setTimeout(() => finish(false), durationMs);
  state = {
    mode,
    digits,
    index: 0,
    startedAt: now,
    deadline: now + durationMs,
    timer,
    raf: 0,
    input: '',
    options,
    panel: null,
    timing: mode === 'timing'
      ? (() => {
          const width = 0.16 + Math.random() * 0.1;
          const start = 0.32 + Math.random() * (0.68 - width - 0.32);
          return {
            zoneStart: start,
            zoneEnd: start + width,
            speed: 2.2 + Math.random() * 1.2,
            phase: Math.random() * Math.PI * 2,
            pos: 0.5,
            cursor: null,
          };
        })()
      : null,
  };
  if (mode === 'digits') {
    paintDigits();
  } else {
    paintTiming();
    frame();
  }
  syncQtePanel();
  return true;
}

/** 输入：digits 接收数字；timing 接收空格/回车。返回是否被 QTE 消费。 */
export function handleQteInput(key: string): boolean {
  const current = state;
  if (!current) return false;
  if (current.mode === 'timing') {
    if (key === ' ' || key === 'Enter') {
      stopTiming();
      return true;
    }
    return false;
  }
  if (!/^\d$/.test(key)) return false;
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
  paintDigits();
  return true;
}

export function cancelQte(): void {
  if (!state) return;
  window.clearTimeout(state.timer);
  window.cancelAnimationFrame(state.raf);
  state.panel?.remove();
  state = null;
}

export function isQteActive(): boolean {
  return state !== null;
}
