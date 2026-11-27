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
  click: '悬停鼠标指向可以按的按钮音效.ogg',
  step: '脚步声 (1).ogg',
  step2: '脚步声 (2).ogg',
  step3: '脚步声 (3).ogg',
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
  possess: '迈尔斯使用恶魔附身.ogg',
  survivorFound: '发现幸存者.ogg',
  huntressAxe: '女猎手成功用出飞斧的声音.ogg',
  survivorImpact: '幸存者被攻击打击音效.ogg',
  wraithPower: '幽灵使用能力声音.ogg',
  nurseAttack: '护士攻击音效.ogg',
  nurseBlink: '护士瞬移音效.ogg',
  trapTrigger: '有幸存者踩到陷阱.ogg',
  trapSet: '设陷者放陷阱.ogg',
  myersAttack: '迈尔斯攻击音效.ogg',
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
  // 第四批：补齐此前一直缺失的槽位（这些文件早已在仓库里，只是没接线）
  cabinet: '打开柜子和柜子互动.ogg',
  phone: '电话声.ogg',
  palletDrop: '幸存者放下板子（木板障碍物）.ogg',
  palletStun: '幸存者放下板子（木板障碍物）砸晕屠夫.ogg',
  executionSite: '点击地图中执行特殊数据的音效.ogg',
  barricadeSmash: '玩家破坏模板障碍物.ogg',
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
  survivorFound: 0.68,
  huntressAxe: 0.82,
  survivorImpact: 0.9,
  wraithPower: 0.76,
  nurseAttack: 0.82,
  nurseBlink: 0.78,
  trapTrigger: 0.88,
  trapSet: 0.72,
  myersAttack: 0.86,
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
  cabinet: 0.6,
  phone: 0.55,
  palletDrop: 0.8,
  palletStun: 0.85,
  executionSite: 0.5,
  barricadeSmash: 0.75,
};

/* ---------- 背景音乐：菜单一首、对局一首，按界面自动切换 ---------- */
export type MusicTrack = 'menu' | 'bgm';
const MUSIC_FILES: Record<MusicTrack, string> = { menu: 'menu.mp3', bgm: '环境底噪1.ogg' };
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
let lastHeartbeatAt = 0;

/** 地图会频繁重绘；仅在幸存者与杀手同处一室时限频播放心跳。 */
export function playHeartbeat(): void {
  const now = Date.now();
  if (now - lastHeartbeatAt < 7000) return;
  lastHeartbeatAt = now;
  playSfxRepeat('heartbeat', 3, 0.42);
}

/** 幸存者被命中时同时播放物理打击声与受伤叫喊，形成明确的双层反馈。 */
export function playSurvivorHit(gender: 'female' | 'male'): void {
  playSfx('survivorImpact', 0.9);
  playSfx(gender === 'female' ? 'voiceFHurt' : 'voiceMHurt', 0.76);
}

/** 捕兽夹命中时播放被夹住者对应性别的尖叫。 */
export function playTrapScream(gender: 'female' | 'male'): void {
  playSfx(gender === 'female' ? 'voiceFScream' : 'voiceMScream', 0.9);
}

/** 幸存者首次被发现时播放对应性别的受惊声。 */
export function playSurvivorStartle(gender: 'female' | 'male'): void {
  playSfx(gender === 'female' ? 'voiceFStartle' : 'voiceMStartle', 0.86);
}

/** 幸存者死亡时播放死亡提示与对应性别的尖叫。 */
export function playSurvivorDeath(gender: 'female' | 'male'): void {
  playSfx('kill', 0.9);
  playSfx(gender === 'female' ? 'voiceFScream' : 'voiceMScream', 0.96);
}

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
 * 脚步：三条录音随机轮换，连续移动时听不出重复。
 * 之前 step 指向不存在的 step.mp3，所以移动一直是静音的。
 */
const STEP_VARIANTS: SfxName[] = ['step', 'step2', 'step3'];
export function playStep(): void {
  playSfx(STEP_VARIANTS[Math.floor(Math.random() * STEP_VARIANTS.length)], 0.3);
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
