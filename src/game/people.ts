import {
  SURVIVOR_MAP,
  THREAT_DESC,
  THREAT_LABEL,
  survivorPortrait,
  type NpcThreat,
} from './survivors';
import type { PersonRole } from './types';

export interface PersonProfile {
  id: string;
  name: string;
  role: PersonRole;
  age: number;
  occupation: string;
  portrait?: string;
  tags: string[];
  bio: string[];
  habit: string;
  secret: string;
  franchise?: string;
  threat?: NpcThreat;
}

const POLICE_PROFILE: PersonProfile = {
  id: 'police-0',
  name: '巡逻警员',
  role: 'police',
  age: 37,
  occupation: '辖区巡警',
  portrait: 'assets/characters/portraits/S12_DavidTapp_Portrait.webp',
  tags: ['警觉', '守规矩', '追踪者'],
  bio: [
    '他在这片辖区巡逻了六年，记性很好。哪扇门该开着、哪扇门不该开着，他一眼就能看出来。',
    '他不太相信巧合。只要有两件不该同时发生的事出现在同一个晚上，他就会沿着那条路一直走下去。',
  ],
  habit: '每次进屋都先摸一次腰间的对讲机。',
  secret: '他申请调离这里三次，每次都被驳回。',
};

const fallbackProfile = (id: string): PersonProfile => ({
  id,
  name: '陌生住客',
  role: 'civilian',
  age: 30,
  occupation: '住户',
  tags: ['沉默'],
  bio: ['没人记得他是什么时候住进来的。'],
  habit: '从不摘下帽子。',
  secret: '他的房间号不在门牌上。',
});

/** 人物档案由角色库生成；知名角色会带上威胁说明与专属立绘。 */
export function getPersonProfile(id: string, role: PersonRole = 'civilian'): PersonProfile {
  if (id === 'police-0') return POLICE_PROFILE;
  const survivor = SURVIVOR_MAP[id];
  if (!survivor) return fallbackProfile(id);

  const serial = Number(id.slice(1)) || 0;
  const tags = survivor.threat
    ? [THREAT_LABEL[survivor.threat], survivor.franchise ?? '知名角色']
    : ['住户', survivor.franchise ?? '普通住客'];
  const bio = [survivor.bio];
  if (survivor.threat) bio.push(THREAT_DESC[survivor.threat]);

  return {
    id,
    name: survivor.name,
    role,
    age: 24 + (serial % 25),
    occupation: survivor.franchise ?? '住户',
    portrait: survivorPortrait(id),
    tags,
    bio,
    habit: survivor.threat === 'spiritual' ? '会低声重复别人还没说出口的话。' : '进屋前总要先看一眼窗户。',
    secret: survivor.threat
      ? `他的威胁类型：${THREAT_LABEL[survivor.threat]}。`
      : '他知道自己不该出现在这份名单上。',
    franchise: survivor.franchise,
    threat: survivor.threat,
  };
}
