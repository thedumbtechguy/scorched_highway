extends Node
## Renders stills and a gameplay clip for reviewing the look. Needs a real
## renderer (a GPU, or software Vulkan under Xvfb), not --headless.
##
##   godot --fixed-fps 30 --path . res://tools/showcase.tscn -- stills <out_dir>
##   godot --fixed-fps 30 --write-movie clip.avi --path . res://tools/showcase.tscn -- movie <seconds>
##   godot --fixed-fps 30 --path . res://tools/showcase.tscn -- roster <out_dir>

var game: Node3D
var cam: Camera3D
var out := "shots"


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var mode := args[0] if args.size() > 0 else "stills"
	var game_script: GDScript = load("res://scripts/game.gd")
	game_script.set("autopilot", true)
	game_script.set("bot_count", 8 if mode == "roster" else 5)
	game = load("res://scenes/main.tscn").instantiate()
	add_child(game)
	if mode == "movie":
		await movie(float(args[1]) if args.size() > 1 else 15.0)
	elif mode == "roster":
		out = args[1] if args.size() > 1 else "shots"
		DirAccess.make_dir_recursive_absolute(out)
		await roster()
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
		ChaseCamera.add_poster_pass(cam)
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
	victim.teleport(Transform3D(Basis.IDENTITY, Vector3(-2, 0.62, -38)))
	rammer.teleport(Transform3D(Basis(Vector3.UP, -PI * 0.5), Vector3(-26, 0.62, -38)))
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


## The whole roster parked in a row, then each car from behind and from the front.
func roster() -> void:
	game._timer = 999.0
	game.hud.visible = false
	await wait(0.5)
	# Clear the floor (props, mesa, ramps) so the cars stand alone in front of the rim.
	for n in game.arena.get_children():
		var n3 := n as Node3D
		if n3 == null or Vector2(n3.position.x, n3.position.z).length() > 60.0:
			continue
		var is_ground := n is StaticBody3D and n3.position.y < -0.9 and Vector2(n3.position.x, n3.position.z).length() < 1.0
		if (n is StaticBody3D or n is MeshInstance3D) and not is_ground:
			n.queue_free()
	var cars: Array = game.cars
	for i in cars.size():
		var c: Car = cars[i]
		c.teleport(Transform3D(Basis(Vector3.UP, PI), Vector3(-28.0 + i * 8.0, 1.4, -20)))
	await wait(2.5)
	free_cam(Vector3(0, 11, 24), Vector3(0, 0.5, -20), 52.0)
	await wait(0.3)
	await shot("roster_lineup")
	for c: Car in cars:
		var xf := c.global_transform
		var size: float = c.def.half_extents.z / 2.3
		free_cam(xf * (Vector3(3.2, 1.6, 6.0) * size), c.global_position + Vector3.UP * 0.4 * size, 34.0)
		await wait(0.15)
		await shot("rear_%s" % c.def.id)
		free_cam(xf * (Vector3(-3.4, 1.0, -5.6) * size), c.global_position + Vector3.UP * 0.3 * size, 34.0)
		await wait(0.15)
		await shot("front_%s" % c.def.id)
