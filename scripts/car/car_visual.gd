class_name CarVisual
extends Node3D
## Placeholder car body built from primitives, with panels that can come off.
## It will be replaced by modelled cars; the interface (add_wheel, update_wheels,
## zone_damaged, char_paint) is what the rest of the game relies on.

var paint_mat: StandardMaterial3D
var trim_mat: StandardMaterial3D
var glass_mat: StandardMaterial3D
var chrome_mat: StandardMaterial3D
var _panels := {} # zone name -> Array of MeshInstance3D, in the order they come off
var _lights: Array[MeshInstance3D] = []
var _wheel_nodes: Array[Node3D] = []
var _detached := {}

const DETACH_AT := [22.0, 48.0, 80.0]


func build(def: Dictionary, paint: Color) -> void:
	paint_mat = StandardMaterial3D.new()
	paint_mat.albedo_color = paint
	paint_mat.metallic = 0.55
	paint_mat.roughness = 0.32
	paint_mat.clearcoat_enabled = true
	paint_mat.clearcoat = 1.0
	paint_mat.clearcoat_roughness = 0.08

	trim_mat = StandardMaterial3D.new()
	trim_mat.albedo_color = Color(0.06, 0.06, 0.065)
	trim_mat.metallic = 0.3
	trim_mat.roughness = 0.6

	chrome_mat = StandardMaterial3D.new()
	chrome_mat.albedo_color = Color(0.82, 0.82, 0.85)
	chrome_mat.metallic = 1.0
	chrome_mat.roughness = 0.12

	glass_mat = StandardMaterial3D.new()
	glass_mat.albedo_color = Color(0.05, 0.07, 0.09, 0.82)
	glass_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass_mat.metallic = 0.2
	glass_mat.roughness = 0.04

	var he: Vector3 = def.half_extents
	var w: float = def.wheel_x * 2.0 # body sits inboard of the tyres; flares cover them
	var l := he.z * 2.0
	# Lower body: a slab with a slight wedge, nose lower than tail.
	_box(Vector3(w, 0.46, l - 0.25), Vector3(0, 0.06, 0.05), paint_mat)
	_box(Vector3(w - 0.3, 0.16, l - 0.5), Vector3(0, -0.22, 0.0), trim_mat) # underbody
	# Cabin: glass house with a painted roof, set back like a muscle car.
	_box(Vector3(w * 0.8, 0.42, 1.9), Vector3(0, 0.48, 0.25), glass_mat)
	_box(Vector3(w * 0.78, 0.07, 1.55), Vector3(0, 0.72, 0.32), paint_mat)
	# Hood bulge and stripes.
	_panel(&"front", _box(Vector3(w * 0.86, 0.06, 1.45), Vector3(0, 0.3, -1.4), paint_mat))
	_box(Vector3(0.55, 0.1, 1.0), Vector3(0, 0.35, -1.25), trim_mat) # scoop
	# Ram bar on the nose: it's what makes the front the strong zone.
	_panel(&"front", _box(Vector3(w + 0.36, 0.3, 0.22), Vector3(0, -0.05, -he.z - 0.02), chrome_mat))
	_box(Vector3(w * 0.7, 0.16, 0.06), Vector3(0, 0.12, -he.z + 0.08), trim_mat) # grille
	# Rear: bumper, deck lid, spoiler.
	_panel(&"rear", _box(Vector3(w + 0.04, 0.26, 0.2), Vector3(0, -0.08, he.z + 0.02), chrome_mat))
	_panel(&"rear", _box(Vector3(w * 0.88, 0.05, 0.9), Vector3(0, 0.29, he.z - 0.55), paint_mat))
	_panel(&"rear", _box(Vector3(w * 0.92, 0.05, 0.32), Vector3(0, 0.52, he.z - 0.2), trim_mat))
	# Doors and fender flares.
	for side in [-1.0, 1.0]:
		var zone: StringName = &"left" if side < 0.0 else &"right"
		_panel(zone, _box(Vector3(0.05, 0.34, 1.35), Vector3(side * (w * 0.5 + 0.02), 0.1, 0.2), paint_mat))
		_panel(zone, _box(Vector3(0.3, 0.12, 1.05), Vector3(side * (w * 0.5 + 0.08), 0.18, def.wheel_rear_z), paint_mat))
		_panel(zone, _box(Vector3(0.28, 0.12, 0.95), Vector3(side * (w * 0.5 + 0.07), 0.18, def.wheel_front_z), paint_mat))
		# Lights.
		_light(Vector3(0.36, 0.12, 0.05), Vector3(side * 0.62, 0.1, -he.z + 0.03), Color(1.0, 0.92, 0.75), 3.0)
		_light(Vector3(0.42, 0.1, 0.05), Vector3(side * 0.58, 0.12, he.z + 0.01), Color(0.9, 0.05, 0.03), 2.0)
		# Exhausts.
		var ex := MeshInstance3D.new()
		var cyl := CylinderMesh.new()
		cyl.top_radius = 0.06
		cyl.bottom_radius = 0.06
		cyl.height = 0.3
		ex.mesh = cyl
		ex.material_override = chrome_mat
		ex.rotation_degrees.x = 90.0
		ex.position = Vector3(side * 0.5, -0.24, he.z + 0.08)
		add_child(ex)


func _box(size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat
	mi.position = pos
	add_child(mi)
	return mi


func _panel(zone: StringName, mi: MeshInstance3D) -> void:
	if not _panels.has(zone):
		_panels[zone] = []
	_panels[zone].append(mi)


func _light(size: Vector3, pos: Vector3, color: Color, energy: float) -> void:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = energy
	_lights.append(_box(size, pos, mat))


func add_wheel(mount: Vector3, radius: float, side: float) -> Node3D:
	var pivot := Node3D.new() # steers around Y, follows suspension
	pivot.position = mount
	add_child(pivot)
	var spin := Node3D.new() # spins around X
	pivot.add_child(spin)
	var tyre := MeshInstance3D.new()
	var tm := CylinderMesh.new()
	tm.top_radius = radius
	tm.bottom_radius = radius
	tm.height = 0.3
	tm.radial_segments = 24
	tyre.mesh = tm
	tyre.rotation_degrees.z = 90.0
	var rubber := StandardMaterial3D.new()
	rubber.albedo_color = Color(0.035, 0.035, 0.035)
	rubber.roughness = 0.92
	tyre.material_override = rubber
	spin.add_child(tyre)
	var rim := MeshInstance3D.new()
	var rm := CylinderMesh.new()
	rm.top_radius = radius * 0.62
	rm.bottom_radius = radius * 0.62
	rm.height = 0.04
	rm.radial_segments = 6 # a spoked look when it spins
	rim.mesh = rm
	rim.rotation_degrees.z = 90.0
	rim.position.x = side * 0.14
	rim.material_override = chrome_mat
	spin.add_child(rim)
	_wheel_nodes.append(pivot)
	return pivot


func update_wheels(wheels: Array[Dictionary], steer_angle: float, rest_length: float) -> void:
	for w in wheels:
		var pivot: Node3D = w.node
		# The wheel centre sits one radius above the contact patch: mount - rest + compression.
		pivot.position.y = w.mount.y - rest_length + w.comp
		pivot.rotation.y = steer_angle if w.front else 0.0
		var spin: Node3D = pivot.get_child(0)
		spin.rotation.x = -fmod(w.spin, TAU)


func zone_damaged(zone: StringName, total: float, car: Node3D) -> void:
	if not _panels.has(zone):
		return
	var want := 0
	for t in DETACH_AT:
		if total >= t:
			want += 1
	var list: Array = _panels[zone]
	while _detached.get(zone, 0) < want and not list.is_empty():
		_detached[zone] = _detached.get(zone, 0) + 1
		Impact.detach_panel(list.pop_front(), car)


func char_paint() -> void:
	paint_mat.albedo_color = paint_mat.albedo_color.darkened(0.82)
	paint_mat.clearcoat = 0.0
	paint_mat.roughness = 0.95
	paint_mat.metallic = 0.1
	for l in _lights:
		var m: StandardMaterial3D = l.material_override
		m.emission_energy_multiplier = 0.0
