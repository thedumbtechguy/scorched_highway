class_name PlayerDriver
extends Node
## Reads the keyboard / gamepad into the car's controls.


func drive(car: Car, _delta: float) -> void:
	car.throttle = Input.get_action_strength(&"throttle") - Input.get_action_strength(&"brake")
	car.steer = Input.get_axis(&"steer_left", &"steer_right")
	car.handbrake = Input.is_action_pressed(&"handbrake")
	car.boost = Input.is_action_pressed(&"boost")
	car.fire = Input.is_action_pressed(&"fire")
	car.special = Input.is_action_pressed(&"special")


static func setup_input() -> void:
	_action(&"throttle", [KEY_W, KEY_UP], [], [JOY_AXIS_TRIGGER_RIGHT, 1.0])
	_action(&"brake", [KEY_S, KEY_DOWN], [], [JOY_AXIS_TRIGGER_LEFT, 1.0])
	_action(&"steer_left", [KEY_A, KEY_LEFT], [], [JOY_AXIS_LEFT_X, -1.0])
	_action(&"steer_right", [KEY_D, KEY_RIGHT], [], [JOY_AXIS_LEFT_X, 1.0])
	_action(&"handbrake", [KEY_SPACE], [JOY_BUTTON_A], [])
	_action(&"boost", [KEY_SHIFT], [JOY_BUTTON_B, JOY_BUTTON_LEFT_SHOULDER], [])
	_action(&"fire", [KEY_J], [JOY_BUTTON_RIGHT_SHOULDER, JOY_BUTTON_X], [], MOUSE_BUTTON_LEFT)
	_action(&"special", [KEY_K, KEY_E], [JOY_BUTTON_Y], [], MOUSE_BUTTON_RIGHT)
	_action(&"ui_prev", [KEY_A, KEY_LEFT], [JOY_BUTTON_DPAD_LEFT], [JOY_AXIS_LEFT_X, -1.0])
	_action(&"ui_next", [KEY_D, KEY_RIGHT], [JOY_BUTTON_DPAD_RIGHT], [JOY_AXIS_LEFT_X, 1.0])
	_action(&"restart", [KEY_ENTER, KEY_KP_ENTER], [JOY_BUTTON_START], [])
	_action(&"reset", [KEY_R], [JOY_BUTTON_BACK], [])
	_action(&"quit", [KEY_ESCAPE], [], [])


static func _action(name: StringName, keys: Array, buttons: Array, axis: Array, mouse := -1) -> void:
	if InputMap.has_action(name):
		return
	InputMap.add_action(name, 0.15)
	for k in keys:
		var e := InputEventKey.new()
		e.physical_keycode = k
		InputMap.action_add_event(name, e)
	for b in buttons:
		var e := InputEventJoypadButton.new()
		e.button_index = b
		InputMap.action_add_event(name, e)
	if axis.size() == 2:
		var e := InputEventJoypadMotion.new()
		e.axis = axis[0]
		e.axis_value = axis[1]
		InputMap.action_add_event(name, e)
	if mouse >= 0:
		var e := InputEventMouseButton.new()
		e.button_index = mouse
		InputMap.action_add_event(name, e)
