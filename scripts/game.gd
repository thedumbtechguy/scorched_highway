extends Node3D
## Wreck mode in The Pit: pick a car, then fight the rest of the roster.
## Last car running wins.

const COUNTDOWN := 3.0

enum State { SELECT, COUNTDOWN, FIGHT, OVER }

## Remembered across restarts.
static var player_car: StringName = &"sundowner"
## Set by tests and tools: no player, every car driven by a bot, no time effects.
static var autopilot := false
static var bot_count := 7

var arena: Arena
var cars: Array[Car] = []
var player: Car
var camera: ChaseCamera
var hud: Hud
var state := State.SELECT
var _timer := 0.0
var _reset_cooldown := 0.0

const BOT_RESPAWN_AFTER := 5.0 # seconds stuck before a bot is towed back in
const PLAYER_HINT_AFTER := 2.0


func _ready() -> void:
	PlayerDriver.setup_input()
	Impact.reset()
	Impact.enabled_time_effects = not autopilot
	arena = Arena.new()
	add_child(arena)
	arena.build()

	camera = ChaseCamera.new()
	add_child(camera)
	camera.make_current()
	Impact.camera = camera

	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Hud.new()
	layer.add_child(hud)

	if autopilot:
		var ids := CarDefs.ORDER.duplicate()
		for i in mini(bot_count, arena.spawn_points.size()):
			_spawn_bot(ids[i % ids.size()], i)
		camera.target = cars[0]
		camera.snap()
		_start_countdown()
	else:
		_preview(player_car)


# --- Car selection ---

func _preview(id: StringName) -> void:
	if player:
		cars.erase(player)
		player.queue_free()
	player_car = id
	player = spawn_car(id, true, arena.spawn_points[0])
	player.set_driver(PlayerDriver.new())
	player.frozen_input = true
	camera.target = player
	camera.orbit = true
	camera.snap()
	var def := player.def
	hud.select_info = {
		"name": def.name, "driver": def.driver, "show": def.show,
		"class": String(def["class"]).capitalize(), "mass": def.mass,
		"special": def.special_name, "stats": def.stats,
	}


func _cycle(step: int) -> void:
	var i := CarDefs.ORDER.find(player_car)
	_preview(CarDefs.ORDER[wrapi(i + step, 0, CarDefs.ORDER.size())])


func _confirm() -> void:
	hud.select_info = {}
	camera.orbit = false
	camera.snap()
	hud.watch(player)
	Sfx.attach_engine(player)
	var others := CarDefs.ORDER.filter(func(id: StringName) -> bool: return id != player_car)
	others.shuffle()
	for i in mini(bot_count, arena.spawn_points.size() - 1):
		_spawn_bot(others[i % others.size()], i + 1)
	_start_countdown()


# --- Match ---

func _spawn_bot(id: StringName, slot: int) -> void:
	var car := spawn_car(id, false, arena.spawn_points[slot])
	car.set_driver(AIDriver.new(randf_range(0.85, 1.2), randf_range(0.8, 1.1)))
	car.frozen_input = true


func spawn_car(id: StringName, is_player: bool, xf: Transform3D) -> Car:
	var car := Car.new()
	car.setup(CarDefs.get_def(id), is_player)
	car.transform = xf
	add_child(car)
	car.add_to_group(&"cars")
	var gun := MachineGun.new(car)
	car.add_child(gun)
	car.gun = gun
	var sp := Specials.create(car)
	if sp:
		car.add_child(sp)
		car.special_node = sp
	car.wrecked.connect(_on_wrecked)
	cars.append(car)
	return car


func _start_countdown() -> void:
	state = State.COUNTDOWN
	_timer = COUNTDOWN
	for c in cars:
		c.frozen_input = true


func running() -> Array[Car]:
	return cars.filter(func(c: Car) -> bool: return not c.is_wrecked)


func _process(delta: float) -> void:
	hud.remaining = running().size() if state == State.FIGHT else 0
	match state:
		State.SELECT:
			hud.message = ""
			if Input.is_action_just_pressed(&"ui_prev"):
				_cycle(-1)
			elif Input.is_action_just_pressed(&"ui_next"):
				_cycle(1)
			elif Input.is_action_just_pressed(&"restart"):
				_confirm()
		State.COUNTDOWN:
			_timer -= delta
			hud.message = str(ceili(_timer)) if _timer > 0.0 else ""
			if _timer <= 0.0:
				state = State.FIGHT
				hud.message = "WRECK 'EM"
				for c in cars:
					c.frozen_input = false
				get_tree().create_timer(0.9).timeout.connect(func() -> void:
					if state == State.FIGHT:
						hud.message = "")
		State.FIGHT:
			_rescue_stuck_cars(delta)
		State.OVER:
			if Input.is_action_just_pressed(&"restart"):
				Impact.reset()
				get_tree().reload_current_scene()
	if Input.is_action_just_pressed(&"quit") and not OS.has_feature("web"):
		get_tree().quit()


## Nobody should spend a match wedged in a corner. The player can reset when
## stuck (R / Back); bots that can't free themselves get towed to open ground.
func _rescue_stuck_cars(delta: float) -> void:
	_reset_cooldown = maxf(0.0, _reset_cooldown - delta)
	for c in running():
		if c != player and c.stuck_time > BOT_RESPAWN_AFTER:
			respawn_in_open(c)
	if player and not player.is_wrecked:
		var can_reset := _reset_cooldown <= 0.0 and (player.stuck_time > 0.6 or player.global_basis.y.y < 0.5)
		hud.hint = "R / BACK  RESET" if can_reset and player.stuck_time > PLAYER_HINT_AFTER else ""
		if can_reset and Input.is_action_just_pressed(&"reset"):
			respawn_in_open(player)
			_reset_cooldown = 3.0
			hud.hint = ""


## Put a car on the spawn point furthest from everyone else, facing the middle.
func respawn_in_open(car: Car) -> void:
	var best: Transform3D = arena.spawn_points[0]
	var best_d := -1.0
	for sp in arena.spawn_points:
		var nearest := INF
		for c in running():
			if c != car:
				nearest = minf(nearest, c.global_position.distance_to(sp.origin))
		if nearest > best_d:
			best_d = nearest
			best = sp
	var def: Dictionary = car.def
	var ride: float = def.rest_length + def.wheel_radius - 0.1 - def.wheel_y + 0.3
	car.teleport(Transform3D(best.basis, Vector3(best.origin.x, ride, best.origin.z)))
	car.stuck_time = 0.0
	Impact.shockwave(Vector3(best.origin.x, 0.2, best.origin.z), 4.0, Poster.CREAM, false)
	if car == player:
		camera.snap()


func _on_wrecked(car: Car, _by: Car) -> void:
	if state != State.FIGHT:
		return
	var left := running()
	if player and car == player:
		_finish("WRECKED", "%d still running · Enter / Start to go again" % left.size())
	elif left.size() <= 1:
		if player and left.has(player):
			_finish("LAST CAR RUNNING", "Enter / Start to go again")
		else:
			_finish("MATCH OVER", "")


func _finish(title: String, sub: String) -> void:
	state = State.OVER
	get_tree().create_timer(1.2, true, false, true).timeout.connect(func() -> void:
		hud.message = title
		hud.sub_message = sub)
