extends Node3D
## Bot combat benchmark (headless):
##   godot --headless --fixed-fps 60 --path . res://tools/bot_bench.tscn
## 1) Hunt: one bot of each class against a dummy driving loops in the arena for 30 s.
## 2) Brawl: an 8-bot match for 90 s; damage dealt per bot-minute, kills, time to first wreck.

class Circler:
	extends Node
	## Laps a 25 m circle round the middle at a steady clip, like a player who
	## won't fight back. Never counts as stuck, so the rescue never teleports it.
	var t := 0.0
	func drive(car: Car, delta: float) -> void:
		t += delta
		car.stuck_time = 0.0
		var p := car.global_position
		var a := atan2(p.z, p.x) + 0.6
		var goal := Vector3(cos(a), 0, sin(a)) * 25.0
		var fwd := car.forward()
		fwd.y = 0.0
		var ang := fwd.normalized().signed_angle_to((goal - p) * Vector3(1, 0, 1), Vector3.UP)
		car.steer = clampf(-ang * 2.0, -1.0, 1.0)
		car.throttle = 0.8 if car.speed < 14.0 else 0.0


const TRIALS := 4


func _ready() -> void:
	Impact.enabled_time_effects = false
	Engine.physics_ticks_per_second = 60
	var out := []
	var args := OS.get_cmdline_user_args()
	var hunters: Array = [&"sundowner", &"gravel_queen", &"sidewinder"]
	if not args.is_empty():
		hunters = Array(args).map(func(a: String) -> StringName: return StringName(a))
	for hunter: StringName in hunters:
		var total := 0.0
		var fire := 0.0
		var esc := 0.0
		for k in TRIALS:
			seed(k)
			var r: Dictionary = await hunt(hunter, k)
			total += r.dealt
			fire += r.fire
			esc += r.esc
		out.append("hunt   %-13s damage to a looping target in 30 s: %.0f (mean of %d)  firing %.0f%%  escaping %.0f%%" % [hunter, total / TRIALS, TRIALS, fire / TRIALS, esc / TRIALS])
		print(out[-1])
	for k in (2 if args.is_empty() else 0):
		seed(100 + k)
		out.append(await brawl())
		print(out[-1])
	for line in out:
		print(line)
	get_tree().quit()


func game() -> Node3D:
	var gs: GDScript = load("res://scripts/game.gd")
	gs.set("autopilot", true)
	var g: Node3D = load("res://scenes/main.tscn").instantiate()
	add_child(g)
	return g


func steps(seconds: float) -> void:
	for i in int(seconds * 60):
		await get_tree().physics_frame


func hunt(hunter: StringName, k: int) -> Dictionary:
	var gs: GDScript = load("res://scripts/game.gd")
	gs.set("bot_count", 2)
	var g := game()
	await steps(0.2)
	var bot: Car = g.cars[0]
	var dummy: Car = g.cars[1]
	# Swap the first bot for the chosen hunter, and make the second a looping dummy.
	var xf := bot.global_transform
	g.cars.erase(bot)
	bot.queue_free()
	bot = g.spawn_car(hunter, false, xf)
	bot.set_driver(AIDriver.new())
	dummy.driver.queue_free()
	dummy.driver = null
	dummy.set_driver(Circler.new())
	dummy.max_hp = 100000.0
	dummy.hp = 100000.0
	var a := TAU * k / TRIALS
	dummy.teleport(Transform3D(Basis(Vector3.UP, -a), Vector3(cos(a), 0, sin(a)) * 25.0 + Vector3.UP * 1.2))
	g._timer = 0.01
	var st := {"fire": 0, "tgt": 0, "dist": 0.0, "n": 0, "esc": 0, "ang": 0.0, "detour": 0, "boost": 0}
	for i in int(30.0 * 60):
		await get_tree().physics_frame
		var ai := bot.driver as AIDriver
		st.n += 1
		st.fire += int(bot.fire)
		st.tgt += int(ai.target == dummy)
		st.esc += int(ai._maneuver > 0.0 or ai._escaping > 0.0)
		st.detour += int(ai._detour_time > 0.0)
		st.boost += int(bot.boost)
		st.dist += bot.global_position.distance_to(dummy.global_position)
	var dealt := dummy.max_hp - dummy.hp
	g.queue_free()
	await get_tree().process_frame
	if OS.has_environment("AI_DEBUG"): print("    trial %d: dealt %.0f detour %.0f%% boost %.0f%% dist %.0f" % [k, dealt, 100.0 * st.detour / st.n, 100.0 * st.boost / st.n, st.dist / st.n])
	return {"dealt": dealt, "fire": 100.0 * st.fire / st.n, "esc": 100.0 * st.esc / st.n}


func brawl() -> String:
	var gs: GDScript = load("res://scripts/game.gd")
	gs.set("bot_count", 8)
	var g := game()
	await steps(4.0)
	var acc := {"dealt": 0.0} # lambdas capture locals by value: count into a dictionary
	for c: Car in g.cars:
		c.damaged.connect(func(_c: Car, amount: float, _z: StringName, by: Car) -> void:
			if by and by != _c:
				acc.dealt += amount)
	var first_wreck := -1.0
	var t := 0.0
	while t < 90.0:
		await get_tree().physics_frame
		t += 1.0 / 60.0
		if first_wreck < 0.0 and g.cars.any(func(c: Car) -> bool: return c.is_wrecked):
			first_wreck = t
	var dealt: float = acc.dealt
	var wrecked: int = g.cars.filter(func(c: Car) -> bool: return c.is_wrecked).size()
	g.queue_free()
	return "brawl  8 bots, 90 s: %.0f damage dealt to others (%.0f per bot-minute), %d wrecked, first wreck at %.0f s" % [dealt, dealt / 8.0 / 1.5, wrecked, first_wreck]
