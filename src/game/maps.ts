import { ROOM_MAP, ROOMS } from './rooms';
import { random } from './random';
import type { RoomId } from './types';

export type HuntingGroundId = 'midwich' | 'ormond' | 'badham' | 'asylum' | 'lampkin';

export interface HuntingGround {
  id: HuntingGroundId;
  name: string;
  file: string;
  layoutStyle: 'tall' | 'wide' | 'branching' | 'compact';
  description: string;
  ruleName: string;
  ruleDescription: string;
  rooms: Partial<Record<RoomId, { name: string; desc: string }>>;
}

const BASE_ROOMS = new Map(ROOMS.map((room) => [room.id, { name: room.name, desc: room.desc }]));

export const HUNTING_GROUNDS: HuntingGround[] = [
  {
    id: 'midwich',
    name: '米德维奇小学',
    file: '320px-IconMap_QuiLevel01.webp',
    layoutStyle: 'tall',
    description: '封闭的教学楼、漫长走廊与地下区域。铃声会让整栋学校重新活过来。',
    ruleName: '课间铃声',
    ruleDescription: '学校广播每隔数回合响起，走廊附近的幸存者会改变路线并向公共区域移动。',
    rooms: {
      attic: { name: '屋顶储藏间', desc: '屋顶斜梁下堆着旧课桌，脚步声会沿木板传到楼下。' },
      nursery: { name: '幼儿教室', desc: '小桌椅整齐得反常，柜子与课桌之间藏着狭窄的阴影。' },
      bedroom: { name: '教职员休息室', desc: '折叠床与私人储物柜挤在一起，像有人匆忙离开。' },
      bathroom: { name: '学生洗手间', desc: '水龙头滴答作响，隔间门后有不自然的呼吸声。' },
      study: { name: '教师办公室', desc: '点名册、学生档案与一部内部电话散落在桌上。' },
      dining: { name: '教职员食堂', desc: '餐盘还没收走，广播喇叭悬在天花板下。' },
      storage: { name: '体育器材室', desc: '球网、垫子和铁制器材挡住视线。' },
      hall: { name: '中央大厅', desc: '学校的交通枢纽，铃声和脚步会在这里层层回荡。' },
      corridor: { name: '教学走廊', desc: '长直走廊连接教室，尽头的安全灯忽明忽暗。' },
      conservatory: { name: '科学实验室', desc: '玻璃器皿碎了一地，化学药剂气味刺鼻。' },
      kitchen: { name: '配膳厨房', desc: '餐车、刀具和清洗池都还留着使用痕迹。' },
      basement: { name: '地下锅炉房', desc: '旧锅炉持续低鸣，热管道让这里闷得喘不过气。' },
      laundry: { name: '清洁间', desc: '拖把池和清洁车挤在狭小空间里。' },
      garage: { name: '校车车库', desc: '校车停在卷帘门后，钥匙似乎还插在控制台上。' },
      garden: { name: '操场', desc: '空荡荡的操场被围墙包围，远处传来金属撞击声。' },
      foyer: { name: '学校入口', desc: '访客登记台旁堆着未拆封的教学用品。' },
      library: { name: '学校图书馆', desc: '高书架形成狭窄通道，翻页声在空房间里格外清晰。' },
      wine: { name: '档案室', desc: '纸箱里塞满旧档案，最里面的柜子没有上锁。' },
      guestroom: { name: '辅导室', desc: '两张椅子面对面摆着，墙上挂着褪色的心理辅导海报。' },
      workshop: { name: '维修间', desc: '钳子、螺丝和电线散落在工作台上。' },
      stairwell: { name: '楼梯间', desc: '水泥楼梯向上下延伸，脚步声会被放大。' },
      chapel: { name: '礼堂', desc: '舞台帷幕半垂，成排座椅之间有许多遮挡。' },
      balcony: { name: '二层连廊', desc: '栏杆外能俯瞰一楼大厅，也容易暴露行踪。' },
    },
  },
  {
    id: 'ormond',
    name: '奥蒙德山度假村',
    file: '320px-IconMap_Wal_Level01.webp',
    layoutStyle: 'wide',
    description: '暴风雪包围山间木屋，室内温暖与室外严寒形成鲜明对比。',
    ruleName: '暴风雪',
    ruleDescription: '室外活动留下的踪迹更明显；暴风雪会短暂压低远距离视野。',
    rooms: {
      attic: { name: '阁楼客房', desc: '斜顶下堆着滑雪装备，积雪从屋檐缝隙渗进来。' },
      nursery: { name: '儿童游戏室', desc: '玩具散落在地毯上，窗外是被雪覆盖的树林。' },
      bedroom: { name: '度假卧室', desc: '厚重的羽绒被没有整理，暖气仍在工作。' },
      bathroom: { name: '温泉浴室', desc: '浴缸里残留温热的水汽，玻璃上凝着雾。' },
      study: { name: '前台办公室', desc: '登记簿和对讲机留在桌面，外线电话时断时续。' },
      dining: { name: '山庄餐厅', desc: '壁炉余烬尚未熄灭，餐桌旁堆着雪地靴。' },
      storage: { name: '滑雪器材库', desc: '雪板和登山绳挂满墙壁，入口被半融的雪水浸湿。' },
      hall: { name: '木屋大厅', desc: '壁炉、沙发和通往各翼的走廊构成山庄中心。' },
      corridor: { name: '客房走廊', desc: '木地板铺着厚地毯，窗外风雪撞击玻璃。' },
      conservatory: { name: '观景玻璃房', desc: '整面玻璃映出雪山，室内植物已经冻伤。' },
      kitchen: { name: '餐厅厨房', desc: '炉灶仍有余温，备用食材堆在冷藏柜旁。' },
      basement: { name: '供暖机房', desc: '锅炉和水泵维持着整栋山庄的暖气。' },
      laundry: { name: '洗衣房', desc: '湿透的毛巾和滑雪服堆在滚筒洗衣机旁。' },
      garage: { name: '雪地车库', desc: '雪地车停在半开的卷帘门内，发动机还留有余温。' },
      garden: { name: '雪地庭院', desc: '厚雪覆盖庭院，任何经过的人都会留下清晰脚印。' },
      foyer: { name: '山庄门厅', desc: '厚外套挂在木钩上，门外风雪几乎吞没台阶。' },
      library: { name: '休闲阅览室', desc: '书架和落地灯围出安静角落，窗边可以观察庭院。' },
      wine: { name: '酒窖', desc: '酒架深处有一扇通风小门，冷气从门缝渗出。' },
      guestroom: { name: '贵宾套房', desc: '行李箱敞开着，床头灯仍然亮着。' },
      workshop: { name: '维修工坊', desc: '工具和零件散在工作台上，墙边放着除雪机。' },
      stairwell: { name: '木楼梯', desc: '楼梯连接上下两层，湿靴子留下的水迹尚未干透。' },
      chapel: { name: '山间祈祷室', desc: '几排长椅对着结霜的窗户，烛火摇晃。' },
      balcony: { name: '观景露台', desc: '露台俯瞰整片雪坡，风雪中几乎无处躲藏。' },
    },
  },
  {
    id: 'badham',
    name: '巴德姆幼儿园',
    file: '320px-IconMap_Eng_Elmstreet.webp',
    layoutStyle: 'branching',
    description: '幼儿园与相邻住宅连成一片，地上活动区和地下通道交错。',
    ruleName: '地下通道',
    ruleDescription: '地下区域适合躲藏与绕行，但入口位置会成为争夺的关键。',
    rooms: {
      attic: { name: '阁楼储物间', desc: '旧玩具和纸箱堆在屋顶下，木板会暴露脚步。' },
      nursery: { name: '幼儿活动室', desc: '彩色地垫和小床散落各处，矮柜后能藏住一个人。' },
      bedroom: { name: '住宅卧室', desc: '床铺凌乱，衣柜门虚掩着。' },
      bathroom: { name: '儿童盥洗室', desc: '低矮洗手池和隔间形成许多视线死角。' },
      study: { name: '园长办公室', desc: '出勤表、钥匙和电话都留在桌上。' },
      dining: { name: '儿童餐厅', desc: '小餐桌上还有没收拾的餐具。' },
      storage: { name: '玩具仓库', desc: '大型玩具和纸箱堆成迷宫。' },
      hall: { name: '幼儿园大厅', desc: '接待区连接教室与后门，是地上区域的中心。' },
      corridor: { name: '教室走廊', desc: '墙面贴着褪色的儿童画，走廊尽头通往地下入口。' },
      conservatory: { name: '室内活动棚', desc: '塑料顶棚被风吹得作响，地面有泥水脚印。' },
      kitchen: { name: '配餐间', desc: '餐车和刀具收纳柜靠着墙面。' },
      basement: { name: '地下避难室', desc: '低矮管道横穿天花板，通风口连接着另一侧。' },
      laundry: { name: '洗衣间', desc: '烘干设备持续运转，噪声盖过轻微脚步。' },
      garage: { name: '住宅车库', desc: '车库门通向街道，工具柜旁堆着儿童自行车。' },
      garden: { name: '幼儿园操场', desc: '滑梯和秋千在风中摇晃，围栏外是住宅街。' },
      foyer: { name: '住宅门廊', desc: '鞋柜旁散落着儿童雨靴。' },
      library: { name: '绘本阅览室', desc: '矮书架围出狭窄通道，地毯吸收了大部分脚步声。' },
      wine: { name: '地下储藏间', desc: '旧家具挡住墙角，里面有通往管线区的检修口。' },
      guestroom: { name: '值班室', desc: '折叠床和监控屏幕都还开着。' },
      workshop: { name: '维修储物间', desc: '螺丝、木板和园艺工具散在地上。' },
      stairwell: { name: '地下楼梯', desc: '狭窄楼梯连接幼儿园与地下区域。' },
      chapel: { name: '社区活动室', desc: '长椅和折叠桌靠墙摆放，窗帘遮住外面的视线。' },
      balcony: { name: '二层平台', desc: '从这里可以观察操场和住宅后巷。' },
    },
  },
  {
    id: 'asylum',
    name: '精神病院',
    file: '320px-IconMap_Brl_MadHouse.webp',
    layoutStyle: 'compact',
    description: '封闭病区、治疗设施和地下设备层构成复杂的医疗建筑。',
    ruleName: '病区警报',
    ruleDescription: '异常声响会触发病区警报，使附近幸存者警觉并重新选择行动路线。',
    rooms: {
      attic: { name: '设备夹层', desc: '通风管道和旧床垫堆在一起，声音会沿管道传递。' },
      nursery: { name: '儿童病房', desc: '空病床排列整齐，床帘后方有狭窄藏身处。' },
      bedroom: { name: '住院病房', desc: '病床和药柜之间没有足够的遮挡。' },
      bathroom: { name: '病区浴室', desc: '浴帘后方传来滴水声，镜面布满裂纹。' },
      study: { name: '主治医师办公室', desc: '病例、药物记录和内部电话散落在桌面。' },
      dining: { name: '配餐大厅', desc: '餐车停在走道中央，墙上的时钟已经停摆。' },
      storage: { name: '医疗器械库', desc: '金属推车和器械柜挤满空间，碰撞会发出刺耳声音。' },
      hall: { name: '接待大厅', desc: '登记台和候诊座椅构成病院中心，警报能传遍各翼。' },
      corridor: { name: '病区长廊', desc: '长廊两侧都是病房，视线被转角和病床遮挡。' },
      conservatory: { name: '疗养温室', desc: '玻璃顶棚下摆着枯萎的植物，门锁已经损坏。' },
      kitchen: { name: '配膳厨房', desc: '餐具和医疗级消毒设备混在一起。' },
      basement: { name: '地下设备层', desc: '电缆、排水管与旧发电机发出持续低鸣。' },
      laundry: { name: '医疗洗衣房', desc: '大型洗衣机和消毒烘干柜仍在运转。' },
      garage: { name: '救护车库', desc: '救护车停在卷帘门后，担架没有收起。' },
      garden: { name: '封闭疗养庭院', desc: '高墙隔绝外界，长椅和枯树形成空旷视野。' },
      foyer: { name: '病院入口', desc: '自动门卡在半开位置，访客登记本被撕掉几页。' },
      library: { name: '病历档案室', desc: '档案柜高过头顶，纸张散落在狭窄过道里。' },
      wine: { name: '药品储藏室', desc: '冷藏柜与药品架并排，部分标签被刮掉。' },
      guestroom: { name: '隔离观察室', desc: '单向玻璃后面是一张固定病床。' },
      workshop: { name: '器械维修室', desc: '拆开的仪器和电线铺满工作台。' },
      stairwell: { name: '消防楼梯', desc: '铁质楼梯向下延伸，脚步声格外清脆。' },
      chapel: { name: '祈祷室', desc: '几排椅子面对着空荡的讲台，烛台已经冷却。' },
      balcony: { name: '病区连廊', desc: '连廊俯瞰庭院，栏杆后没有可以躲藏的地方。' },
    },
  },
  {
    id: 'lampkin',
    name: '兰普金街',
    file: '320px-IconMap_Sub_Street.webp',
    layoutStyle: 'wide',
    description: '万圣节夜晚的住宅街区，独栋住宅、车库与庭院组成猎场。',
    ruleName: '邻里警觉',
    ruleDescription: '住宅之间的异常会相互传播；街区幸存者可能向邻居求助或转移。',
    rooms: {
      attic: { name: '阁楼', desc: '旧家具和节日装饰挤在屋顶下，地板会放大脚步声。' },
      nursery: { name: '儿童卧室', desc: '床边摆着南瓜灯，窗帘没有完全拉上。' },
      bedroom: { name: '主卧室', desc: '床铺凌乱，衣柜半开，床头灯仍然亮着。' },
      bathroom: { name: '浴室', desc: '镜子上的水汽还没散，浴缸帘拉着。' },
      study: { name: '家庭书房', desc: '电话和家庭账簿放在桌上，窗外能看见邻居家的灯。' },
      dining: { name: '餐厅', desc: '晚餐还摆在桌上，椅子被匆忙推开。' },
      storage: { name: '车库储物间', desc: '园艺工具和节日装饰堆在角落。' },
      hall: { name: '主住宅客厅', desc: '沙发和楼梯围绕中央空间，前门外就是街道。' },
      corridor: { name: '住宅走廊', desc: '走廊连接卧室和后门，窗外偶尔掠过人影。' },
      conservatory: { name: '玻璃阳光房', desc: '花架和玻璃窗映出整条街的灯光。' },
      kitchen: { name: '家庭厨房', desc: '刀架和水槽都在手边，后门通向庭院。' },
      basement: { name: '地下室', desc: '旧锅炉和储物箱堆在墙边，楼梯通往客厅。' },
      laundry: { name: '洗衣房', desc: '洗衣机还在转，后窗通向狭窄小巷。' },
      garage: { name: '独立车库', desc: '汽车停在半开的车库门后，工具柜靠着墙。' },
      garden: { name: '后院', desc: '南瓜灯照亮篱笆和草坪，邻居家的窗户清晰可见。' },
      foyer: { name: '前门廊', desc: '门垫上堆着糖果包装，门外有万圣节装饰。' },
      library: { name: '家庭书房', desc: '书架挡住窗户，桌上摊开着一本旧相册。' },
      wine: { name: '地下储藏室', desc: '酒架与旧纸箱挤在一起，墙角有一扇小门。' },
      guestroom: { name: '客房', desc: '行李箱敞开，窗户正对邻居的车道。' },
      workshop: { name: '工具间', desc: '锤子、铁丝和生锈剪刀摊在工作台上。' },
      stairwell: { name: '楼梯间', desc: '木楼梯连接两层，任何急促脚步都会传到客厅。' },
      chapel: { name: '社区礼拜室', desc: '长椅和烛台整齐排列，后门通往小巷。' },
      balcony: { name: '前廊平台', desc: '站在这里可以观察整条住宅街，也容易被邻居看见。' },
    },
  },
];

export function getHuntingGround(id?: string): HuntingGround {
  return HUNTING_GROUNDS.find((ground) => ground.id === id) ?? HUNTING_GROUNDS[0];
}

export function rollHuntingGround(exclude?: HuntingGroundId): HuntingGround {
  const pool = HUNTING_GROUNDS.filter((ground) => ground.id !== exclude);
  return pool[Math.floor(random() * pool.length)] ?? HUNTING_GROUNDS[0];
}

/** 切换场地时先还原基础房间，再套用该场地的房间名称与环境描述。 */
export function applyHuntingGround(id: HuntingGroundId): void {
  const ground = getHuntingGround(id);
  for (const room of ROOMS) {
    const base = BASE_ROOMS.get(room.id);
    if (base) {
      room.name = base.name;
      room.desc = base.desc;
    }
    const themed = ground.rooms[room.id];
    if (themed) {
      room.name = themed.name;
      room.desc = themed.desc;
    }
  }
  // 防止配置漏项：所有地图仍必须保留可用的房间名称与描述。
  for (const room of ROOMS) {
    if (!room.name || !room.desc || !ROOM_MAP[room.id]) throw new Error(`场地配置缺少房间信息：${room.id}`);
  }
}
