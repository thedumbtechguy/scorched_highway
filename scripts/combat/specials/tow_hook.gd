class_name TowHook
extends Special
## Long Haul: a harpoon on a chain. Hook a car, drag it, then let go mid-swing to
## sling it (press again, or it lets go on its own). The chain only pulls, like
## a real one, and both cars feel it: a light car gets thrown around, a heavy
## one drags the truck.

const SPEED := 90.0
const RANGE := 40.0
const HOLD := 5.0
const STIFFNESS := 60000.0
const DAMPING := 9000.0
const MIN_LENGTH := 6.0
const REEL := 3.0 # metres per second the winch pulls in
const DAMAGE := 6.0

enum State { IDLE, FLYING, ATTACHED }

var state := State.IDLE
var target: Car
var _anchor := Vector3.ZERO # on the target, in its local space
var _length := 0.0
var _held := 0.0
var _harpoon := Vector3.ZERO
var _harpoon_vel := Vector3.ZERO
var _chain: MeshInstance3D


func _init(owner_car: Car) -> void:
	super(owner_car)
	display_name = "Tow Hook"
	recharge = 10.0
	add_to_group(&"tow_hooks")


func _ready() -> void:
	_chain = MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.06
	cm.bottom_radius = 0.06
	cm.height = 1.0
	cm.radial_segments = 6
	_chain.mesh = cm
	_chain.material_override = Poster.shared(Color(0.9, 0.88, 0.82), &"chrome")
	_chain.top_level = true
	_chain.visible = false
	add_child(_chain)


func is_busy() -> bool:
	return state != State.IDLE


func is_attached() -> bool:
	return state == State.ATTACHED and is_instance_valid(target)


func activate() -> void:
	state = State.FLYING
	_harpoon = global_position
	_harpoon_vel = car.forward() * SPEED + car.linear_velocity
	var aim := Aim.target_in_cone(car, _harpoon, car.forward(), deg_to_rad(12.0), RANGE)
	if aim and car.scrambled <= 0.0:
		_harpoon_vel = (aim.global_position - _harpoon).normalized() * SPEED + car.linear_velocity
	Impact.muzzle_flash(_harpoon, car.forward(), car.is_player, 0.8)


func on_press_while_busy() -> void:
	release()


func release() -> void:
	if is_instance_valid(target):
		target.hooked_by = null
	target = null
	state = State.IDLE
	_chain.visible = false


func tick(delta: float) -> void:
	match state:
		State.FLYING:
			_fly(delta)
		State.ATTACHED:
			_pull(delta)
	_draw_chain()


func _fly(delta: float) -> void:
	var to := _harpoon + _harpoon_vel * delta
	var q := PhysicsRayQueryParameters3D.create(_harpoon, to, Car.LAYER_WORLD | Car.LAYER_CARS, [car.get_rid()])
	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	if not hit.is_empty():
		var c := hit.collider as Car
		if c and not c.is_wrecked:
			target = c
			target.hooked_by = self
			_anchor = c.to_local(hit.position)
			_length = maxf(global_position.distance_to(hit.position), MIN_LENGTH)
			_held = 0.0
			state = State.ATTACHED
			c.take_hit(DAMAGE, hit.position, _harpoon_vel.normalized() * 1500.0, car)
			Impact.shell_hit(hit.position, hit.normal, true, car.is_player or c.is_player)
			return
		release()
		return
	_harpoon = to
	if _harpoon.distance_to(global_position) > RANGE:
		release()


func _pull(delta: float) -> void:
	if not is_instance_valid(target) or target.is_wrecked or car.is_wrecked:
		release()
		return
	_held += delta
	if _held > HOLD:
		release()
		return
	_length = maxf(MIN_LENGTH, _length - REEL * delta)
	var a := target.global_transform * _anchor
	var h := global_position
	var span := h - a
	var d := span.length()
	if d <= _length:
		return
	var dir := span / d
	var rel := (target.point_velocity(a) - car.point_velocity(h)).dot(dir)
	var force := maxf(0.0, STIFFNESS * (d - _length) + DAMPING * rel)
	target.apply_force(dir * force, a - target.global_position)
	car.apply_force(-dir * force, h - car.global_position)


func _draw_chain() -> void:
	var from := global_position
	var to: Vector3
	if state == State.FLYING:
		to = _harpoon
	elif is_attached():
		to = target.global_transform * _anchor
	else:
		_chain.visible = false
		return
	var d := from.distance_to(to)
	if d < 0.05:
		_chain.visible = false
		return
	_chain.visible = true
	var mid := (from + to) * 0.5
	var dir := (to - from) / d
	var axis := Vector3.UP.cross(dir)
	var basis := Basis.IDENTITY
	if axis.length() > 0.0001:
		basis = Basis(axis.normalized(), Vector3.UP.angle_to(dir))
	_chain.global_transform = Transform3D(basis.scaled(Vector3(1.0, d, 1.0)), mid)


func ai_wants(target_car: Car) -> bool:
	if target_car == null:
		return false
	if state == State.ATTACHED:
		return _held > 2.5 # let go and sling it
	var to := target_car.global_position - car.global_position
	return to.length() < RANGE * 0.8 and car.forward().angle_to(to) < deg_to_rad(10.0)
