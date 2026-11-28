/**
 * 幸存者道具：只有三件，全部由道具箱发放。
 *
 * 修理箱：修复被杀手砸坏的区域电闸与电话。
 * 手电筒：照晕玩家；玩家挥刀或搬运倒地者时，附近的携带者会冲过来打断。
 * 医疗箱：治疗自己，或加速治疗其他幸存者（一次回复 2 点）。
 */
import type { SurvivorItem } from './types';

export const SURVIVOR_ITEM_LABEL: Record<SurvivorItem, string> = {
  repair: '修理箱',
  flashlight: '手电筒',
  medkit: '医疗箱',
};

export const SURVIVOR_ITEM_DESC: Record<SurvivorItem, string> = {
  repair: '修复被杀手破坏的电闸或电话',
  flashlight: '照晕杀手，打断挥刀或搬运',
  medkit: '治疗自己，或加速治疗同伴',
};

export const SURVIVOR_ITEM_USES: Record<SurvivorItem, number> = {
  repair: 2,
  flashlight: 2,
  medkit: 2,
};

export const ITEM_BOX_CHARGES = 1;
export const ITEM_BOX_COUNT = 2;

export const SURVIVOR_ITEMS: SurvivorItem[] = ['repair', 'flashlight', 'medkit'];
