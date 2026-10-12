class_name CarDefs
## The launch roster. Each car belongs to a body class (shared size, weight band
## and hitbox) and has 1-5 stats that are turned into physics numbers here, so
## cars are tuned in one place. Units are SI: kilograms, newtons, metres, m/s.

const ORDER: Array[StringName] = [
	&"sundowner", &"lawdog", &"picket_fence", &"moonbeam",
	&"gravel_queen", &"long_haul", &"sidewinder", &"double_trouble",
]

## Body classes. Wheels are [x, z, steers, drive share, width]; drive shares sum to 1.
const CLASSES := {
	&"light": {
		"half_extents": Vector3(0.85, 0.42, 1.95),
		"cabin": [Vector3(0.6, 0.25, 0.8), Vector3(0, 0.45, 0.2)],
		"wheel_radius": 0.42, "rest_length": 0.4, "wheel_y": -0.05,
		"com": Vector3(0, -0.2, 0.1),
		"wheels": [[-0.88, -1.3, true, 0.15, 0.32], [0.88, -1.3, true, 0.15, 0.32], [-0.88, 1.2, false, 0.35, 0.42], [0.88, 1.2, false, 0.35, 0.42]],
	},
	&"medium": {
		"half_extents": Vector3(0.95, 0.45, 2.3),
		"cabin": [Vector3(0.78, 0.26, 1.05), Vector3(0, 0.56, 0.2)],
		"wheel_radius": 0.37, "rest_length": 0.36, "wheel_y": -0.02,
		"com": Vector3(0, -0.22, 0.05),
		"wheels": [[-0.86, -1.48, true, 0.15, 0.3], [0.86, -1.48, true, 0.15, 0.3], [-0.86, 1.42, false, 0.35, 0.3], [0.86, 1.42, false, 0.35, 0.3]],
	},
	&"heavy": {
		"half_extents": Vector3(1.15, 0.7, 3.0),
		"cabin": [Vector3(1.05, 0.55, 0.9), Vector3(0, 1.1, -0.6)],
		"wheel_radius": 0.52, "rest_length": 0.42, "wheel_y": -0.25,
		"com": Vector3(0, -0.35, 0.0),
		"wheels": [[-1.0, -2.0, true, 0.1, 0.36], [1.0, -2.0, true, 0.1, 0.36], [-1.0, 1.0, false, 0.2, 0.42], [1.0, 1.0, false, 0.2, 0.42], [-1.0, 2.15, false, 0.2, 0.42], [1.0, 2.15, false, 0.2, 0.42]],
	},
}

const CARS := {
	&"sundowner": {
		"name": "Sundowner", "driver": "Dee Cortez", "show": "Sundown Stunts",
		"class": &"medium", "mass": 2000.0,
		"stats": {"speed": 4, "accel": 4, "handling": 3, "armour": 3},
		"special": &"thunder_cannons", "special_name": "Thunder Cannons",
		"paint": Color(0.8, 0.17, 0.1), "accent": Color(0.98, 0.94, 0.85),
	},
	&"lawdog": {
		"name": "Lawdog", "driver": "Deputy Tull", "show": "Pursuit Unit 9",
		"class": &"medium", "mass": 2300.0,
		"stats": {"speed": 4, "accel": 3, "handling": 4, "armour": 3},
		"special": &"riot_gun", "special_name": "Riot Gun",
		"paint": Color(0.14, 0.19, 0.29), "accent": Color(0.98, 0.94, 0.85),
	},
	&"picket_fence": {
		"name": "Picket Fence", "driver": "Barb Henderson & kids", "show": "The Hendersons",
		"class": &"medium", "mass": 2400.0,
		"stats": {"speed": 3, "accel": 3, "handling": 3, "armour": 4},
		"special": &"fourth_of_july", "special_name": "Fourth of July",
		"paint": Color(0.49, 0.54, 0.23), "accent": Color(0.54, 0.35, 0.2),
	},
	&"moonbeam": {
		"name": "Moonbeam", "driver": "Sky Farrow", "show": "The Moonbeam Hour",
		"class": &"medium", "mass": 2600.0,
		"stats": {"speed": 3, "accel": 2, "handling": 3, "armour": 4},
		"special": &"good_vibrations", "special_name": "Good Vibrations",
		"paint": Color(0.12, 0.54, 0.54), "accent": Color(0.98, 0.94, 0.85),
		"cabin": [Vector3(0.88, 0.5, 2.0), Vector3(0, 0.75, 0.1)],
	},
	&"gravel_queen": {
		"name": "Gravel Queen", "driver": "Ma Hollis", "show": "Ma's Quarry",
		"class": &"heavy", "mass": 3600.0,
		"stats": {"speed": 3, "accel": 2, "handling": 2, "armour": 5},
		"special": &"scrap_bomb", "special_name": "Scrap Bomb",
		"paint": Color(0.95, 0.69, 0.2), "accent": Color(0.78, 0.2, 0.12),
	},
	&"long_haul": {
		"name": "Long Haul", "driver": "Earl \"Mule\" Pruitt", "show": "CB handle Mule",
		"class": &"heavy", "mass": 4200.0,
		"stats": {"speed": 4, "accel": 1, "handling": 1, "armour": 5},
		"special": &"tow_hook", "special_name": "Tow Hook",
		"paint": Color(0.56, 0.12, 0.1), "accent": Color(0.95, 0.69, 0.2),
		"cabin": [Vector3(1.1, 0.75, 1.2), Vector3(0, 1.2, 0.5)],
		"wheels": [[-1.0, -1.9, true, 0.1, 0.36], [1.0, -1.9, true, 0.1, 0.36], [-1.0, 1.45, false, 0.2, 0.42], [1.0, 1.45, false, 0.2, 0.42], [-1.0, 2.45, false, 0.2, 0.42], [1.0, 2.45, false, 0.2, 0.42]],
	},
	&"sidewinder": {
		"name": "Sidewinder", "driver": "June Okafor", "show": "Baja champion",
		"class": &"light", "mass": 1300.0,
		"stats": {"speed": 4, "accel": 5, "handling": 5, "armour": 1},
		"special": &"ground_pound", "special_name": "Ground Pound",
		"paint": Color(0.31, 0.54, 0.23), "accent": Color(0.98, 0.94, 0.85),
	},
	&"double_trouble": {
		"name": "Double Trouble", "driver": "The Flying Kowalskis", "show": "Saturday-night daredevils",
		"class": &"light", "mass": 1400.0,
		"stats": {"speed": 5, "accel": 4, "handling": 3, "armour": 2},
		"special": &"tail_gunner", "special_name": "Tail Gunner",
		"paint": Color(0.88, 0.38, 0.18), "accent": Color(0.98, 0.94, 0.85),
		"com": Vector3(-0.05, -0.3, 0.1),
		# A sidecar rig wants to lift the chair in hard turns; a stronger roll assist keeps it down.
		"roll_assist": 2.0,
		# Bike on the left (front and rear), sidecar wheel on the right. Only the bike's rear wheel drives.
		# The bike's rear wheel drives; the sidecar wheel helps a little (arcade licence).
		"wheels": [[-0.35, -1.3, true, 0.0, 0.18], [-0.35, 1.05, false, 0.7, 0.24], [0.9, 0.15, false, 0.3, 0.2]],
	},
}


## The full, physics-ready definition of a car: class defaults, the car's own
## overrides, and stats turned into forces.
static func get_def(id: StringName) -> Dictionary:
	var car: Dictionary = CARS[id]
	var d: Dictionary = CLASSES[car["class"]].duplicate(true)
	d.merge(car.duplicate(true), true)
	d.id = id
	var st: Dictionary = d.stats
	var m: float = d.mass
	var n: float = d.wheels.size()
	d.hp = 100.0 + st.armour * 25.0
	# Top speeds sit in a narrow band so every class can race.
	d.top_speed = 41.0 + st.speed * 1.6
	d.reverse_speed = 18.0
	d.engine_force = m * (6.5 + st.accel * 1.1)
	d.brake_force = m * 12.0
	d.boost_force = m * 5.0
	d.boost_drain = 38.0
	d.boost_regen = 11.0
	d.grip = 1.2 + st.handling * 0.06
	d.grip_rear_handbrake = d.grip * 0.32
	d.steer_lock = 31.0 + st.handling * 2.0
	d.steer_lock_fast = 6.0 + st.handling * 0.8
	# Suspension sized so each wheel settles about 10 cm under the car's weight.
	d.spring = m * 9.81 / n / 0.1
	var crit := 2.0 * sqrt(d.spring * m / n)
	d.damp_bump = crit * 0.42
	d.damp_rebound = crit * 0.52
	d.anti_roll = d.spring * 0.5
	# Arcade assists: a righting torque against roll, and help reaching the steered yaw rate.
	d.roll_assist = d.get("roll_assist", 0.4)
	d.yaw_assist = d.get("yaw_assist", 0.0)
	var zs: Array = d.wheels.map(func(w: Array) -> float: return w[1])
	d.wheelbase = maxf(zs.max() - zs.min(), 1.0)
	return d
