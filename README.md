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
- **NPC 会反应**。他们警觉、躲避、逃跑；知名角色还带专属威胁：报警者（通缉 +3 并报点）、领路人（带走同伴）、组队者（减伤）、灵异感知（无视隐匿）。
- **五种任务**：清除名单（刺杀 N 名标记目标）、无声收割（击杀 N 人且通缉 ≤3）、证据销毁（收集证据后撤到车库）、秘密仪式（在指定房间连续结束回合）、替身游戏（杀 1 人后撤离）。
- **12 个杀手**，每人一套原创机制（尾随值、封门设陷、穿墙、诅咒蔓延……），外加每回合一次的主动能力。
- **22 张卡 + 8 张布局卡，共 29 张**；带商店与牌组构筑（10–15 张，同名最多 3 张）。

## 项目结构

```
src/
  main.ts              事件委托、屏幕切换、存档读写
  style.css            全部样式（深色单主题）
  game/
    types.ts           所有数据结构
    cards.ts           29 张卡牌定义（含图标来源技能名）
    killers.ts         12 个杀手与原创机制文案
    rooms.ts           房间、邻接关系、平面图矩形、特殊房间
    missions.ts        任务生成
    survivors.ts       52 名逃生者与威胁类型
    people.ts          人物档案
    engine.ts          全部规则结算（纯函数，可直接单测）
    save.ts            存档校验与降级
    assetMap.ts        素材路径映射
  ui/render.ts         纯字符串模板渲染
  ui/scene.ts          平面图的程序化场景层（Canvas：材质 / 墙体 / 家具 / 光照）
scripts/
  import_dbd_assets.py 从图鉴站裁切技能图标 / 力量图标
  sync_to_repo.py      把工程同步进本地 git 克隆
```

规则全部收敛在 `engine.ts`，不碰 DOM；`render.ts` 只负责把状态拼成字符串。想加一张卡只需要两处：`cards.ts` 增一项，`engine.ts` 里补一个 `case`。

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

## 卡牌与图标对照

图标来自 [dbdwiki](https://dbdwiki.com/index.html) 的杀手技能精灵图，一卡一图标、互不重复；卡牌名称、数值与效果均为本项目原创，`sourceSkill` 只标注图标对应的原技能。

| 卡牌 id | 卡牌 | 费用 | 类型 | 原技能 | 所属杀手 |
| --- | --- | --- | --- | --- | --- |
| `shuriken` | 暗器投掷 | 1 | 攻击 | Sloppy Butcher | 通用 |
| `choke` | 窒息拥抱 | 2 | 攻击 | Iron Grasp | 通用 |
| `execute` | 灭口 | 3 | 攻击 | Coup de Grâce | The Twins |
| `harvest` | 连环收割 | 2 | 攻击 | Blood Echo | The Oni |
| `final_blow` | 最后一刀 | 1 | 攻击 | Cull the Weak | 通用 |
| `break_in` | 破窗而入 | 1 | 技能 | Brutal Strength | The Trapper |
| `silent_step` | 潜行 | 1 | 技能 | Insidious | 通用 |
| `sprint` | 疾行 | 1 | 技能 | Rapid Brutality | The Xenomorph |
| `clean` | 血迹清理 | 1 | 技能 | Trail of Torment | The Executioner |
| `night_cover` | 夜色掩护 | 0 | 技能 | Darkness Revealed | The Dredge |
| `silence` | 沉默是金 | 2 | 技能 | Hex: Huntress Lullaby | The Huntress |
| `disguise` | 换装 | 2 | 技能 | Dark Devotion | The Plague |
| `intimidate` | 精神压迫 | 2 | 技能 | Distressing | 通用 |
| `fear` | 恐惧蔓延 | 2 | 技能 | Coulrophobia | The Clown |
| `aim` | 致命精准 | 1 | 技能 | Deerstalker | 通用 |
| `evacuate` | 紧急撤离 | 3 | 技能 | Blood Warden | The Nightmare |
| `search` | 搜寻档案 | 1 | 技能 | Hoarder | The Twins |
| `false_lead` | 伪造线索 | 2 | 战术 | Furtive Chase | The Ghost Face |
| `lock_door` | 关门落锁 | 1 | 战术 | Deadlock | The Cenobite |
| `bait` | 诱饵 | 1 | 战术 | Spies from the Shadows | 通用 |
| `mind_control` | 心理操控 | 2 | 战术 | Dominance | The Dark Lord |
| `cut_line` | 剪断电话线 | 1 | 布局 | Dead Man's Switch | The Deathslinger |
| `lure` | 引开注意 | 1 | 布局 | Barbecue & Chilli | The Cannibal |
| `wiretap` | 安装窃听 | 1 | 布局 | A Nurse's Calling | The Nurse |
| `poltergeist` | 灵异事件 | 1 | 布局 | Hex: Haunted Ground | The Spirit |
| `blackout` | 拉闸断电 | 2 | 布局 | Hex: Face the Darkness | The Knight |
| `block_gate` | 封住后院 | 2 | 布局 | Bamboozle | The Clown |
| `ghost_light` | 鬼火引路 | 1 | 布局 | Lethal Pursuer | The Nemesis |
| `false_report` | 虚假报案 | 2 | 布局 | Hex: Retribution | The Deathslinger |

图标文件名与卡牌 id 一一对应：`public/assets/dbd/perks/<id>.png`。重新生成（会打印上面这张表的实际命中结果）：

```bash
python scripts/import_dbd_assets.py    # 需要 Pillow
```

## 杀手与力量

| 杀手 | 力量名 | 原创机制 |
| --- | --- | --- |
| 设陷者 | 捕兽夹 | 每回合首次移动封锁刚离开的房间 |
| 幽灵 | 骷髅丧钟 | 每回合首次移动无视相邻且不惊动目击者 |
| 护士 | 斯宾塞的濒死之息 | 基础步数 3 |
| 女猎手 | 狩猎飞斧 | 每回合首次攻击 +1 伤害 |
| 鬼面 | 夜幕 | 每回合首次目击不涨通缉，逮捕阈值 6 |
| 迈克尔·迈尔斯 | 恶魔附身 | 尾随值满后可处决同房间目标 |
| 贞子 | 怨灵 | 击杀后相邻房间目标额外掉 1 血 |
| 梦魇 | 梦魇之爪 | 首次移动后额外 +1 步 |
| 食人魔 | 电锯 | 首次攻击 +2 伤害，但通缉 +1 |
| 处刑者 | 送葬者 | 受伤存活者被钉住，无法逃离 |
| 魔王 | 撕裂边界 | 首次移动无视相邻且不触发目击 |
| 医生 | 电击治疗 | 首次目击不报警，但通缉 +1 |

## 素材与声明

- 技能图标、力量图标、稀有度底框、52 张角色肖像来自公开图鉴站与网络素材，仅用于个人同人项目；这些素材的版权归各自权利人所有，本项目不做商业用途。
- 卡牌名称、描述、数值、全部游戏机制与界面文案为本项目原创。
- 若要公开分发或商用，请替换为自制或已授权素材。

## 部署

`.github/workflows/deploy.yml` 会在推送到 `main` 时自动构建并发布到 GitHub Pages（`base: './'` 已配好，仓库子路径可直接访问）。首次使用需在仓库 Settings → Pages 把 Source 设为 GitHub Actions。
