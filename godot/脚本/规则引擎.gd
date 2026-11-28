extends RefCounted
class_name HuntGame

const CARD_DATA := [
	{"id":"恐惧气息","name":"恐惧气息","cost":1,"kind":"fear","value":22,"desc":"当前房间幸存者恐惧 +22"},
	{"id":"迅捷步伐","name":"迅捷步伐","cost":0,"kind":"ap","value":1,"desc":"本回合行动点 +1"},
	{"id":"血腥威慑","name":"血腥威慑","cost":2,"kind":"alarm","value":-8,"desc":"警报 -8"},
	{"id":"猎物标记","name":"猎物标记","cost":1,"kind":"mark","value":1,"desc":"标记当前房间的一名幸存者"}
]
const ROOM_DATA := [
	{"id":"foyer","name":"入口大厅","links":[1,4],"desc":"门厅寂静，空气里有潮湿的灰尘味。"},
	{"id":"corridor","name":"主走廊","links":[0,2,5],"desc":"灯光忽明忽暗，墙纸大片剥落。"},
	{"id":"dining","name":"餐厅","links":[1,3,6],"desc":"餐桌仍摆着没有动过的晚餐。"},
	{"id":"kitchen","name":"厨房","links":[2,7],"desc":"刀具与锅具整齐得不自然。"},
	{"id":"study","name":"办公室","links":[0,5,8],"desc":"电话、文件与一盏台灯。"},
	{"id":"bedroom","name":"卧室","links":[1,4,6,9],"desc":"衣柜门半开，床底有拖动痕迹。"},
	{"id":"bathroom","name":"洗手间","links":[2,5,7,10],"desc":"水龙头滴水声在瓷砖间回响。"},
	{"id":"storage","name":"储藏室","links":[3,6,11],"desc":"货架之间堆着清洁用品。"},
	{"id":"chapel","name":"祈祷室","links":[4,9,12],"desc":"几排长椅面向蒙尘的祭台。"},
	{"id":"basement","name":"地下室","links":[5,8,10,13],"desc":"管道深处传来低沉的震动。"},
	{"id":"garage","name":"车库","links":[6,9,11,14],"desc":"一辆旧车停在卷帘门下。"},
	{"id":"garden","name":"后院","links":[7,10,15],"desc":"高草随夜风轻轻摆动。"},
	{"id":"attic","name":"阁楼","links":[8,13],"desc":"木梁发出细微的吱呀声。"},
	{"id":"laundry","name":"洗衣房","links":[9,12,14],"desc":"洗衣机里残留着一件染血的衬衣。"},
	{"id":"workshop","name":"维修间","links":[10,13,15],"desc":"工具墙上缺了一把锤子。"},
	{"id":"yard","name":"庭院出口","links":[11,14],"desc":"围栏之外是一条通往公路的小路。"}
]
const NAMES := ["林澄","周野","顾宁","许知夏","陈默","沈遥","唐可","陆川"]
const CONTRACTS := [
	{"title":"血色清单","description":"击杀名单目标 1 名","goal":1,"type":"target"},
	{"title":"无声收割","description":"击杀任意 4 名幸存者","goal":4,"type":"kills"},
	{"title":"行刑名单","description":"完成 2 次处决","goal":2,"type":"executions"}
]

var rooms: Array[Dictionary] = []
var survivors: Array[Dictionary] = []
var player_room := 0
var turn := 1
var ap := 4
var max_ap := 4
var alarm := 12
var score := 0
var kills := 0
var executions := 0
var hand: Array[Dictionary] = []
var deck: Array[Dictionary] = []
var logs: Array[String] = []
var contract: Dictionary = {}
var finished := false

func _init() -> void:
	start_run(false)

func start_run(free_hunt: bool = false) -> void:
	rooms = ROOM_DATA.duplicate(true)
	survivors.clear()
	for i in range(8):
		survivors.append({"id":i,"name":NAMES[i],"room":(i*2+1)%15,"hp":4,"fear":randi_range(0,20),"alert":randi_range(0,25),"downed":false,"dead":false,"marked":false,"personality":i%4})
	player_room = 0
	turn = 1
	ap = 4
	max_ap = 4
	alarm = 12
	score = 0
	kills = 0
	executions = 0
	finished = false
	contract = {"title":"自由猎杀","description":"没有强制目标，尽情狩猎","goal":999,"type":"free"} if free_hunt else CONTRACTS.pick_random().duplicate(true)
	deck = CARD_DATA.duplicate(true)
	deck.shuffle()
	hand.clear()
	logs.clear()
	_add_log("契约已随机生成：[b]%s[/b]。" % contract.title)
	_add_log("你进入了%s。幸存者尚未发现你的存在。" % rooms[0].name)
	_draw_card()
	_draw_card()
	_draw_card()
	_draw_card()
	_draw_card()

func connected_rooms(index: int) -> Array:
	return rooms[index].links

func people_in_room(index: int) -> Array:
	var result: Array = []
	for p in survivors:
		if not p.dead and int(p.room) == index: result.append(p)
	return result

func _spend(cost: int) -> bool:
	if finished or ap < cost: return false
	ap -= cost
	return true

func move_to(index: int) -> Dictionary:
	if index == player_room: return _result("你已经在这里。")
	if not connected_rooms(player_room).has(index): return _result("只能移动到相邻房间。")
	if not _spend(1): return _result("行动点不足。")
	player_room = index
	_add_log("你移动到了%s。" % rooms[index].name)
	_after_action()
	return _result("移动完成。")

func attack() -> Dictionary:
	if not _spend(1): return _result("行动点不足。")
	var targets := people_in_room(player_room)
	var target: Dictionary
	for p in targets:
		if not p.downed:
			target = p
			break
	if target.is_empty():
		ap += 1
		return _result("这里没有可以攻击的站立幸存者。")
	target.hp = int(target.hp) - 2
	target.fear = mini(100, int(target.fear)+25)
	target.alert = 100
	alarm = mini(100, alarm+3)
	_add_log("你攻击了%s，造成 2 点伤害。" % target.name)
	if int(target.hp) <= 0:
		target.downed = true
		target.hp = 0
		target["bleedout"] = 4
		alarm = mini(100, alarm+4)
		_add_log("[color=#e0a06c]%s 倒地了，正在流血。[/color]" % target.name)
	else:
		_add_log("%s 惊慌逃窜，开始寻找逃生路线。" % target.name)
		_flee(target)
	_after_action()
	return _result("攻击完成。")

func execute_downed() -> Dictionary:
	if not _spend(1): return _result("行动点不足。")
	for p in people_in_room(player_room):
		if p.downed:
			_kill(p, true)
			_after_action()
			return _result("处决完成。")
	ap += 1
	return _result("当前房间没有倒地目标。")

func search() -> Dictionary:
	if not _spend(1): return _result("行动点不足。")
	_add_log("你搜索了%s，发现一些可利用的痕迹。" % rooms[player_room].name)
	score += 2
	_draw_card()
	_after_action()
	return _result("搜索完成，抽取 1 张牌。")

func play_card(id: String) -> Dictionary:
	for i in range(hand.size()):
		var c: Dictionary = hand[i]
		if c.id != id: continue
		if not _spend(int(c.cost)): return _result("行动点不足。")
		hand.remove_at(i)
		match c.kind:
			"fear":
				for p in people_in_room(player_room): p.fear = mini(100, int(p.fear)+int(c.value))
				_add_log("恐惧气息在房间里扩散。")
			"ap":
				ap += int(c.value)
			"alarm":
				alarm = maxi(0, alarm+int(c.value))
			"mark":
				var targets := people_in_room(player_room)
				if not targets.is_empty(): targets[0].marked = true
			_add_log("你打出了卡牌「%s」。" % c.name)
		_after_action()
		return _result("卡牌已使用。")
	return _result("找不到这张牌。")

func end_turn() -> void:
	if finished: return
	turn += 1
	_add_log("[color=#b8a0a0]第 %d 回合开始。[/color]" % turn)
	for p in survivors:
		if p.dead: continue
		if p.downed:
			p.bleedout = int(p.get("bleedout",4))-1
			if int(p.bleedout) <= 0:
				_kill(p, false)
			continue
		p.fear = maxi(0, int(p.fear)-2)
		p.alert = mini(100, int(p.alert)+ (8 if alarm >= 60 else 2))
		if int(p.alert) >= 55 or int(p.fear) >= 55:
			_flee(p)
			if randf() < 0.18: alarm = mini(100, alarm+5)
	alarm = maxi(0, alarm-2)
	if alarm >= 60: _add_log("警报已触发：逃生点开始开放。")
	ap = max_ap
	_draw_card()
	_check_contract()

func _after_action() -> void:
	for p in survivors:
		if p.dead or p.downed: continue
		if int(p.room) == player_room:
			p.alert = 100
			p.fear = mini(100, int(p.fear)+8)
			_flee(p)
	_check_contract()

func _flee(p: Dictionary) -> void:
	var options: Array = rooms[int(p.room)].links
	if options.is_empty(): return
	var destination: int = options.pick_random()
	p.room = destination
	_add_log("%s 惊慌地逃往%s。" % [p.name, rooms[destination].name])

func _kill(p: Dictionary, execution: bool) -> void:
	p.dead = true
	p.downed = false
	kills += 1
	if execution: executions += 1
	score += 14 + (10 if execution else 0)
	_add_log("[color=#c65c5c]%s 已被杀死。[/color]" % p.name)
	if p.marked and contract.type == "target": _add_log("名单目标已完成。")
	_check_contract()

func _draw_card() -> void:
	if hand.size() >= 6: return
	if deck.is_empty(): deck = CARD_DATA.duplicate(true); deck.shuffle()
	hand.append(deck.pop_back())

func _check_contract() -> void:
	if contract.type == "kills" and kills >= int(contract.goal): finished = true
	elif contract.type == "target" and kills >= int(contract.goal): finished = true
	elif contract.type == "executions" and executions >= int(contract.goal): finished = true
	if finished: _add_log("[color=#d9b36c]契约主目标达成！可以结束本局。[/color]")
	if kills >= survivors.size(): finished = true

func _add_log(line: String) -> void:
	logs.append(line)

func _result(text_value: String) -> Dictionary:
	return {"ok":true,"message":text_value}
