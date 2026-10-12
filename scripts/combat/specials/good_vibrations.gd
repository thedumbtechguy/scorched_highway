class_name GoodVibrations
extends Special
## Moonbeam: a 360-degree blast from the roof speakers. Throws nearby cars
## outward, knocks projectiles out of the air, snaps tow chains and scrambles
## everyone's aim. Little damage: it's the roster's counter.

const RADIUS := 14.0
const DAMAGE := 4.0
const PUSH := 9.0 # m/s given to a car at the centre
const SCRAMBLE := 3.0


func _init(owner_car: Car) -> void:
	super(owner_car)
	display_name = "Good Vibrations"
	recharge = 9.0


func activate() -> void:
	var pos := car.global_position
	var involves_player := car.is_player
	for n in get_tree().get_nodes_in_group(&"cars"):
		var c := n as Car
		if c == car:
			continue
		var to := c.global_position - pos
		var d := to.length()
		if d > RADIUS:
			continue
		var k := 1.0 - 0.5 * d / RADIUS
		var dir := (Vector3(to.x, 0.0, to.z).normalized() + Vector3.UP * 0.35).normalized()
		c.take_hit(DAMAGE * k, c.global_position - dir * 0.9, dir * c.mass * PUSH * k, car)
		c.scrambled = SCRAMBLE
		involves_player = involves_player or c.is_player
	for p in get_tree().get_nodes_in_group(&"projectiles"):
		var shell := p as Node3D
		if shell and shell.global_position.distance_to(pos) < RADIUS and shell.get("shooter") != car:
			shell.call("deflect")
	for h in get_tree().get_nodes_in_group(&"tow_hooks"):
		var hook := h as TowHook
		if hook and hook.is_attached() and (hook.target == car or hook.car.global_position.distance_to(pos) < RADIUS or hook.target.global_position.distance_to(pos) < RADIUS):
			hook.release()
	Impact.shockwave(pos, RADIUS, Color(0.6, 0.45, 1.0), involves_player)


func ai_wants(_target: Car) -> bool:
	if car.hooked_by != null:
		return true
	if Aim.count_within(car, RADIUS * 0.8) >= 2:
		return true
	for p in get_tree().get_nodes_in_group(&"projectiles"):
		var shell := p as Node3D
		if shell and shell.get("shooter") != car and shell.global_position.distance_to(car.global_position) < 18.0:
			return true
	return false
