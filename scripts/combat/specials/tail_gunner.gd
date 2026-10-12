class_name TailGunner
extends Special
## Double Trouble: Stella swivels the sidecar gun onto whoever's closest behind or
## beside them and keeps firing for a few seconds while Stan drives. Shoot the
## sidecar off and the special is gone.

const DURATION := 4.0
const INTERVAL := 0.1
const RANGE := 55.0
const MIN_ANGLE := deg_to_rad(50.0) # from the nose: behind and beside only
const SPEED := 170.0
const DAMAGE := 2.2
const IMPULSE := 900.0

var _left := 0.0
var _timer := 0.0


func _init(owner_car: Car) -> void:
	super(owner_car)
	display_name = "Tail Gunner"
	recharge = 9.0


func is_available() -> bool:
	return car.visual.has_part(&"sidecar")


func is_busy() -> bool:
	return _left > 0.0


func activate() -> void:
	_left = DURATION
	_timer = 0.0


func tick(delta: float) -> void:
	var turret := car.visual.turret
	if _left <= 0.0:
		return
	if not is_available() or car.is_wrecked:
		_left = 0.0
		return
	_left -= delta
	var target := Aim.nearest(car, RANGE, MIN_ANGLE)
	if target == null:
		return
	var muzzle := turret.global_position if is_instance_valid(turret) else global_position
	var t := muzzle.distance_to(target.global_position) / SPEED
	var aim := target.global_position + (target.linear_velocity - car.linear_velocity) * t + Vector3.UP * 0.2
	if is_instance_valid(turret):
		# The barrel points along the turret's +Z.
		turret.look_at(muzzle - (aim - muzzle), Vector3.UP)
	_timer -= delta
	if _timer > 0.0:
		return
	_timer = INTERVAL
	var dir := (aim - muzzle).normalized()
	var shell := Shell.new().setup(car, muzzle + dir * 0.9, dir * SPEED + car.linear_velocity, DAMAGE, IMPULSE, &"bullet")
	car.get_parent().add_child(shell)
	Impact.muzzle_flash(muzzle + dir * 0.9, dir, car.is_player, 0.4)


func ai_wants(_target: Car) -> bool:
	return Aim.nearest(car, 40.0, MIN_ANGLE) != null
