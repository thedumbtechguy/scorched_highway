class_name GroundPound
extends Special
## Sidewinder: a hydraulic hop over the traffic that slams down with a shockwave.
## The faster she comes down, the bigger the blast.

const HOP := 9.0 # m/s straight up
const BASE_RADIUS := 6.0
const BASE_DAMAGE := 6.0

var _airborne := false
var _air_time := 0.0
var _fall_speed := 0.0


func _init(owner_car: Car) -> void:
	super(owner_car)
	display_name = "Ground Pound"
	recharge = 7.0


func is_ready() -> bool:
	return super() and car.grounded_wheels >= 2


func is_busy() -> bool:
	return _airborne


func activate() -> void:
	car.apply_central_impulse(Vector3.UP * car.mass * HOP + car.forward() * car.mass * 1.5)
	_airborne = true
	_air_time = 0.0
	_fall_speed = 0.0
	Impact.shockwave(car.global_position + Vector3.DOWN * 0.6, 3.0, Color(1.0, 0.8, 0.3), false)


func tick(delta: float) -> void:
	if not _airborne:
		return
	_air_time += delta
	_fall_speed = maxf(_fall_speed, -car.linear_velocity.y)
	if _air_time > 0.3 and car.grounded_wheels >= 3:
		_airborne = false
		_slam()
	elif _air_time > 6.0:
		_airborne = false


func _slam() -> void:
	var radius := BASE_RADIUS + minf(_fall_speed, 20.0) * 0.35
	var damage := BASE_DAMAGE + minf(_fall_speed, 20.0) * 1.1
	var pos := car.global_position
	var involves_player := car.is_player
	for n in get_tree().get_nodes_in_group(&"cars"):
		var c := n as Car
		if c == car:
			continue
		var to := c.global_position - pos
		var d := to.length()
		if d > radius:
			continue
		var k := 1.0 - 0.6 * d / radius
		var dir := (Vector3(to.x, 0.0, to.z).normalized() + Vector3.UP * 0.9).normalized()
		c.take_hit(damage * k, c.global_position - Vector3(to.x, 0.0, to.z).normalized() * 0.9, dir * c.mass * 6.0 * k, car)
		involves_player = involves_player or c.is_player
	Impact.shockwave(pos + Vector3.DOWN * 0.5, radius, Color(1.0, 0.75, 0.25), involves_player)


func ai_wants(target: Car) -> bool:
	return target != null and target.global_position.distance_to(car.global_position) < 9.0
