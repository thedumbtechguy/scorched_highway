class_name AIDriver
extends Node
## A bot that plays by the zone rules: it lines up side and rear hits, uses the
## gun to knock targets off line, and backs off when its nose isn't pointed at you.

var aggression := 1.0
var skill := 1.0
var target: Car

var _retarget := 0.0
var _stuck_time := 0.0
var _reversing := 0.0
var _reverse_steer := 1.0
var _wander := Vector3.ZERO


func _init(aggr := 1.0, skl := 1.0) -> void:
	aggression = aggr
	skill = skl


func drive(car: Car, delta: float) -> void:
	_retarget -= delta
	if _retarget <= 0.0 or target == null or target.is_wrecked:
		_retarget = randf_range(2.5, 4.5)
		target = _pick_target(car)

	var pos := car.global_position
	var fwd := car.forward()
	fwd.y = 0.0
	fwd = fwd.normalized()

	# Unstick: reverse out when we've been pinned against something.
	if _reversing > 0.0:
		_reversing -= delta
		car.throttle = -1.0
		car.steer = _reverse_steer
		car.boost = false
		car.handbrake = false
		car.fire = false
		return
	if absf(car.speed) < 2.0 and car.throttle > 0.5:
		_stuck_time += delta
		if _stuck_time > 1.2:
			_stuck_time = 0.0
			_reversing = randf_range(0.9, 1.4)
			_reverse_steer = 1.0 if randf() < 0.5 else -1.0
	else:
		_stuck_time = 0.0

	var aim_point: Vector3
	if target:
		aim_point = _attack_point(car, target)
	else:
		if _wander == Vector3.ZERO or pos.distance_to(_wander) < 10.0:
			_wander = Vector3(randf_range(-45, 45), 0, randf_range(-45, 45))
		aim_point = _wander

	var to := aim_point - pos
	to.y = 0.0
	var dist := to.length()
	var angle := fwd.signed_angle_to(to.normalized(), Vector3.UP) # positive = target on the left
	var steer := clampf(-angle * 2.2, -1.0, 1.0)

	# Avoid walls: feel ahead and turn away from whichever side is closer.
	var look := 8.0 + absf(car.speed) * 0.6
	var space := car.get_world_3d().direct_space_state
	var left_hit := _probe(space, car, fwd.rotated(Vector3.UP, 0.35), look)
	var right_hit := _probe(space, car, fwd.rotated(Vector3.UP, -0.35), look)
	if left_hit < look or right_hit < look:
		var push := (1.0 - minf(left_hit, right_hit) / look) * 1.6
		steer += push if left_hit < right_hit else -push
	steer = clampf(steer, -1.0, 1.0)

	var throttle := 1.0
	if absf(angle) > 1.6 and car.speed > 14.0:
		throttle = -0.6 # brake into a hard turn
	car.throttle = throttle
	car.steer = steer
	car.handbrake = absf(angle) > 1.2 and car.speed > 12.0 and skill > 0.8

	var lined_up := absf(angle) < 0.18
	car.boost = target != null and lined_up and dist < 38.0 * aggression and dist > 6.0 and car.boost_meter > 30.0
	car.fire = target != null and lined_up and dist < 90.0 and _gun_ready(car)


## Go for the target's weakest side: lead its motion and swing wide to hit it side-on.
func _attack_point(car: Car, t: Car) -> Vector3:
	var tpos := t.global_position
	var dist := car.global_position.distance_to(tpos)
	var lead_time := clampf(dist / maxf(absf(car.speed), 10.0), 0.0, 1.5) * skill
	var predicted := tpos + t.linear_velocity * lead_time
	# Flank: aim beside the target's nose so we arrive at its side, not its ram bar.
	var t_fwd := t.forward()
	t_fwd.y = 0.0
	var facing_us := t_fwd.normalized().dot((car.global_position - tpos).normalized())
	if facing_us > 0.5 and dist > 14.0:
		var side := t.global_basis.x
		side.y = 0.0
		var sign_ := signf(side.dot(car.global_position - tpos))
		return predicted + side.normalized() * sign_ * 10.0
	return predicted


func _pick_target(car: Car) -> Car:
	var best: Car
	var best_d := INF
	for n in car.get_tree().get_nodes_in_group(&"cars"):
		var c := n as Car
		if c == car or c.is_wrecked:
			continue
		var d := car.global_position.distance_to(c.global_position)
		if c.is_player:
			d *= 0.75 # the player is the most interesting thing in the arena
		if d < best_d:
			best_d = d
			best = c
	return best


func _probe(space: PhysicsDirectSpaceState3D, car: Car, dir: Vector3, length: float) -> float:
	var from := car.global_position + Vector3.UP * 0.3
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * length, Car.LAYER_WORLD, [car.get_rid()])
	var hit := space.intersect_ray(q)
	return length if hit.is_empty() else from.distance_to(hit.position)


func _gun_ready(car: Car) -> bool:
	var gun := car.gun as Autocannon
	return gun != null and gun.heat < 0.75
