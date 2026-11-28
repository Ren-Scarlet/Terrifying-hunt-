import type { RoomId } from '../types';

export type ExecutionKind = 'normal' | 'special' | 'qte';
export type ExecutionWhen = 'success' | 'fail';

/** CSV 中的一条处决文本；每个字段都可以单独填，未填的字段回退到低优先级条目。 */
export interface ExecutionTextEntry {
  id: string;
  kind: ExecutionKind | 'any';
  site?: string;
  killer?: string;
  victim?: string;
  /** 只在 QTE 成功 / 失败时使用；留空表示两种结果通用。 */
  when?: ExecutionWhen;
  weight?: number;
  title?: string;
  line?: string;
  description?: string;
}

export interface ExecutionContext {
  kind: ExecutionKind;
  killer: string;
  victimId: string;
  victimName: string;
  siteId?: string;
  siteName?: string;
  room: RoomId;
  /** QTE 结果；其他处决类型不传。 */
  success?: boolean;
}

export interface ResolvedExecutionText {
  title: string;
  line: string;
  description: string;
}
