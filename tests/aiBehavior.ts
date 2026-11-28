/**
 * 新决策核心的回归测试。
 *
 * 只测纯函数：能力表、恐惧对执行质量的影响、优先级、追逐体力。
 * 这一层还没有接管游戏，所以这里红了不会影响玩法，但说明新 AI 的规则漂了。
 */
import {
  BROKEN_FREEZE_CHANCE,
  CAPABILITIES,
  actionAllowed,
  decide,
  type ActionKind,
  type DecisionContext,
} from '../src/game/npc/ai/behavior';
import {
  CHASE,
  afterFlee,
  canFlee,
  createChaseState,
  tickChase,
} from '../src/game/npc/ai/chase';

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

function ctx(over: Partial<DecisionContext> = {}): DecisionContext {
  return {
    alert: 0,
    fear: 0,
    control: 'normal',
    sameRoomKiller: false,
    justAttacked: false,
    startled: false,
    chased: false,
    phoneHere: false,
    totemHere: false,
    allyDownedHere: false,
    allyInjuredHere: false,
    gateOpen: false,
    atExit: false,
    canHideHere: false,
    canBarricadeHere: false,
    chase: createChaseState(),
    ...over,
  };
}

/* ---------------- 能力表 ---------------- */

const order = ['unaware', 'suspicious', 'alert', 'panicked'] as const;
const monotonic = order.every((band, index) => {
  if (index === 0) return true;
  const prev = CAPABILITIES[order[index - 1]];
  return prev.every((action) => CAPABILITIES[band].includes(action));
});
check('能力表单调：高一档只多不少', monotonic);

check('未发觉不会主动逃', !CAPABILITIES.unaware.includes('flee'));
check('警觉才会报警/锁门/放板',
  CAPABILITIES.alert.includes('call') && CAPABILITIES.alert.includes('lock') && CAPABILITIES.alert.includes('barricade'));
check('怀疑就会拆图腾', CAPABILITIES.suspicious.includes('totem'));
check('慌乱才会喊人', !CAPABILITIES.alert.includes('shout') && CAPABILITIES.panicked.includes('shout'));

/* ---------------- 恐惧只调质量 ---------------- */

check('恐惧：锁门和放板失效',
  !actionAllowed('lock', 'afraid') && !actionAllowed('barricade', 'afraid'));
check('恐惧：逃跑仍然可用', actionAllowed('flee', 'afraid'));
check('崩溃：报警与躲藏也失效',
  !actionAllowed('call', 'broken') && !actionAllowed('hide', 'broken'));
check('冷静/不安不限制动作',
  actionAllowed('barricade', 'calm') && actionAllowed('barricade', 'uneasy'));

/* ---------------- 追逐体力 ---------------- */

const chase = createChaseState();
check('追逐：初始能逃', canFlee(chase));
let spent = chase;
for (let i = 0; i < CHASE.maxStamina; i += 1) spent = afterFlee(spent);
check('追逐：体力耗尽后必须喘', !canFlee(spent) && spent.stamina === 0 && spent.stagger > 0);
const rested = tickChase(spent);
check('追逐：喘一回合后恢复一次', canFlee(rested) && rested.stamina === 1);

/* ---------------- 决策优先级 ---------------- */

check('被控时什么都不做',
  decide(ctx({ control: 'downed', justAttacked: true })).kind === 'idle');

check('被攻击：慌乱会逃',
  decide(ctx({ alert: 100, justAttacked: true })).kind === 'flee');

check('被攻击但体力耗尽：原地（可以被追上）',
  decide(ctx({ alert: 100, justAttacked: true, chase: { stamina: 0, stagger: 1 } })).kind === 'idle');

const frozen = decide(ctx({ alert: 100, fear: 100, justAttacked: true }), () => BROKEN_FREEZE_CHANCE - 0.01);
check('崩溃时逃跑有概率原地不动', frozen.kind === 'idle' && frozen.reason === 'broken_freeze');
const notFrozen = decide(ctx({ alert: 100, fear: 100, justAttacked: true }), () => BROKEN_FREEZE_CHANCE + 0.01);
check('崩溃但不是每次都会卡住', notFrozen.kind === 'flee');

check('玩家贴脸：警觉以上先跑',
  decide(ctx({ alert: 50, sameRoomKiller: true })).kind === 'flee');
check('玩家贴脸且跑不了：躲柜子',
  decide(ctx({ alert: 50, sameRoomKiller: true, canHideHere: true, chase: { stamina: 0, stagger: 1 } })).kind === 'hide');
check('玩家贴脸且体力见底：仍然尝试夺门而出',
  decide(ctx({ alert: 50, sameRoomKiller: true, chase: { stamina: 0, stagger: 1 } })).kind === 'flee');

check('有人倒地：任何档位都会去救',
  decide(ctx({ alert: 0, allyDownedHere: true })).kind === 'rescue');
check('有人受伤：先治疗', decide(ctx({ alert: 0, allyInjuredHere: true })).kind === 'heal');

check('被追且能放板：先放板',
  decide(ctx({ alert: 50, chased: true, canBarricadeHere: true })).kind === 'barricade');
check('恐惧时放不了板：改为躲或逃',
  decide(ctx({ alert: 50, fear: 70, chased: true, canBarricadeHere: true })).kind !== 'barricade');

check('警觉以上在电话旁：报警',
  decide(ctx({ alert: 50, phoneHere: true })).kind === 'call');
check('怀疑在图腾旁：拆图腾',
  decide(ctx({ alert: 20, totemHere: true })).kind === 'totem');

check('站在逃生点且门开着：逃出去',
  decide(ctx({ alert: 50, gateOpen: true, atExit: true })).kind === 'escape');
check('慌乱且没事做：喊人',
  decide(ctx({ alert: 80 })).kind === 'shout');
check('未发觉：继续日常',
  decide(ctx({ alert: 0 })).kind === 'move');

console.log(`\n新决策 ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
