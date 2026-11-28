/** 每种杀手的处决演出风格。文本表只写文字，动画样式固定在这里。 */
export const EXECUTION_MOTION: Record<string, string> = {
  '设陷者': 'trapper',
  '幽灵': 'wraith',
  '护士': 'nurse',
  '女猎手': 'huntress',
  '鬼面': 'ghostface',
  '迈克尔·迈尔斯': 'myers',
  '贞子': 'sadako',
  '梦魇': 'freddy',
  '食人魔': 'cannibal',
  '处刑者': 'executioner',
  '魔王': 'demon',
  '医生': 'doctor',
  '门徒': 'pig',
};

export function executionMotion(killer: string): string {
  return EXECUTION_MOTION[killer] ?? 'trapper';
}
