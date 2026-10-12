class_name Special
extends Node3D
## A car's signature special. It charges up over `recharge` seconds, fires when
## the driver presses the special button, and tells bots when it's a good idea.

var car: Car
var display_name := ""
var recharge := 8.0
var charge := 1.0 # 0..1
var _was_pressed := false


func _init(owner_car: Car) -> void:
	car = owner_car
	position = car.visual.special_mount


func is_ready() -> bool:
	return charge >= 1.0 and not car.is_wrecked and is_available()


## False when the special can't work at all (Double Trouble without its sidecar).
func is_available() -> bool:
	return true


## True while the special is doing something (a burst firing, a hook attached).
func is_busy() -> bool:
	return false


func _physics_process(delta: float) -> void:
	var pressed := car.special
	if pressed and not _was_pressed:
		if is_busy():
			on_press_while_busy()
		elif is_ready():
			charge = 0.0
			activate()
	_was_pressed = pressed
	if not is_busy():
		charge = minf(1.0, charge + delta / recharge)
	tick(delta)


func activate() -> void:
	pass


func on_press_while_busy() -> void:
	pass


func tick(_delta: float) -> void:
	pass


## Bots: is now a good moment? `target` is the bot's current target (may be null).
func ai_wants(_target: Car) -> bool:
	return false
