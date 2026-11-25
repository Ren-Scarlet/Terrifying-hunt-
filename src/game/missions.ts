import { random } from './random';
import { ROOM_MAP } from './rooms';
import type { Mission, MissionKind, RoomId } from './types';

const pick = <T,>(arr: T[]): T => arr[Math.floor(random() * arr.length)];

/**
 * 任务生成。玩家一律靠「杀够人 / 杀掉关键人物再撤离 / 收齐证据撤离」取胜；
 * 没有「在房间里挂机数回合」这类白给任务。
 * 幸存者那边的压力另算：每逃一人扣分，人全跑光或团队目标做满，玩家直接输。
 */
export function generateMission(unlockedKinds: MissionKind[] = [
  'assassinate',
  'bodyCount',
  'evidence',
  'escape',
]): Mission {
  const kind = pick(unlockedKinds);

  switch (kind) {
    case 'assassinate': {
      const count = random() < 0.5 ? 2 : 3;
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: `清除名单 · ${count} 人`,
        desc: `猎杀 ${count} 名标记目标，然后一路撤回车库撤离。名单上的人一旦翻出后院，契约立刻作废；光砍完不算完成，必须活着走出去。`,
        turns: 20 + count,
        reward: 100 + count * 20,
        targetCount: count,
        objective: `击杀 ${count} 名标记目标，并抵达车库撤离`,
        successText: `名单 ${count}/${count} + 人在车库`,
        failText: `超时 · 标记目标逃走 · 幸存者全逃 · 暴露度满（被捕 / 被驱散）`,
      };
    }
    case 'bodyCount': {
      const count = 3 + Math.floor(random() * 2);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: `无声收割 · ${count} 人`,
        desc: `累计击杀 ${count} 人即可完成契约。每逃走一个人都会扣分，人全跑光了契约照样作废。`,
        turns: 22,
        reward: 120,
        targetCount: count,
        objective: `累计击杀 ${count} 人`,
        successText: `击杀 ${count}/${count}`,
        failText: `超时 · 幸存者全逃 · 暴露度满（被捕 / 被驱散）`,
      };
    }
    case 'evidence': {
      const count = 2 + Math.floor(random() * 2);
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: `证据销毁 · ${count} 份`,
        desc: `用「囤积者」收集 ${count} 份证据，然后前往车库撤离。证据没齐就走，等于白来一趟。`,
        turns: 22,
        reward: 140,
        targetCount: count,
        objective: `收集 ${count} 份证据，并抵达车库撤离`,
        successText: `证据 ${count}/${count} + 人在车库`,
        failText: `超时 · 幸存者全逃 · 暴露度满（被捕 / 被驱散）`,
      };
    }
    case 'escape': {
      return {
        id: `mission-${Date.now()}`,
        kind,
        title: '替身游戏',
        desc: '击杀 1 名标记目标，并在警察赶到前移动到车库撤离。目标跑掉、或者你被堵在屋里，都算失败。',
        turns: 20,
        reward: 160,
        targetCount: 1,
        objective: '击杀 1 名标记目标，并抵达车库撤离',
        successText: '标记目标死亡 + 人在车库',
        failText: '超时 · 标记目标逃走 · 幸存者全逃 · 暴露度满（被捕 / 被驱散）',
      };
    }
  }
}

export function roomName(id: RoomId): string {
  // 直接用房间表里的名字，避免改地图时忘记同步这里
  return ROOM_MAP[id]?.name ?? id;
}
