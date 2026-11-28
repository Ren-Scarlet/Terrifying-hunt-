/**
 * 处决文本数据维护脚本。
 *
 *   node scripts/execution-texts.mjs import [csv]   把 Excel/CSV 转成游戏用的 JSON
 *   node scripts/execution-texts.mjs export [csv]   把当前 JSON 导出成 CSV 模板
 *   node scripts/execution-texts.mjs verify         检查 CSV 与 JSON 是否同步
 *   node scripts/execution-texts.mjs validate       只校验 CSV 内容
 *
 * CSV 列：id,kind,site,killer,victim,when,weight,title,line,description
 *   kind    normal / special / qte / any
 *   site    处决点 id（fridge、microwave…）或房间 id（kitchen…），留空表示不限
 *   killer  杀手名，留空表示不限
 *   victim  幸存者 id 或中文名，留空表示不限
 *   when    仅 QTE：success / fail，留空表示通用
 *   weight  同优先级文本的随机权重，默认 1
 *   文本支持 {victim} {killer} {site} 占位符
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CSV_PATH = resolve(ROOT, 'data/execution-texts.csv');
const JSON_PATH = resolve(ROOT, 'src/game/data/executionTexts.json');

const KINDS = new Set(['normal', 'special', 'qte', 'any']);
const PLACEHOLDERS = new Set(['victim', 'killer', 'site']);
const HEADERS = ['id', 'kind', 'site', 'killer', 'victim', 'when', 'weight', 'title', 'line', 'description'];

/** 解析 CSV：支持引号、转义引号与字段内换行。 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseEntries(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error('CSV 是空的');
  const header = rows[0].map((cell) => cell.trim());
  if (header.join(',') !== HEADERS.join(',')) {
    throw new Error(`表头必须是：${HEADERS.join(',')}\n实际是：${header.join(',')}`);
  }
  const errors = [];
  const ids = new Set();
  const entries = [];
  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const record = Object.fromEntries(HEADERS.map((key, i) => [key, (cells[i] ?? '').trim()]));
    if (!record.id) { errors.push(`第 ${line} 行：id 不能为空`); return; }
    if (ids.has(record.id)) errors.push(`第 ${line} 行：id 重复（${record.id}）`);
    ids.add(record.id);
    if (!KINDS.has(record.kind)) errors.push(`第 ${line} 行：kind 必须是 normal/special/qte/any（当前 ${record.kind || '空'}）`);
    if (record.when && record.when !== 'success' && record.when !== 'fail') {
      errors.push(`第 ${line} 行：when 只能是 success / fail 或留空`);
    }
    const weight = record.weight === '' ? 1 : Number(record.weight);
    if (!Number.isFinite(weight) || weight <= 0) errors.push(`第 ${line} 行：weight 必须是正数`);
    ['title', 'line', 'description'].forEach((field) => {
      const text = record[field] ?? '';
      for (const match of text.matchAll(/\{([^}]+)\}/g)) {
        if (!PLACEHOLDERS.has(match[1])) errors.push(`第 ${line} 行：未知占位符 {${match[1]}}`);
      }
    });
    if (!record.title && !record.line && !record.description) errors.push(`第 ${line} 行：三段文本至少要填一段`);
    entries.push({
      id: record.id,
      kind: record.kind,
      ...(record.site ? { site: record.site } : {}),
      ...(record.killer ? { killer: record.killer } : {}),
      ...(record.victim ? { victim: record.victim } : {}),
      ...(record.when ? { when: record.when } : {}),
      weight,
      ...(record.title ? { title: record.title } : {}),
      ...(record.line ? { line: record.line } : {}),
      ...(record.description ? { description: record.description } : {}),
    });
  });
  return { entries, errors };
}

function readCsv(path = CSV_PATH) {
  return parseEntries(readFileSync(path, 'utf8'));
}

function writeJson(entries) {
  const payload = { version: 1, entries };
  writeFileSync(JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeCsv(path, entries) {
  const lines = [HEADERS.join(',')];
  for (const entry of entries) {
    lines.push([
      entry.id, entry.kind, entry.site ?? '', entry.killer ?? '', entry.victim ?? '', entry.when ?? '', entry.weight ?? 1,
      entry.title ?? '', entry.line ?? '', entry.description ?? '',
    ].map(csvEscape).join(','));
  }
  writeFileSync(path, `${lines.join('\n')}\n`);
}

function normalize(entries) {
  return JSON.stringify(entries.map((entry) => ({
    id: entry.id, kind: entry.kind, site: entry.site ?? '', killer: entry.killer ?? '',
    victim: entry.victim ?? '', when: entry.when ?? '', weight: entry.weight ?? 1, title: entry.title ?? '',
    line: entry.line ?? '', description: entry.description ?? '',
  })).sort((a, b) => a.id.localeCompare(b.id)));
}

const [command = 'validate', target] = process.argv.slice(2);
try {
  if (command === 'import') {
    const { entries, errors } = readCsv(target ? resolve(target) : CSV_PATH);
    if (errors.length) {
      console.error(`发现 ${errors.length} 个错误：`);
      errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    writeJson(entries);
    console.log(`已导入 ${entries.length} 条处决文本 → src/game/data/executionTexts.json`);
  } else if (command === 'export') {
    const payload = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
    const out = resolve(target || CSV_PATH);
    writeCsv(out, payload.entries ?? []);
    console.log(`已导出 ${payload.entries?.length ?? 0} 条 → ${out}`);
  } else if (command === 'verify') {
    const { entries, errors } = readCsv();
    if (errors.length) {
      console.error(`CSV 有 ${errors.length} 个错误：`);
      errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    const payload = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
    if (normalize(entries) !== normalize(payload.entries ?? [])) {
      console.error('CSV 与 src/game/data/executionTexts.json 不同步：请运行 node scripts/execution-texts.mjs import');
      process.exit(1);
    }
    console.log(`处决文本已同步：${entries.length} 条`);
  } else if (command === 'validate') {
    const { entries, errors } = readCsv();
    if (errors.length) {
      console.error(`发现 ${errors.length} 个错误：`);
      errors.forEach((error) => console.error(`  - ${error}`));
      process.exit(1);
    }
    console.log(`处决文本校验通过：${entries.length} 条`);
  } else {
    console.error('用法：node scripts/execution-texts.mjs <import|export|verify|validate> [csv]');
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
