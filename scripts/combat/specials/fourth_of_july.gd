class_name FourthOfJuly
extends Special
## Picket Fence: the kids light the roof rack. Six fireworks mortars arc high and
## rain on the nearest rival, ahead or behind, leading its motion.

const SHOTS := 6
const GAP := 0.13
const FLIGHT := 1.5
const GRAVITY := 18.0
const RADIUS := 4.5
const DAMAGE := 14.0
const IMPULSE := 6500.0
const RANGE := 80.0

var _left := 0
var _timer := 0.0
var _target: Car
var _point := Vector3.ZERO


func _init(owner_car: Car) -> void:
	super(owner_car)
	display_name = "Fourth of July"
	recharge = 10.0


func is_busy() -> bool:
	return _left > 0


func activate() -> void:
	_target = Aim.nearest(car, RANGE)
	_point = car.global_position + car.forward() * 35.0
	_left = SHOTS
	_timer = 0.0


func tick(delta: float) -> void:
	if _left <= 0 or car.is_wrecked:
		_left = 0
		return
	_timer -= delta
	if _timer > 0.0:
		return
	_timer = GAP
	_left -= 1
	var aim := _point
	if is_instance_valid(_target) and not _target.is_wrecked:
		aim = _target.global_position + _target.linear_velocity * FLIGHT
	aim += Vector3(randf_range(-3.0, 3.0), 0.0, randf_range(-3.0, 3.0))
	var from := car.global_transform * Vector3(randf_range(-0.3, 0.3), 1.3, -0.4)
	# Ballistic launch so the shell lands on `aim` after FLIGHT seconds.
	var vel := (aim - from) / FLIGHT + Vector3.UP * 0.5 * GRAVITY * FLIGHT
	var shell := Shell.new().setup(car, from, vel, DAMAGE, IMPULSE, &"firework").with_blast(RADIUS, GRAVITY, FLIGHT + 1.0)
	car.get_parent().add_child(shell)
	Impact.muzzle_flash(from, Vector3.UP, car.is_player, 0.7)


func ai_wants(target: Car) -> bool:
	if target == null:
		return false
	var d := target.global_position.distance_to(car.global_position)
	return d > 15.0 and d < 70.0
