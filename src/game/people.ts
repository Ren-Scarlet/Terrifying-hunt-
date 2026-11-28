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
  age?: number;
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

const OCCUPATIONS: Record<string, string> = {
  S01: '团队协调员', S02: '短跑运动员', S03: '植物学爱好者', S04: '野外生存者',
  S05: '涂鸦艺术家', S06: '学生', S07: '职业赌徒', S08: '退伍军人',
  S09: '职业电竞选手', S10: '橄榄球运动员', S11: '学生', S12: '警探',
  S13: '歌手', S14: '教师', S15: '平面设计师', S16: '电视主持人',
  S17: '机械师', S18: '学生记者', S19: '学生', S20: '拳击手',
  S21: '纪录片导演', S22: '灵异事件幸存者', S23: '建筑师', S24: '冒险者',
  S25: '音乐制作人', S26: '特种警员', S27: '警察新人', S28: '恐怖故事作家',
  S29: '数学研究者', S30: '灵异事件研究者', S31: '超自然调查员', S32: '特工',
  S33: '医疗兵', S34: '历史学者', S35: '舞者', S36: '舞者',
  S37: '士兵', S38: '演员', S39: '星际货船军官', S40: '作家',
  S41: '灵异仪式参与者', S42: '马戏团演员', S43: '考古学家', S44: '恶魔猎人',
  S45: '灵异研究者', S46: '医护人员', S47: '警长', S48: '剑士',
  S49: '住客', S50: '业余爱好者', S51: '实验体', S52: '游戏参与者',
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

  const tags = survivor.threat
    ? [THREAT_LABEL[survivor.threat], survivor.franchise ?? '知名角色']
    : ['住户', survivor.franchise ?? '普通住客'];
  const bio = [survivor.bio];
  if (survivor.threat) bio.push(THREAT_DESC[survivor.threat]);

  return {
    id,
    name: survivor.name,
    role,
    occupation: OCCUPATIONS[id] ?? '住户',
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
