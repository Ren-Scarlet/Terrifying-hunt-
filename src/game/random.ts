/**
 * 可注入的随机数来源。
 *
 * 默认仍使用 Math.random，保持现有玩法与调用方式；测试和模拟器可以在一个
 * 同步作用域内注入带种子的随机源，让地图、任务和 NPC 决策可复现。
 */
type RandomSource = () => number;

let activeSource: RandomSource | null = null;

export function random(): number {
  const value = (activeSource ?? Math.random)();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`RandomSource 必须返回 [0, 1) 内的有限数值，实际为 ${value}`);
  }
  return value;
}

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function withRandomSource<T>(source: RandomSource, run: () => T): T {
  const previous = activeSource;
  activeSource = source;
  try {
    return run();
  } finally {
    activeSource = previous;
  }
}

/** Fisher–Yates 洗牌；共享随机源，测试可用种子完整复现。 */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 从数组随机取一项。 */
export function randomOf<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
