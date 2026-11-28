extends Node

const SAVE_PATH := "user://night_hunt_godot.cfg"
var bloodpoints := 0
var total_kills := 0
var total_executions := 0
var completed_runs := 0
var best_score := 0
var was_settled := false

func _ready() -> void:
	load_progress()

func load_progress() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK: return
	bloodpoints = int(cfg.get_value("progress", "bloodpoints", 0))
	total_kills = int(cfg.get_value("progress", "total_kills", 0))
	total_executions = int(cfg.get_value("progress", "total_executions", 0))
	completed_runs = int(cfg.get_value("progress", "completed_runs", 0))
	best_score = int(cfg.get_value("progress", "best_score", 0))

func settle_run(score: int, kills: int, executions: int) -> void:
	var earned := maxi(10, score)
	bloodpoints += earned
	total_kills += kills
	total_executions += executions
	completed_runs += 1
	best_score = maxi(best_score, score)
	was_settled = true
	save_progress()

func save_progress() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("progress", "bloodpoints", bloodpoints)
	cfg.set_value("progress", "total_kills", total_kills)
	cfg.set_value("progress", "total_executions", total_executions)
	cfg.set_value("progress", "completed_runs", completed_runs)
	cfg.set_value("progress", "best_score", best_score)
	cfg.save(SAVE_PATH)
