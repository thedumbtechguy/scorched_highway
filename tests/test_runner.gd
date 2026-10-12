extends Node3D
## Headless tests. Run with:
##   godot --headless --fixed-fps 120 --path . res://tests/test_runner.tscn
## Exits 0 when every test passes, 1 otherwise.

const TICK := 1.0 / 120.0

var _failures := 0
var _stage: Node3D


func _ready() -> void:
	Impact.enabled_time_effects = false
	var tests := [
		test_rests_on_wheels,
		test_drives_and_turns_without_rolling,
		test_side_ram_hurts_victim_more,
		test_nose_into_wall_is_cheap,
		test_cannon_damages_and_shoves,
		test_wreck_detaches_panels_and_signals,
		test_full_match,
	]
	for t: Callable in tests:
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
	var body := StaticBody3D.new()
	body.collision_layer = Car.LAYER_WORLD
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(600, 2, 600)
	cs.shape = box
	body.add_child(cs)
	body.position = Vector3(0, -1, 0)
	_stage.add_child(body)


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


func make_car(pos: Vector3, yaw := 0.0) -> Car:
	var car := Car.new()
	car.setup(CarDefs.SUNDOWNER, Color.RED, false)
	car.transform = Transform3D(Basis(Vector3.UP, yaw), pos)
	_stage.add_child(car)
	car.add_to_group(&"cars")
	return car


func step(seconds: float) -> void:
	for i in int(seconds / TICK):
		await get_tree().physics_frame


func upright(car: Car) -> bool:
	return car.global_basis.y.dot(Vector3.UP) > 0.9


func check(cond: bool, what: String) -> bool:
	if not cond:
		print("      " + what)
	return cond


# --- Tests ---

func test_rests_on_wheels() -> bool:
	flat_ground()
	var car := make_car(Vector3(0, 1.5, 0))
	await step(3.0)
	var y := car.global_position.y
	return (check(upright(car), "not upright")
		and check(car.linear_velocity.length() < 0.15, "still moving: %s" % car.linear_velocity)
		and check(y > 0.45 and y < 0.75, "ride height %.2f" % y)
		and check(car.hp == car.max_hp, "took damage settling: %.1f" % (car.max_hp - car.hp))
		and check(car.grounded_wheels == 4, "wheels grounded: %d" % car.grounded_wheels))


func test_drives_and_turns_without_rolling() -> bool:
	flat_ground()
	var car := make_car(Vector3(0, 0.7, 0))
	await step(0.5)
	car.throttle = 1.0
	await step(5.0)
	var straight := car.speed
	var yaw0 := car.global_basis.get_euler().y
	car.steer = 1.0
	await step(2.5)
	var turned := absf(angle_difference(yaw0, car.global_basis.get_euler().y))
	car.steer = 0.0
	car.throttle = -1.0
	await step(2.5)
	print("      5 s flat out: %.1f m/s, turned %.0f deg, then braked to %.1f m/s" % [straight, rad_to_deg(turned), car.speed])
	return (check(straight > 20.0 and straight < 38.0, "speed after 5 s: %.1f" % straight)
		and check(turned > 0.8, "barely turned")
		and check(upright(car), "rolled over")
		and check(car.speed < 3.0, "didn't stop: %.1f" % car.speed))


func test_side_ram_hurts_victim_more() -> bool:
	flat_ground()
	var victim := make_car(Vector3(0, 0.62, 0), PI * 0.5) # broadside to the rammer
	var rammer := make_car(Vector3(0, 0.62, 30))
	await step(0.5)
	rammer.linear_velocity = rammer.forward() * 20.0
	rammer.throttle = 1.0
	await step(2.5)
	var dv := victim.max_hp - victim.hp
	var dr := rammer.max_hp - rammer.hp
	print("      victim took %.1f, rammer took %.1f" % [dv, dr])
	return (check(dv > 15.0, "victim barely hurt")
		and check(dv > dr * 2.0, "rammer hurt as much as victim")
		and check(victim.zone_damage[&"left"] + victim.zone_damage[&"right"] > dv * 0.6, "hit didn't land on a side"))


func test_nose_into_wall_is_cheap() -> bool:
	flat_ground()
	wall(Vector3(0, 2, -30), Vector3(20, 4, 2))
	var car := make_car(Vector3(0, 0.62, 0))
	await step(0.5)
	car.linear_velocity = car.forward() * 20.0
	car.throttle = 1.0
	await step(2.5)
	var d := car.max_hp - car.hp
	print("      20 m/s into a wall nose first: %.1f damage" % d)
	return check(d > 1.0 and d < 20.0, "damage %.1f" % d)


func test_cannon_damages_and_shoves() -> bool:
	flat_ground()
	var shooter := make_car(Vector3(0, 0.62, 0))
	var target := make_car(Vector3(0, 0.62, -25), PI * 0.5)
	var gun := Autocannon.new(shooter)
	shooter.add_child(gun)
	shooter.gun = gun
	await step(1.0)
	var before := target.global_position
	shooter.fire = true
	await step(1.0)
	shooter.fire = false
	var heat := gun.heat
	await step(0.5)
	var d := target.max_hp - target.hp
	var shove := target.global_position.distance_to(before)
	print("      1 s of fire: %.1f damage, shoved %.2f m, heat %.2f" % [d, shove, heat])
	return (check(d > 8.0, "damage %.1f" % d)
		and check(shove > 0.3, "target didn't move")
		and check(heat > 0.1, "no heat"))


func test_wreck_detaches_panels_and_signals() -> bool:
	flat_ground()
	var car := make_car(Vector3(0, 0.62, 0))
	await step(0.5)
	var got := [false]
	car.wrecked.connect(func(_c: Car, _b: Car) -> void: got[0] = true)
	var nose := car.global_transform * Vector3(0, 0, -2.2)
	for i in 4:
		car.take_damage(25.0, nose, null)
	car.take_damage(200.0, car.global_position, null)
	await step(2.0)
	var debris := 0
	for n in _stage.get_children():
		if n is RigidBody3D and not (n is Car):
			debris += 1
	return (check(got[0], "no wrecked signal")
		and check(car.is_wrecked, "not wrecked")
		and check(debris >= 2, "front panels didn't come off: %d" % debris))


func test_full_match() -> bool:
	var game_script: GDScript = load("res://scripts/game.gd")
	game_script.set("autopilot", true)
	game_script.set("bot_count", 4)
	var game: Node3D = load("res://scenes/main.tscn").instantiate()
	_stage.add_child(game)
	await step(60.0)
	var cars: Array = game.cars
	var hurt := 0
	var fell := 0
	for c: Car in cars:
		if c.hp < c.max_hp:
			hurt += 1
		if c.global_position.y < -3.0 or c.global_position.length() > 120.0:
			fell += 1
	print("      after 60 s: %d of %d cars damaged, %d wrecked" % [hurt, cars.size(), cars.filter(func(c: Car) -> bool: return c.is_wrecked).size()])
	return (check(hurt >= 2, "bots aren't fighting")
		and check(fell == 0, "%d cars left the arena" % fell))
