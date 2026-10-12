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
		State.OVER:
			if Input.is_action_just_pressed(&"restart"):
				Impact.reset()
				get_tree().reload_current_scene()
	if Input.is_action_just_pressed(&"quit") and not OS.has_feature("web"):
		get_tree().quit()


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
