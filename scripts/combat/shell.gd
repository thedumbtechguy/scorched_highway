class_name Shell
extends Node3D
## A projectile swept with a ray each tick so it can't tunnel through a car.
## Direct-hit by default; give it a blast radius and it explodes on impact
## (mortars, fireworks). Every live projectile is in the "projectiles" group,
## so Good Vibrations can knock it out of the air.

var shooter: Car
var velocity := Vector3.ZERO
var damage := 0.0
var impulse := 0.0
var gravity := 4.0 # light drop by default, enough to read as a projectile
var life := 1.6
var blast_radius := 0.0
var _age := 0.0

static var _meshes := {}
static var _mats := {}


func setup(from: Car, pos: Vector3, vel: Vector3, dmg: float, imp: float, look := &"tracer") -> Shell:
	shooter = from
	velocity = vel
	damage = dmg
	impulse = imp
	position = pos
	add_to_group(&"projectiles")
	var tracer := MeshInstance3D.new()
	tracer.mesh = _mesh(look)
	tracer.material_override = _mat(look)
	tracer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if look != &"firework":
		tracer.rotation_degrees.x = 90.0
		tracer.position.z = (tracer.mesh as CylinderMesh).height * 0.5
	add_child(tracer)
	return self


## Explode on impact instead of hitting one car.
func with_blast(radius: float, grav: float, lifetime: float) -> Shell:
	blast_radius = radius
	gravity = grav
	life = lifetime
	return self


static func _mesh(look: StringName) -> Mesh:
	if not _meshes.has(look):
		if look == &"firework":
			var sm := SphereMesh.new()
			sm.radius = 0.22
			sm.height = 0.44
			sm.radial_segments = 8
			sm.rings = 4
			_meshes[look] = sm
		else:
			var cm := CylinderMesh.new()
			var r := 0.08 if look == &"heavy" else (0.035 if look == &"bullet" else 0.05)
			cm.top_radius = r
			cm.bottom_radius = r
			cm.height = 3.6 if look == &"heavy" else (1.6 if look == &"bullet" else 3.2)
			cm.radial_segments = 6
			_meshes[look] = cm
	return _meshes[look]


static func _mat(look: StringName) -> StandardMaterial3D:
	if not _mats.has(look):
		var c := Color(1.0, 0.6, 0.2)
		if look == &"firework":
			c = Color(1.0, 0.3, 0.55)
		elif look == &"bullet":
			c = Color(1.0, 0.85, 0.5)
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.albedo_color = c.lightened(0.3)
		m.emission_enabled = true
		m.emission = c
		m.emission_energy_multiplier = 6.0
		_mats[look] = m
	return _mats[look]


func _ready() -> void:
	_orient()


func _physics_process(delta: float) -> void:
	_age += delta
	if _age > life:
		if blast_radius > 0.0:
			_explode(global_position, Vector3.UP)
		queue_free()
		return
	velocity += Vector3.DOWN * gravity * delta
	var from := global_position
	var to := from + velocity * delta
	var exclude: Array[RID] = []
	if is_instance_valid(shooter):
		exclude.append(shooter.get_rid())
	var q := PhysicsRayQueryParameters3D.create(from, to, Car.LAYER_WORLD | Car.LAYER_CARS, exclude)
	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	if hit.is_empty():
		global_position = to
		_orient()
		return
	if blast_radius > 0.0:
		_explode(hit.position, hit.normal)
		queue_free()
		return
	var dir := velocity.normalized()
	var target := hit.collider as Car
	var by: Car = shooter if is_instance_valid(shooter) else null
	if target:
		target.take_hit(damage, hit.position, dir * impulse, by)
		if by and by.is_player:
			Impact.hit_marker()
	Impact.shell_hit(hit.position, hit.normal, target != null, _involves_player(target))
	queue_free()


func _explode(pos: Vector3, normal: Vector3) -> void:
	var by: Car = shooter if is_instance_valid(shooter) else null
	Blast.explode(self, pos + normal * 0.3, blast_radius, damage, impulse, by, by)


## Knocked out of the air (Good Vibrations).
func deflect() -> void:
	Impact.shell_hit(global_position, -velocity.normalized(), false, false)
	queue_free()


func _involves_player(target: Car) -> bool:
	return (is_instance_valid(shooter) and shooter.is_player) or (target != null and target.is_player)


func _orient() -> void:
	if velocity.length_squared() > 0.01:
		look_at(global_position + velocity, Vector3.UP if absf(velocity.normalized().y) < 0.99 else Vector3.FORWARD)
