/**
 * 处决文本解析。
 *
 * 数据来自 data/execution-texts.csv → src/game/data/executionTexts.json。
 * 一条文本可以只填 title / line / description 中的任意一段；
 * 每个字段各自选取“匹配得最具体”的那一组，同组内按 weight 随机。
 *
 * 匹配分：
 *   类型完全一致 +10；victim +8；site +4；killer +2；kind=any 只拿其他分。
 */
import { random } from '../random';
import rawData from '../data/executionTexts.json';
import type { ExecutionContext, ExecutionTextEntry, ResolvedExecutionText } from './types';

const ENTRIES: ExecutionTextEntry[] = (rawData as { entries?: ExecutionTextEntry[] }).entries ?? [];

function entryScore(entry: ExecutionTextEntry, ctx: ExecutionContext): number {
  if (entry.kind !== 'any' && entry.kind !== ctx.kind) return -1;
  if (entry.when) {
    const wanted = ctx.success === true;
    if ((entry.when === 'success') !== wanted) return -1;
  }
  let score = entry.kind === ctx.kind ? 10 : 0;
  if (entry.victim) {
    if (entry.victim !== ctx.victimId && entry.victim !== ctx.victimName) return -1;
    score += 8;
  }
  if (entry.site) {
    if (entry.site !== ctx.siteId && entry.site !== ctx.room) return -1;
    score += 4;
  }
  if (entry.killer) {
    if (entry.killer !== ctx.killer) return -1;
    score += 2;
  }
  return score;
}

function fill(text: string, ctx: ExecutionContext): string {
  return text
    .replace(/\{victim\}/g, ctx.victimName)
    .replace(/\{killer\}/g, ctx.killer)
    .replace(/\{site\}/g, ctx.siteName ?? ctx.siteId ?? '现场');
}

function pickField(field: 'title' | 'line' | 'description', ctx: ExecutionContext): string {
  let bestScore = -1;
  let pool: ExecutionTextEntry[] = [];
  for (const entry of ENTRIES) {
    const text = entry[field];
    if (!text) continue;
    const score = entryScore(entry, ctx);
    if (score < 0) continue;
    if (score > bestScore) { bestScore = score; pool = [entry]; }
    else if (score === bestScore) pool.push(entry);
  }
  if (!pool.length) return '';
  const total = pool.reduce((sum, entry) => sum + Math.max(1, entry.weight ?? 1), 0);
  let roll = random() * total;
  for (const entry of pool) {
    roll -= Math.max(1, entry.weight ?? 1);
    if (roll <= 0) return fill(entry[field]!, ctx);
  }
  return fill(pool[pool.length - 1][field]!, ctx);
}

function fallback(ctx: ExecutionContext): ResolvedExecutionText {
  if (ctx.kind === 'qte') {
    return {
      title: '完美处决',
      line: '节奏踩准了。',
      description: `你顺着${ctx.victimName}的呼吸节拍落下最后一击。`,
    };
  }
  if (ctx.kind === 'special') {
    return { title: ctx.siteName ?? '地点处决', line: '', description: `你利用${ctx.siteName ?? '现场'}完成了对${ctx.victimName}的处决。` };
  }
  return { title: '处决', line: '', description: `你俯身结束${ctx.victimName}，屋里重新安静下来。` };
}

export function resolveExecutionText(ctx: ExecutionContext): ResolvedExecutionText {
  const fallbackText = fallback(ctx);
  return {
    title: pickField('title', ctx) || fallbackText.title,
    line: pickField('line', ctx),
    description: pickField('description', ctx) || fallbackText.description,
  };
}

/** 供测试与命令行校验使用。 */
export function executionTextEntries(): ExecutionTextEntry[] {
  return ENTRIES;
}
