extends Control

const ENGINE := preload("res://脚本/规则引擎.gd")
var game: RefCounted
var selected_room := 0
var message := "准备开始。系统将在出发时随机发放契约。"
var root_ui: VBoxContainer
var map_grid: GridContainer
var info_label: RichTextLabel
var log_label: RichTextLabel
var hand_box: HBoxContainer
var action_box: HBoxContainer

func _ready() -> void:
	game = ENGINE.new()
	_build_ui()
	_render()

func _build_ui() -> void:
	var bg := ColorRect.new()
	bg.color = Color("#111116")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	root_ui = VBoxContainer.new()
	root_ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root_ui.add_theme_constant_override("separation", 12)
	root_ui.add_theme_color_override("font_color", Color("#e8e2dc"))
	root_ui.add_theme_constant_override("margin_left", 22)
	root_ui.add_theme_constant_override("margin_right", 22)
	root_ui.add_theme_constant_override("margin_top", 18)
	root_ui.add_theme_constant_override("margin_bottom", 18)
	add_child(root_ui)
	var header := HBoxContainer.new()
	root_ui.add_child(header)
	var title := Label.new()
	title.text = "暗夜杀机  /  NIGHT HUNT"
	title.add_theme_font_size_override("font_size", 26)
	header.add_child(title)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)
	var end_turn := _button("结束回合", _end_turn)
	header.add_child(end_turn)
	var stats := HBoxContainer.new()
	stats.name = "状态栏"
	root_ui.add_child(stats)
	info_label = RichTextLabel.new()
	info_label.custom_minimum_size = Vector2(0, 82)
	info_label.fit_content = true
	info_label.bbcode_enabled = true
	root_ui.add_child(info_label)
	var middle := HBoxContainer.new()
	middle.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_ui.add_child(middle)
	var map_panel := PanelContainer.new()
	map_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	middle.add_child(map_panel)
	var map_v := VBoxContainer.new()
	map_panel.add_child(map_v)
	var map_title := Label.new()
	map_title.text = "猎场 · 房间地图"
	map_title.add_theme_font_size_override("font_size", 18)
	map_v.add_child(map_title)
	map_grid = GridContainer.new()
	map_grid.columns = 4
	map_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map_v.add_child(map_grid)
	var side := VBoxContainer.new()
	side.custom_minimum_size.x = 350
	middle.add_child(side)
	var side_title := Label.new()
	side_title.text = "现场情报"
	side_title.add_theme_font_size_override("font_size", 18)
	side.add_child(side_title)
	log_label = RichTextLabel.new()
	log_label.bbcode_enabled = true
	log_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	log_label.custom_minimum_size.y = 260
	side.add_child(log_label)
	var action_title := Label.new()
	action_title.text = "行动"
	action_title.add_theme_font_size_override("font_size", 18)
	root_ui.add_child(action_title)
	action_box = HBoxContainer.new()
	root_ui.add_child(action_box)
	var hand_title := Label.new()
	hand_title.text = "手牌"
	hand_title.add_theme_font_size_override("font_size", 18)
	root_ui.add_child(hand_title)
	hand_box = HBoxContainer.new()
	root_ui.add_child(hand_box)

func _button(text_value: String, callback: Callable) -> Button:
	var b := Button.new()
	b.text = text_value
	b.custom_minimum_size = Vector2(130, 42)
	b.pressed.connect(callback)
	return b

func _render() -> void:
	for child in map_grid.get_children(): child.queue_free()
	for i in range(game.rooms.size()):
		var room: Dictionary = game.rooms[i]
		var b := Button.new()
		b.custom_minimum_size = Vector2(150, 105)
		var label := str(room.name)
		if i == game.player_room: label = "◆ " + label + "\n【杀手】"
		var people := game.people_in_room(i)
		if not people.is_empty(): label += "\n幸存者：" + str(people.size())
		if i == selected_room: label = "▶ " + label
		b.text = label
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.disabled = not game.connected_rooms(game.player_room).has(i) and i != game.player_room
		b.pressed.connect(_select_room.bind(i))
		map_grid.add_child(b)
	info_label.text = "[b]第 %d 回合[/b]　行动点 %d/%d　警报 %d/100　猎杀评分 %d　击杀 %d　\n契约：[color=#d9a86c]%s[/color]　目标：%s" % [game.turn, game.ap, game.max_ap, game.alarm, game.score, game.kills, game.contract.title, game.contract.description]
	log_label.text = "\n".join(game.logs.slice(maxi(0, game.logs.size()-13)))
	for child in action_box.get_children(): child.queue_free()
	action_box.add_child(_button("移动到选中房间 · 1 AP", _move))
	action_box.add_child(_button("攻击 · 1 AP", _attack))
	action_box.add_child(_button("搜索 · 1 AP", _search))
	action_box.add_child(_button("普通处决 · 1 AP", _execute))
	action_box.add_child(_button("自由猎杀重开", _restart))
	for child in hand_box.get_children(): child.queue_free()
	for card in game.hand:
		hand_box.add_child(_button(str(card.name) + "\n" + str(card.cost) + " AP", _play_card.bind(card.id)))

func _select_room(index: int) -> void:
	selected_room = index
	_render()

func _move() -> void:
	var result: Dictionary = game.move_to(selected_room)
	message = str(result.message)
	_render()

func _attack() -> void:
	var result: Dictionary = game.attack()
	message = str(result.message)
	_render()

func _search() -> void:
	var result: Dictionary = game.search()
	message = str(result.message)
	_render()

func _execute() -> void:
	var result: Dictionary = game.execute_downed()
	message = str(result.message)
	_render()

func _play_card(id: String) -> void:
	var result: Dictionary = game.play_card(id)
	message = str(result.message)
	_render()

func _end_turn() -> void:
	game.end_turn()
	_render()

func _restart() -> void:
	game.start_run(true)
	selected_room = game.player_room
	_render()
