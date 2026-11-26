/**
 * 音效与背景音乐播放器
 *
 * 音频文件全部放在 public/assets/audio/ 下，按 SFX_FILES / MUSIC_FILES 里的文件名命名。
 * 文件名统一用英文短名，中文原名只写在注释里说明用途（素材来自「音乐素材」文件夹）。
 *
 * ── 已覆盖入库（与文件夹逐字节一致）──
 *   start.ogg     游戏开始时音效
 *   kill.ogg      幸存者死亡时音效
 *   possess.ogg   迈尔斯开启恶魔附身音效
 *   sabotage.wav  图腾被破坏音效
 *   menu.mp3      选择角色界面背景音乐（循环）
 *
 * ── 第一批：触发点已接好 ──
 *   crow.ogg      乌鸦叫声
 *   pickup.ogg    拾取武器
 *   win.ogg       游戏胜利
 *   lose.ogg      游戏失败（「胜负已分结算画面」与其完全相同，只入一份）
 *   heartbeat.ogg 心跳音，技能显示红色小人时串行循环 3 次
 *   gate.ogg      逃生大门开启
 *   stage.ogg     逃生者进度每完成 25%
 *   ready.ogg     点击准备完成时
 *   menuButton.ogg 大厅选择按钮
 *   killerPick.ogg 选择角色框
 *   enterMap.ogg  进入地图（准备完成）时播放，不是地图场景音乐
 *
 * ── 第二批：触发点已接好 ──
 *   flee.ogg      人类逃走了（游戏失败分支）
 *   objective.ogg 完成一项任务条件，或一些事件
 *   breaker.ogg   破坏电闸声音
 *   voiceFHurt / voiceFHit / voiceFScream / voiceFStartle   女幸存者：受伤 / 受击 / 尖叫 / 受惊
 *   voiceMHurt / voiceMHit / voiceMScream / voiceMStartle   男幸存者：受伤 / 受击 / 尖叫 / 受惊
 *
 * ── 第三批：本次新增素材 ──
 *   execute.ogg   处决声音（处决后延迟接擦刀）
 *   wipe.ogg      擦刀音效
 *   attack.ogg    重攻击（伤害高的音效）
 *   spark.ogg     电流火花声（破坏电闸后接上）
 *   smash.ogg     破坏声音（通用破坏）
 *
 * 仍缺文件的槽位（click / step / hit / down / stun / generator / endturn / bgm）
 * 保持静默跳过：error 后加入 missing 集合不再重试，不会打断游戏，也不会弹错。
 * 浏览器要求「先有用户交互」才能出声，第一次点击会调 unlockAudio() 把当前音乐真正响起来。
 */
const SFX_FILES = {
  click: 'click.mp3',
  step: 'step.mp3',
  attack: 'attack.ogg',
  hit: 'hit.mp3',
  down: 'down.mp3',
  kill: 'kill.ogg',
  wipe: 'wipe.ogg',
  sabotage: 'sabotage.wav',
  stun: 'stun.mp3',
  pickup: 'pickup.ogg',
  generator: 'generator.mp3',
  crow: 'crow.ogg',
  endturn: 'endturn.mp3',
  start: 'start.ogg',
  possess: 'possess.ogg',
  win: 'win.ogg',
  lose: 'lose.ogg',
  // 第一批：触发点已接好
  heartbeat: 'heartbeat.ogg',
  gate: 'gate.ogg',
  stage: 'stage.ogg',
  ready: 'ready.ogg',
  menuButton: 'menuButton.ogg',
  killerPick: 'killerPick.ogg',
  enterMap: 'enterMap.ogg',
  // 第二批：触发点已接好
  flee: 'flee.ogg',
  objective: 'objective.ogg',
  breaker: 'breaker.ogg',
  voiceFHurt: 'voiceFHurt.ogg',
  voiceFHit: 'voiceFHit.ogg',
  voiceFScream: 'voiceFScream.ogg',
  voiceFStartle: 'voiceFStartle.ogg',
  voiceMHurt: 'voiceMHurt.ogg',
  voiceMHit: 'voiceMHit.ogg',
  voiceMScream: 'voiceMScream.ogg',
  voiceMStartle: 'voiceMStartle.ogg',
  // 第三批：本次新增素材
  execute: 'execute.ogg',
  spark: 'spark.ogg',
  smash: 'smash.ogg',
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
  heartbeat: 0.45,
  gate: 0.7,
  stage: 0.6,
  ready: 0.35,
  menuButton: 0.3,
  killerPick: 0.4,
  enterMap: 0.5,
  flee: 0.75,
  objective: 0.6,
  breaker: 0.65,
  execute: 0.85,
  spark: 0.6,
  smash: 0.7,
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
  if (track === musicTrack) {
    unlockAudio();
    return;
  }
  // 先停止上一首，再判断新曲目是否存在；否则缺失 bgm.mp3 时会提前返回，
  // 让 menu.mp3 在主界面切入游戏后继续播放。
  musicTrack = track;
  if (music) {
    music.pause();
    music.currentTime = 0;
    music = null;
  }
  if (!track || musicMissing.has(track)) return;
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

/**
 * 串行重复播放：心跳这类「一次事件里循环 3~4 次」的音效。
 * 上一播完才播下一遍，不会叠成一团；同名事件重复触发时各自独立计时。
 */
export function playSfxRepeat(name: SfxName, times: number, volume?: number): void {
  if (muted || missing.has(name)) return;
  let left = Math.max(1, times);
  const playOne = (): void => {
    if (left <= 0) return;
    const a = new Audio(src(SFX_FILES[name]));
    a.volume = volume ?? VOLUME[name] ?? 0.65;
    a.addEventListener('error', () => {
      missing.add(name);
      left = 0;
    }, { once: true });
    a.addEventListener('ended', () => {
      left -= 1;
      if (left > 0) playOne();
    }, { once: true });
    void a.play().catch(() => {});
  };
  playOne();
}
