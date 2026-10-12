extends Node
## Renders stills and a gameplay clip for reviewing the look. Needs a real
## renderer (a GPU, or software Vulkan under Xvfb), not --headless.
##
##   godot --fixed-fps 30 --path . res://tools/showcase.tscn -- stills <out_dir>
##   godot --fixed-fps 30 --write-movie clip.avi --path . res://tools/showcase.tscn -- movie <seconds>

var game: Node3D
var cam: Camera3D
var out := "shots"


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var mode := args[0] if args.size() > 0 else "stills"
	var game_script: GDScript = load("res://scripts/game.gd")
	game_script.set("autopilot", true)
	game_script.set("bot_count", 5)
	game = load("res://scenes/main.tscn").instantiate()
	add_child(game)
	if mode == "movie":
		await movie(float(args[1]) if args.size() > 1 else 15.0)
	else:
		out = args[1] if args.size() > 1 else "shots"
		DirAccess.make_dir_recursive_absolute(out)
		await stills()
	get_tree().quit()


func wait(seconds: float) -> void:
	var t := 0.0
	while t < seconds:
		await get_tree().process_frame
		t += get_process_delta_time() / maxf(Engine.time_scale, 0.0001)


func shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("%s/%s.png" % [out, name])
	print("saved ", name)


func free_cam(pos: Vector3, look: Vector3, fov := 45.0) -> void:
	if cam == null:
		cam = Camera3D.new()
		add_child(cam)
	cam.global_position = pos
	cam.look_at(look, Vector3.UP)
	cam.fov = fov
	cam.make_current()


func stills() -> void:
	game._timer = 999.0 # hold the countdown: cars stay parked for the beauty shots
	game.hud.visible = false
	await wait(2.0)
	var car: Car = game.cars[0]
	var c := car.global_position
	var xf := car.global_transform
	free_cam(xf * Vector3(-3.4, 0.9, -4.8), c + Vector3.UP * 0.3, 38.0)
	await wait(0.2)
	await shot("car_front")
	free_cam(xf * Vector3(3.8, 1.5, 5.0), c + Vector3.UP * 0.4, 38.0)
	await wait(0.2)
	await shot("car_rear")
	free_cam(Vector3(78, 52, 78), Vector3(0, 0, 0), 55.0)
	await wait(0.3)
	await shot("arena")

	# Staged T-bone in open ground, to see what a hit looks like.
	var victim: Car = game.cars[1]
	var rammer: Car = game.cars[2]
	victim.global_transform = Transform3D(Basis.IDENTITY, Vector3(-2, 0.62, -38))
	rammer.global_transform = Transform3D(Basis(Vector3.UP, -PI * 0.5), Vector3(-26, 0.62, -38))
	victim.reset_physics_interpolation()
	rammer.reset_physics_interpolation()
	free_cam(Vector3(-9, 1.6, -29.5), Vector3(-4, 0.6, -38), 50.0)
	await wait(1.0)
	rammer.linear_velocity = Vector3(24, 0, 0)
	var t := 0.0
	var n := 0
	while t < 1.6:
		await get_tree().process_frame
		t += get_process_delta_time()
		if t > 0.85 and n < 12:
			await shot("crash_%02d" % n)
			n += 1

	# Into the fight, with the HUD, following the first car.
	game.hud.visible = true
	game.hud.watch(game.cars[0])
	game.camera.target = game.cars[0]
	game.camera.snap()
	game.camera.make_current()
	game._timer = 0.01
	for i in 3:
		await wait(5.0)
		await shot("fight_%d" % i)


func movie(seconds: float) -> void:
	# The followed car plays the part of the player: hitstop, slow motion, engine sound.
	var car: Car = game.cars[0]
	car.is_player = true
	Impact.enabled_time_effects = true
	game.hud.watch(car)
	Sfx.attach_engine(car)
	game._timer = 1.5
	await wait(seconds)
