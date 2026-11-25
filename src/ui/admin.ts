import { CARDS } from '../game/data/cards';
import { KILLERS } from '../game/data/killers';
import type { Op } from '../game/effect';
import { exportTuning, hasTuning } from '../game/tuning';
import { PERK_RARITY_BG, cardImage } from '../game/assetMap';

/**
 * ============================================================================
 *  平衡调整界面
 * ============================================================================
 *
 *  主菜单 →「平衡调整」打开。所有输入框的 data-tune 形如：
 *    card|卡牌id|cost            卡牌费用
 *    card|卡牌id|0.amount        第 1 条指令的 amount
 *    card|卡牌id|0.then.1.turns  条件分支里的第 2 条指令
 *    power|杀手|能力id|cooldown  能力冷却
 *  改动会写回运行中的数据表，下一局立刻生效，同时存进 localStorage。
 */

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const OP_LABEL: Record<string, string> = {
  damage: '伤害',
  down: '击倒',
  execute: '处决',
  kill: '即死',
  wanted: '通缉',
  wantedHalf: '通缉减半',
  alert: '警觉',
  block: '定身',
  pin: '钉住',
  move: '强制移动',
  teleportPlayer: '自己移动',
  lockRoom: '锁房间',
  scout: '侦查',
  search: '搜索',
  track: '追踪',
  lure: '制造噪声',
  alarm: '团队警戒',
  sabotage: '破坏设施',
  draw: '抽牌',
  energy: '能量',
  steps: '步数',
  stun: '玩家眩晕',
  evidence: '证据',
  discount: '费用减免',
  bonusDamage: '攻击加成',
  arrestThreshold: '逮捕阈值',
  reveal: '暴露',
  heal: '治疗',
  rescue: '救援',
  bleed: '流血',
  stalk: '尾随',
  silenceAlarm: '封锁报警',
  flag: '开关',
  log: '日志',
  if: '条件分支',
};

const WHO_OPTIONS = [
  ['victim', '当前目标'],
  ['lowestHpHere', '房间内血最少'],
  ['highestAlert', '全场最警觉'],
  ['targetsHere', '房间内所有目标'],
  ['civilsHere', '房间内所有平民'],
  ['allHere', '房间内所有人'],
  ['markedAny', '全场标记目标'],
  ['allAny', '全场所有人'],
  ['fleeing', '正在逃跑的人'],
  ['downedAny', '全场倒地的人'],
  ['injuredAny', '全场受伤的人'],
  ['randomAny', '全场随机一人'],
];

const DEST_OPTIONS = [
  ['here', '当前房间'],
  ['adjacent', '相邻房间'],
  ['far', '最远房间'],
  ['exit', '车库'],
  ['garden', '后院'],
  ['attic', '阁楼'],
  ['nursery', '儿童房'],
  ['bedroom', '卧室'],
  ['study', '书房'],
  ['storage', '储藏室'],
  ['hall', '大厅'],
  ['corridor', '走廊'],
  ['kitchen', '厨房'],
  ['basement', '地下室'],
  ['laundry', '洗衣房'],
  ['garage', '车库'],
];

const FLAG_OPTIONS = [
  ['phoneCut', '剪断电话'],
  ['wiretap', '窃听'],
  ['poltergeist', '灵异'],
  ['policeBlocked', '警察停步'],
  ['noAlarm', '目击无效'],
  ['exitBlocked', '封锁逃生点'],
  ['clearBarricade', '拆除堵门'],
  ['freeMove', '无视相邻'],
  ['possessReady', '附身就绪'],
];

const SABOTAGE_OPTIONS = [
  ['phone', '电话线'],
  ['radio', '无线电'],
  ['exit', '后院门'],
  ['lights', '电闸'],
];

type FieldType = 'num' | 'who' | 'dest' | 'flag' | 'sabotage' | 'text';

const OP_FIELDS: Record<string, Array<[string, FieldType]>> = {
  damage: [['who', 'who'], ['amount', 'num'], ['maxHp', 'num']],
  down: [['who', 'who']],
  execute: [['who', 'who']],
  kill: [['who', 'who']],
  wanted: [['amount', 'num']],
  wantedHalf: [],
  alert: [['who', 'who'], ['amount', 'num']],
  block: [['who', 'who'], ['turns', 'num']],
  pin: [['who', 'who']],
  move: [['who', 'who'], ['to', 'dest']],
  teleportPlayer: [['to', 'dest']],
  lockRoom: [['room', 'dest'], ['turns', 'num']],
  scout: [['to', 'dest'], ['turns', 'num']],
  search: [],
  track: [['who', 'who'], ['turns', 'num']],
  lure: [['to', 'dest'], ['count', 'num']],
  alarm: [['amount', 'num']],
  sabotage: [['key', 'sabotage']],
  draw: [['amount', 'num']],
  energy: [['amount', 'num']],
  steps: [['amount', 'num']],
  stun: [['amount', 'num']],
  evidence: [['amount', 'num']],
  discount: [['amount', 'num']],
  bonusDamage: [['amount', 'num']],
  arrestThreshold: [['amount', 'num']],
  reveal: [],
  heal: [['who', 'who'], ['amount', 'num']],
  rescue: [['who', 'who']],
  bleed: [['who', 'who'], ['amount', 'num']],
  stalk: [['amount', 'num']],
  silenceAlarm: [['turns', 'num']],
  flag: [['key', 'flag'], ['value', 'num']],
  log: [['text', 'text']],
  if: [],
};

function options(list: string[][], current: unknown): string {
  return list
    .map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function fieldHtml(op: Op, field: string, type: FieldType, tuneKey: string): string {
  const record = op as unknown as Record<string, unknown>;
  const value = record[field];
  if (type === 'text') {
    return `<span class="tune-text">${escape(String(value ?? ''))}</span>`;
  }
  if (type === 'who' || type === 'dest' || type === 'flag' || type === 'sabotage') {
    const list =
      type === 'who' ? WHO_OPTIONS : type === 'dest' ? DEST_OPTIONS : type === 'flag' ? FLAG_OPTIONS : SABOTAGE_OPTIONS;
    return `<select data-tune="${tuneKey}.${field}">${options(list, value)}</select>`;
  }
  // 没定义的字段留空，不要显示一个会误伤的 0（比如 maxHp: 0）
  return `<input type="number" step="1" min="0" max="30" data-tune="${tuneKey}.${field}"
    value="${typeof value === 'number' ? value : ''}" placeholder="—" aria-label="${field}">`;
}

function opRow(op: Op, tuneKey: string, depth = 0): string {
  const fields = OP_FIELDS[op.op] ?? [];
  const head = `<code class="tune-op-name">${OP_LABEL[op.op] ?? op.op}</code>`;
  const inputs = fields.map(([field, type]) => fieldHtml(op, field, type, tuneKey)).join('');
  const nested =
    op.op === 'if'
      ? `<div class="tune-nested">
          <span class="tune-cond">条件：${escape(JSON.stringify(op.cond))}</span>
          <div class="tune-branch"><em>满足</em>${op.then.map((o, i) => opRow(o, `${tuneKey}.then.${i}`, depth + 1)).join('')}</div>
          ${op.else?.length ? `<div class="tune-branch"><em>否则</em>${op.else.map((o, i) => opRow(o, `${tuneKey}.else.${i}`, depth + 1)).join('')}</div>` : ''}
        </div>`
      : '';
  return `<div class="tune-op" style="--depth:${depth}">${head}${inputs}</div>${nested}`;
}

function opsHtml(ops: Op[], prefix: string): string {
  if (!ops.length) return '<div class="tune-empty">没有指令</div>';
  return ops.map((op, i) => opRow(op, `${prefix}${i}`)).join('');
}

function cardBlock(): string {
  return CARDS.map((card) => {
    const img = cardImage(card.id);
    return `<div class="tune-card">
      <div class="tune-head">
        <span class="tune-perk">
          <img src="${PERK_RARITY_BG}" alt="" onerror="this.style.display='none'">
          ${img ? `<img class="tune-glyph" src="${img}" alt="" onerror="this.style.display='none'">` : ''}
        </span>
        <b>${escape(card.name)}</b>
        <label class="tune-cost">费 <input type="number" min="0" max="6" data-tune="card|${card.id}|cost" value="${card.cost}"></label>
      </div>
      <div class="tune-ops">${opsHtml(card.ops, `card|${card.id}|`)}</div>
      ${card.precheck ? `<div class="tune-pre">前置：${escape(card.precheck.hint)}</div>` : ''}
    </div>`;
  }).join('');
}

function powerBlock(): string {
  return KILLERS.map((killer) => {
    const powers = killer.powers
      .map(
        (power) => `<div class="tune-card">
          <div class="tune-head">
            <span class="tune-power-icon"><img src="${killer.icon}" alt="" onerror="this.style.display='none'"></span>
            <b>${escape(power.name)}</b>
            <label class="tune-cost">CD <input type="number" min="1" max="8" data-tune="power|${killer.owner}|${power.id}|cooldown" value="${power.cooldown}"></label>
            ${power.ultimate ? '<em class="tune-ult">大招</em>' : ''}
          </div>
          <div class="tune-ops">${opsHtml(power.ops, `power|${killer.owner}|${power.id}|`)}</div>
        </div>`,
      )
      .join('');
    return `<div class="tune-killer"><h3>${escape(killer.owner)} <small>${escape(killer.title)}</small></h3>
      <div class="tune-killer-powers">${powers}</div></div>`;
  }).join('');
}

export function renderAdmin(): string {
  return `
    <div class="overlay admin-overlay">
      <div class="modal admin-modal">
        <div class="subtitle">BALANCE WORKBENCH</div>
        <h1>平衡<span>调整</span></h1>
        <p class="admin-lead">直接改数字，改完立刻生效并存进这台机器的浏览器。改动写的是「卡牌费用、每条效果的数值、能力冷却」——想加新效果还是去 <code>src/game/data</code> 里写。</p>
        <div class="admin-toolbar">
          <span class="admin-state ${hasTuning() ? 'dirty' : ''}">${hasTuning() ? '正在使用本地改动' : '使用原始数值'}</span>
          <button class="btn mini" data-action="admin-export">导出数据</button>
          <button class="btn mini ghost" data-action="admin-reset">恢复默认</button>
          <button class="btn primary" data-action="admin-close">返回菜单</button>
        </div>
        <div class="admin-export" id="adminExport" hidden>
          <p>把下面这段发给我，就能固化进代码；也可以自己存成备份，下次用「导入」贴回来。</p>
          <textarea id="adminExportText" readonly rows="8">${escape(exportTuning())}</textarea>
          <div class="admin-export-actions">
            <button class="btn mini" data-action="admin-copy">复制</button>
            <button class="btn mini ghost" data-action="admin-hide-export">收起</button>
          </div>
        </div>
        <div class="admin-sections">
          <section>
            <h2>卡牌 <small>${CARDS.length} 张 · 费用与效果数值</small></h2>
            <div class="admin-grid">${cardBlock()}</div>
          </section>
          <section>
            <h2>杀手能力 <small>${KILLERS.length} 位 · 冷却与效果数值</small></h2>
            ${powerBlock()}
          </section>
        </div>
      </div>
    </div>
  `;
}
