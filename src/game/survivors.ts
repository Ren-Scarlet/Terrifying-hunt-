/**
 * 逃生者角色库。立绘来自用户提供的 52 张角色肖像。
 * 知名角色标记为 special，并赋予会真正影响玩法的威胁行为。
 */

export type NpcThreat = 'alarm' | 'lead' | 'team' | 'spiritual';

export interface Survivor {
  id: string;
  name: string;
  en: string;
  franchise?: string;
  threat?: NpcThreat;
  bio: string;
}

const portrait = (id: string) => `assets/characters/portraits/${id}_Portrait.webp`;

export const SURVIVORS: Survivor[] = [
  { id: 'S01', name: '德怀特·费尔菲尔德', en: 'Dwight Fairfield', bio: '总在找人组队，却总是最后一个知道发生了什么。' },
  { id: 'S02', name: '梅格·托马斯', en: 'Meg Thomas', bio: '短跑选手，习惯用速度解决一切问题。' },
  { id: 'S03', name: '克洛黛特·莫雷尔', en: 'Claudette Morel', bio: '懂草药，也懂如何让别人闭嘴。' },
  { id: 'S04', name: '朴杰克', en: 'Jake Park', bio: '沉默的徒步者，能在任何地方睡著。' },
  { id: 'S05', name: '妮娅·卡尔松', en: 'Nea Karlsson', bio: '墙上涂鸦的签名比她的名字更出名。' },
  { id: 'S06', name: '劳丽·斯特罗德', en: 'Laurie Strode', franchise: '月光光心慌慌', threat: 'alarm', bio: '她已经幸存过一次，绝不会再毫无准备地被抓到。' },
  { id: 'S07', name: '埃斯·维斯康蒂', en: 'Ace Visconti', bio: '赌徒，把每一次逃生都当作最后一注。' },
  { id: 'S08', name: '比尔·奥弗贝克', en: 'Bill Overbeck', bio: '老兵，习惯在撤退前点数还活着的人。' },
  { id: 'S09', name: '冯敏', en: 'Feng Min', bio: '职业选手，对地图的记忆比对自己房间更熟。' },
  { id: 'S10', name: '大卫·金', en: 'David King', bio: '橄榄球员，撞开过比这更重的门。' },
  { id: 'S11', name: '昆汀·史密斯', en: 'Quentin Smith', bio: '在梦里见过这栋房子，醒来后背脊发凉。' },
  { id: 'S12', name: '大卫·塔普', en: 'David Tapp', franchise: '电锯惊魂', threat: 'alarm', bio: '老练的警探。他一旦确认你的存在，整条街都会听见警笛。' },
  { id: 'S13', name: '凯特·登森', en: 'Kate Denson', bio: '歌手，习惯用声音填满沉默。' },
  { id: 'S14', name: '亚当·弗朗西斯', en: 'Adam Francis', bio: '教师，总是最后一个离开教室的人。' },
  { id: 'S15', name: '杰夫·约翰森', en: 'Jeff Johansen', bio: '他在寻找失踪的姐姐，不会轻易离开线索。' },
  { id: 'S16', name: '简·罗梅罗', en: 'Jane Romero', bio: '名人，知道自己被看见时的价值。' },
  { id: 'S17', name: '阿什·威廉姆斯', en: 'Ash Williams', franchise: '鬼玩人', threat: 'team', bio: '他见过书、见过恶魔，也见过比这更糟的夜晚。他会组织活人反击。' },
  { id: 'S18', name: '南希·惠勒', en: 'Nancy Wheeler', franchise: '怪奇物语', threat: 'team', bio: '她从不接受“反正没人会相信”这种说法。' },
  { id: 'S19', name: '史蒂夫·哈灵顿', en: 'Steve Harrington', franchise: '怪奇物语', threat: 'lead', bio: '他总能把一群孩子带出险境，即使自己满身是伤。' },
  { id: 'S20', name: '木村由衣', en: 'Yui Kimura', bio: '拳击手，习惯正面面对恐惧。' },
  { id: 'S21', name: '扎里娜·卡西尔', en: 'Zarina Kassir', bio: '移民律师，相信每个人都能拿到第二次机会。' },
  { id: 'S22', name: '雪莉·梅森', en: 'Cheryl Mason', franchise: '寂静岭', threat: 'spiritual', bio: '她走过的雾里，藏着别人看不见的东西。' },
  { id: 'S23', name: '费利克斯·里希特', en: 'Felix Richter', bio: '建筑师，对每一扇门的位置都记得很清楚。' },
  { id: 'S24', name: '埃洛迪·拉科托', en: 'Elodie Rakoto', bio: '她带着一把旧斧头，也带着一整个家族的秘密。' },
  { id: 'S25', name: '李允珍', en: 'Yun-Jin Lee', franchise: '娱乐公司', threat: 'alarm', bio: '她知道该打给谁，也知道该让谁闭嘴。' },
  { id: 'S26', name: '吉尔·瓦伦丁', en: 'Jill Valentine', franchise: '生化危机', threat: 'team', bio: 'S.T.A.R.S. 成员。她会迅速组织起一支临时小队。' },
  { id: 'S27', name: '里昂·S·肯尼迪', en: 'Leon Scott Kennedy', franchise: '生化危机', threat: 'team', bio: '新员工，但手里的枪从来不是装饰。' },
  { id: 'S28', name: '米凯拉·里德', en: 'Mikaela Reid', bio: '写恐怖故事的人，最怕自己写过的情节成真。' },
  { id: 'S29', name: '乔纳·巴斯克斯', en: 'Jonah Vasquez', bio: '他的数学能算出最安全的路线。' },
  { id: 'S30', name: '浅川阳一', en: 'Yoichi Asakawa', franchise: '午夜凶铃', threat: 'spiritual', bio: '他研究过那盘录像带，知道灵异的痕迹无法用常识解释。' },
  { id: 'S31', name: '哈迪·考尔', en: 'Haddie Kaur', bio: '她记录过太多“不可能发生”的事。' },
  { id: 'S32', name: '艾达·王', en: 'Ada Wong', franchise: '生化危机', threat: 'team', bio: '她从不为别人冒险，除非那正好也是她的任务。' },
  { id: 'S33', name: '丽贝卡·查姆伯斯', en: 'Rebecca Chambers', franchise: '生化危机', threat: 'team', bio: '医疗兵，总能用人最少的资源救回最多的人。' },
  { id: 'S34', name: '维托里奥·托斯卡诺', en: 'Vittorio Toscano', bio: '他带着祖传的护身符，从不解释它有什么用。' },
  { id: 'S35', name: '塔莉塔·莱拉', en: 'Thalita Lyra', bio: '舞者，脚步比多数人安静。' },
  { id: 'S36', name: '雷纳托·莱拉', en: 'Renato Lyra', bio: '她的兄弟，永远跟在她身后半步。' },
  { id: 'S37', name: '加布里埃尔·索马', en: 'Gabriel Soma', bio: '士兵，服从命令，但只服从自己认得的命令。' },
  { id: 'S38', name: '尼古拉斯·凯奇', en: 'Nicolas Cage', franchise: '影视明星', threat: 'lead', bio: '他自己也不清楚为什么会出现在这里，但镜头感一直很好。' },
  { id: 'S39', name: '艾伦·雷普利', en: 'Ellen Ripley', franchise: '异形', threat: 'lead', bio: '她从不抛下任何人，也从不相信“已经安全了”。' },
  { id: 'S40', name: '艾伦·韦克', en: 'Alan Wake', franchise: '心灵杀手', threat: 'spiritual', bio: '他写下的句子会变成现实，包括那些最坏的句子。' },
  { id: 'S41', name: '塞布尔·沃德', en: 'Sable Ward', franchise: '灵异', threat: 'spiritual', bio: '她在地下室摆过一场仪式，有些东西跟着她走了出来。' },
  { id: 'S42', name: '剧团', en: 'The Troupe', franchise: '马戏团', threat: 'team', bio: '他们一起行动，一起欢呼，一起消失。' },
  { id: 'S43', name: '劳拉·克劳馥', en: 'Lara Croft', franchise: '古墓丽影', threat: 'lead', bio: '她能凭一支火把走出任何迷宫。' },
  { id: 'S44', name: '特雷弗·贝尔蒙特', en: 'Trevor Belmont', franchise: '恶魔城', threat: 'team', bio: '他带着鞭子和圣水，对“鬼怪”这件事很有经验。' },
  { id: 'S45', name: '托里·凯恩', en: 'Taurie Cain', franchise: '灵异', threat: 'spiritual', bio: '她能听见墙里的低语，并低声回答。' },
  { id: 'S46', name: '奥雷拉·罗斯', en: 'Orela Rose', bio: '她相信善意能改变任何结局，包括这个。' },
  { id: 'S47', name: '瑞克·格莱姆斯', en: 'Rick Grimes', franchise: '行尸走肉', threat: 'team', bio: '他会先清点人数，再决定要不要开门。' },
  { id: 'S48', name: '米琼恩·格莱姆斯', en: 'Michonne Grimes', franchise: '行尸走肉', threat: 'team', bio: '她不需要说话就能让一屋子人安静下来。' },
  { id: 'S49', name: '薇·布尼亚萨克', en: 'Vee Boonyasak', bio: '她把每一道门都当作可以谈判的对象。' },
  { id: 'S50', name: '达斯汀·亨德森', en: 'Dustin Henderson', franchise: '怪奇物语', threat: 'team', bio: '他造的电台能接通任何不该被接通的频率。' },
  { id: 'S51', name: '十一', en: 'Eleven', franchise: '怪奇物语', threat: 'spiritual', bio: '她能听见别人的声音，也能让门自己关上。' },
  { id: 'S52', name: '权泰英', en: 'Kwon Tae-young', franchise: '鱿鱼游戏', threat: 'team', bio: '他习惯在混乱里数清还有多少人站着。' },
];

export const SURVIVOR_MAP: Record<string, Survivor> = SURVIVORS.reduce(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {} as Record<string, Survivor>,
);

export const SPECIAL_SURVIVORS = SURVIVORS.filter((s) => s.threat);

export const THREAT_LABEL: Record<NpcThreat, string> = {
  alarm: '报警者',
  lead: '领路人',
  team: '组队者',
  spiritual: '灵异感知',
};

export const THREAT_DESC: Record<NpcThreat, string> = {
  alarm: '目击你时通缉值 +3，并直接把警察引到现场。',
  lead: '每回合带一名同伴逃向更远的房间。',
  team: '同房间的同伴受其保护，受到的攻击伤害 -1。',
  spiritual: '能看穿潜行与夜幕，你的无声机制对她无效。',
};

export const survivorPortrait = (id: string) => portrait(id);
