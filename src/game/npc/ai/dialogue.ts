/**
 * 幸存者头顶的短对白：按当前警戒档和意图挑一句。
 *
 * 纯表现层：只读状态、只写 person.dialogue，不参与任何判定。
 */
import { SURVIVOR_INJURED_HP } from '../../constants';
import { randomOf } from '../../random';
import type { GameState, Person } from '../../types';
import { npcPeople as npcs } from '../../world/roomState';
import { awarenessStage } from '../awareness';
export function updateNpcDialogue(state: GameState): void {
  const daily = ['今晚吃什么？', '这里还挺安静的。', '等会儿要不要看电影？', '我有点饿了。', '你听说最近的新消息了吗？', '忙完就去休息吧。', '灯怎么又闪了一下？', '我刚才好像听见楼上有人。', '等会儿一起去厨房吧。', '这地方闻起来像潮湿的地下室。'];
  const suspicious = ['嗯？刚才是什么动静？', '你听见了吗？', '是不是有什么东西掉了？', '奇怪……我去看看。', '刚刚那扇门是不是自己动了？', '我不喜欢这里突然安静下来。', '先别走远，我总觉得有人。'];
  const alarmed = ['这里好像不太对劲。', '我们最好待在一起。', '刚才那声音是从哪边来的？', '快去看看其他人怎么样了。', '电话怎么打不通？', '别碰开关，我听见里面有声音。', '我们应该换条路走。'];
  const fleeing = ['救命！他在追我！', '快跑！别回头！', '该死！离我远点！', '有人吗？救救我！', '他就在后面！', '别往那边去！', '我看见他了——快关门！', '分头跑！不，别分开！'];
  const injured = ['好痛……谁来帮帮我。', '我流血了……', '别把我一个人留在这里。', '腿……我的腿动不了了。', '我不想死在这里。'];
  for (const person of npcs(state)) {
    const stage = awarenessStage(person.alert);
    // awareness 记录已确认的危险知识；对白只读取当前 alert 分档，不得反向清空记忆。
    if (person.hp <= 0) {
      person.dialogue = randomOf(['……', '救……命……', '我动不了了……']);
    } else if ((person.intent === 'flee' || person.intent === 'escape') && stage >= 2) {
      person.dialogue = person.hp <= SURVIVOR_INJURED_HP ? randomOf(injured) : randomOf(fleeing);
    } else if (person.intent === 'call' && stage >= 1) {
      person.dialogue = randomOf(['喂？听得到吗？这里出事了！', '快接电话！求求你们快接！', '我需要帮助！', '有人在屋里！请马上派人来！', '线路断了？该死，换无线电！']);
    } else if (person.intent === 'hide' || person.hidden) {
      person.dialogue = randomOf(stage >= 2 ? ['别让他发现我……', '别出声，他就在附近……', '我得找机会逃出去……'] : ['别出声……', '我刚才好像听见了什么。', '拜托，快点离开……']);
    } else if (stage === 3) {
      const archetypeLines: Partial<Record<Person['archetype'], string[]>> = {
        alert: ['别停下来！他就在后面！', '出口在哪？我得马上离开！'],
        defiant: ['把门顶住！我来挡住他！', '别让他靠近，我手里有东西！'],
        caller: ['快接啊！求你们快接！', '我已经报警了，警察很快就到！'],
        rescuer: ['先把伤员带走！我不会丢下他们！', '撑住，我马上回来救你！'],
        hider: ['不……不要看这里……', '只要不出声，他就找不到我。'],
        brave: ['都到我身后！别让他把我们分开！', '我们一起上，也许能拦住他！'],
        kiter: ['绕开他！别走直线！', '我知道另一条路，跟上我！'],
      };
      const lines = archetypeLines[person.archetype] ?? [];
      person.dialogue = randomOf([...lines, '他就在附近！', '别分开，快找个安全的地方！', '我们得想办法离开这里！']);
    } else if (stage === 2) {
      person.dialogue = randomOf(alarmed);
    } else if (stage === 1) {
      person.dialogue = randomOf(suspicious);
    } else {
      person.dialogue = randomOf(daily);
    }
  }
}
