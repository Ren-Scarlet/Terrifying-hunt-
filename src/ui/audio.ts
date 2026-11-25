/**
 * 音效与背景音乐播放器
 *
 * 音频文件全部放在 public/assets/audio/ 下，按 SFX_FILES / MUSIC_FILES 里的文件名命名。
 * 已实装（来自「音乐素材」文件夹，用途按文件名标注）：
 *   start.ogg     开局一次性音效（游戏开始时）
 *   kill.ogg      幸存者死亡时
 *   possess.ogg   迈尔斯开启恶魔附身
 *   sabotage.wav  破坏场地设施（图腾被破坏）
 *   menu.mp3      角色选择界面的背景音乐（循环）
 * 其余名字暂缺文件就静默跳过：error 后加入 missing 集合不再重试，
 * 不会打断游戏，也不会弹错。浏览器要求「先有用户交互」才能出声，
 * 第一次点击会调 unlockAudio() 把当前音乐真正响起来。
 */
const SFX_FILES = {
  click: 'click.mp3',
  step: 'step.mp3',
  attack: 'attack.mp3',
  hit: 'hit.mp3',
  down: 'down.mp3',
  kill: 'kill.ogg',
  wipe: 'wipe.mp3',
  sabotage: 'sabotage.wav',
  stun: 'stun.mp3',
  pickup: 'pickup.mp3',
  generator: 'generator.mp3',
  crow: 'crow.mp3',
  endturn: 'endturn.mp3',
  start: 'start.ogg',
  possess: 'possess.ogg',
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
  start: 0.7,
  possess: 0.8,
  win: 0.8,
  lose: 0.8,
};

/* ---------- 背景音乐：菜单一首、对局一首，按界面自动切换 ---------- */
export type MusicTrack = 'menu' | 'bgm';
const MUSIC_FILES: Record<MusicTrack, string> = { menu: 'menu.mp3', bgm: 'bgm.mp3' };
const MUSIC_VOLUME: Record<MusicTrack, number> = { menu: 0.4, bgm: 0.22 };

const BASE =
  ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || './';
const src = (file: string) => `${BASE}assets/audio/${file}`;

const MUTE_KEY = 'th-audio-muted';
let muted = localStorage.getItem(MUTE_KEY) === '1';
let music: HTMLAudioElement | null = null;
let musicTrack: MusicTrack | null = null;
const musicMissing = new Set<MusicTrack>();
let audioUnlocked = false;
const missing = new Set<SfxName>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  if (value) {
    music?.pause();
  } else {
    unlockAudio();
  }
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

/** 第一次用户交互后调用：把当前该放的音乐真正响起来 */
export function unlockAudio(): void {
  audioUnlocked = true;
  if (muted) return;
  if (music && music.paused) void music.play().catch(() => {});
}

/** 主界面放角色选择的音乐，对局里换另一首。幂等：同一轨不会重播 */
export function setMusic(track: MusicTrack | null): void {
  if (track !== null && musicMissing.has(track)) return;
  if (track === musicTrack) {
    unlockAudio();
    return;
  }
  musicTrack = track;
  if (music) {
    music.pause();
    music = null;
  }
  if (!track) return;
  const el = new Audio(src(MUSIC_FILES[track]));
  el.loop = true;
  el.volume = MUSIC_VOLUME[track];
  // 加载失败（文件还没给）就记住这一轨，不再反复请求
  el.addEventListener('error', () => {
    musicMissing.add(track);
    if (music === el) {
      music = null;
      if (musicTrack === track) musicTrack = null;
    }
  }, { once: true });
  music = el;
  if (audioUnlocked && !muted) void el.play().catch(() => {});
}

/** 播一个音效；同名音效可以重叠（连点、连砍不会互相打断） */
export function playSfx(name: SfxName, volume?: number): void {
  if (muted || missing.has(name)) return;
  const a = new Audio(src(SFX_FILES[name]));
  a.volume = volume ?? VOLUME[name] ?? 0.65;
  a.addEventListener('error', () => missing.add(name), { once: true });
  void a.play().catch(() => {});
}
