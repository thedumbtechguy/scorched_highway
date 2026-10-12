class_name MachineGun
extends Node3D
## Every car's standard gun: fast, light rounds with a little shove, mild aim
## assist, and a barrel that heats up so you fire in bursts.

const INTERVAL := 0.11
const SPEED := 180.0
const DAMAGE := 1.6
const HIT_IMPULSE := 650.0
const RECOIL := 120.0
const HEAT_PER_SHOT := 0.032
const COOL_RATE := 0.5
const COOL_DELAY := 0.4 # the barrel only sheds heat once you stop firing
const AIM_CONE := deg_to_rad(9.0)
const AIM_RANGE := 110.0

var car: Car
var heat := 0.0
var overheated := false
var _cooldown := 0.0
var _since_shot := 10.0
var _side := 1.0


func _init(owner_car: Car) -> void:
	car = owner_car
	position = car.visual.gun_mount
	var v := car.visual
	v.box(Vector3(0.3, 0.14, 0.4), Vector3.ZERO, v.trim_mat, &"", Vector3.ZERO, self)
	for x in [-0.07, 0.07]:
		v.cyl(0.03, 0.7, Vector3(x, 0.02, -0.45), v.trim_mat, &"", Vector3(90, 0, 0), self, 6)


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
	_side = -_side
	var muzzle := global_transform * Vector3(0.07 * _side, 0.02, -0.85)
	var dir := Aim.direction(car, muzzle, car.forward(), AIM_CONE, AIM_RANGE, SPEED)
	var shell := Shell.new().setup(car, muzzle, dir * SPEED + car.linear_velocity, DAMAGE, HIT_IMPULSE, &"bullet")
	car.get_parent().add_child(shell)
	car.apply_impulse(-dir * RECOIL, global_position - car.global_position)
	Impact.muzzle_flash(muzzle, dir, car.is_player, 0.4)
