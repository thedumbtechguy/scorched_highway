class_name Aim
## Targeting shared by guns, specials and bots.


## Aim assist: point at the best enemy inside a cone, leading its motion.
## A car scrambled by Good Vibrations gets no assist.
static func direction(car: Car, muzzle: Vector3, fwd: Vector3, cone: float, max_range: float, speed: float) -> Vector3:
	var best := target_in_cone(car, muzzle, fwd, cone, max_range)
	if best == null or car.scrambled > 0.0:
		return (fwd + Vector3.UP * 0.01).normalized()
	var t := muzzle.distance_to(best.global_position) / speed
	var lead := best.global_position + (best.linear_velocity - car.linear_velocity) * t + Vector3.UP * 0.15
	return (lead - muzzle).normalized()


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
		var ang := fwd.angle_to(to)
		if ang > cone:
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
