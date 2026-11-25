# 夜猎档案 · Night Hunt Dossier

一款运行在浏览器里的**单人卡牌潜行游戏**。你不是逃脱者——你是那栋房子里不该存在的东西。接取契约，潜入一栋十个房间的宅子，布置现场、猎杀名单上的目标，然后在警察赶到之前撤离。

纯前端实现（Vite + TypeScript + 原生 DOM），无后端、无框架、无追踪，存档写在 `localStorage`。

## 快速开始

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # 类型检查 + 生产构建，输出到 dist/
npm run preview    # 预览构建产物
```

## 玩法

- **一局 8–11 回合**。每回合 3 点能量、2 步移动；回合结束弃掉手牌并重抽 5 张。
- **通缉值 0–10**。杀人、被目击都会让它上涨；警察和你同处一室且通缉值达到阈值（默认 4）就会被当场逮捕。
- **NPC 有目的，不是靶子。** 每个人开局就带着一个目的：打电话报警、从后院翻篱笆逃、躲进柜子、把人聚起来、找东西反抗。你一进门他们就会警觉，然后按目的行动——想跑的会真的跑到后院去，想打电话的会真的把警察叫来。
- **逃跑是真实的失败条件。** 站在后院的人撑过一个回合就会翻篱笆消失；逃走的人会扣分，跑够上限（默认 2 人）或名单目标全部脱岗，直接判负。
- **他们还会反击。** 警觉拉满的人会推柜子堵门，堵门的房间你要多花 1 步才能进（除非用「所向无敌」撞开）；杀人后尸体被发现，整栋房子的警觉跟着抬起来，恐慌会连锁。
- **五种任务**：清除名单（刺杀 N 名标记目标）、无声收割（击杀 N 人且通缉 ≤3）、证据销毁（收集证据后撤到车库）、秘密仪式（在指定房间连续结束回合）、替身游戏（杀 1 人后撤离）。
- **13 个杀手**，每人一个每回合可用的主力技 + 一个 3 回合冷却的大招。
- **29 张卡**；带商店与牌组构筑（10–15 张，同名最多 3 张）。

## 项目结构

```
src/
  main.ts                事件委托、屏幕切换、存档读写
  style.css              全部样式（深色单主题）
  game/
    types.ts             所有数据结构
    effect.ts            效果指令（DSL）的类型定义与说明书
    data/
      cards.ts           ★ 29 张卡牌 + 每张的效果程序（改卡牌改这里）
      killers.ts         ★ 13 个杀手 + 两个能力的效果程序（改能力改这里）
    cards.ts             转发 data/cards.ts
    killers.ts           转发 data/killers.ts
    engine.ts            规则结算 + 效果解释器 + NPC 行为（纯逻辑，可单测）
    ai 相关             —— 在 engine.ts 内的 npcTurn / pursueGoal / escapePhase
    rooms.ts             房间、邻接关系、平面图矩形、特殊房间
    missions.ts          任务生成
    survivors.ts         52 名逃生者与威胁类型
    people.ts            人物档案
    save.ts              存档校验与降级
    assetMap.ts          素材路径映射
  ui/render.ts           纯字符串模板渲染
  ui/scene.ts            平面图的程序化场景层（Canvas：材质 / 墙体 / 家具 / 光照）
scripts/
  import_dbd_assets.py   从图鉴站裁切技能图标 / 力量图标
```

## 自己改卡牌效果（不需要 AI）

卡牌和杀手能力的效果都是一串**指令**，写在 `src/game/data/cards.ts` 和 `src/game/data/killers.ts` 里，引擎负责逐条执行。改数字、加效果、加条件都在这两个文件里完成，存盘刷新就生效。

举个例子，现在「辣手屠夫」是：

```ts
{
  id: 'shuriken',
  name: '辣手屠夫',
  cost: 1,
  type: 'attack',
  desc: '对当前房间的一名目标造成 2 点伤害，并使其流血：之后每次回合结束再掉 1 点生命。',
  ops: [
    { op: 'damage', who: 'victim', amount: 2 },
    { op: 'bleed',  who: 'victim', amount: 1 },
  ],
}
```

想让它打 3 点、流血 2 点，就改 `amount`；想再加个效果，就往 `ops` 里再写一条：

```ts
  ops: [
    { op: 'damage', who: 'victim', amount: 3 },
    { op: 'bleed',  who: 'victim', amount: 2 },
    { op: 'wanted', amount: 1 },                 // 附带 +1 通缉
    { op: 'if', cond: { c: 'killsThisTurn', gte: 1 },
      then: [{ op: 'draw', amount: 1 }] },       // 本回合已杀过人则再抽一张
  ],
```

**可选对象（who）**：`victim`（当前房间最优先的一人）、`lowestHpHere`、`highestAlert`（全场）、`targetsHere`、`civilsHere`、`allHere`、`markedAny`、`allAny`、`fleeing`、`randomAny`。

**可用指令（op）**：`damage` / `kill` / `wanted` / `wantedHalf` / `alert` / `block` / `pin` / `move` / `teleportPlayer` / `lockRoom` / `draw` / `energy` / `steps` / `evidence` / `discount` / `bonusDamage` / `arrestThreshold` / `reveal` / `heal` / `bleed` / `stalk` / `silenceAlarm` / `flag` / `log` / `if`。

完整的字段说明、可用条件（cond）和全局开关（flag）都写在 **`src/game/effect.ts` 文件开头**。

**防止空放**：给卡加一个 `precheck`，条件不满足时既不扣能量也不弃牌：

```ts
  precheck: { cond: { c: 'victimHere', maxHp: 2 }, hint: '当前房间没有生命值不高于 2 的目标。' },
```

## 卡牌与图标对照

图标来自 [dbdwiki](https://dbdwiki.com/index.html) 的杀手技能精灵图，一卡一图标、互不重复。**卡名采用图鉴技能的官方中文名，和图标严格一一对应**；具体数值与结算效果为本作按这套规则重新设计的，不是照搬原作。

| 卡牌 id | 卡牌 | 费用 | 类型 | 原技能 |
| --- | --- | --- | --- | --- |
| `shuriken` | 辣手屠夫 | 1 | 攻击 | Sloppy Butcher |
| `choke` | 牢牢紧握 | 2 | 攻击 | Iron Grasp |
| `execute` | 恩赐解脱 | 3 | 攻击 | Coup de Grâce |
| `harvest` | 鲜血回响 | 2 | 攻击 | Blood Echo |
| `final_blow` | 优胜劣汰 | 1 | 攻击 | Cull the Weak |
| `break_in` | 所向无敌 | 1 | 技能 | Brutal Strength |
| `silent_step` | 静止隐身 | 1 | 技能 | Insidious |
| `sprint` | 疾速残暴 | 1 | 技能 | Rapid Brutality |
| `clean` | 折磨路径 | 1 | 技能 | Trail of Torment |
| `night_cover` | 黑暗启迪 | 0 | 技能 | Darkness Revealed |
| `silence` | 厄咒：猎手摇篮曲 | 1 | 技能 | Hex: Huntress Lullaby |
| `disguise` | 黑暗奉献 | 2 | 技能 | Dark Devotion |
| `intimidate` | 恐惧释放 | 2 | 技能 | Distressing |
| `fear` | 小丑恐惧症 | 2 | 技能 | Coulrophobia |
| `aim` | 猎鹿者 | 1 | 技能 | Deerstalker |
| `evacuate` | 血腥狱长 | 3 | 技能 | Blood Warden |
| `search` | 囤积者 | 1 | 技能 | Hoarder |
| `false_lead` | 鬼祟追杀 | 2 | 战术 | Furtive Chase |
| `lock_door` | 死锁 | 1 | 战术 | Deadlock |
| `bait` | 鬼鸦谍影 | 1 | 战术 | Spies from the Shadows |
| `mind_control` | 支配之力 | 2 | 战术 | Dominance |
| `cut_line` | 失效开关 | 1 | 布局 | Dead Man's Switch |
| `lure` | 人肉烧烤 | 1 | 布局 | Barbecue & Chilli |
| `wiretap` | 护士的呼唤 | 1 | 布局 | A Nurse's Calling |
| `poltergeist` | 厄咒：闹鬼之地 | 1 | 布局 | Hex: Haunted Ground |
| `blackout` | 厄咒：直面黑暗 | 2 | 布局 | Hex: Face the Darkness |
| `block_gate` | 花言巧语 | 2 | 布局 | Bamboozle |
| `ghost_light` | 致命追踪者 | 1 | 布局 | Lethal Pursuer |
| `false_report` | 厄咒：惩戒 | 2 | 布局 | Hex: Retribution |

图标文件名与卡牌 id 一一对应：`public/assets/dbd/perks/<id>.png`。重新生成（会打印上面这张表的实际命中结果）：

```bash
python scripts/import_dbd_assets.py    # 需要 Pillow
```

## 杀手与能力

每位杀手有两个主动能力，冷却分开计算：**主力技每回合可用**，**大招 3 回合一次**。能力效果同样写在 `data/killers.ts` 的 `ops` 里。

| 杀手 | 力量 | 主力技（CD 1） | 大招（CD 3） |
| --- | --- | --- | --- |
| 设陷者 | 捕兽夹 | 布设捕兽夹：封锁当前与相邻房间 2 回合 | 整层封锁：全场 NPC 2 回合无法移动 |
| 幽灵 | 骷髅丧钟 | 丧钟：无视相邻、不计步数、不惊动目击者 | 穿墙突袭：步数 +3、隐匿、下次攻击 +2 |
| 护士 | 斯宾塞的濒死之息 | 瞬步：步数 +2，移动不惊动 | 窒息之息：当前房间 3 伤并压制 |
| 女猎手 | 狩猎飞斧 | 投斧：跨房间对警觉最高者 2 伤 | 连投：3 伤 + 2 伤 |
| 鬼面 | 夜幕 | 夜幕潜行：通缉 -1，目击无效 | 夜袭：步数 +3、隐匿、攻击 +3 |
| 迈克尔·迈尔斯 | 恶魔附身 | 凝视：尾随 +30，房间警觉 -15 | 恶魔附身：尾随满 100 处决一人 |
| 贞子 | 怨灵 | 恐惧洪流：全场警觉 +12 并僵住 | 录像带：全场 2 伤并暴露 |
| 梦魇 | 梦魇之爪 | 入梦：警觉最高者定格 2 回合 | 梦魇降临：全场警觉 +25、1 伤、僵住 |
| 食人魔 | 电锯 | 电锯冲刺：步数 +2、攻击 +2、通缉 +1 | 狂锯：当前房间 4 伤，通缉 +3 |
| 处刑者 | 送葬者 | 审判之链：钉住当前房间所有人 | 处刑：击杀血量最低的一人 |
| 魔王 | 撕裂边界 | 裂隙穿行：瞬移到相邻房间且不惊动 | 群体撕裂：当前房间 3 伤并压制 |
| 医生 | 电击治疗 | 电击治疗：压制并抬警觉，通缉 +1 | 疯狂：3 回合内无人能报警 |
| 门徒 | 竖锯的洗礼 | 伏击：隐匿、步数 +1、攻击 +2 | 竖锯的洗礼：全场压制 2 回合并流血 |

立绘在 `public/assets/characters/killers/`（贞子 / 迈尔斯 / 食人魔 / 鬼面 / 门徒）。没有立绘的杀手会退回使用力量图标，两种都装在同一套边框里。

## 视觉与场景渲染

平面图不是一张背景图，而是叠在 DOM 房间下面的 Canvas 场景层（`src/ui/scene.ts`）。DOM 只保留房间名、人物头像和点击热区，`rooms.ts` 里的百分比矩形一个都没动，所以交互位置、碰撞和存档完全不受影响。

三层画布：

| 层 | 内容 | 重绘时机 |
| --- | --- | --- |
| `static` | 屋外院子、地面材质、家具、墙体、门窗、血迹 | 尺寸变化 / 有人死亡 / 房间被封锁 |
| `dark` | 全局压暗，再用 `destination-out` 逐光源打光洞 | 每帧（半分辨率） |
| `main` | 静态图 + 黑暗层 + 加色光 + 尘埃 | 每帧 |

几条刻意的取舍：

- **整栋房子当成一个实体画。** 地基阴影只投一次，房间之间的缝隙填成连续墙体，靠邻居的边扩到缝隙中线，朝屋外的边扩出墙厚。逐房间各投一次影，无论材质多细都会读成"十张漂浮的卡牌"。
- **门不挖洞。** 从墙体上 `destination-out` 挖洞会露出画布底层，颜色不可控；改成在整块墙上盖一条门洞地面 + 门框 + 门轴暗影，既稳定又更像真的门洞。斜对角的邻居（走廊↔地下室）墙上没有洞，只在走位上连通。
- **压暗层负责照明，加色层只负责色温。** 只靠加色光叠亮度会把暗场景冲成灰白；先用光源在黑暗层上"擦"出被照亮的区域，再加一点暖/冷的光色，对比度才留得住。
- **每间房有独立的材质、色调和环境光。** 大厅暖木 + 吊灯，厨房冷瓷砖 + 日光灯，地下室湿水泥 + 单只灯泡，卧室地毯只有月光。
- **UI 不描亮边。** 房间的 DOM 边框只保留极淡的一圈和悬停高亮；画在 Canvas 上的墙已经是实体，再描一圈亮边就又变回卡牌。

场景里没有位图素材，全部是 Canvas 程序化绘制（木地板、瓷砖、水泥、草地、50+ 种家具、血迹、雾与尘埃）。角色头像、卡牌图标、杀手立绘仍使用 `public/assets` 下已有的图片。

## 素材与声明

- 技能图标、力量图标、稀有度底框、52 张角色肖像、5 张杀手立绘来自公开图鉴站与用户提供的素材，仅用于个人同人项目；这些素材的版权归各自权利人所有，本项目不做商业用途。
- 卡牌数值、结算效果、NPC 行为、界面文案为本项目原创。
- 若要公开分发或商用，请替换为自制或已授权素材。

## 部署

`.github/workflows/deploy.yml` 会在推送到 `main` 时自动构建并发布到 GitHub Pages（`base: './'` 已配好，仓库子路径可直接访问）。首次使用需在仓库 Settings → Pages 把 Source 设为 GitHub Actions。
