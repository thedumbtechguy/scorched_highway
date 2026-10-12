class_name Aim
## Targeting shared by guns, specials and bots.


## Aim assist: point at the best enemy inside a cone, leading its motion.
## A car scrambled by Good Vibrations gets no assist.
static func direction(car: Car, muzzle: Vector3, fwd: Vector3, cone: float, max_range: float, speed: float) -> Vector3:
	var best := target_in_cone(car, muzzle, fwd, cone, max_range)
	if best == null or car.scrambled > 0.0:
		return zeroed(car, muzzle, fwd)
	var t := muzzle.distance_to(best.global_position) / speed
	var lead := best.global_position + (best.linear_velocity - car.linear_velocity) * t + Vector3.UP * 0.15
	return (lead - muzzle).normalized()


## Where an unassisted shot goes: along the ground the car is driving on (not
## wherever the nose happens to be pitched), dropping to the height of a low
## car's body at a typical fighting range, so a gun on a truck roof still hits
## a buggy instead of sailing over it.
const ZERO_RANGE := 30.0
const MAX_PITCH := deg_to_rad(30.0)
const ZERO_HEIGHT := 0.75

static func zeroed(car: Car, muzzle: Vector3, fwd: Vector3) -> Vector3:
	var down := PhysicsRayQueryParameters3D.create(muzzle, muzzle + Vector3.DOWN * 6.0, Car.LAYER_WORLD, [car.get_rid()])
	var ground := car.get_world_3d().direct_space_state.intersect_ray(down)
	if ground.is_empty():
		return fwd # airborne: fire where the nose points
	var n: Vector3 = ground.normal
	var along := (fwd - n * fwd.dot(n)).normalized()
	var aim_at: Vector3 = ground.position + along * ZERO_RANGE + n * ZERO_HEIGHT
	return (aim_at - muzzle).normalized()


static func target_in_cone(car: Car, from: Vector3, fwd: Vector3, cone: float, max_range: float) -> Car:
	var best: Car
	var best_score := INF
	for n in car.get_tree().get_nodes_in_group(&"cars"):
		var c := n as Car
		if c == car or c.is_wrecked:
			continue
		var to := c.global_position - from
		var d := to.length()
		if d > max_range or d < 0.5:
			continue
		# The cone is judged left-right only: a low car close in under a tall gun sits
		# well below the nose but is plainly in the sights.
		var flat_fwd := Vector3(fwd.x, 0, fwd.z).normalized()
		var flat_to := Vector3(to.x, 0, to.z).normalized()
		var ang := flat_fwd.angle_to(flat_to)
		if ang > cone or absf(asin(clampf(to.y / d, -1.0, 1.0))) > MAX_PITCH:
			continue
		var score := ang * 40.0 + d
		if score < best_score:
			best_score = score
			best = c
	return best


## Nearest living enemy within range, optionally only those whose bearing from
## the car's nose is between min_angle and max_angle (radians).
static func nearest(car: Car, max_range: float, min_angle := 0.0, max_angle := PI) -> Car:
	var best: Car
	var best_d := max_range
	var fwd := car.forward()
	for n in car.get_tree().get_nodes_in_group(&"cars"):
		var c := n as Car
		if c == car or c.is_wrecked:
			continue
		var to := c.global_position - car.global_position
		var d := to.length()
		if d >= best_d:
			continue
		var ang := fwd.angle_to(to)
		if ang < min_angle or ang > max_angle:
			continue
		best_d = d
		best = c
	return best


static func count_within(car: Car, radius: float) -> int:
	var n := 0
	for o in car.get_tree().get_nodes_in_group(&"cars"):
		var c := o as Car
		if c != car and not c.is_wrecked and c.global_position.distance_to(car.global_position) < radius:
			n += 1
	return n
