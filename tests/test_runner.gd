extends Node3D
## Headless tests. Run with:
##   godot --headless --fixed-fps 120 --path . res://tests/test_runner.tscn
## Add `-- ticks=60` (and --fixed-fps 60) to run at the web build's physics rate.
## Exits 0 when every test passes, 1 otherwise.

var TICK := 1.0 / 120.0

var _failures := 0
var _stage: Node3D


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("ticks="):
			Engine.physics_ticks_per_second = int(a.substr(6))
	TICK = 1.0 / Engine.physics_ticks_per_second
	print("physics at %d Hz" % Engine.physics_ticks_per_second)
	Impact.enabled_time_effects = false
	var tests := [
		test_every_car_rests_on_its_wheels,
		test_every_car_drives_turns_and_stops,
		test_acceleration,
		test_reverse,
		test_turn_in,
		test_bot_escapes_a_corner,
		test_side_ram_hurts_victim_more,
		test_heavy_beats_light_in_a_ram,
		test_nose_into_wall_is_cheap,
		test_machine_gun_damages,
		test_damage_sheds_panels_and_signature_parts,
		test_thunder_cannons_shove,
		test_riot_gun_spins_light_more_than_heavy,
		test_fourth_of_july_rains_on_target,
		test_good_vibrations_throws_back_and_snaps_hooks,
		test_scrap_bomb_hits_a_chaser,
		test_tow_hook_drags_target,
		test_ground_pound_hops_and_slams,
		test_tail_gunner_covers_rear_until_sidecar_lost,
		test_frozen_bots_hold_fire,
		test_full_match,
		test_bots_keep_moving,
	]
	# TEST_ONLY=name runs just the tests whose names contain it.
	var only := OS.get_environment("TEST_ONLY")
	for t: Callable in tests:
		if only != "" and not t.get_method().contains(only):
			continue
		_stage = Node3D.new()
		add_child(_stage)
		var ok: bool = await t.call()
		print(("PASS  " if ok else "FAIL  ") + t.get_method())
		if not ok:
			_failures += 1
		_stage.queue_free()
		await get_tree().process_frame
	print("%d failed" % _failures if _failures else "all passed")
	get_tree().quit(1 if _failures else 0)


# --- Helpers ---

func flat_ground() -> void:
	wall(Vector3(0, -1, 0), Vector3(800, 2, 800))


func wall(pos: Vector3, size: Vector3) -> void:
	var body := StaticBody3D.new()
	body.collision_layer = Car.LAYER_WORLD
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	cs.shape = box
	body.add_child(cs)
	body.position = pos
	_stage.add_child(body)


## A car resting on flat ground, facing `yaw` (0 = -Z). Armed with its gun and special.
func make_car(id: StringName, pos: Vector3, yaw := 0.0) -> Car:
	var def := CarDefs.get_def(id)
	var car := Car.new()
	car.setup(def, false)
	var ride: float = def.rest_length + def.wheel_radius - 0.1 - def.wheel_y
	car.transform = Transform3D(Basis(Vector3.UP, yaw), Vector3(pos.x, ride, pos.z))
	_stage.add_child(car)
	car.add_to_group(&"cars")
	var gun := MachineGun.new(car)
	car.add_child(gun)
	car.gun = gun
	var sp := Specials.create(car)
	car.add_child(sp)
	car.special_node = sp
	return car


func step(seconds: float) -> void:
	for i in int(seconds / TICK):
		await get_tree().physics_frame


func press_special(car: Car) -> void:
	car.special = true
	await step(0.05)
	car.special = false
	await step(0.05)


func upright(car: Car) -> bool:
	return car.global_basis.y.dot(Vector3.UP) > 0.9


func lost(car: Car) -> float:
	return car.max_hp - car.hp


func check(cond: bool, what: String) -> bool:
	if not cond:
		print("      " + what)
	return cond


# --- Physics ---

func test_every_car_rests_on_its_wheels() -> bool:
	flat_ground()
	var cars := {}
	var x := -50.0
	for id in CarDefs.ORDER:
		cars[id] = make_car(id, Vector3(x, 0, 0))
		x += 14.0
	await step(3.0)
	var ok := true
	for id in cars:
		var c: Car = cars[id]
		ok = check(upright(c), "%s not upright" % id) and ok
		ok = check(c.linear_velocity.length() < 0.15, "%s still moving: %s" % [id, c.linear_velocity]) and ok
		ok = check(c.hp == c.max_hp, "%s took damage settling" % id) and ok
		ok = check(c.grounded_wheels == c.def.wheels.size(), "%s: %d of %d wheels grounded" % [id, c.grounded_wheels, c.def.wheels.size()]) and ok
	return ok


func test_every_car_drives_turns_and_stops() -> bool:
	flat_ground()
	var cars := {}
	var x := -140.0
	for id in CarDefs.ORDER:
		cars[id] = make_car(id, Vector3(x, 0, 0))
		x += 40.0
	await step(0.5)
	for c: Car in cars.values():
		c.throttle = 1.0
	await step(5.0)
	var speed := {}
	var yaw0 := {}
	for id in cars:
		speed[id] = cars[id].speed
		yaw0[id] = cars[id].global_basis.get_euler().y
		cars[id].steer = 1.0
	await step(2.5)
	var turned := {}
	for id in cars:
		turned[id] = absf(angle_difference(yaw0[id], cars[id].global_basis.get_euler().y))
		cars[id].steer = 0.0
		cars[id].throttle = -1.0
	# Holding brake stops the car, then reverses it: track the slowest it got.
	var slowest := {}
	for id in cars:
		slowest[id] = INF
	for i in int(4.0 / TICK):
		await get_tree().physics_frame
		for id in cars:
			slowest[id] = minf(slowest[id], absf(cars[id].speed))
	var ok := true
	for id in cars:
		var c: Car = cars[id]
		print("      %-15s 5 s flat out %4.1f m/s, turned %3.0f deg, braked to %4.1f" % [id, speed[id], rad_to_deg(turned[id]), slowest[id]])
		ok = check(speed[id] > 25.0 and speed[id] < 46.0, "%s speed %.1f" % [id, speed[id]]) and ok
		ok = check(turned[id] > 0.6, "%s barely turned" % id) and ok
		ok = check(upright(c), "%s rolled over" % id) and ok
		ok = check(slowest[id] < 1.0, "%s didn't stop: %.1f" % [id, slowest[id]]) and ok
	return ok


## Brisk but not twitchy: 0-100 km/h in about 3-4 s for most cars, slower for the trucks.
func test_acceleration() -> bool:
	flat_ground()
	var cars := {}
	var x := -70.0
	for id in CarDefs.ORDER:
		cars[id] = make_car(id, Vector3(x, 0, 0))
		x += 20.0
	await step(0.5)
	var t100 := {}
	for c: Car in cars.values():
		c.throttle = 1.0
	var t := 0.0
	while t < 10.0 and t100.size() < cars.size():
		await get_tree().physics_frame
		t += TICK
		for id in cars:
			if not t100.has(id) and cars[id].speed >= 100.0 / 3.6:
				t100[id] = t
	var ok := true
	for id in cars:
		var limit := 6.5 if cars[id].def["class"] == &"heavy" else 5.0
		var took: float = t100.get(id, 99.0)
		print("      %-15s 0-100 km/h in %.1f s" % [id, took])
		ok = check(took < limit, "%s too slow: %.1f s" % [id, took]) and ok
		ok = check(took > 2.0, "%s too twitchy: %.1f s" % [id, took]) and ok
	return ok


## Backing out of trouble has to be quick: every car gets to a brisk reversing
## speed in a couple of seconds, though slower than it goes forward.
func test_reverse() -> bool:
	flat_ground()
	var cars := {}
	var x := -70.0
	for id in CarDefs.ORDER:
		cars[id] = make_car(id, Vector3(x, 0, 0))
		x += 20.0
	await step(0.5)
	for c: Car in cars.values():
		c.throttle = -1.0
	await step(2.0)
	var at_2s := {}
	for id in cars:
		at_2s[id] = -cars[id].speed
	await step(3.0)
	var ok := true
	for id in cars:
		var c: Car = cars[id]
		print("      %-15s reversing %.1f m/s after 2 s, %.1f m/s after 5 s" % [id, at_2s[id], -c.speed])
		ok = check(at_2s[id] > 9.0, "%s reverses too slowly: %.1f m/s after 2 s" % [id, at_2s[id]]) and ok
		ok = check(-c.speed < c.def.reverse_speed + 0.5, "%s reverses past its limit: %.1f m/s" % [id, -c.speed]) and ok
	return ok


## Cornering should feel eager: from a 20 m/s cruise, full lock swings every car
## through 90 degrees in under 2 s (trucks a little slower) and keeps most of
## its speed, without spinning or rolling.
func test_turn_in() -> bool:
	flat_ground()
	var cars := {}
	var x := -140.0
	for id in CarDefs.ORDER:
		cars[id] = make_car(id, Vector3(x, 0, 0))
		x += 40.0
	await step(0.5)
	var yaw0 := {}
	var t90 := {}
	var cruising := {}
	var t := 0.0
	while t < 12.0 and t90.size() < cars.size():
		await get_tree().physics_frame
		t += TICK
		for id in cars:
			var c: Car = cars[id]
			if t90.has(id):
				continue
			if not cruising.has(id):
				c.throttle = 1.0
				if c.speed >= 20.0:
					cruising[id] = t
					yaw0[id] = c.global_basis.get_euler().y
					c.steer = 1.0
					c.throttle = 0.6
			elif absf(angle_difference(yaw0[id], c.global_basis.get_euler().y)) >= PI * 0.5:
				t90[id] = t - cruising[id]
	var ok := true
	for id in cars:
		var c: Car = cars[id]
		var took: float = t90.get(id, 99.0)
		print("      %-15s 90 deg from 20 m/s in %.2f s, still at %.1f m/s" % [id, took, c.speed])
		# Trucks and the three-wheeled sidecar rig are allowed to be clumsier.
		var limit := 2.6 if c.def["class"] == &"heavy" or c.def.wheels.size() < 4 else 1.9
		ok = check(took < limit, "%s turns in too slowly: %.2f s" % [id, took]) and ok
		ok = check(c.speed > 10.0, "%s scrubs off too much speed: %.1f m/s" % [id, c.speed]) and ok
		ok = check(upright(c), "%s rolled over" % id) and ok
	return ok


## A bot driven nose-first into a corner, with a truck parked behind it, gets itself out.
func test_bot_escapes_a_corner() -> bool:
	flat_ground()
	wall(Vector3(0, 2, -8), Vector3(20, 4, 1))
	wall(Vector3(-8, 2, 0), Vector3(1, 4, 20))
	var bot := make_car(&"lawdog", Vector3(-5, 0, -5), PI * 0.25)
	var blocker := make_car(&"gravel_queen", Vector3(-1, 0, -1), PI * 0.25 + PI * 0.5)
	blocker.remove_from_group(&"cars") # scenery here, not a target: the bot should head for the bait
	var bait := make_car(&"sidewinder", Vector3(60, 0, 60))
	bait.frozen_input = true
	bot.set_driver(AIDriver.new())
	var start := bot.global_position
	await step(12.0)
	var moved := bot.global_position.distance_to(start)
	print("      bot moved %.1f m out of the corner" % moved)
	return check(moved > 10.0, "bot still stuck in the corner")


func test_side_ram_hurts_victim_more() -> bool:
	flat_ground()
	var victim := make_car(&"sundowner", Vector3(0, 0, 0), PI * 0.5)
	var rammer := make_car(&"sundowner", Vector3(0, 0, 30))
	await step(0.5)
	rammer.linear_velocity = rammer.forward() * 20.0
	rammer.throttle = 1.0
	await step(2.5)
	print("      victim took %.1f, rammer took %.1f" % [lost(victim), lost(rammer)])
	return (check(lost(victim) > 15.0, "victim barely hurt")
		and check(lost(victim) > lost(rammer) * 2.0, "rammer hurt as much as victim"))


func test_heavy_beats_light_in_a_ram() -> bool:
	flat_ground()
	var light := make_car(&"sidewinder", Vector3(0, 0, 0), PI * 0.5)
	var heavy := make_car(&"long_haul", Vector3(0, 0, 30))
	await step(0.5)
	heavy.linear_velocity = heavy.forward() * 15.0
	heavy.throttle = 1.0
	await step(2.5)
	print("      Sidewinder took %.1f, Long Haul took %.1f" % [lost(light), lost(heavy)])
	return check(lost(light) > lost(heavy) * 4.0, "the heavy didn't dominate")


func test_nose_into_wall_is_cheap() -> bool:
	flat_ground()
	wall(Vector3(0, 2, -30), Vector3(20, 4, 2))
	var car := make_car(&"sundowner", Vector3(0, 0, 0))
	await step(0.5)
	car.linear_velocity = car.forward() * 20.0
	car.throttle = 1.0
	await step(2.5)
	print("      20 m/s into a wall nose first: %.1f damage" % lost(car))
	return check(lost(car) > 1.0 and lost(car) < 20.0, "damage %.1f" % lost(car))


func test_machine_gun_damages() -> bool:
	flat_ground()
	var shooter := make_car(&"lawdog", Vector3(0, 0, 0))
	var target := make_car(&"sundowner", Vector3(0, 0, -25), PI * 0.5)
	await step(1.0)
	shooter.fire = true
	await step(1.5)
	shooter.fire = false
	var heat: float = shooter.gun.heat
	await step(0.3)
	print("      1.5 s of fire: %.1f damage, heat %.2f" % [lost(target), heat])
	return check(lost(target) > 8.0, "damage %.1f" % lost(target)) and check(heat > 0.2, "no heat")


func test_damage_sheds_panels_and_signature_parts() -> bool:
	flat_ground()
	var car := make_car(&"lawdog", Vector3(0, 0, 0))
	await step(0.5)
	var got := [false]
	car.wrecked.connect(func(_c: Car, _b: Car) -> void: got[0] = true)
	var had_bar := car.visual.has_part(&"light_bar")
	car.take_damage(car.max_hp * 0.3, car.global_position, null)
	var bar_gone := not car.visual.has_part(&"light_bar")
	var nose := car.global_transform * Vector3(0, 0, -2.2)
	for i in 4:
		car.take_damage(25.0, nose, null)
	car.take_damage(500.0, car.global_position, null)
	await step(2.0)
	var debris := 0
	for n in _stage.get_children():
		if n is RigidBody3D and not (n is Car):
			debris += 1
	return (check(had_bar and bar_gone, "light bar didn't come off at 30% damage")
		and check(got[0] and car.is_wrecked, "not wrecked")
		and check(debris >= 3, "only %d pieces came off" % debris))


# --- Specials ---

func test_thunder_cannons_shove() -> bool:
	flat_ground()
	var car := make_car(&"sundowner", Vector3(0, 0, 0))
	var target := make_car(&"lawdog", Vector3(0, 0, -30), PI * 0.5)
	await step(1.0)
	var before := target.global_position
	await press_special(car)
	await step(1.5)
	print("      burst: %.1f damage, shoved %.2f m" % [lost(target), target.global_position.distance_to(before)])
	return (check(lost(target) > 20.0, "damage %.1f" % lost(target))
		and check(target.global_position.distance_to(before) > 0.8, "barely moved")
		and check(car.special_node.charge < 0.5, "didn't use the charge"))


func test_riot_gun_spins_light_more_than_heavy() -> bool:
	flat_ground()
	var a := make_car(&"lawdog", Vector3(-40, 0, 0))
	var light := make_car(&"sidewinder", Vector3(-40, 0, -9), PI * 0.5)
	var b := make_car(&"lawdog", Vector3(40, 0, 0))
	var heavy := make_car(&"gravel_queen", Vector3(40, 0, -10), PI * 0.5)
	await step(1.0)
	await press_special(a)
	await press_special(b)
	await step(0.1)
	var spin_light := absf(light.angular_velocity.y)
	var spin_heavy := absf(heavy.angular_velocity.y)
	print("      yaw rate: light %.2f rad/s, heavy %.2f rad/s" % [spin_light, spin_heavy])
	return (check(spin_light > 1.0, "light car barely spun")
		and check(spin_light > spin_heavy * 2.5, "heavy spun nearly as much"))


func test_fourth_of_july_rains_on_target() -> bool:
	flat_ground()
	var car := make_car(&"picket_fence", Vector3(0, 0, 0))
	var target := make_car(&"gravel_queen", Vector3(0, 0, -35), PI * 0.5)
	await step(1.0)
	await press_special(car)
	await step(3.5)
	print("      mortars: %.1f damage to the target, %.1f to the wagon" % [lost(target), lost(car)])
	return check(lost(target) > 10.0, "target barely hurt") and check(lost(car) == 0.0, "the wagon hit itself")


func test_good_vibrations_throws_back_and_snaps_hooks() -> bool:
	flat_ground()
	var van := make_car(&"moonbeam", Vector3(0, 0, 0))
	var near := make_car(&"sidewinder", Vector3(5, 0, 0))
	var truck := make_car(&"long_haul", Vector3(0, 0, -25), PI)
	await step(1.0)
	await press_special(truck)
	await step(0.8)
	var hook := truck.special_node as TowHook
	var was_hooked := hook.is_attached()
	var d0 := near.global_position.distance_to(van.global_position)
	await press_special(van)
	await step(0.6)
	var d1 := near.global_position.distance_to(van.global_position)
	print("      hooked %s; neighbour pushed from %.1f to %.1f m; scrambled %.1f s" % [was_hooked, d0, d1, near.scrambled])
	return (check(was_hooked, "tow hook never caught the van")
		and check(not hook.is_attached(), "hook still attached")
		and check(d1 > d0 + 2.5, "neighbour not thrown back")
		and check(near.scrambled > 0.0, "neighbour not scrambled"))


func test_scrap_bomb_hits_a_chaser() -> bool:
	flat_ground()
	var truck := make_car(&"gravel_queen", Vector3(0, 0, 0))
	var chaser := make_car(&"sundowner", Vector3(0, 0, 18))
	await step(1.0)
	truck.throttle = 0.6
	chaser.throttle = 1.0
	await step(0.5)
	await press_special(truck)
	await step(2.5)
	print("      chaser took %.1f, truck took %.1f" % [lost(chaser), lost(truck)])
	return check(lost(chaser) > 8.0, "chaser barely hurt") and check(lost(truck) == 0.0, "Ma hit herself")


func test_tow_hook_drags_target() -> bool:
	flat_ground()
	var truck := make_car(&"long_haul", Vector3(0, 0, 0))
	var target := make_car(&"sidewinder", Vector3(0, 0, -22), PI * 0.5)
	await step(1.0)
	await press_special(truck)
	await step(0.5)
	var hook := truck.special_node as TowHook
	var attached := hook.is_attached()
	var d0 := truck.global_position.distance_to(target.global_position)
	await step(2.5)
	var d1 := truck.global_position.distance_to(target.global_position)
	print("      attached %s; distance %.1f to %.1f m" % [attached, d0, d1])
	return check(attached, "hook missed") and check(d1 < d0 - 3.0, "target not dragged in")


func test_ground_pound_hops_and_slams() -> bool:
	flat_ground()
	var buggy := make_car(&"sidewinder", Vector3(0, 0, 0))
	var victim := make_car(&"lawdog", Vector3(0, 0, -7), PI * 0.5)
	await step(1.0)
	var y0 := buggy.global_position.y
	await press_special(buggy)
	var peak := y0
	for i in 240:
		await get_tree().physics_frame
		peak = maxf(peak, buggy.global_position.y)
	print("      hop height %.1f m; victim took %.1f" % [peak - y0, lost(victim)])
	return check(peak - y0 > 2.5, "barely hopped") and check(lost(victim) > 4.0, "no shockwave damage")


func test_tail_gunner_covers_rear_until_sidecar_lost() -> bool:
	flat_ground()
	var bike := make_car(&"double_trouble", Vector3(0, 0, 0))
	var chaser := make_car(&"sundowner", Vector3(2, 0, 16))
	var sp := bike.special_node as TailGunner
	await step(1.0)
	await press_special(bike)
	await step(2.5)
	var hurt := lost(chaser)
	var before := sp.is_available()
	bike.take_damage(bike.max_hp * 0.75, bike.global_position, null)
	print("      chaser took %.1f; available before %s, after losing sidecar %s" % [hurt, before, sp.is_available()])
	return (check(hurt > 6.0, "chaser barely hurt")
		and check(before and not sp.is_available(), "special survived losing the sidecar"))


# --- Whole game ---

func test_frozen_bots_hold_fire() -> bool:
	flat_ground()
	var ok := true
	var cars: Array[Car] = []
	for i in CarDefs.ORDER.size():
		var c := make_car(CarDefs.ORDER[i], Vector3(-28 + i * 8.0, 0, 0))
		c.set_driver(AIDriver.new())
		c.frozen_input = true
		cars.append(c)
	await step(4.0)
	for c in cars:
		ok = check(c.special_node.charge >= 1.0 and not c.special_node.is_busy(), "%s used its special while frozen" % c.def.id) and ok
		ok = check(c.global_position.distance_to(Vector3(-28 + cars.find(c) * 8.0, c.global_position.y, 0)) < 0.5, "%s moved while frozen" % c.def.id) and ok
	return ok


func test_full_match() -> bool:
	var game_script: GDScript = load("res://scripts/game.gd")
	game_script.set("autopilot", true)
	game_script.set("bot_count", 8)
	var game: Node3D = load("res://scenes/main.tscn").instantiate()
	_stage.add_child(game)
	await step(60.0)
	var cars: Array = game.cars
	var hurt := 0
	var fell := 0
	var specials_used := 0
	for c: Car in cars:
		if c.hp < c.max_hp:
			hurt += 1
		if c.global_position.y < -3.0 or c.global_position.length() > 120.0:
			fell += 1
		if c.special_node and (c.special_node.charge < 1.0 or c.special_node.is_busy()):
			specials_used += 1
	print("      after 60 s: %d of %d cars damaged, %d wrecked, %d used their special recently" % [hurt, cars.size(), cars.filter(func(c: Car) -> bool: return c.is_wrecked).size(), specials_used])
	return (check(cars.size() == 8, "expected 8 cars, got %d" % cars.size())
		and check(hurt >= 4, "bots aren't fighting")
		and check(fell == 0, "%d cars left the arena" % fell))


## Over a long bot match, nobody spends much of it stuck (respawns included).
func test_bots_keep_moving() -> bool:
	var game_script: GDScript = load("res://scripts/game.gd")
	game_script.set("autopilot", true)
	game_script.set("bot_count", 8)
	var game: Node3D = load("res://scenes/main.tscn").instantiate()
	_stage.add_child(game)
	await step(4.0) # countdown
	var still := {}
	var alive := {}
	var run := {}
	var longest := {}
	for i in int(90.0 / TICK):
		await get_tree().physics_frame
		for c: Car in game.cars:
			if c.is_wrecked:
				continue
			alive[c] = alive.get(c, 0.0) + TICK
			if c.linear_velocity.length() < 1.5:
				still[c] = still.get(c, 0.0) + TICK
				run[c] = run.get(c, 0.0) + TICK
				longest[c] = maxf(longest.get(c, 0.0), run[c])
			else:
				run[c] = 0.0
	# Per car, stillness swings with how the fights go; across the field it's stable.
	# The promise per car is that nobody stays stuck for long.
	var ok := true
	var total_still := 0.0
	var total_alive := 0.0
	for c: Car in game.cars:
		var frac: float = still.get(c, 0.0) / maxf(alive.get(c, 1.0), 1.0)
		total_still += still.get(c, 0.0)
		total_alive += alive.get(c, 0.0)
		print("      %-15s still %3.0f%% of %3.0f s alive, longest %.1f s" % [c.def.id, frac * 100.0, alive.get(c, 0.0), longest.get(c, 0.0)])
		ok = check(longest.get(c, 0.0) < 6.0, "%s stuck for %.1f s at a stretch" % [c.def.id, longest.get(c, 0.0)]) and ok
	var field := total_still / maxf(total_alive, 1.0)
	print("      whole field still %.0f%% of the time" % (field * 100.0))
	ok = check(field < 0.25, "the field stood still %.0f%% of the time" % (field * 100.0)) and ok
	return ok
