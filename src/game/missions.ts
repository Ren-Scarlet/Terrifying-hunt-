import { random, shuffle } from './random';
import { ROOM_MAP } from './rooms';
import type { Mission, MissionKind, MissionTask, RoomId } from './types';

const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];

function killerBonusTask(killer: string): MissionTask | null {
  if (killer === '迈克尔·迈尔斯') return { id: 'bonus-myers-stalk', kind: 'killer_stat', metric: 'myers_stalk', label: '额外挑战：尾随 3 名不同幸存者', target: 3, reward: 55, optional: true };
  if (killer === '设陷者') return { id: 'bonus-trap-trigger', kind: 'killer_stat', metric: 'trap_triggers', label: '额外挑战：让 2 名人类踩中捕兽夹', target: 2, reward: 55, optional: true };
  if (killer === '护士') return { id: 'bonus-nurse-blink-attack', kind: 'killer_stat', metric: 'nurse_blink_attacks', label: '额外挑战：闪现后用普通攻击命中 1 名幸存者', target: 1, reward: 60, optional: true };
  if (killer === '女猎手') return { id: 'bonus-huntress-hatchet', kind: 'killer_stat', metric: 'hatchet_hits', label: '额外挑战：用飞斧命中 2 名幸存者', target: 2, reward: 55, optional: true };
  return null;
}

interface ContractDefinition {
  kind: MissionKind;
  title: string;
  desc: string;
  objective: string;
  successText: string;
  reward: number;
  targetCount: number;
  tasks: MissionTask[];
}

function contractDefinitions(): ContractDefinition[] {
  return [
    {
      kind: 'assassinate',
      title: '血色清单',
      desc: '名单上的目标必须死。目标位置会变化，别让他逃出猎场。',
      objective: '击杀 1 名名单指定目标。',
      successText: '击杀名单指定目标即可完成主契约。',
      reward: 165,
      targetCount: 1,
      tasks: [{ id: 'primary-marked-target', kind: 'marked_kill', label: '主目标：击杀名单指定目标', target: 1, reward: 0 }],
    },
    {
      kind: 'bodyCount',
      title: '无声收割',
      desc: '不指定猎物。你必须在警察控制现场前完成足够数量的猎杀。',
      objective: '击杀任意 4 名幸存者。',
      successText: '累计击杀 4 名幸存者即可完成主契约。',
      reward: 170,
      targetCount: 0,
      tasks: [{ id: 'primary-body-count', kind: 'kill_count', label: '主目标：击杀任意 4 名幸存者', target: 4, reward: 0 }],
    },
    {
      kind: 'execution',
      title: '行刑名单',
      desc: '把猎物打倒只是开始。你必须亲自完成两次处决。',
      objective: '完成 2 次处决。',
      successText: '累计完成 2 次处决即可完成主契约；普通处决、地点处决与分数处决均计入。',
      reward: 175,
      targetCount: 0,
      tasks: [{ id: 'primary-executions', kind: 'execute', label: '主目标：完成 2 次处决', target: 2, reward: 0 }],
    },
    {
      kind: 'sabotage',
      title: '断电协议',
      desc: '先破坏区域电闸，再趁混乱猎杀。没有名单目标，现场设施就是你的目标。',
      objective: '破坏 2 个区域电闸，并击杀 2 名幸存者。',
      successText: '同时完成两项主目标即可完成主契约。',
      reward: 185,
      targetCount: 0,
      tasks: [
        { id: 'primary-breakers', kind: 'break_circuit', label: '主目标：破坏 2 个区域电闸', target: 2, reward: 0 },
        { id: 'primary-sabotage-kills', kind: 'kill_count', label: '主目标：击杀 2 名幸存者', target: 2, reward: 0 },
      ],
    },
    {
      kind: 'silent',
      title: '无声证词',
      desc: '名单上的目标必须死，而且不能让幸存者成功报警。',
      objective: '击杀 1 名名单指定目标，并阻止幸存者成功报警。',
      successText: '击杀名单指定目标，同时确保本局没有幸存者成功报警。',
      reward: 185,
      targetCount: 1,
      tasks: [
        { id: 'primary-silent-target', kind: 'marked_kill', label: '主目标：击杀名单指定目标', target: 1, reward: 0 },
        { id: 'primary-no-alarm', kind: 'no_alarm', label: '主目标：阻止幸存者成功报警', target: 1, reward: 0 },
      ],
    },
    {
      kind: 'scoreExecution',
      title: '血点献祭',
      desc: '先累积足够的猎杀评分，再对倒地目标发动分数处决。',
      objective: '累积至少 200 分，并完成 1 次分数处决。',
      successText: '达到 200 分后，点击倒地幸存者头顶的「分数处决」按钮并完成 QTE。',
      reward: 180,
      targetCount: 0,
      tasks: [
        { id: 'primary-score-threshold', kind: 'score_threshold', label: '主目标：猎杀评分达到 200', target: 200, reward: 0 },
        { id: 'primary-score-execution', kind: 'score_execute', label: '主目标：完成 1 次分数处决', target: 1, reward: 0 },
        { id: 'primary-score-kills', kind: 'kill_count', label: '主目标：至少击杀 2 名幸存者', target: 2, reward: 0 },
      ],
    },
  ];
}

function optionalTasks(killer: string, required: MissionTask[]): MissionTask[] {
  const requiredKinds = new Set(required.map((task) => task.kind));
  const bonusPool: MissionTask[] = [
    { id: 'bonus-kill-five', kind: 'kill_count', label: '高难挑战：击杀 5 名人类', target: 5, reward: 75, optional: true },
    { id: 'bonus-execution-three', kind: 'execute', label: '额外挑战：完成 3 次处决', target: 3, reward: 50, optional: true },
    { id: 'bonus-special-execution', kind: 'special_execute', label: '高难挑战：完成 1 次地点处决', target: 1, reward: 65, optional: true },
    { id: 'bonus-score-execution', kind: 'score_execute', label: '高难挑战：完成 1 次分数处决', target: 1, reward: 65, optional: true },
    { id: 'bonus-low-alarm', kind: 'alarm_below', label: '高难挑战：结束时警报不超过 35', target: 1, limit: 35, reward: 60, optional: true },
    { id: 'bonus-no-alarm', kind: 'no_alarm', label: '额外挑战：全程阻止幸存者成功报警', target: 1, reward: 45, optional: true },
  ];
  const available = bonusPool.filter((task) => !requiredKinds.has(task.kind));
  const selected = shuffle(available).slice(0, 2);
  const killerTask = killerBonusTask(killer);
  if (killerTask && !requiredKinds.has(killerTask.kind)) selected.push(killerTask);
  return selected;
}

/** 契约只在玩家点击「准备开始」时随机生成；不会先展示任务供玩家针对性改牌。
 *  kind 可选：测试与「指定契约」入口用，传了就只在该类型里选。 */
export function generateMission(killer = '迈克尔·迈尔斯', kind?: MissionKind): Mission {
  const pool = contractDefinitions();
  const definition = (kind ? pool.find((item) => item.kind === kind) : undefined) ?? pick(pool);
  const tasks = [...definition.tasks, ...optionalTasks(killer, definition.tasks)];
  return {
    id: `contract-${Date.now()}-${Math.floor(random() * 100000)}`,
    mode: 'contract',
    kind: definition.kind,
    title: definition.title,
    desc: definition.desc,
    turns: 20,
    reward: definition.reward,
    targetCount: definition.targetCount,
    tasks,
    objective: definition.objective,
    successText: definition.successText,
    failText: '指定目标逃离、所有幸存者逃离、杀手被击败，或达到回合上限时仍未完成全部主目标。',
  };
}

/**
 * 加注：在契约上追加一个高难目标。
 * 达成时契约分 +60%，未达成时结算扣 50%——风险与收益都由玩家自己选。
 */
export function withAnte(mission: Mission): Mission {
  if (mission.mode === 'free') return mission;
  const anteTask: MissionTask = {
    id: 'ante-target',
    kind: 'kill_count',
    label: '加注目标：累计击杀 6 名幸存者',
    target: 6,
    reward: 0,
    optional: true,
  };
  return { ...mission, ante: true, tasks: [...(mission.tasks ?? []), anteTask] };
}

export function generateFreeHunt(): Mission {
  return {
    id: `free-hunt-${Date.now()}`,
    mode: 'free',
    kind: 'bodyCount',
    title: '自由猎杀',
    desc: '没有指定猎物，也没有强制任务。选择自己的猎杀目标与方式，随时可以结束本局。',
    turns: 99,
    reward: 0,
    targetCount: 0,
    objective: '自主选择猎物与猎杀方式；地图、环境和幸存者都由你决定如何利用。',
    successText: '由你决定何时结束猎杀；自主挑战仅用于记录本局表现。',
    failText: '被击败或所有幸存者逃离仍会结束猎杀。',
    tasks: [
      { id: 'free-kills', kind: 'kill_count', label: '猎杀任意幸存者', target: 3, optional: true, reward: 0 },
      { id: 'free-executions', kind: 'execute', label: '完成处决', target: 2, optional: true, reward: 0 },
      { id: 'free-signature', kind: 'score_execute', label: '尝试分数处决', target: 1, optional: true, reward: 0 },
    ],
  };
}

export function roomName(id: RoomId): string {
  return ROOM_MAP[id]?.name ?? id;
}
