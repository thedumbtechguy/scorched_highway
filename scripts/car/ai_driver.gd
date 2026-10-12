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
var _phase_moving := false # got going in the current gear
var _pinned := {} # gears in which turning only pins us harder against something: drive them straight
var _leg_best := 0.0 # fastest we got going in the current leg
var _escaping := 0.0
var _escape_dir := Vector3.ZERO
var _since_escape := 99.0
var _progress_from := Vector3.ZERO
var _progress_time := 0.0
var _stall_time := 0.0 # driving into something without moving
var _push_time := 0.0 # time spent nose-to-nose with the target at low speed
var _last_hp := -1.0
var _hurt_by: Car # whoever hit us last, while it's fresh
var _hurt_time := 99.0
var _gun_cooling := false
var _detour := Vector3.ZERO # a waypoint around something blocking the way to the target
var _detour_time := 0.0
var _special_check := 0.0


func _init(aggr := 1.0, skl := 1.0) -> void:
	aggression = aggr
	skill = skl


func drive(car: Car, delta: float) -> void:
	_notice_hits(car, delta)
	_retarget -= delta
	if _retarget <= 0.0 or target == null or target.is_wrecked:
		_retarget = randf_range(1.5, 3.0)
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
	var fighting := target != null and _escaping <= 0.0
	if _escaping > 0.0:
		aim_point = pos + _escape_dir * 20.0
	elif target:
		aim_point = _route(car, pos, _attack_point(car, target), delta)
	else:
		if _wander == Vector3.ZERO or pos.distance_to(_wander) < 10.0:
			_wander = Vector3(randf_range(-45, 45), 0, randf_range(-45, 45))
		aim_point = _route(car, pos, _wander, delta)

	var to := aim_point - pos
	to.y = 0.0
	var angle := fwd.signed_angle_to(to.normalized(), Vector3.UP) # positive = aim point on the left
	var steer := clampf(-angle * 2.4, -1.0, 1.0)

	# Avoid walls: feel ahead and turn away from whichever side is closer.
	var heavy: bool = car.def["class"] == &"heavy"
	var look := 8.0 + absf(car.speed) * (1.0 if heavy else 0.7)
	var left_hit := _probe(car, fwd.rotated(Vector3.UP, 0.35), look)
	var right_hit := _probe(car, fwd.rotated(Vector3.UP, -0.35), look)
	if left_hit < look or right_hit < look:
		var push := (1.0 - minf(left_hit, right_hit) / look) * 1.6
		steer += push if left_hit < right_hit else -push
	# A wall dead ahead overrides the chase: turn along it, toward the side with more room.
	var ahead := _probe_front(car, fwd, look, Car.LAYER_WORLD)
	var wall_close := ahead < look * 0.7 and _escaping <= 0.0
	if wall_close:
		var wide_l := _probe(car, fwd.rotated(Vector3.UP, 1.0), look)
		var wide_r := _probe(car, fwd.rotated(Vector3.UP, -1.0), look)
		steer = -1.0 if wide_l > wide_r else 1.0
	steer = clampf(steer, -1.0, 1.0)

	var throttle := 1.0
	var handbrake := false
	if absf(angle) > 1.6 and car.speed > 14.0:
		throttle = -0.6 # brake into a hard turn
	if wall_close and car.speed > 7.0 and ahead < car.speed * (1.1 if heavy else 0.8):
		throttle = -1.0 # can't turn in time: scrub speed so the turn bites
	# Turn and fight: something worth hitting is behind us and close. Whip round.
	if fighting and absf(angle) > 2.0 and car.speed > 6.0 and car.speed < 22.0 and skill > 0.7:
		handbrake = true
		throttle = 0.4
	elif absf(angle) > 1.2 and car.speed > 12.0 and skill > 0.8:
		handbrake = true
	car.throttle = throttle
	car.steer = steer
	car.handbrake = handbrake

	car.boost = false
	car.fire = false
	if fighting:
		_fight(car, pos, fwd)
	_use_special(car, delta)


## Guns and rams. Fire in bursts with a clear line of fire; save the ram charge
## for a committed hit on a side or the rear (or anything at all, for a heavy).
func _fight(car: Car, pos: Vector3, fwd: Vector3) -> void:
	var to_t := target.global_position - pos
	to_t.y = 0.0
	var dist := to_t.length()
	var ang := absf(fwd.signed_angle_to(to_t.normalized(), Vector3.UP))
	var clear := _line_of_sight(car, target)
	# Bursts: let the barrel cool once it's hot, then open up again.
	var gun := car.gun as MachineGun
	if gun:
		if gun.heat > 0.85 or gun.overheated:
			_gun_cooling = true
		elif gun.heat < 0.35:
			_gun_cooling = false
	car.fire = clear and not _gun_cooling and ang < 0.3 and dist < 80.0
	# Ram: lined up, close enough to commit, and the hit lands somewhere that hurts.
	var exposed := absf(target.forward().dot(-to_t.normalized())) < 0.7 # we'd hit a side or rear
	var heavy: bool = car.def["class"] == &"heavy"
	var worth_it := exposed or heavy or target.hp < target.max_hp * 0.3
	car.boost = clear and worth_it and ang < 0.25 * (0.8 + aggression * 0.4) and dist > 5.0 and dist < 38.0 * aggression and car.boost_meter > 25.0


## Remember who just hit us: they become the first choice of target.
func _notice_hits(car: Car, delta: float) -> void:
	_hurt_time += delta
	if _last_hp >= 0.0 and car.hp < _last_hp - 2.0 and car.last_attacker and car.last_attacker != car:
		_hurt_by = car.last_attacker
		_hurt_time = 0.0
		if _hurt_by != target and not _hurt_by.is_wrecked:
			_retarget = minf(_retarget, 0.2)
	_last_hp = car.hp


## Head for `goal` unless something solid is in the way; then take a detour
## around whichever side opens up first, and keep it for a moment so we commit.
func _route(car: Car, pos: Vector3, goal: Vector3, delta: float) -> Vector3:
	_detour_time -= delta
	if _detour_time > 0.0 and pos.distance_to(_detour) > 6.0:
		return _detour
	var to := goal - pos
	to.y = 0.0
	var dist := to.length()
	if dist < 1.0:
		return goal
	var dir := to / dist
	var reach := minf(dist, 12.0) # nearer than this, a wall is worth planning round
	if _probe_world(car, pos, dir, reach) >= reach:
		return goal
	# Try headings either side; prefer one that opens a clear line to the goal,
	# then the smallest turn.
	var best_score := INF
	for step: float in [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]:
		var d := dir.rotated(Vector3.UP, step)
		var room := _probe_world(car, pos, d, 20.0)
		if room < 10.0:
			continue
		var w := pos + d * minf(room * 0.8, 16.0)
		var to_goal := goal - w
		to_goal.y = 0.0
		var sees := _probe_world(car, w, to_goal.normalized(), to_goal.length()) >= to_goal.length() - 1.0
		var score := absf(step) * 3.0 + (0.0 if sees else 10.0)
		if score < best_score:
			best_score = score
			_detour = w
	if best_score < INF:
		_detour_time = 1.5
		return _detour
	return goal


func _line_of_sight(car: Car, other: Car) -> bool:
	var from := car.global_position + Vector3.UP * 0.8
	var to := other.global_position + Vector3.UP * 0.6
	var q := PhysicsRayQueryParameters3D.create(from, to, Car.LAYER_WORLD, [car.get_rid()])
	return car.get_world_3d().direct_space_state.intersect_ray(q).is_empty()


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
	# Pressing on but not moving and touching something: a corner caught on a wall.
	if absf(car.throttle) > 0.3 and absf(car.speed) < 2.0 and car.get_contact_count() > 0:
		_stall_time += delta
	else:
		_stall_time = 0.0
	if _stall_time > 0.5:
		_stall_time = 0.0
		_progress_from = pos
		_progress_time = 0.0
		_start_escape(car, pos, fwd)
		return _manoeuvre(car, delta, fwd)
	var nose: float = car.def.half_extents.z + 1.5
	var blocked := _probe_front(car, fwd, nose) < nose and absf(car.speed) < 4.0
	var window := 0.7 if blocked else 1.6
	if _progress_time >= window:
		var moved := Vector2(pos.x - _progress_from.x, pos.z - _progress_from.z).length()
		_progress_from = pos
		_progress_time = 0.0
		if moved < 2.0 * window: # under 2 m/s on the throttle is stuck, or shoving something that won't move
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
	_phase_moving = false
	_pinned.clear()
	_leg_best = 0.0
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
	var clear_ahead: bool = _probe_front(car, fwd, car.def.half_extents.z + 5.0) >= car.def.half_extents.z + 5.0
	if absf(angle) < 0.5 and clear_ahead:
		_maneuver = 0.0
		_escaping = 1.8
		return false
	if _maneuver <= 0.0:
		if absf(car.speed) > 3.0:
			return false # out of time but moving: carry on and let the progress check watch
		# Out of time and still hemmed in: look again from here.
		_start_escape(car, car.global_position, fwd)
	# Change gear when we stop, or when the way we're going is blocked (shoving a truck counts).
	# Speed is measured in the direction of the gear, and only once the car has had a
	# moment to get going: passing through zero while changing direction isn't stopping.
	var going := car.speed * _gear
	if going > 1.5:
		_phase_moving = true
	_leg_best = maxf(_leg_best, going)
	var reach: float = car.def.half_extents.z + 0.6 # rays start at the car's centre: this is nearly touching
	var blocked_way := _probe_front(car, fwd * _gear, reach) < reach and going < 3.0
	var stopped := going < 0.8 and (_phase_moving or _phase_time > 1.0)
	var touching := car.get_contact_count() > 0
	var crawling := going < 2.5 and _phase_time > (0.9 if touching else 1.4) # scraping along something
	var backed_off := _gear < 0.0 and _phase_time > 1.4 # far enough: turning forward is quicker
	if _phase_time > 0.35 and (stopped or blocked_way or crawling or backed_off):
		# Pressed flank-on against something, full lock in this gear only pins us harder:
		# from now on, drive this gear straight and do the turning in the other.
		if touching and _leg_best < 3.0 and absf(car.steer) > 0.0:
			_pinned[_gear] = true
		_leg_best = 0.0
		_gear = -_gear
		_phase_time = 0.0
		_phase_moving = false
	car.throttle = _gear
	# Reversing with the wheels turned right swings the nose left; going forward, steer the way you want to turn.
	car.steer = signf(angle) * -_gear if absf(angle) > 0.1 and not _pinned.has(_gear) else 0.0
	car.boost = false
	car.handbrake = false
	car.fire = false
	car.special = false
	return true


## Where to drive to land a good hit. By default, straight at where the target
## will be, so the gun bears. With a ram charged, light and medium cars avoid a
## target's ram bar and swing wide to arrive at its side; heavies don't care and
## go straight through. A badly damaged bot keeps its distance and uses the gun.
func _attack_point(car: Car, t: Car) -> Vector3:
	var pos := car.global_position
	var tpos := t.global_position
	var dist := pos.distance_to(tpos)
	var lead_time := clampf(dist / maxf(absf(car.speed), 12.0), 0.0, 1.2) * skill
	var predicted := tpos + t.linear_velocity * lead_time
	var away := pos - tpos
	away.y = 0.0
	if car.hp < car.max_hp * 0.3 and dist < 28.0:
		# Hurt: circle at range rather than trading hits.
		return tpos + away.normalized().rotated(Vector3.UP, 1.2) * 30.0
	if car.def["class"] == &"heavy":
		return predicted
	var t_fwd := t.forward()
	t_fwd.y = 0.0
	var facing_us := t_fwd.normalized().dot(away.normalized())
	# Swing wide only to set up a ram; otherwise keep the nose (and the gun) on them.
	var ram_ready := car.boost_meter > 40.0 and dist < 35.0
	if ram_ready and facing_us > 0.4 and dist > 10.0:
		var side := t.global_basis.x
		side.y = 0.0
		var sign_ := signf(side.dot(away)) if absf(side.dot(away)) > 0.1 else 1.0
		return predicted + side.normalized() * sign_ * clampf(dist * 0.4, 6.0, 14.0)
	return predicted


## Score every rival: close is good, someone who just hit us is better, a
## wounded car is tempting, and a target already swarmed by other bots is not.
func _pick_target(car: Car) -> Car:
	var best: Car
	var best_score := INF
	var swarm := {}
	for n in car.get_tree().get_nodes_in_group(&"cars"):
		var c := n as Car
		if c == car or c.is_wrecked or not (c.driver is AIDriver):
			continue
		var their: Car = (c.driver as AIDriver).target
		if their:
			swarm[their] = swarm.get(their, 0) + 1
	for n in car.get_tree().get_nodes_in_group(&"cars"):
		var c := n as Car
		if c == car or c.is_wrecked:
			continue
		var score := car.global_position.distance_to(c.global_position)
		if c == _hurt_by and _hurt_time < 6.0:
			score -= 30.0
		score -= (1.0 - c.hp / c.max_hp) * 20.0
		var others: int = swarm.get(c, 0) - (1 if c == target else 0)
		if others >= 2:
			score += 25.0 * (others - 1)
		if c.is_player:
			score -= 8.0 # the player is the most interesting thing in the arena
		if not _line_of_sight(car, c):
			score += 12.0
		if score < best_score:
			best_score = score
			best = c
	return best


## Where the feelers start: bumper height, just above the underside of the body,
## so low walls, ramp sides and kerbs register. `off` shifts it sideways.
func _bumper(car: Car, off := Vector3.ZERO) -> Vector3:
	var he: Vector3 = car.def.half_extents
	return car.global_position + car.global_basis.y * (0.35 - he.y) + off


## Distance to the first solid thing along `dir`. Slopes gentle enough to drive
## up (ramps) don't count: those are road, not walls.
func _cast(car: Car, from: Vector3, dir: Vector3, length: float, mask: int) -> float:
	var space := car.get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * length, mask, [car.get_rid()])
	var hit := space.intersect_ray(q)
	if hit.is_empty():
		return length
	var n: Vector3 = hit.normal
	if n.y > 0.75:
		return length
	return from.distance_to(hit.position)


## Distance to the nearest wall along `dir`, from `from_pos` (for planning routes).
func _probe_world(car: Car, from_pos: Vector3, dir: Vector3, length: float) -> float:
	return _cast(car, _bumper(car) - car.global_position + from_pos, dir, length, Car.LAYER_WORLD)


## Distance to the nearest wall along `dir`.
func _probe(car: Car, dir: Vector3, length: float) -> float:
	return _cast(car, _bumper(car), dir, length, Car.LAYER_WORLD)


## Distance to the first wall or car along `dir`.
func _probe_any(car: Car, dir: Vector3, length: float) -> float:
	return _cast(car, _bumper(car), dir, length, Car.LAYER_WORLD | Car.LAYER_CARS)


## Like _probe_any, but from both corners as well as the middle, so a corner
## caught on a wall counts as blocked.
func _probe_front(car: Car, dir: Vector3, length: float, mask := Car.LAYER_WORLD | Car.LAYER_CARS) -> float:
	var he: Vector3 = car.def.half_extents
	var side := dir.cross(Vector3.UP).normalized() * he.x * 0.9
	var nearest := length
	for off: Vector3 in [Vector3.ZERO, side, -side]:
		nearest = minf(nearest, _cast(car, _bumper(car, off), dir, length, mask))
	return nearest


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
