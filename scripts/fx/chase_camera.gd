class_name ChaseCamera
extends Camera3D
## A camera with mass: it trails the car, swings with its velocity rather than
## its nose, widens with speed, and takes trauma (shake) and kicks from hits.

const DISTANCE := 7.2
const HEIGHT := 2.6
const LOOK_AHEAD := 5.0
const BASE_FOV := 64.0

var target: Car
var trauma := 0.0
## Car selection: circle slowly around the parked car.
var orbit := false
var _orbit_angle := 0.6
var _dir := Vector3.FORWARD
var _kick := Vector3.ZERO
var _kick_vel := Vector3.ZERO
var _noise := FastNoiseLite.new()
var _t := 0.0
var _pos := Vector3.ZERO


func _ready() -> void:
	top_level = true
	fov = BASE_FOV
	near = 0.1
	far = 1500.0
	_noise.frequency = 2.2
	process_mode = Node.PROCESS_MODE_ALWAYS
	add_poster_pass(self)


## The comic-ink finish for any camera: crease lines from the depth-and-normal
## buffer (Forward+ only; every renderer gets the ink hulls), a little paper grain
## and a vignette. No halftone: the shade is hatched on the surfaces themselves.
static func add_poster_pass(cam: Camera3D) -> void:
	var quad := MeshInstance3D.new()
	quad.mesh = QuadMesh.new()
	quad.extra_cull_margin = 16384.0
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var m := ShaderMaterial.new()
	if RenderingServer.get_current_rendering_method() == "forward_plus":
		m.shader = load("res://shaders/poster_post.gdshader")
		m.set_shader_parameter("outline_px", 2.0)
		m.set_shader_parameter("outline_color", Poster.INK)
	else:
		m.shader = load("res://shaders/poster_print.gdshader")
	m.set_shader_parameter("halftone", 0.0)
	m.set_shader_parameter("grain", 0.035)
	m.set_shader_parameter("vignette", 0.22)
	quad.material_override = m
	cam.add_child(quad)
	quad.position = Vector3(0, 0, -1)


func snap() -> void:
	if target == null:
		return
	_dir = target.forward()
	_dir.y = 0.0
	_dir = _dir.normalized()
	_pos = target.global_position - _dir * DISTANCE + Vector3.UP * HEIGHT
	global_position = _pos
	look_at(target.global_position + _dir * LOOK_AHEAD, Vector3.UP)
	reset_physics_interpolation()


func add_trauma(amount: float, kick := Vector3.ZERO) -> void:
	trauma = minf(trauma + amount, 1.0)
	_kick_vel += kick * 12.0


func _process(delta: float) -> void:
	if target == null:
		return
	# Real time, so shake keeps moving during hitstop and slow motion.
	var dt := delta / maxf(Engine.time_scale, 0.001)
	dt = minf(dt, 0.05)
	_t += dt
	var gdt := delta # game time, for following the car

	var car_pos := target.get_global_transform_interpolated().origin
	# Bigger bodies need the camera further back and higher.
	var size := clampf(target.def.half_extents.z / 2.3, 0.85, 1.35)
	if orbit:
		_orbit_angle += dt * 0.35
		var p := car_pos + Vector3(sin(_orbit_angle), 0.0, cos(_orbit_angle)) * 7.5 * size + Vector3.UP * 1.6 * size
		global_position = p
		look_at(car_pos + Vector3.UP * 0.3 * size, Vector3.UP)
		fov = BASE_FOV - 10.0
		return
	var fwd := target.forward()
	fwd.y = 0.0
	fwd = fwd.normalized()
	var vel := target.linear_velocity
	vel.y = 0.0
	var want := fwd
	if vel.length() > 4.0 and target.speed > 0.0:
		want = fwd.lerp(vel.normalized(), 0.55).normalized()
	_dir = _dir.slerp(want, 1.0 - exp(-3.2 * gdt)).normalized()

	var desired := car_pos - _dir * DISTANCE * size + Vector3.UP * HEIGHT * size
	# Keep the camera out of rock walls.
	var space := target.get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(car_pos + Vector3.UP * 1.2, desired, Car.LAYER_WORLD)
	var hit := space.intersect_ray(q)
	if not hit.is_empty():
		desired = hit.position + (car_pos - desired).normalized() * 0.6
	_pos = _pos.lerp(desired, 1.0 - exp(-9.0 * gdt))
	# Never let the car outrun the frame.
	var off := _pos - car_pos
	if off.length() > DISTANCE * size * 1.6:
		_pos = car_pos + off.normalized() * DISTANCE * size * 1.6

	# Kick: a damped spring that recovers in real time.
	_kick_vel += (-_kick * 140.0 - _kick_vel * 14.0) * dt
	_kick += _kick_vel * dt
	trauma = maxf(trauma - dt * 1.4, 0.0)
	var shake := trauma * trauma
	var jitter := Vector3(
		_noise.get_noise_2d(_t * 60.0, 0.0),
		_noise.get_noise_2d(0.0, _t * 60.0),
		_noise.get_noise_2d(_t * 60.0, 100.0)) * shake * 0.45

	global_position = _pos + _kick + jitter
	look_at(car_pos + _dir * LOOK_AHEAD + Vector3.UP * 0.9 * size, Vector3.UP)
	rotate_object_local(Vector3.FORWARD, _noise.get_noise_2d(_t * 40.0, 50.0) * shake * 0.08)

	var spd := clampf(absf(target.speed) / 45.0, 0.0, 1.0)
	var want_fov := BASE_FOV + spd * 14.0 + (7.0 if target.boosting else 0.0)
	fov = lerpf(fov, want_fov, 1.0 - exp(-4.0 * dt))
