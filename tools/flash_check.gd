extends Node
## Measures screen flicker while the followed car fires: mean brightness per
## frame, quiet and then firing. A max jump much above 0.01 is a visible flash.

func _ready() -> void:
	var gs: GDScript = load("res://scripts/game.gd")
	gs.set("autopilot", true)
	gs.set("bot_count", 2)
	var game: Node3D = load("res://scenes/main.tscn").instantiate()
	add_child(game)
	game._timer = 999.0
	for i in 60:
		await get_tree().process_frame
	var car: Car = game.cars[0]
	car.driver.queue_free()
	car.driver = null
	game._timer = 0.01
	for i in 10:
		await get_tree().process_frame
	car.frozen_input = false
	car.throttle = 0.0
	game.camera.target = car
	game.camera.snap()
	game.camera.make_current()
	var lums: Array[float] = []
	for phase in 2:
		car.fire = phase == 1
		for i in 45:
			await RenderingServer.frame_post_draw
			var img := get_viewport().get_texture().get_image()
			img.resize(64, 36)
			var sum := 0.0
			for y in 36:
				for x in 64:
					sum += img.get_pixel(x, y).get_luminance()
			lums.append(sum / (64 * 36))
	var quiet := lums.slice(10, 45)
	var firing := lums.slice(55, 90)
	print("FLASH quiet mean %.3f range %.3f | firing mean %.3f range %.3f max jump %.3f" % [_mean(quiet), quiet.max() - quiet.min(), _mean(firing), firing.max() - firing.min(), _jump(firing)])
	get_tree().quit()

func _mean(a: Array) -> float:
	var s := 0.0
	for v in a: s += v
	return s / a.size()

func _jump(a: Array) -> float:
	var m := 0.0
	for i in range(1, a.size()): m = maxf(m, absf(a[i] - a[i - 1]))
	return m
