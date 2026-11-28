/**
 * 幸存者头顶的短对白：按警戒/恐惧档位、受伤与当前行为挑一句。
 *
 * 纯表现层：只读状态、只写 person.dialogue，不参与任何判定。
 * 同一名幸存者不会连续两次说同一句话。
 */
import { SURVIVOR_INJURED_HP } from '../../constants';
import { randomOf } from '../../random';
import type { GameState, Person } from '../../types';
import { npcPeople as npcs } from '../../world/roomState';
import { alertBand, fearBand } from './model';

const daily = [
  '今晚吃什么？', '这里还挺安静的。', '等会儿要不要看电影？', '我有点饿了。',
  '你听说最近的新消息了吗？', '忙完就去休息吧。', '灯怎么又闪了一下？',
  '我刚才好像听见楼上有人。', '等会儿一起去厨房吧。', '这地方闻起来像潮湿的地下室。',
  '谁把窗户打开了？', '我总觉得这栋房子在看着我们。', '电话线是不是有点问题？',
];
const suspicious = [
  '嗯？刚才是什么动静？', '你听见了吗？', '是不是有什么东西掉了？',
  '奇怪……我去看看。', '刚刚那扇门是不是自己动了？', '我不喜欢这里突然安静下来。',
  '先别走远，我总觉得有人。', '这地板刚才是不是响了一声？', '谁在那边？',
];
const alarmed = [
  '这里好像不太对劲。', '我们最好待在一起。', '刚才那声音是从哪边来的？',
  '快去看看其他人怎么样了。', '电话怎么打不通？', '别碰开关，我听见里面有声音。',
  '我们应该换条路走。', '喂？听得到吗？这里出事了！', '把门关上，快！',
  '我数到三，我们一起跑。',
];
const fleeing = [
  '救命！他在追我！', '快跑！别回头！', '该死！离我远点！', '有人吗？救救我！',
  '他就在后面！', '别往那边去！', '我看见他了——快关门！', '分头跑！不，别分开！',
  '不要停，跑！', '楼梯！往楼梯跑！',
];
const terrified = [
  '别过来……别过来……', '我不想死……我不想死……', '求求你，放过我……',
  '我什么都看不见了……', '呼吸……我喘不上气……', '让我出去……让我出去……',
];
const injured = [
  '好痛……谁来帮帮我。', '我流血了……', '别把我一个人留在这里。',
  '腿……我的腿动不了了。', '我不想死在这里。', '谁有医疗箱？',
  '我还能走……我能走……', '扶我一下，就一下。',
];
const hiding = ['别出声……', '我刚才好像听见了什么。', '拜托，快点离开……', '他应该没看见我。'];
const hidingScared = ['别让他发现我……', '别出声，他就在附近……', '我得找机会逃出去……', '呼吸轻一点……'];

const lastLines = new WeakMap<GameState, Map<string, string>>();

function pickFresh(pool: string[], last?: string): string {
  const candidates = last && pool.length > 1 ? pool.filter((line) => line !== last) : pool;
  return randomOf(candidates);
}

export function updateNpcDialogue(state: GameState): void {
  let history = lastLines.get(state);
  if (!history) { history = new Map(); lastLines.set(state, history); }
  for (const person of npcs(state)) {
    const band = alertBand(person.alert);
    const fear = fearBand(person.fear);
    let pool: string[];
    if (person.hp <= 0) pool = ['……', '救……命……', '我动不了了……'];
    else if (fear === 'broken') pool = terrified;
    else if (person.hidden) pool = band === 'panicked' || band === 'alert' ? hidingScared : hiding;
    else if (person.hp <= SURVIVOR_INJURED_HP) pool = injured;
    else if (band === 'panicked') pool = fleeing;
    else if (band === 'alert') pool = alarmed;
    else if (band === 'suspicious') pool = suspicious;
    else pool = daily;
    person.dialogue = pickFresh(pool, history.get(person.id));
    history.set(person.id, person.dialogue);
  }
}
