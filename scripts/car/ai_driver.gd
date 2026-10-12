class_name AIDriver
extends Node
## A bot that plays by the zone rules: it lines up side and rear hits, uses the
## gun to knock targets off line, and backs off when its nose isn't pointed at you.

var aggression := 1.0
var skill := 1.0
var target: Car

var _retarget := 0.0
var _wander := Vector3.ZERO
# Getting unstuck: back out turning toward open ground, then drive into it.
var _maneuver := 0.0 # seconds left of the multi-point turn
var _gear := -1.0 # -1 reversing, +1 forward, within the manoeuvre
var _phase_time := 0.0
var _escaping := 0.0
var _escape_dir := Vector3.ZERO
var _since_escape := 99.0
var _progress_from := Vector3.ZERO
var _progress_time := 0.0
var _push_time := 0.0 # time spent nose-to-nose with the target at low speed
var _special_check := 0.0


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

	if _unstick(car, delta, pos, fwd):
		return
	if _disengage(car, delta, pos, fwd):
		return

	var aim_point: Vector3
	if _escaping > 0.0:
		aim_point = pos + _escape_dir * 20.0
	elif target:
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
	# A wall dead ahead overrides the chase: turn along it, toward the side with more room.
	var ahead := _probe(space, car, fwd, look)
	if ahead < look * 0.7 and _escaping <= 0.0:
		var wide_l := _probe(space, car, fwd.rotated(Vector3.UP, 1.0), look)
		var wide_r := _probe(space, car, fwd.rotated(Vector3.UP, -1.0), look)
		steer = -1.0 if wide_l > wide_r else 1.0
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
	_use_special(car, delta)


## Watch our own progress. If we haven't covered ground for a while (pinned on a
## wall, a car or a corner), find the most open direction, reverse while turning
## the nose toward it, then drive out that way before picking a fight again.
## Returns true while reversing (the inputs are already set).
func _unstick(car: Car, delta: float, pos: Vector3, fwd: Vector3) -> bool:
	_since_escape += delta
	_escaping = maxf(0.0, _escaping - delta)
	if _maneuver > 0.0:
		return _manoeuvre(car, delta, fwd)
	_progress_time += delta
	var nose: float = car.def.half_extents.z + 1.5
	var blocked := _probe_any(car, fwd, nose) < nose and absf(car.speed) < 4.0
	var window := 0.7 if blocked else 1.6
	if _progress_time >= window:
		var moved := Vector2(pos.x - _progress_from.x, pos.z - _progress_from.z).length()
		_progress_from = pos
		_progress_time = 0.0
		if moved < 0.9 * window:
			_start_escape(car, pos, fwd)
			return _manoeuvre(car, delta, fwd)
	return false


## Attack passes, not shoving matches: after a hit, if we're stuck nose-to-nose
## with the target, peel away at an angle, swing round and come back for another run.
func _disengage(car: Car, delta: float, pos: Vector3, fwd: Vector3) -> bool:
	if target == null or _escaping > 0.0:
		_push_time = 0.0
		return false
	var close := target.global_position.distance_to(pos) < 7.0
	if close and absf(car.speed) < 4.0:
		_push_time += delta
	else:
		_push_time = maxf(0.0, _push_time - delta)
	if _push_time < 0.7:
		return false
	_push_time = 0.0
	var away := pos - target.global_position
	away.y = 0.0
	away = away.normalized().rotated(Vector3.UP, randf_range(0.5, 1.0) * (1.0 if randf() < 0.5 else -1.0))
	_start_escape(car, pos, fwd, away)
	return _manoeuvre(car, delta, fwd)


func _start_escape(car: Car, pos: Vector3, fwd: Vector3, preferred := Vector3.ZERO) -> void:
	# Score eight directions by how far we could drive, nudged toward the middle
	# (or toward a preferred direction, when peeling away from a fight).
	var best := -fwd
	var best_score := -INF
	var pull := preferred if preferred != Vector3.ZERO else (-pos * Vector3(1, 0, 1)).normalized()
	for i in 8:
		var dir := fwd.rotated(Vector3.UP, TAU * i / 8.0)
		var room := _probe_any(car, dir, 14.0)
		var to_centre := pull
		var score := room + dir.dot(to_centre) * (6.0 if preferred != Vector3.ZERO else 3.0)
		if score > best_score:
			best_score = score
			best = dir
	_escape_dir = best
	_gear = -1.0
	_phase_time = 0.0
	# Stuck again soon after an escape: allow a longer shuffle.
	_maneuver = 8.0 if _since_escape < 8.0 else 6.0
	_since_escape = 0.0


## A multi-point turn: keep rotating the nose toward open ground, reversing and
## going forward in turn whenever the car stops making progress, until the way
## ahead is clear. Then drive out for a moment before picking a fight again.
func _manoeuvre(car: Car, delta: float, fwd: Vector3) -> bool:
	_maneuver -= delta
	_phase_time += delta
	var angle := fwd.signed_angle_to(_escape_dir, Vector3.UP) # positive = open ground on the left
	var clear_ahead: bool = _probe_any(car, fwd, car.def.half_extents.z + 5.0) >= car.def.half_extents.z + 5.0
	if absf(angle) < 0.5 and clear_ahead:
		_maneuver = 0.0
		_escaping = 1.8
		return false
	if _maneuver <= 0.0:
		return false # out of time without lining up: carry on and let the progress check try again
	# Change gear when we stop, or when the way we're going is blocked (shoving a truck counts).
	var reach: float = car.def.half_extents.z + 0.6 # rays start at the car's centre: this is nearly touching
	var blocked_way := _probe_any(car, fwd * _gear, reach) < reach and absf(car.speed) < 3.0
	var crawling := _phase_time > 1.6 and absf(car.speed) < 2.5 # scraping along something
	if _phase_time > 0.35 and (absf(car.speed) < 0.8 or blocked_way or crawling):
		_gear = -_gear
		_phase_time = 0.0
	car.throttle = _gear
	# Reversing with the wheels turned right swings the nose left; going forward, steer the way you want to turn.
	car.steer = signf(angle) * -_gear if absf(angle) > 0.1 else 0.0
	car.boost = false
	car.handbrake = false
	car.fire = false
	car.special = false
	return true


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


## Distance to the first wall or car along `dir`, from bumper height.
func _probe_any(car: Car, dir: Vector3, length: float) -> float:
	var from := car.global_position + Vector3.UP * 0.4
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * length, Car.LAYER_WORLD | Car.LAYER_CARS, [car.get_rid()])
	var hit := car.get_world_3d().direct_space_state.intersect_ray(q)
	return length if hit.is_empty() else from.distance_to(hit.position)


func _gun_ready(car: Car) -> bool:
	var gun := car.gun as MachineGun
	return gun != null and gun.heat < 0.75


## Check a few times a second whether the special fits the moment; a press is one tick long.
func _use_special(car: Car, delta: float) -> void:
	car.special = false
	var sp := car.special_node as Special
	if sp == null:
		return
	_special_check -= delta
	if _special_check > 0.0:
		return
	_special_check = randf_range(0.25, 0.45) / maxf(skill, 0.3)
	if (sp.is_ready() or sp.is_busy()) and sp.ai_wants(target):
		car.special = true
