extends Node
## Autoload "Impact": everything that makes a hit feel like a hit. Hitstop,
## slow motion, camera trauma, sparks, debris, fireballs, flying panels, and
## the sounds that go with them. Gameplay code reports events; this decides the feel.

signal player_hit_confirmed

var camera: Node # ChaseCamera, registered by the game
var enabled_time_effects := true

var _base_scale := 1.0
var _hitstop_until := 0.0
var _slowmo_until := 0.0
## Unscaled time, advanced per frame, so hitstop and slow motion last the same
## whether the game runs live or frame by frame (tests, movie capture).
var _clock := 0.0

static var _spark_mesh: Mesh
static var _chunk_mesh: Mesh
static var _smoke_mesh: Mesh
static var _fire_mat: StandardMaterial3D
static var _chunk_mat: StandardMaterial3D


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_make_shared()


func _process(delta: float) -> void:
	var real := delta / maxf(Engine.time_scale, 0.0001)
	_clock += real
	if _clock >= _slowmo_until:
		_base_scale = move_toward(_base_scale, 1.0, real * 2.5)
	Engine.time_scale = 0.03 if _clock < _hitstop_until else _base_scale


func reset() -> void:
	_base_scale = 1.0
	_hitstop_until = 0.0
	_slowmo_until = 0.0
	Engine.time_scale = 1.0


func hitstop(seconds: float) -> void:
	if not enabled_time_effects:
		return
	_hitstop_until = maxf(_hitstop_until, _clock + seconds)


func slowmo(scale: float, seconds: float) -> void:
	if not enabled_time_effects:
		return
	_base_scale = scale
	_slowmo_until = _clock + seconds


func shake(trauma: float, kick := Vector3.ZERO) -> void:
	if camera and camera.has_method("add_trauma"):
		camera.add_trauma(trauma, kick)


# --- Events ---

func collision(pos: Vector3, normal: Vector3, energy_kj: float, involves_player: bool) -> void:
	var k := clampf(energy_kj / 250.0, 0.0, 1.0)
	_sparks(pos, normal, int(lerpf(14, 90, k)), lerpf(6.0, 16.0, k))
	_chunks(pos, normal, int(lerpf(1, 9, k)), lerpf(3.0, 9.0, k))
	if k > 0.25:
		_dust(pos, lerpf(1.0, 3.0, k))
	Sfx.play(&"thump", pos, lerpf(-8.0, 6.0, k), randf_range(0.85, 1.1))
	Sfx.play(&"crunch", pos, lerpf(-12.0, 3.0, k), randf_range(0.8, 1.15))
	if involves_player:
		hitstop(lerpf(0.03, 0.13, k))
		shake(lerpf(0.25, 0.9, k), normal * lerpf(0.15, 0.6, k))
	elif camera and camera.global_position.distance_to(pos) < 40.0:
		shake(lerpf(0.05, 0.3, k))


func shell_hit(pos: Vector3, normal: Vector3, hit_car: bool, involves_player: bool) -> void:
	_sparks(pos, normal, 28 if hit_car else 12, 11.0)
	_flash(pos, Color(1.0, 0.65, 0.3), 3.5, 0.06, 5.0)
	if not hit_car:
		_dust(pos, 1.2)
	Sfx.play(&"shell_hit" if hit_car else &"thump", pos, 0.0 if hit_car else -6.0, randf_range(0.9, 1.15))
	if involves_player and hit_car:
		hitstop(0.025)
		shake(0.22, normal * 0.12)


func muzzle_flash(pos: Vector3, dir: Vector3, is_player: bool, size := 1.0) -> void:
	_flash(pos + dir * 0.4, Color(1.0, 0.7, 0.35), 6.0 * size, 0.05, 8.0 * size)
	_fireball(pos + dir * 0.6 * size, 0.45 * size, 0.07)
	Sfx.play(&"cannon", pos, (2.0 if is_player else -2.0) + (size - 1.0) * 10.0, randf_range(0.93, 1.05) / sqrt(size))
	if is_player:
		shake(0.16 * size, -dir * 0.08 * size)


## An explosion from a weapon (mortar, bomblet, shockwave), scaled by its radius.
func blast(pos: Vector3, radius: float, involves_player: bool) -> void:
	var k := clampf(radius / 6.0, 0.3, 2.0)
	_fireball(pos + Vector3.UP * 0.4, radius * 0.7, 0.35)
	_flash(pos + Vector3.UP, Color(1.0, 0.6, 0.25), 8.0 * k, 0.3, radius * 4.0)
	_sparks(pos, Vector3.UP, int(30 * k), 14.0)
	_dust(pos, radius * 0.5)
	Sfx.play(&"explosion", pos, -4.0 + k * 4.0, randf_range(1.1, 1.35) / k)
	if involves_player:
		hitstop(0.03 + 0.03 * k)
		shake(0.25 * k)
	elif camera and camera.global_position.distance_to(pos) < 50.0:
		shake(0.12 * k)


## A ring of force on the ground (Good Vibrations, Ground Pound).
func shockwave(pos: Vector3, radius: float, color: Color, involves_player: bool) -> void:
	var w := _world()
	if w == null:
		return
	var mi := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.8
	tm.outer_radius = 1.0
	tm.rings = 32
	tm.ring_segments = 8
	mi.mesh = tm
	var mat := _fire_mat.duplicate() as StandardMaterial3D
	mat.albedo_color = color
	mat.emission = color
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	w.add_child(mi)
	mi.global_position = pos + Vector3.UP * 0.3
	mi.scale = Vector3(1.0, 0.6, 1.0)
	var tw := mi.create_tween().set_parallel(true)
	tw.tween_property(mi, "scale", Vector3(radius, 0.6, radius), 0.35).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.4)
	tw.chain().tween_callback(mi.queue_free)
	_dust(pos, radius * 0.35)
	Sfx.play(&"thump", pos, 4.0, 0.7)
	if involves_player:
		hitstop(0.05)
		shake(0.5, Vector3.UP * 0.2)


func explosion(pos: Vector3, involves_player: bool) -> void:
	_fireball(pos + Vector3.UP * 0.6, 4.2, 0.55)
	_flash(pos + Vector3.UP, Color(1.0, 0.55, 0.2), 14.0, 0.5, 30.0)
	_sparks(pos, Vector3.UP, 120, 20.0)
	_chunks(pos, Vector3.UP, 14, 12.0)
	_dust(pos, 5.0)
	Sfx.play(&"explosion", pos, 8.0, randf_range(0.9, 1.05))
	if involves_player:
		hitstop(0.12)
		slowmo(0.28, 1.1)
		shake(1.0, Vector3.UP * 0.5)
	else:
		shake(0.45)


func hit_marker() -> void:
	player_hit_confirmed.emit()


## A panel or part that took enough damage comes off and tumbles away as debris.
func detach_panel(node: Node3D, car: Node3D) -> void:
	if not is_instance_valid(node) or not node.is_inside_tree():
		return
	var world := car.get_parent()
	var xf := node.global_transform
	var aabb := _local_aabb(node)
	var body := RigidBody3D.new()
	body.collision_layer = Car.LAYER_DEBRIS
	body.collision_mask = Car.LAYER_WORLD
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = aabb.size.max(Vector3(0.08, 0.08, 0.08))
	shape.shape = box
	shape.position = aabb.get_center()
	body.add_child(shape)
	body.mass = clampf(aabb.size.x * aabb.size.y * aabb.size.z * 200.0, 10.0, 200.0)
	world.add_child(body)
	body.global_transform = xf
	node.get_parent().remove_child(node)
	body.add_child(node)
	node.transform = Transform3D.IDENTITY
	var car_body := car as RigidBody3D
	var out := (xf.origin - car.global_position).normalized()
	body.linear_velocity = (car_body.linear_velocity if car_body else Vector3.ZERO) + out * randf_range(3.0, 6.0) + Vector3.UP * randf_range(3.0, 6.0)
	body.angular_velocity = Vector3(randf_range(-8, 8), randf_range(-8, 8), randf_range(-8, 8))
	_free_later(body, 10.0)


## Bounds of everything drawn under a node, in that node's space.
func _local_aabb(node: Node3D) -> AABB:
	var inv := node.global_transform.affine_inverse()
	var out := AABB()
	var first := true
	var stack: Array[Node] = [node]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		stack.append_array(n.get_children())
		var vi := n as VisualInstance3D
		if vi == null:
			continue
		var b: AABB = (inv * vi.global_transform) * vi.get_aabb()
		out = b if first else out.merge(b)
		first = false
	return out


# --- Building blocks ---

func _make_shared() -> void:
	if _spark_mesh:
		return
	var sm := BoxMesh.new()
	sm.size = Vector3(0.025, 0.35, 0.025)
	var spark_mat := StandardMaterial3D.new()
	spark_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	spark_mat.albedo_color = Color(1.0, 0.8, 0.45)
	spark_mat.vertex_color_use_as_albedo = true
	sm.material = spark_mat
	_spark_mesh = sm

	var cm := BoxMesh.new()
	cm.size = Vector3(0.12, 0.05, 0.16)
	_chunk_mat = StandardMaterial3D.new()
	_chunk_mat.albedo_color = Color(0.12, 0.11, 0.1)
	_chunk_mat.metallic = 0.6
	_chunk_mat.roughness = 0.5
	cm.material = _chunk_mat
	_chunk_mesh = cm

	var qm := QuadMesh.new()
	qm.size = Vector2(1, 1)
	var smoke_mat := StandardMaterial3D.new()
	smoke_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	smoke_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	smoke_mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	smoke_mat.vertex_color_use_as_albedo = true
	smoke_mat.albedo_texture = _soft_dot()
	qm.material = smoke_mat
	_smoke_mesh = qm

	_fire_mat = StandardMaterial3D.new()
	_fire_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_fire_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_fire_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_fire_mat.albedo_color = Color(1.0, 0.55, 0.18)
	_fire_mat.emission_enabled = true
	_fire_mat.emission = Color(1.0, 0.45, 0.1)
	_fire_mat.emission_energy_multiplier = 4.0


func _soft_dot() -> Texture2D:
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(0.5, 0.0)
	t.width = 64
	t.height = 64
	return t


func _world() -> Node:
	return get_tree().current_scene


func _particles(pos: Vector3, mesh: Mesh, amount: int, lifetime: float, pm: ParticleProcessMaterial) -> GPUParticles3D:
	var p := GPUParticles3D.new()
	p.amount = maxi(amount, 1)
	p.lifetime = lifetime
	p.one_shot = true
	p.explosiveness = 1.0
	p.draw_pass_1 = mesh
	p.process_material = pm
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	p.visibility_aabb = AABB(Vector3(-20, -20, -20), Vector3(40, 40, 40))
	var w := _world()
	if w == null:
		return p
	w.add_child(p)
	p.global_position = pos
	p.emitting = true
	_free_later(p, lifetime + 0.5)
	return p


func _sparks(pos: Vector3, normal: Vector3, amount: int, speed: float) -> void:
	var pm := ParticleProcessMaterial.new()
	pm.direction = normal if normal.length() > 0.1 else Vector3.UP
	pm.spread = 70.0
	pm.initial_velocity_min = speed * 0.4
	pm.initial_velocity_max = speed
	pm.gravity = Vector3(0, -14, 0)
	pm.damping_min = 1.0
	pm.damping_max = 3.0
	pm.particle_flag_align_y = true
	pm.scale_min = 0.6
	pm.scale_max = 1.4
	var ramp := Gradient.new()
	ramp.set_color(0, Color(4.0, 2.6, 1.2))
	ramp.set_color(1, Color(1.2, 0.25, 0.05))
	var gt := GradientTexture1D.new()
	gt.gradient = ramp
	pm.color_ramp = gt
	_particles(pos, _spark_mesh, amount, 0.6, pm)


func _chunks(pos: Vector3, normal: Vector3, amount: int, speed: float) -> void:
	var pm := ParticleProcessMaterial.new()
	pm.direction = (normal + Vector3.UP).normalized()
	pm.spread = 55.0
	pm.initial_velocity_min = speed * 0.4
	pm.initial_velocity_max = speed
	pm.gravity = Vector3(0, -20, 0)
	pm.angular_velocity_min = -720.0
	pm.angular_velocity_max = 720.0
	pm.scale_min = 0.6
	pm.scale_max = 2.0
	pm.collision_mode = ParticleProcessMaterial.COLLISION_RIGID
	pm.collision_bounce = 0.2
	pm.collision_friction = 0.6
	_particles(pos, _chunk_mesh, amount, 1.6, pm)


func _dust(pos: Vector3, size: float) -> void:
	var pm := ParticleProcessMaterial.new()
	pm.direction = Vector3.UP
	pm.spread = 80.0
	pm.initial_velocity_min = 1.0
	pm.initial_velocity_max = 3.0 * size
	pm.gravity = Vector3(0, 0.6, 0)
	pm.damping_min = 2.0
	pm.damping_max = 4.0
	pm.scale_min = size * 1.2
	pm.scale_max = size * 2.6
	var curve := Curve.new()
	curve.add_point(Vector2(0, 0.4))
	curve.add_point(Vector2(1, 1.0))
	var ct := CurveTexture.new()
	ct.curve = curve
	pm.scale_curve = ct
	var ramp := Gradient.new()
	ramp.set_color(0, Color(0.55, 0.47, 0.38, 0.55))
	ramp.set_color(1, Color(0.55, 0.47, 0.38, 0.0))
	var gt := GradientTexture1D.new()
	gt.gradient = ramp
	pm.color_ramp = gt
	_particles(pos, _smoke_mesh, int(6 + size * 4), 2.2, pm)


func _fireball(pos: Vector3, radius: float, life: float) -> void:
	var w := _world()
	if w == null:
		return
	var mi := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.5
	sm.height = 1.0
	sm.radial_segments = 16
	sm.rings = 8
	mi.mesh = sm
	var mat := _fire_mat.duplicate() as StandardMaterial3D
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	w.add_child(mi)
	mi.global_position = pos
	mi.scale = Vector3.ONE * radius * 0.4
	var tw := mi.create_tween().set_parallel(true)
	tw.tween_property(mi, "scale", Vector3.ONE * radius * 2.0, life).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_EXPO)
	tw.tween_property(mat, "albedo_color:a", 0.0, life).set_ease(Tween.EASE_IN)
	tw.tween_property(mat, "emission_energy_multiplier", 0.0, life)
	tw.chain().tween_callback(mi.queue_free)


func _flash(pos: Vector3, color: Color, energy: float, life: float, rng: float) -> void:
	var w := _world()
	if w == null:
		return
	var l := OmniLight3D.new()
	l.light_color = color
	l.light_energy = energy
	l.omni_range = rng
	l.shadow_enabled = false
	w.add_child(l)
	l.global_position = pos
	var tw := l.create_tween()
	tw.tween_property(l, "light_energy", 0.0, life)
	tw.tween_callback(l.queue_free)


func _free_later(n: Node, seconds: float) -> void:
	get_tree().create_timer(seconds, false).timeout.connect(n.queue_free)
