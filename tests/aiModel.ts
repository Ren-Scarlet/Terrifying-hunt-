/**
 * 新幸存者模型（警戒 × 恐惧）的回归测试。
 *
 * 这一层还没有接管游戏，先把数值规则钉死：
 * 之后新 AI 接管时，只要这里不红，就说明"档位/事件/衰减"没有被改坏。
 */
import {
  AI_TUNING,
  alertBand,
  applyAlertEvent,
  applyFearEvent,
  canDropAlertBand,
  decayAlert,
  decayFear,
  fearBand,
  isSafe,
} from '../src/game/npc/ai/model';
import type { Mind } from '../src/game/npc/ai/model';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

const mind = (alert = 0, fear = 0): Mind => ({ alert, fear });

/* ---------------- 档位边界 ---------------- */

const t = AI_TUNING.alertThresholds;
check('警戒 0–11：未发觉', alertBand(0) === 'unaware' && alertBand(t.suspicious - 1) === 'unaware');
check('警戒 12–39：怀疑', alertBand(t.suspicious) === 'suspicious' && alertBand(t.alert - 1) === 'suspicious');
check('警戒 40–74：警觉', alertBand(t.alert) === 'alert' && alertBand(t.panicked - 1) === 'alert');
check('警戒 75–100：慌乱', alertBand(t.panicked) === 'panicked' && alertBand(100) === 'panicked');

const f = AI_TUNING.fearThresholds;
check('恐惧 0–29：冷静', fearBand(0) === 'calm' && fearBand(f.uneasy - 1) === 'calm');
check('恐惧 30–59：不安', fearBand(f.uneasy) === 'uneasy' && fearBand(f.afraid - 1) === 'uneasy');
check('恐惧 60–84：恐惧', fearBand(f.afraid) === 'afraid' && fearBand(f.broken - 1) === 'afraid');
check('恐惧 85+：崩溃', fearBand(f.broken) === 'broken' && fearBand(100) === 'broken');

/* ---------------- 迟滞 ---------------- */

check('慌乱：跌到 62 以下才允许掉档',
  !canDropAlertBand('panicked', t.panicked - AI_TUNING.alertHysteresis.panicked)
  && canDropAlertBand('panicked', t.panicked - AI_TUNING.alertHysteresis.panicked - 1));
check('警觉：跌到 32 以下才允许掉档',
  !canDropAlertBand('alert', 32) && canDropAlertBand('alert', 31));

/* ---------------- 警戒事件 ---------------- */

const hurt = mind();
check('被攻击：直接拉满并进入慌乱', applyAlertEvent(hurt, 'attacked') === 'panicked' && hurt.alert === 100);

const corpse = mind(0, 0);
check('看见尸体：至少到警觉', applyAlertEvent(corpse, 'see_corpse') === 'alert' && corpse.alert === 40);
check('看见尸体不会顺带加恐惧（两套数值独立）', corpse.fear === 0);

const killed = mind(20, 0);
check('目击杀害：至少到慌乱', applyAlertEvent(killed, 'witness_kill') === 'panicked' && killed.alert === 75);
check('目击杀害不会自动改恐惧', killed.fear === 0);

const noise = mind();
applyAlertEvent(noise, 'noise_adjacent', 2);
check('倍率作用于增量：6 × 2 = 12 → 怀疑', noise.alert === 12 && alertBand(noise.alert) === 'suspicious');

const enter = mind(50, 0);
applyAlertEvent(enter, 'player_enters');
check('进门只抬下限，不压低更高警戒', enter.alert === 72, `alert=${enter.alert}`);

/* ---------------- 恐惧事件 ---------------- */

const scared = mind(0, 0);
check('被攻击的恐惧事件：+30 → 不安', applyFearEvent(scared, 'attacked') === 'uneasy' && scared.fear === 30);
check('恐惧事件不会改警戒', scared.alert === 0);

const negative = mind(0, 5);
applyFearEvent(negative, 'safe');
check('恐惧不会低于 0', negative.fear === 0);

/* ---------------- 衰减 ---------------- */

const safeDecay = mind(50, 0);
decayAlert(safeDecay, true);
check('安全时警戒 −15', safeDecay.alert === 35, `alert=${safeDecay.alert}`);

const unsafeDecay = mind(50, 0);
decayAlert(unsafeDecay, false);
check('不安全时警戒 −8', unsafeDecay.alert === 42, `alert=${unsafeDecay.alert}`);

const panicDecay = mind(100, 0);
decayAlert(panicDecay, true);
check('慌乱档衰减减半：−7', panicDecay.alert === 93, `alert=${panicDecay.alert}`);

const fearSafe = mind(0, 50);
decayFear(fearSafe, true);
check('安全时恐惧 −10', fearSafe.fear === 40);

const fearUnsafe = mind(0, 50);
decayFear(fearUnsafe, false);
check('不安全时恐惧不下降', fearUnsafe.fear === 50);

const fearBroken = mind(0, 100);
decayFear(fearBroken, true);
check('崩溃档衰减更快：−18', fearBroken.fear === 82);

/* ---------------- 安全判定 ---------------- */

check('安全 = 距离 ≥2 且未被追且有光',
  isSafe({ distance: 2, chased: false, lit: true })
  && !isSafe({ distance: 1, chased: false, lit: true })
  && !isSafe({ distance: 3, chased: true, lit: true })
  && !isSafe({ distance: 3, chased: false, lit: false }));

console.log(`\n新模型 ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
