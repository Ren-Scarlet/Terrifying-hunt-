/**
 * 一条命令跑完所有验证：类型检查 + 界面状态 + 规则回归 + 整局冒烟。
 * 逻辑改动只需要跑这个，不要启动浏览器。
 *
 *   npm run check          几秒内跑完（8 局冒烟）
 *
 * 子进程输出写进临时文件，而不是走管道：受限环境（沙箱、部分 CI 容器）里
 * 管道型 stdio 会被拒绝（spawn EPERM），以前会让整条检查直接判失败。
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';

const OUT = '.cache/tests';
const LOG = `${OUT}/last-run.log`;
const env = { ...process.env };

mkdirSync(OUT, { recursive: true });

const results = [];
const t0 = Date.now();

function step(label, fn) {
  const started = Date.now();
  let ok = false;
  try {
    ok = fn() !== false;
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error));
  }
  results.push({ label, ok, ms: Date.now() - started });
  return ok;
}

/** 跑一个子进程，stdout/stderr 落到同一个日志文件，再按需回放。 */
function run(file, args) {
  const fd = openSync(LOG, 'w');
  try {
    const result = spawnSync(file, args, { env, stdio: ['ignore', fd, fd] });
    return { status: result.status, output: readFileSync(LOG, 'utf8').trimEnd() };
  } finally {
    closeSync(fd);
  }
}

/** 只在失败时把完整输出放出来；成功就只留最后几行。 */
function replay(result, tailLines = 4) {
  const ok = result.status === 0;
  if (!ok) {
    console.log(result.output || '(没有输出)');
  } else if (result.output) {
    const lines = result.output.split('\n');
    console.log(lines.slice(-tailLines).join('\n'));
  }
  return ok;
}

const tscOk = step('typecheck (src)', () => replay(run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']), 20));

if (tscOk) {
  console.log('打包测试…');
  const suites = [
    { entry: 'tests/ui.ts', out: `${OUT}/ui.mjs` },
    { entry: 'tests/world.ts', out: `${OUT}/world.mjs` },
    { entry: 'tests/npc.ts', out: `${OUT}/npc.mjs` },
    { entry: 'tests/aiModel.ts', out: `${OUT}/aimodel.mjs` },
    { entry: 'tests/aiBehavior.ts', out: `${OUT}/aibehavior.mjs` },
    { entry: 'tests/logic.ts', out: `${OUT}/logic.mjs` },
    { entry: 'tests/sim.ts', out: `${OUT}/sim.mjs` },
  ];

  const bundled = await Promise.all(suites.map(async (suite) => {
    try {
      await build({
        entryPoints: [suite.entry],
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node18',
        outfile: suite.out,
        logLevel: 'error',
      });
      return true;
    } catch (error) {
      console.log(`打包失败：${suite.entry}\n${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }));

  if (bundled.every(Boolean)) {
    step('界面状态', () => replay(run(process.execPath, [`${OUT}/ui.mjs`]), 3));
    step('世界查询', () => replay(run(process.execPath, [`${OUT}/world.mjs`]), 3));
    step('AI 判定', () => replay(run(process.execPath, [`${OUT}/npc.mjs`]), 3));
    step('新模型', () => replay(run(process.execPath, [`${OUT}/aimodel.mjs`]), 3));
    step('新决策', () => replay(run(process.execPath, [`${OUT}/aibehavior.mjs`]), 3));
    step('规则回归', () => replay(run(process.execPath, [`${OUT}/logic.mjs`]), 3));
    step('整局冒烟', () => replay(run(process.execPath, [`${OUT}/sim.mjs`]), 3));
  } else {
    results.push({ label: '打包测试', ok: false, ms: 0 });
  }
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + '─'.repeat(46));
for (const r of results) {
  console.log(`${r.ok ? '  ok  ' : ' FAIL '} ${r.label.padEnd(18, ' ')} ${r.ms}ms`);
}
console.log(`总计 ${((Date.now() - t0) / 1000).toFixed(1)}s ${failed.length ? `· ${failed.length} 项失败` : '· 全部通过'}`);
process.exitCode = failed.length ? 1 : 0;
