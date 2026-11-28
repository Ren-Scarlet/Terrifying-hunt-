import { ACHIEVEMENTS, achievementProgress, achievementUnlocked } from '../../game/achievements';
import { uiIcon } from '../../game/assetMap';
import type { SaveData } from '../../game/types';
import { escape } from './shared';

function rewardLabel(reward: { credits?: number; darkCells?: number }): string {
  const parts: string[] = [];
  if (reward.credits) parts.push(`血点 +${reward.credits}`);
  if (reward.darkCells) parts.push(`暗金细胞 +${reward.darkCells}`);
  return parts.join(' · ');
}

export function renderAchievements(save: SaveData): string {
  const unlockedCount = ACHIEVEMENTS.filter((def) => achievementUnlocked(save, def.id)).length;
  const cards = ACHIEVEMENTS.map((def) => {
    const unlocked = achievementUnlocked(save, def.id);
    const progress = achievementProgress(save, def);
    const percent = Math.min(100, Math.round((progress / def.target) * 100));
    const reward = def.reward ? rewardLabel(def.reward) : '';
    const iconKey = def.icon as Parameters<typeof uiIcon>[0];
    return `<article class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
      <span class="achievement-icon"><img src="${uiIcon(iconKey)}" alt="" aria-hidden="true" onerror="this.style.display='none'"></span>
      <div class="achievement-copy">
        <b>${escape(def.name)}${unlocked ? '<em>已解锁</em>' : ''}</b>
        <p>${escape(def.description)}</p>
        <div class="achievement-progress"><span style="width:${percent}%"></span><i>${Math.min(progress, def.target)}/${def.target}</i></div>
        ${reward ? `<small class="achievement-reward">${unlocked ? '已领取' : '奖励'}：${escape(reward)}</small>` : ''}
      </div>
    </article>`;
  }).join('');
  return `
    <div class="overlay">
      <div class="modal achievements-modal">
        <div class="subtitle">ACHIEVEMENTS</div>
        <h1>成就</h1>
        <p class="achievements-lead">已解锁 <b>${unlockedCount}</b> / ${ACHIEVEMENTS.length}。部分成就在解锁时会自动发放血点或暗金细胞。</p>
        <div class="achievement-grid">${cards}</div>
        <div class="actions">
          <button class="btn ghost" data-action="achievements-close">关闭</button>
        </div>
      </div>
    </div>
  `;
}
