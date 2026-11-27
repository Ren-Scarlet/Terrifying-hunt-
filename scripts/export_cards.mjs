/**
 * 从源码导出卡牌一览表。
 *
 *   node scripts/export_cards.mjs
 *
 * 做法：用 esbuild（项目 devDependency）把 src/game/data/cards.ts 与
 * src/game/effectCatalog.ts 打成一个临时 ESM 模块并 import，读取真实的
 * CARDS 与效果目录，生成 docs/卡牌一览.md。
 *
 * 约束：
 *   · 不联网、不写临时文件（bundle 走内存 + data: URL）；
 *   · 输出顺序固定：卡池（通用→专属→商店）→ 专属杀手 → 卡牌 id；
 *   · 只导出源码内置卡牌，不包含平衡面板存进 localStorage 的本地覆盖。
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_FILE = join(ROOT, 'docs', '卡牌一览.md');

/* ------------------------------------------------------------------ */
/* 1. 打包并载入运行时数据                                             */
/* ------------------------------------------------------------------ */

const entry = `
  export { CARDS } from './src/game/data/cards.ts';
  export {
    EFFECT_OPS,
    WHO_OPTIONS,
    DEST_OPTIONS,
    FLAG_OPTIONS,
    STATUS_OPTIONS,
    SABOTAGE_OPTIONS,
  } from './src/game/effectCatalog.ts';
`;

const bundled = await build({
  stdin: {
    contents: entry,
    resolveDir: ROOT,
    sourcefile: 'export-cards-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  write: false,
  logLevel: 'silent',
});

const code = bundled.outputFiles?.[0]?.text;
if (!code) {
  console.error('[export_cards] esbuild produced no output');
  process.exit(1);
}
const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
const runtime = await import(dataUrl);

const CARDS = runtime.CARDS;
const EFFECT_OPS = runtime.EFFECT_OPS;
const OPTION_LISTS = {
  who: runtime.WHO_OPTIONS,
  dest: runtime.DEST_OPTIONS,
  flag: runtime.FLAG_OPTIONS,
  status: runtime.STATUS_OPTIONS,
  sabotage: runtime.SABOTAGE_OPTIONS,
};

if (!Array.isArray(CARDS) || !EFFECT_OPS) {
  console.error('[export_cards] expected CARDS array and EFFECT_OPS from src');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* 2. 可读化：op / 条件 / 选项                                         */
/* ------------------------------------------------------------------ */

const TYPE_LABEL = {
  attack: '攻击',
  skill: '技能',
  tactic: '战术',
  setup: '布置',
};

const POOL_LABEL = {
  initial: '通用',
  killer: '杀手专属',
  shop: '商店',
};

const FIELD_LABEL = {
  who: '目标',
  amount: '数值',
  maxHp: '生命上限',
  bleedTurns: '流血次数',
  status: '状态',
  statusTurns: '状态次数',
  turns: '回合',
  to: '目的地',
  room: '房间',
  key: '键',
  value: '值',
  count: '数量',
  text: '文本',
  distance: '距离',
  clearAlert: '清除警觉',
  all: '全场',
  adj: '相邻',
};

const COND_LABEL = {
  killsThisTurn: '本回合击杀数',
  peopleHere: '房间人数',
  victimHere: '当前房间有可攻击目标',
  downedHere: '当前房间有倒地者',
  injuredHere: '当前房间有伤者',
  targetAway: '有目标在别处',
  energy: '行动点',
  wanted: '暴露度',
  alarm: '警报',
  stalk: '尾随值',
  possession: '恶魔附身中',
  visibleSurvivor: '视野内有幸存者',
  survivorNearby: '附近有幸存者',
  carryingPerson: '正抱着人',
  currentDestructible: '有可破坏物',
  flag: '开关',
  room: '所在房间',
  markedAlive: '标记目标存活',
  escaped: '已逃脱人数',
  hasThreat: '存在威胁',
  hasArchetype: '存在性格',
};

/** effectCatalog 的 FLAG_OPTIONS 没收录、但 FlagKey / 代码里实际用到的开关。 */
const EXTRA_FLAG_LABEL = {
  stealthNext: '静止隐身行动',
  myersStalk: '尾随者模式',
  myersLastBest: '把最好的留在最后',
};

function optionLabel(type, value) {
  const list = OPTION_LISTS[type];
  if (Array.isArray(list)) {
    const found = list.find((item) => item[0] === value);
    if (found) return found[1];
  }
  if (type === 'flag' && EXTRA_FLAG_LABEL[value]) return EXTRA_FLAG_LABEL[value];
  return String(value);
}

function fieldLabel(field) {
  return FIELD_LABEL[field] ?? field;
}

function formatValue(type, value) {
  if (type === 'flag') {
    // 开关同时保留英文键，方便对照源码 / 导入 JSON。
    return `${optionLabel(type, value)}（${value}）`;
  }
  if (type === 'who' || type === 'dest' || type === 'status' || type === 'sabotage') {
    return optionLabel(type, value);
  }
  if (type === 'text') return `“${String(value)}”`;
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function formatCond(cond) {
  if (!cond || typeof cond !== 'object') return String(cond);
  const name = COND_LABEL[cond.c] ?? String(cond.c);
  const parts = [];
  for (const [key, value] of Object.entries(cond)) {
    if (key === 'c') continue;
    const op = key === 'gte' ? '≥' : key === 'lte' ? '≤' : '=';
    let shown = String(value);
    if (key === 'key' && cond.c === 'flag') shown = optionLabel('flag', value);
    else if (key === 'a' && cond.c === 'hasArchetype') shown = String(value);
    else if (key === 'v' && cond.c === 'hasThreat') shown = String(value);
    else if (key === 'is' && cond.c === 'room') shown = optionLabel('dest', value);
    parts.push(`${key}${op}${shown}`);
  }
  return parts.length ? `${name}（${parts.join('，')}）` : name;
}

function formatOp(op) {
  if (!op || typeof op !== 'object') return String(op);
  if (op.op === 'if') {
    const thenPart = formatOps(op.then);
    const elsePart = op.else?.length ? `；否则：${formatOps(op.else)}` : '';
    return `条件分支〔${formatCond(op.cond)}〕满足：${thenPart}${elsePart}`;
  }
  const meta = EFFECT_OPS[op.op];
  const label = meta?.label ?? op.op;
  const declared = meta?.fields ?? [];
  const known = new Set(['op', 'cond', 'then', 'else', ...declared.map(([field]) => field)]);
  const extras = Object.keys(op)
    .filter((field) => !known.has(field))
    .sort();
  const fields = [
    ...declared.filter(([field]) => field in op),
    ...extras.map((field) => [field, 'raw']),
  ];
  if (!fields.length) return label;
  const rendered = fields.map(([field, type]) => {
    const value = op[field];
    const shown = type === 'raw' ? String(value) : formatValue(type, value);
    return `${fieldLabel(field)}=${shown}`;
  });
  return `${label}：${rendered.join('，')}`;
}

function formatOps(ops) {
  if (!Array.isArray(ops) || !ops.length) return '无';
  return ops.map(formatOp).join('<br>');
}

/* ------------------------------------------------------------------ */
/* 3. 排序与表格                                                       */
/* ------------------------------------------------------------------ */

const POOL_ORDER = { initial: 0, killer: 1, shop: 2 };
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const sorted = [...CARDS].sort((a, b) => {
  const poolA = POOL_ORDER[a.pool] ?? 3;
  const poolB = POOL_ORDER[b.pool] ?? 3;
  if (poolA !== poolB) return poolA - poolB;
  const ownerA = a.killerOnly ?? '';
  const ownerB = b.killerOnly ?? '';
  if (ownerA !== ownerB) return cmp(ownerA, ownerB);
  return cmp(a.id, b.id);
});

function escapeCell(text) {
  return String(text ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function unlockLabel(card) {
  if (!card.unlocked) {
    const price = 20 + (Number(card.cost) || 0) * 15;
    return `未解锁（商店 ${price} 血点）`;
  }
  if (card.pool === 'killer') return `已解锁（${card.killerOnly ?? '专属'}专属）`;
  if (card.pool === 'shop') return '已解锁（商店）';
  return '已解锁（通用）';
}

const rows = sorted.map((card) => {
  const cells = [
    card.id,
    card.name,
    TYPE_LABEL[card.type] ?? card.type,
    String(card.cost),
    unlockLabel(card),
    card.desc,
    formatOps(card.ops),
  ];
  return `| ${cells.map(escapeCell).join(' | ')} |`;
});

const poolCounts = new Map();
const typeCounts = new Map();
for (const card of sorted) {
  const pool = card.pool ?? '未标注';
  poolCounts.set(pool, (poolCounts.get(pool) ?? 0) + 1);
  typeCounts.set(card.type, (typeCounts.get(card.type) ?? 0) + 1);
}
const poolSummary = [...poolCounts.entries()]
  .sort((a, b) => (POOL_ORDER[a[0]] ?? 3) - (POOL_ORDER[b[0]] ?? 3) || cmp(a[0], b[0]))
  .map(([pool, count]) => `${POOL_LABEL[pool] ?? pool} ${count} 张`)
  .join(' · ');
const TYPE_ORDER = ['attack', 'skill', 'tactic', 'setup'];
const typeSummary = [...typeCounts.entries()]
  .sort((a, b) => (TYPE_ORDER.indexOf(a[0]) + 1 || 99) - (TYPE_ORDER.indexOf(b[0]) + 1 || 99) || cmp(a[0], b[0]))
  .map(([type, count]) => `${TYPE_LABEL[type] ?? type} ${count} 张`)
  .join(' · ');

const output = `# 卡牌一览

> 本文件由 \`node scripts/export_cards.mjs\` 自动生成，请勿手工编辑。  
> 数据来源：\`src/game/data/cards.ts\`（卡牌定义）与 \`src/game/effectCatalog.ts\`（op 名称与可选取值）。  
> 这里只列出源码内置卡牌，不包含平衡面板保存在浏览器 localStorage 或云端配置里的本地改动。  
> 共 ${sorted.length} 张：${poolSummary}；按类型：${typeSummary}。

| id | 名称 | 类型 | 费用 | 解锁 | 描述 | ops（可读形式） |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

## 说明

- 「ops」是引擎实际执行的指令列表，按数组顺序结算；卡牌描述只是文案，两者不一致时以 ops 与引擎实现为准。
- 少数卡牌在引擎里有额外的硬编码分支（例如 \`myers_eclipse_light\` 的处决、\`myers_last_best\` 的最后一人气场、\`hell\` 的选房、\`unbreakable\` 的免费擦刀），上表只展示 \`ops\`，完整行为以 \`src/game/engine.ts\` 的 \`playCard()\` 为准。
- 字段名保留英文（如 \`who\`、\`bleedTurns\`），便于对照源码和平衡面板里的路径（例如 \`0.amount\`、\`0.then.1.turns\`）。
- \`attack\` 指令比较特殊：引擎会用它发动一次真正的挥刀（基础 1 点伤害，受配件与连携影响），并在命中且目标掉血后施加 \`bleedTurns\` 次流血结算；\`statusTurns\` 为 0 时不会施加状态。
`;

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, output, 'utf8');

console.log(`[export_cards] wrote ${OUT_FILE}`);
console.log(`[export_cards] cards: ${sorted.length} (${poolSummary})`);
