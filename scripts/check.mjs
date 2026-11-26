/**
 * 一条命令跑完所有验证：类型检查 + 规则回归 + 胜率抽样。
 * 逻辑改动只需要跑这个，不要启动浏览器。
 *
 *   npm run check          3 秒左右（39 局抽样）
 *   npm run check:full     12 杀手 × 8 局，用于最终平衡
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = '.cache/tests';
const full = process.argv.includes('--full');
const env = { ...process.env, GAMES: full ? '8' : '3' };

mkdirSync(OUT, { recursive: true });

const results = [];
const t0 = Date.now();

function step(label, fn) {
  const started = Date.now();
  const ok = fn();
  results.push({ label, ok, ms: Date.now() - started });
  return ok;
}

/** 只在检查失败时把输出放出来，成功就闭嘴 */
function runNode(file) {
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', env });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd();
  if (r.status !== 0) console.log(out);
  else console.log(out.split('\n').slice(-4).join('\n'));
  return r.status === 0;
}

const tscOk = step('typecheck (src)', () => {
  const r = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) console.log((r.stdout ?? '') + (r.stderr ?? ''));
  return r.status === 0;
});

if (tscOk) {
  console.log('打包测试…');
  await build({
    entryPoints: ['tests/logic.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    outfile: `${OUT}/logic.mjs`,
    logLevel: 'error',
  });
  await build({
    entryPoints: ['tests/sim.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    outfile: `${OUT}/sim.mjs`,
    logLevel: 'error',
  });

  step('规则回归', () => runNode(`${OUT}/logic.mjs`));
  step('胜率抽样', () => runNode(`${OUT}/sim.mjs`));
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + '─'.repeat(46));
for (const r of results) {
  console.log(`${r.ok ? '  ok  ' : ' FAIL '} ${r.label.padEnd(18, ' ')} ${r.ms}ms`);
}
console.log(`总计 ${((Date.now() - t0) / 1000).toFixed(1)}s ${failed.length ? `· ${failed.length} 项失败` : '· 全部通过'}`);
process.exitCode = failed.length ? 1 : 0;
