class_name ThunderCannons
extends Special
## Sundowner: twin 40 mm cannons fire a six-round burst straight ahead. No aim
## assist: it's a skill shot. Every shell that lands shoves the target sideways.

const ROUNDS := 6
const GAP := 0.09
const SPEED := 190.0
const DAMAGE := 7.0
const IMPULSE := 5200.0
const RECOIL := 900.0

var _left := 0
var _timer := 0.0


func _init(owner_car: Car) -> void:
	super(owner_car)
	display_name = "Thunder Cannons"
	recharge = 7.0


func is_busy() -> bool:
	return _left > 0


func activate() -> void:
	_left = ROUNDS
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
	var side := 0.6 if _left % 2 == 0 else -0.6
	var muzzle := car.global_transform * Vector3(side, 0.42, -2.2)
	var dir := (car.forward() + Vector3.UP * 0.008).normalized()
	var shell := Shell.new().setup(car, muzzle, dir * SPEED + car.linear_velocity, DAMAGE, IMPULSE, &"heavy")
	car.get_parent().add_child(shell)
	car.apply_impulse(-dir * RECOIL, muzzle - car.global_position)
	Impact.muzzle_flash(muzzle, dir, car.is_player, 1.3)


func ai_wants(target: Car) -> bool:
	if target == null:
		return false
	var to := target.global_position - car.global_position
	return to.length() < 70.0 and car.forward().angle_to(to) < deg_to_rad(5.0)
