extends Node3D
## Wreck mode in The Pit: you against the bots, last car running wins.

const PAINTS := [Color(0.62, 0.06, 0.04), Color(0.05, 0.2, 0.32), Color(0.85, 0.58, 0.12), Color(0.2, 0.22, 0.2), Color(0.42, 0.44, 0.47)]
const COUNTDOWN := 3.0

enum State { COUNTDOWN, FIGHT, OVER }

## Set by tests: no player, every car driven by a bot, and no time effects.
static var autopilot := false
static var bot_count := 3

var arena: Arena
var cars: Array[Car] = []
var player: Car
var camera: ChaseCamera
var hud: Hud
var state := State.COUNTDOWN
var _timer := 0.0


func _ready() -> void:
	PlayerDriver.setup_input()
	Impact.reset()
	Impact.enabled_time_effects = not autopilot
	arena = Arena.new()
	add_child(arena)
	arena.build()

	var n := bot_count + (0 if autopilot else 1)
	for i in n:
		var is_player := i == 0 and not autopilot
		var car := spawn_car(CarDefs.SUNDOWNER, PAINTS[i % PAINTS.size()], is_player, arena.spawn_points[i])
		if is_player:
			player = car
			car.set_driver(PlayerDriver.new())
		else:
			car.set_driver(AIDriver.new(randf_range(0.85, 1.2), randf_range(0.8, 1.1)))
		car.frozen_input = true

	camera = ChaseCamera.new()
	add_child(camera)
	camera.target = player if player else cars[0]
	camera.make_current()
	camera.snap()
	Impact.camera = camera

	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Hud.new()
	layer.add_child(hud)
	if player:
		hud.watch(player)
		Sfx.attach_engine(player)
	_timer = COUNTDOWN


func spawn_car(def: Dictionary, paint: Color, is_player: bool, xf: Transform3D) -> Car:
	var car := Car.new()
	car.setup(def, paint, is_player)
	car.transform = xf
	add_child(car)
	car.add_to_group(&"cars")
	var gun := Autocannon.new(car)
	car.add_child(gun)
	car.gun = gun
	car.wrecked.connect(_on_wrecked)
	cars.append(car)
	return car


func running() -> Array[Car]:
	return cars.filter(func(c: Car) -> bool: return not c.is_wrecked)


func _process(delta: float) -> void:
	hud.remaining = running().size() if state == State.FIGHT else 0
	match state:
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
	if Input.is_action_just_pressed(&"quit"):
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
