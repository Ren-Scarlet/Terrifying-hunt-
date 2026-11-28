/**
 * 生成一次处决演出：解析文本、递增序号、写入 state。
 * 所有处决入口（普通 / 地点 / QTE）都走这里，界面只消费 state.executionScene。
 */
import type { ExecutionScene, GameState, Person } from '../types';
import { executionMotion } from './motions';
import { resolveExecutionText } from './resolve';
import type { ExecutionKind } from './types';

export interface ExecutionSceneOptions {
  kind: ExecutionKind;
  victim: Person;
  siteId?: string;
  siteName?: string;
  success?: boolean;
}

export function createExecutionScene(state: GameState, options: ExecutionSceneOptions): ExecutionScene {
  const { kind, victim, siteId, siteName } = options;
  state.executionSceneSeq += 1;
  const text = resolveExecutionText({
    kind,
    killer: state.killer,
    victimId: victim.id,
    victimName: victim.name,
    siteId,
    siteName,
    room: state.playerRoom,
    success: options.success,
  });
  const scene: ExecutionScene = {
    seq: state.executionSceneSeq,
    kind,
    ...text,
    motion: executionMotion(state.killer),
    room: state.playerRoom,
    victimId: victim.id,
    siteId,
    success: options.success ?? true,
  };
  state.executionScene = scene;
  return scene;
}
