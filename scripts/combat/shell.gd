class_name Shell
extends Node3D
## A tracer shell, swept with a ray each tick so it can't tunnel through a car.

const GRAVITY := 4.0 # light drop, enough to read as a projectile
const LIFE := 1.6

var shooter: Car
var velocity := Vector3.ZERO
var damage := 0.0
var impulse := 0.0
var _age := 0.0

static var _mesh: Mesh
static var _mat: StandardMaterial3D


func setup(from: Car, pos: Vector3, vel: Vector3, dmg: float, imp: float) -> void:
	shooter = from
	velocity = vel
	damage = dmg
	impulse = imp
	position = pos
	if _mesh == null:
		var cm := CylinderMesh.new()
		cm.top_radius = 0.05
		cm.bottom_radius = 0.05
		cm.height = 3.2
		cm.radial_segments = 6
		_mesh = cm
		_mat = StandardMaterial3D.new()
		_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_mat.albedo_color = Color(1.0, 0.75, 0.35)
		_mat.emission_enabled = true
		_mat.emission = Color(1.0, 0.6, 0.2)
		_mat.emission_energy_multiplier = 6.0
	var tracer := MeshInstance3D.new()
	tracer.mesh = _mesh
	tracer.material_override = _mat
	tracer.rotation_degrees.x = 90.0
	tracer.position.z = 1.6
	tracer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(tracer)


func _ready() -> void:
	_orient()


func _physics_process(delta: float) -> void:
	_age += delta
	if _age > LIFE:
		queue_free()
		return
	velocity += Vector3.DOWN * GRAVITY * delta
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
	var dir := velocity.normalized()
	var target := hit.collider as Car
	if target:
		target.take_hit(damage, hit.position, dir * impulse, shooter)
		if is_instance_valid(shooter) and shooter.is_player:
			Impact.hit_marker()
	Impact.shell_hit(hit.position, hit.normal, target != null, _involves_player(target))
	queue_free()


func _involves_player(target: Car) -> bool:
	return (is_instance_valid(shooter) and shooter.is_player) or (target != null and target.is_player)


func _orient() -> void:
	if velocity.length_squared() > 0.01:
		look_at(global_position + velocity, Vector3.UP if absf(velocity.normalized().y) < 0.99 else Vector3.FORWARD)
