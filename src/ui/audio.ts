/**
 * 音效播放器
 *
 * 音频文件全部放在 public/assets/audio/ 下，按 SFX_FILES 里的文件名命名（.mp3）。
 * 缺哪个文件就静默跳过：play() 的 reject 被吞掉，不会打断游戏，也不会弹错。
 * 浏览器要求「先有用户交互」才能出声，所以第一次点击会调 unlockAudio() 起背景音乐。
 */
const SFX_FILES = {
  click: 'click.mp3',
  step: 'step.mp3',
  attack: 'attack.mp3',
  hit: 'hit.mp3',
  down: 'down.mp3',
  kill: 'kill.mp3',
  wipe: 'wipe.mp3',
  sabotage: 'sabotage.mp3',
  stun: 'stun.mp3',
  pickup: 'pickup.mp3',
  generator: 'generator.mp3',
  crow: 'crow.mp3',
  endturn: 'endturn.mp3',
  win: 'win.mp3',
  lose: 'lose.mp3',
} as const;

export type SfxName = keyof typeof SFX_FILES;

const VOLUME: Partial<Record<SfxName, number>> = {
  click: 0.22,
  step: 0.3,
  attack: 0.7,
  hit: 0.75,
  down: 0.8,
  kill: 0.85,
  wipe: 0.5,
  sabotage: 0.75,
  stun: 0.8,
  pickup: 0.6,
  generator: 0.55,
  crow: 0.5,
  endturn: 0.35,
  win: 0.8,
  lose: 0.8,
};

const BASE =
  ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || './';
const src = (file: string) => `${BASE}assets/audio/${file}`;

const MUTE_KEY = 'th-audio-muted';
let muted = localStorage.getItem(MUTE_KEY) === '1';
let bgm: HTMLAudioElement | null = null;
const missing = new Set<SfxName>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  if (value) {
    bgm?.pause();
  } else {
    unlockAudio();
    if (bgm) void bgm.play().catch(() => {});
  }
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

/** 第一次用户交互后调用：起循环背景音乐 */
export function unlockAudio(): void {
  if (muted || bgm) return;
  const a = new Audio(src('bgm.mp3'));
  a.loop = true;
  a.volume = 0.2;
  a.addEventListener('error', () => { bgm = null; }, { once: true });
  void a.play().catch(() => {});
  bgm = a;
}

/** 播一个音效；同名音效可以重叠（连点、连砍不会互相打断） */
export function playSfx(name: SfxName, volume?: number): void {
  if (muted || missing.has(name)) return;
  const a = new Audio(src(SFX_FILES[name]));
  a.volume = volume ?? VOLUME[name] ?? 0.65;
  a.addEventListener('error', () => missing.add(name), { once: true });
  void a.play().catch(() => {});
}
