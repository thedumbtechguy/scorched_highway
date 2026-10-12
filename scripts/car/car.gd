class_name Car
extends RigidBody3D
## A heavy raycast-suspension car. Drivers (player or AI) write the input fields;
## the car turns them into forces, and turns collisions into zone damage.

signal wrecked(car: Car, by: Car)
signal damaged(car: Car, amount: float, zone: StringName, by: Car)

enum Zone { FRONT, SIDE, REAR }

const ZONE_MULT := { Zone.FRONT: 0.35, Zone.SIDE: 1.0, Zone.REAR: 1.3 }
const ZONE_FRONT_BOOSTING := 0.15
const RAM_BOOST_MULT := 1.5
## Damage per kilojoule of collision energy.
const DAMAGE_PER_KJ := 0.2
## Closing speeds below this are scrapes, not hits.
const IMPACT_MIN_SPEED := 4.0
## Static scenery hurts less than another car: you chose to drive into it.
const SCENERY_MULT := 0.55
const PAIR_COOLDOWN := 0.35

const LAYER_WORLD := 1
const LAYER_CARS := 2
const LAYER_DEBRIS := 4

# --- Input, written by the driver each physics tick ---
var throttle := 0.0 # -1 (brake / reverse) .. 1
var steer := 0.0 # -1 left .. 1 right
var handbrake := false
var boost := false
var fire := false

# --- State ---
var def: Dictionary
var driver: Node
var paint := Color.WHITE
var is_player := false
var hp := 100.0
var max_hp := 100.0
var boost_meter := 100.0
var boosting := false
var is_wrecked := false
var frozen_input := false
var zone_damage := { &"front": 0.0, &"left": 0.0, &"right": 0.0, &"rear": 0.0 }
var last_attacker: Car
var gun: Node
var visual: CarVisual
var grounded_wheels := 0
var speed := 0.0 # signed, forward positive
var rpm := 0.0 # 0..1 within the current gear, for audio
var gear := 1

var _wheels: Array[Dictionary] = []
var _steer_angle := 0.0
var _vel_hist: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO, Vector3.ZERO]
var _pending_contacts: Array[Dictionary] = []
var _pair_cooldown := {}
var _upside_down_time := 0.0
var _teleport_to: Variant = null # Transform3D, applied inside the physics step


func setup(car_def: Dictionary, paint_color: Color, player: bool) -> void:
	def = car_def
	paint = paint_color
	is_player = player
	max_hp = def.hp
	hp = max_hp
	mass = def.mass
	collision_layer = LAYER_CARS
	collision_mask = LAYER_WORLD | LAYER_CARS
	can_sleep = false
	continuous_cd = true
	contact_monitor = true
	max_contacts_reported = 8
	angular_damp = 0.6
	linear_damp = 0.0
	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = Vector3(0, -0.22, 0.05)
	var he: Vector3 = def.half_extents
	var m: float = def.mass
	# Box inertia, with extra roll resistance so the car leans rather than tips.
	inertia = Vector3(
		m / 12.0 * (4.0 * he.y * he.y + 4.0 * he.z * he.z),
		m / 12.0 * (4.0 * he.x * he.x + 4.0 * he.z * he.z) * 1.1,
		m / 12.0 * (4.0 * he.x * he.x + 4.0 * he.y * he.y) * 1.6)
	var pm := PhysicsMaterial.new()
	pm.friction = 0.35
	pm.bounce = 0.05
	physics_material_override = pm

	_add_shape(Vector3(he.x, 0.33, he.z), Vector3(0, -0.02, 0))
	_add_shape(Vector3(he.x * 0.82, 0.26, 1.05), Vector3(0, 0.56, 0.2))

	visual = CarVisual.new()
	add_child(visual)
	visual.build(def, paint)

	for side in [-1.0, 1.0]:
		for front in [true, false]:
			var z: float = def.wheel_front_z if front else def.wheel_rear_z
			var w := {
				"mount": Vector3(side * def.wheel_x, def.wheel_y, z),
				"front": front,
				"side": side,
				"comp": 0.0,
				"prev_comp": 0.0,
				"grounded": false,
				"spin": 0.0,
				"slip": 0.0,
				"node": visual.add_wheel(Vector3(side * def.wheel_x, def.wheel_y, z), def.wheel_radius, side),
			}
			_wheels.append(w)


func _add_shape(half: Vector3, pos: Vector3) -> void:
	var cs := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = half * 2.0
	cs.shape = box
	cs.position = pos
	add_child(cs)


## Move the car and stop it dead. Writing global_transform on a moving rigid
## body can be overwritten by the physics step, so the move is applied in it.
func teleport(xf: Transform3D) -> void:
	_teleport_to = xf
	global_transform = xf
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	reset_physics_interpolation()


func set_driver(d: Node) -> void:
	driver = d
	add_child(d)


func forward() -> Vector3:
	return -global_basis.z


func com_world() -> Vector3:
	return global_transform * center_of_mass


func point_velocity(p: Vector3) -> Vector3:
	return linear_velocity + angular_velocity.cross(p - com_world())


func _physics_process(delta: float) -> void:
	if driver and driver.has_method("drive") and not is_wrecked:
		driver.drive(self, delta)
	if frozen_input or is_wrecked:
		throttle = 0.0
		steer = 0.0
		boost = false
		fire = false
		handbrake = is_wrecked or frozen_input

	speed = linear_velocity.dot(forward())
	_update_boost(delta)
	_update_steering(delta)
	_update_wheels(delta)
	_apply_aero()
	_air_and_recovery(delta)
	_process_contacts()
	_update_rpm()

	_vel_hist.pop_front()
	_vel_hist.append(linear_velocity)
	for k in _pair_cooldown.keys():
		_pair_cooldown[k] -= delta
		if _pair_cooldown[k] <= 0.0:
			_pair_cooldown.erase(k)


func _update_boost(delta: float) -> void:
	boosting = boost and boost_meter > 0.0 and not is_wrecked
	if boosting:
		boost_meter = maxf(0.0, boost_meter - def.boost_drain * delta)
		apply_central_force(forward() * def.boost_force)
	else:
		boost_meter = minf(100.0, boost_meter + def.boost_regen * delta)


func _update_steering(delta: float) -> void:
	var t := clampf(absf(speed) / def.top_speed, 0.0, 1.0)
	var lock := deg_to_rad(lerpf(def.steer_lock, def.steer_lock_fast, sqrt(t)))
	var target := -steer * lock
	# Heavy steering rack: it takes a moment to wind on lock.
	_steer_angle = move_toward(_steer_angle, target, delta * 2.6)


func _update_wheels(delta: float) -> void:
	var space := get_world_3d().direct_space_state
	var up := global_basis.y
	var ray_len: float = def.rest_length + def.wheel_radius
	var com := com_world()
	var per_wheel_mass: float = mass * 0.25
	grounded_wheels = 0

	for w in _wheels:
		var origin: Vector3 = global_transform * w.mount
		var q := PhysicsRayQueryParameters3D.create(origin, origin - up * ray_len, LAYER_WORLD | LAYER_CARS, [get_rid()])
		var hit := space.intersect_ray(q)
		w.prev_comp = w.comp
		if hit.is_empty():
			w.grounded = false
			w.comp = 0.0
			continue
		w.grounded = true
		grounded_wheels += 1
		var dist := origin.distance_to(hit.position)
		w.comp = clampf(ray_len - dist, 0.0, ray_len)
		var comp_vel: float = (w.comp - w.prev_comp) / delta
		var damp: float = def.damp_bump if comp_vel > 0.0 else def.damp_rebound
		var spring: float = def.spring * w.comp + damp * comp_vel
		# Bump stop near full compression, so landings thud instead of bottoming through.
		var bump_start: float = def.rest_length * 0.85
		if w.comp > bump_start:
			spring += (w.comp - bump_start) * def.spring * 8.0
		spring = maxf(spring, 0.0)
		w.load = spring
		apply_force(up * spring, origin - global_position)

	_apply_anti_roll()

	for w in _wheels:
		if not w.grounded:
			w.spin += speed / def.wheel_radius * delta
			continue
		var origin: Vector3 = global_transform * w.mount
		var contact: Vector3 = origin - up * (ray_len - w.comp)
		var fwd := forward()
		if w.front:
			fwd = fwd.rotated(up, _steer_angle)
		var right := fwd.cross(up).normalized()
		var v := point_velocity(contact)
		var v_long := v.dot(fwd)
		var v_lat := v.dot(right)
		var load: float = w.load

		# Longitudinal: drive, brake, rolling resistance.
		var f_long := 0.0
		var drive_share: float = def.drive_front if w.front else (1.0 - def.drive_front)
		if throttle > 0.0:
			var fall := 1.0 - pow(clampf(speed / def.top_speed, 0.0, 1.0), 2.0)
			f_long += throttle * def.engine_force * fall * drive_share * 0.5
		elif throttle < 0.0:
			if speed > 1.0:
				f_long -= signf(v_long) * def.brake_force * -throttle * 0.25
			else:
				var fall_r := 1.0 - clampf(-speed / def.reverse_speed, 0.0, 1.0)
				f_long += throttle * def.engine_force * 0.6 * fall_r * drive_share * 0.5
		if handbrake and not w.front:
			f_long -= signf(v_long) * def.brake_force * 0.35
		f_long -= v_long * 6.0
		# Don't let braking push the car backwards.
		var max_stop := absf(v_long) * per_wheel_mass / delta
		if throttle <= 0.0 and absf(f_long) > max_stop and signf(f_long) != signf(throttle):
			f_long = signf(f_long) * max_stop

		# Lateral: cancel sideways slip, up to the grip limit.
		var f_lat := -v_lat * per_wheel_mass / delta * 0.32
		var mu: float = def.grip
		if handbrake and not w.front:
			mu = def.grip_rear_handbrake
		var limit := mu * load
		var f := Vector2(f_long, f_lat)
		w.slip = 0.0
		if f.length() > limit:
			w.slip = clampf(f.length() / maxf(limit, 1.0) - 1.0, 0.0, 1.0)
			f = f.normalized() * limit
		# Apply traction a little above the contact patch, so the body leans without tripping over itself.
		var apply_at := contact.lerp(com, 0.45)
		apply_force(fwd * f.x + right * f.y, apply_at - global_position)
		w.spin += v_long / def.wheel_radius * delta

	visual.update_wheels(_wheels, _steer_angle, def.rest_length)


func _apply_anti_roll() -> void:
	var up := global_basis.y
	for front in [true, false]:
		var l: Dictionary
		var r: Dictionary
		for w in _wheels:
			if w.front == front:
				if w.side < 0.0:
					l = w
				else:
					r = w
		var diff: float = (l.comp - r.comp) * def.anti_roll
		if l.grounded:
			apply_force(-up * diff, (global_transform * l.mount) - global_position)
		if r.grounded:
			apply_force(up * diff, (global_transform * r.mount) - global_position)


func _apply_aero() -> void:
	var v := linear_velocity
	apply_central_force(-v * v.length() * 0.75)
	if grounded_wheels > 0:
		apply_central_force(-global_basis.y * v.length_squared() * 1.2)


func _air_and_recovery(delta: float) -> void:
	if grounded_wheels == 0 and not is_wrecked:
		# A little air control: level out and turn, like a driver working the throttle.
		var right := global_basis.x
		var pitch := (-global_basis.z).dot(Vector3.UP)
		apply_torque(right * -pitch * mass * 3.0)
		apply_torque(Vector3.UP * -steer * mass * 1.5)
		var roll := global_basis.x.dot(Vector3.UP)
		apply_torque(-global_basis.z * roll * mass * 3.0)
	# Arcade mercy: a car stuck on its roof or side rights itself.
	if global_basis.y.dot(Vector3.UP) < 0.35 and linear_velocity.length() < 3.0 and not is_wrecked:
		_upside_down_time += delta
		if _upside_down_time > 1.8:
			_upside_down_time = 0.0
			var yaw := atan2(-global_basis.z.x, -global_basis.z.z)
			teleport(Transform3D(Basis(Vector3.UP, yaw + PI), global_position + Vector3.UP * 1.5))
	else:
		_upside_down_time = 0.0


func _update_rpm() -> void:
	var s := absf(speed)
	var gears := [0.0, 11.0, 20.0, 29.0, 38.0, 60.0]
	gear = 1
	for i in range(1, gears.size() - 1):
		if s > gears[i]:
			gear = i + 1
	var lo: float = gears[gear - 1]
	var hi: float = gears[gear]
	rpm = clampf(0.2 + 0.8 * (s - lo) / (hi - lo), 0.0, 1.0)


# --- Collisions and damage ---

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
	if _teleport_to != null:
		state.transform = _teleport_to
		state.linear_velocity = Vector3.ZERO
		state.angular_velocity = Vector3.ZERO
		_teleport_to = null
		_pending_contacts.clear()
		return
	for i in state.get_contact_count():
		var other := state.get_contact_collider_object(i)
		if other == null:
			continue
		_pending_contacts.append({
			"other": other,
			"pos": state.get_contact_local_position(i),
			"normal": state.get_contact_local_normal(i),
		})


func _process_contacts() -> void:
	if _pending_contacts.is_empty():
		return
	var best := {}
	for c in _pending_contacts:
		var other: Object = c.other
		if other is RigidBody3D and not (other is Car):
			continue # debris
		var id := other.get_instance_id()
		if _pair_cooldown.has(id):
			continue
		var other_car := other as Car
		var closing := _closing_speed(c.normal, other_car)
		if closing < IMPACT_MIN_SPEED:
			continue
		if not best.has(id) or closing > best[id].closing:
			c.closing = closing
			best[id] = c
	_pending_contacts.clear()
	for id in best:
		_pair_cooldown[id] = PAIR_COOLDOWN
		var c: Dictionary = best[id]
		_resolve_impact(c.other as Car, c.pos, c.normal, c.closing)


func _closing_speed(normal: Vector3, other: Car) -> float:
	var best := 0.0
	for i in _vel_hist.size():
		var mine := _vel_hist[i]
		var theirs: Vector3 = other._vel_hist[i] if other else Vector3.ZERO
		best = maxf(best, absf((mine - theirs).dot(normal)))
	return best


func _resolve_impact(other: Car, pos: Vector3, normal: Vector3, closing: float) -> void:
	var reduced_mass := mass * 0.5
	if other:
		reduced_mass = mass * other.mass / (mass + other.mass)
	var s := closing - IMPACT_MIN_SPEED * 0.5
	var energy_kj := 0.5 * reduced_mass * s * s / 1000.0
	var zone := zone_at(pos)
	var mult: float = ZONE_MULT[zone]
	if zone == Zone.FRONT and boosting:
		mult = ZONE_FRONT_BOOSTING
	if other == null:
		mult *= SCENERY_MULT
	elif other.boosting and other.zone_at(pos) == Zone.FRONT:
		mult *= RAM_BOOST_MULT
	var dmg := energy_kj * DAMAGE_PER_KJ * mult
	take_damage(dmg, pos, other)
	# One of the pair reports the feel of the hit, so it isn't doubled.
	if other == null or get_instance_id() < other.get_instance_id():
		var involves_player := is_player or (other != null and other.is_player)
		Impact.collision(pos, normal, energy_kj, involves_player)


func zone_at(world_pos: Vector3) -> Zone:
	var local := global_transform.affine_inverse() * world_pos
	var he: Vector3 = def.half_extents
	var z := local.z / he.z
	var x := absf(local.x) / he.x
	if z < -0.62 and x < 1.05:
		return Zone.FRONT
	if z > 0.66 and x < 1.05:
		return Zone.REAR
	return Zone.SIDE


func zone_name(world_pos: Vector3) -> StringName:
	match zone_at(world_pos):
		Zone.FRONT:
			return &"front"
		Zone.REAR:
			return &"rear"
	var local := global_transform.affine_inverse() * world_pos
	return &"left" if local.x < 0.0 else &"right"


## Shell hits and other direct damage. `base` is scaled by the zone that was hit.
func take_hit(base: float, pos: Vector3, impulse: Vector3, by: Car) -> void:
	if is_wrecked:
		apply_impulse(impulse, pos - global_position)
		return
	apply_impulse(impulse, pos - global_position)
	var mult: float = ZONE_MULT[zone_at(pos)]
	take_damage(base * mult, pos, by)


func take_damage(amount: float, pos: Vector3, by: Car) -> void:
	if is_wrecked or amount <= 0.0:
		return
	var zn := zone_name(pos)
	zone_damage[zn] += amount
	visual.zone_damaged(zn, zone_damage[zn], self)
	if by and by != self:
		last_attacker = by
	hp -= amount
	damaged.emit(self, amount, zn, by)
	if hp <= 0.0:
		_wreck()


func _wreck() -> void:
	hp = 0.0
	is_wrecked = true
	boosting = false
	visual.char_paint()
	apply_central_impulse(Vector3.UP * mass * 6.5 + linear_velocity.normalized() * mass * 2.0)
	apply_torque_impulse(Vector3(randf_range(-1, 1), randf_range(-0.5, 0.5), randf_range(-1, 1)) * mass * 2.2)
	Impact.explosion(global_position, is_player or (last_attacker != null and last_attacker.is_player))
	wrecked.emit(self, last_attacker)
