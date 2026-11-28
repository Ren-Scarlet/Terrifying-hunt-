/**
 * 幸存者头顶的短对白：按新的警戒/恐惧档位挑一句。
 *
 * 纯表现层：只读状态、只写 person.dialogue，不参与任何判定。
 * 不再读取旧的 awareness 与性格：对白只跟"他现在多警戒、多害怕"有关。
 */
import { SURVIVOR_INJURED_HP } from '../../constants';
import { randomOf } from '../../random';
import type { GameState, Person } from '../../types';
import { npcPeople as npcs } from '../../world/roomState';
import { alertBand, fearBand } from './model';

export function updateNpcDialogue(state: GameState): void {
  const daily = ['今晚吃什么？', '这里还挺安静的。', '等会儿要不要看电影？', '我有点饿了。', '你听说最近的新消息了吗？', '忙完就去休息吧。', '灯怎么又闪了一下？', '我刚才好像听见楼上有人。', '等会儿一起去厨房吧。', '这地方闻起来像潮湿的地下室。'];
  const suspicious = ['嗯？刚才是什么动静？', '你听见了吗？', '是不是有什么东西掉了？', '奇怪……我去看看。', '刚刚那扇门是不是自己动了？', '我不喜欢这里突然安静下来。', '先别走远，我总觉得有人。'];
  const alarmed = ['这里好像不太对劲。', '我们最好待在一起。', '刚才那声音是从哪边来的？', '快去看看其他人怎么样了。', '电话怎么打不通？', '别碰开关，我听见里面有声音。', '我们应该换条路走。', '喂？听得到吗？这里出事了！'];
  const fleeing = ['救命！他在追我！', '快跑！别回头！', '该死！离我远点！', '有人吗？救救我！', '他就在后面！', '别往那边去！', '我看见他了——快关门！', '分头跑！不，别分开！'];
  const terrified = ['别过来……别过来……', '我不想死……我不想死……', '求求你，放过我……', '我什么都看不见了……', '呼吸……我喘不上气……'];
  const injured = ['好痛……谁来帮帮我。', '我流血了……', '别把我一个人留在这里。', '腿……我的腿动不了了。', '我不想死在这里。'];
  const hiding = ['别出声……', '我刚才好像听见了什么。', '拜托，快点离开……'];
  const hidingScared = ['别让他发现我……', '别出声，他就在附近……', '我得找机会逃出去……'];

  for (const person of npcs(state)) {
    const band = alertBand(person.alert);
    const fear = fearBand(person.fear);

    if (person.hp <= 0) {
      person.dialogue = randomOf(['……', '救……命……', '我动不了了……']);
    } else if (fear === 'broken') {
      person.dialogue = randomOf(terrified);
    } else if (person.hidden) {
      person.dialogue = randomOf(band === 'panicked' || band === 'alert' ? hidingScared : hiding);
    } else if (band === 'panicked') {
      person.dialogue = person.hp <= SURVIVOR_INJURED_HP ? randomOf(injured) : randomOf(fleeing);
    } else if (band === 'alert') {
      person.dialogue = randomOf(alarmed);
    } else if (band === 'suspicious') {
      person.dialogue = randomOf(suspicious);
    } else {
      person.dialogue = randomOf(daily);
    }
  }
}
