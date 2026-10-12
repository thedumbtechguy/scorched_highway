class_name CarDefs
## Tuning for each chassis. Units are SI: kilograms, newtons, metres, m/s.

const SUNDOWNER := {
	"name": "Sundowner",
	"mass": 2000.0,
	"hp": 160.0,
	# Engine: peak tractive force, falling off towards top speed.
	"engine_force": 15500.0,
	"top_speed": 46.0,
	"reverse_speed": 13.0,
	"brake_force": 24000.0,
	"drive_front": 0.3, # share of drive torque to the front axle
	# Boost doubles as the ram charge.
	"boost_force": 10000.0,
	"boost_drain": 38.0, # meter per second, out of 100
	"boost_regen": 11.0,
	# Suspension (per wheel).
	"spring": 52000.0,
	"damp_bump": 4200.0,
	"damp_rebound": 5200.0,
	"rest_length": 0.36,
	"wheel_radius": 0.37,
	"anti_roll": 26000.0,
	# Tyres.
	"grip": 1.35, # friction coefficient
	"grip_rear_handbrake": 0.42,
	"steer_lock": 32.0, # degrees at walking pace
	"steer_lock_fast": 8.5, # degrees at top speed
	# Body.
	"half_extents": Vector3(0.95, 0.45, 2.3),
	"wheel_x": 0.86,
	"wheel_front_z": -1.48,
	"wheel_rear_z": 1.42,
	"wheel_y": -0.02,
	# Gun.
	"gun": "autocannon",
}
