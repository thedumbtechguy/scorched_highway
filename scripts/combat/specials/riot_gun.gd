class_name RiotGun
extends Special
## Lawdog: a slug shotgun aimed low. A hit on a rear quarter spins the target
## out; the closer, the harder. The spin is a real impulse, so heavy cars,
## with far more inertia, barely turn.

const RANGE := 16.0
const CONE := deg_to_rad(22.0)
const DAMAGE := 12.0
const IMPULSE := 9000.0


func _init(owner_car: Car) -> void:
	super(owner_car)
	display_name = "Riot Gun"
	recharge = 6.0


func activate() -> void:
	var muzzle := car.global_transform * Vector3(0.45, 0.4, -2.3)
	var fwd := car.forward()
	Impact.muzzle_flash(muzzle, fwd, car.is_player, 1.6)
	var target := Aim.target_in_cone(car, muzzle, fwd, CONE, RANGE)
	if target == null:
		return
	var d := muzzle.distance_to(target.global_position)
	var k := 1.0 - 0.7 * d / RANGE
	# Strike the rear corner nearest the shooter, pushing across the car: a PIT manoeuvre.
	var local_shooter := target.to_local(car.global_position)
	var side := signf(local_shooter.x) if absf(local_shooter.x) > 0.01 else 1.0
	var he: Vector3 = target.def.half_extents
	var corner := target.global_transform * Vector3(side * he.x, 0.0, he.z * 0.8)
	var push := -target.global_basis.x * side
	push.y = 0.0
	target.take_hit(DAMAGE * k, corner, push.normalized() * IMPULSE * k, car)
	Impact.shell_hit(corner, push, true, car.is_player or target.is_player)
	if car.is_player:
		Impact.hit_marker()


func ai_wants(target: Car) -> bool:
	if target == null:
		return false
	var to := target.global_position - car.global_position
	return to.length() < RANGE * 0.85 and car.forward().angle_to(to) < CONE
