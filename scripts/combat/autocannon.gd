class_name Autocannon
extends Node3D
## A slow, heavy gun. Shells shove the target and kick the shooter back;
## the barrel heats up, so it fires in bursts.

const INTERVAL := 0.3
const SHELL_SPEED := 170.0
const DAMAGE := 4.5
const HIT_IMPULSE := 3600.0 # N·s: about 1.8 m/s to a two-tonne car
const RECOIL := 1100.0
const HEAT_PER_SHOT := 0.085
const COOL_RATE := 0.45
const COOL_DELAY := 0.5 # the barrel only sheds heat once you stop firing
const AIM_CONE := deg_to_rad(11.0)
const AIM_RANGE := 140.0

var car: Car
var heat := 0.0
var overheated := false
var _cooldown := 0.0
var _since_shot := 10.0


func _init(owner_car: Car) -> void:
	car = owner_car
	position = Vector3(0, 0.82, -0.6)
	var barrel := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.07
	cm.bottom_radius = 0.09
	cm.height = 1.5
	barrel.mesh = cm
	barrel.rotation_degrees.x = 90.0
	barrel.position.z = -0.55
	barrel.material_override = car.visual.trim_mat
	add_child(barrel)
	var mount := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.42, 0.22, 0.6)
	mount.mesh = bm
	mount.material_override = car.visual.trim_mat
	add_child(mount)


func _physics_process(delta: float) -> void:
	_cooldown -= delta
	_since_shot += delta
	if _since_shot > COOL_DELAY:
		heat = maxf(0.0, heat - COOL_RATE * delta)
	if overheated and heat < 0.35:
		overheated = false
	if car.fire and not car.is_wrecked and _cooldown <= 0.0 and not overheated:
		_shoot()


func _shoot() -> void:
	_cooldown = INTERVAL
	_since_shot = 0.0
	heat += HEAT_PER_SHOT
	if heat >= 1.0:
		heat = 1.0
		overheated = true
	var muzzle := global_transform * Vector3(0, 0, -1.35)
	var dir := aim_direction(muzzle)
	var shell := Shell.new()
	shell.setup(car, muzzle, dir * SHELL_SPEED + car.linear_velocity, DAMAGE, HIT_IMPULSE)
	car.get_parent().add_child(shell)
	car.apply_impulse(-dir * RECOIL, global_position - car.global_position)
	Impact.muzzle_flash(muzzle, dir, car.is_player)


## Aim assist: snap to the nearest enemy inside a narrow cone, leading its motion.
func aim_direction(muzzle: Vector3) -> Vector3:
	var fwd := car.forward()
	var best: Car
	var best_score := INF
	for other in get_tree().get_nodes_in_group(&"cars"):
		var c := other as Car
		if c == car or c.is_wrecked:
			continue
		var to := c.global_position - muzzle
		var d := to.length()
		if d > AIM_RANGE:
			continue
		var ang := fwd.angle_to(to)
		if ang > AIM_CONE:
			continue
		var score := ang * 40.0 + d
		if score < best_score:
			best_score = score
			best = c
	if best == null:
		return (fwd + Vector3.UP * 0.01).normalized()
	var t := muzzle.distance_to(best.global_position) / SHELL_SPEED
	var lead := best.global_position + (best.linear_velocity - car.linear_velocity) * t + Vector3.UP * 0.15
	return (lead - muzzle).normalized()
