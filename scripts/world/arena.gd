class_name Arena
extends Node3D
## "The Pit": a sunken quarry floor ringed by rock, with containers and concrete
## to slam people into and a central mesa to be rammed off. Built from
## primitives with procedural materials until it gets an art pass.

const FLOOR_HALF := 70.0

var spawn_points: Array[Transform3D] = []
var _rng := RandomNumberGenerator.new()
var _mats := {}


func build() -> void:
	_rng.seed = 6767
	_make_materials()
	_environment()
	_ground()
	_rim()
	_mesa()
	_ramps()
	_containers()
	_pillars()
	_backdrop()
	for i in 8:
		var a := TAU * i / 8.0 + 0.3
		var p := Vector3(cos(a), 0.0, sin(a)) * 46.0 + Vector3.UP * 1.2
		var face := Transform3D.IDENTITY.looking_at(-p.normalized() * Vector3(1, 0, 1), Vector3.UP)
		spawn_points.append(Transform3D(face.basis, p))


## Flat poster colour with cel shading; the ink lines come from the camera's post pass.
func _make_materials() -> void:
	_mats.sand = Poster.mat(Poster.SAND, &"ground")
	_mats.rock = Poster.mat(Poster.CANYON)
	_mats.concrete = Poster.mat(Poster.CONCRETE)
	_mats.rust = Poster.mat(Poster.RUST)
	_mats.navy = Poster.mat(Poster.NAVY)
	_mats.bone = Poster.mat(Poster.CREAM)
	_mats.teal = Poster.mat(Poster.TEAL)
	_mats.hazard = Poster.mat(Poster.MUSTARD)


## A drive-in poster sky: burnt orange to cream, a hard sun, purple shadows.
func _environment() -> void:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-30.0, -40.0, 0.0)
	sun.light_color = Color(1.0, 0.93, 0.8)
	sun.light_energy = 2.1
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 220.0
	sun.shadow_blur = 0.0
	add_child(sun)

	var sky_mat := ProceduralSkyMaterial.new()
	# A hard desert sky: deep blue overhead, bleaching to dusty gold at the horizon.
	sky_mat.sky_top_color = Color(0.22, 0.45, 0.66)
	sky_mat.sky_horizon_color = Color(0.94, 0.8, 0.58)
	sky_mat.ground_horizon_color = Color(0.9, 0.74, 0.52)
	sky_mat.ground_bottom_color = Color(0.45, 0.3, 0.2)
	sky_mat.sky_curve = 0.25
	sky_mat.sun_angle_max = 12.0
	var sky := Sky.new()
	sky.sky_material = sky_mat

	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.tonemap_exposure = 1.0
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	# Shade stays coloured, never grey: a cool dusty violet against the warm sun.
	env.ambient_light_color = Poster.PLUM
	env.ambient_light_energy = 0.55
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.glow_enabled = true
	env.glow_intensity = 0.25
	env.glow_hdr_threshold = 1.2
	env.fog_enabled = true
	env.fog_light_color = Color(0.92, 0.78, 0.56)
	env.fog_density = 0.0016
	env.fog_sky_affect = 0.2 # haze on the ground, but keep the sky blue
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.1
	# The web/low-end renderer lights in a different colour space and comes out
	# much brighter: pull it back so the poster palette survives.
	if RenderingServer.get_current_rendering_method() == "gl_compatibility":
		env.tonemap_exposure = 0.72
		env.glow_enabled = false
		env.ambient_light_energy = 0.5
		sun.light_energy = 1.05
		env.adjustment_saturation = 1.0
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)


func _static_box(size: Vector3, xf: Transform3D, mat: Material, shadow := true, mesh: Mesh = null) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.collision_layer = Car.LAYER_WORLD
	body.collision_mask = 0
	var cs := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	cs.shape = shape
	body.add_child(cs)
	var mi := MeshInstance3D.new()
	if mesh:
		mi.mesh = mesh
	else:
		var bm := BoxMesh.new()
		bm.size = size
		mi.mesh = bm
	mi.material_override = mat
	if not shadow:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.add_child(mi)
	body.transform = xf
	var pm := PhysicsMaterial.new()
	pm.friction = 0.5
	body.physics_material_override = pm
	add_child(body)
	return body


func _ground() -> void:
	_static_box(Vector3(400, 2, 400), Transform3D(Basis.IDENTITY, Vector3(0, -1, 0)), _mats.sand, false)


## A ring of tumbled rock slabs around the floor, overlapping so there are no gaps.
func _rim() -> void:
	var count := 30
	for i in count:
		var a := TAU * i / count
		var r := FLOOR_HALF + 6.0 + _rng.randf_range(-2.0, 2.0)
		var p := Vector3(cos(a) * r, 0.0, sin(a) * r)
		var h := _rng.randf_range(14.0, 24.0)
		var size := Vector3(_rng.randf_range(18.0, 24.0), h, _rng.randf_range(10.0, 14.0))
		var basis := Basis(Vector3.UP, -a + PI * 0.5) * Basis(Vector3.RIGHT, _rng.randf_range(-0.12, 0.05)) * Basis(Vector3.FORWARD, _rng.randf_range(-0.06, 0.06))
		_static_box(size, Transform3D(basis, p + Vector3.UP * (h * 0.5 - 1.5)), _mats.rock, true, rock_mesh(size, 0.16))
		# A lower talus slab in front, angled like a banked wall you can ride up a little.
		if i % 2 == 0:
			var talus := Vector3(size.x * 0.9, 3.0, 9.0)
			var tb := Basis(Vector3.UP, -a + PI * 0.5) * Basis(Vector3.RIGHT, deg_to_rad(-22.0))
			var tp := Vector3(cos(a), 0.0, sin(a)) * (FLOOR_HALF - 1.5)
			_static_box(talus, Transform3D(tb, tp + Vector3.UP * 0.2), _mats.rock, true, rock_mesh(talus, 0.1))


func _mesa() -> void:
	_static_box(Vector3(22, 3.6, 22), Transform3D(Basis(Vector3.UP, 0.12), Vector3(0, 1.8, 0)), _mats.concrete)
	# Ramps up onto it from two sides.
	for side in [-1.0, 1.0]:
		var ang := deg_to_rad(13.0)
		var length := 3.6 / sin(ang)
		var b := Basis(Vector3.UP, 0.12) * Basis(Vector3.UP, 0.0 if side > 0 else PI) * Basis(Vector3.RIGHT, ang)
		var centre := Basis(Vector3.UP, 0.12) * Vector3(0, 0, side * (11.0 + length * 0.5 * cos(ang)))
		var thick := 7.0 # thick enough that the underside is buried: a solid wedge
		var y := length * 0.5 * sin(ang) - thick * 0.5 * cos(ang)
		_static_box(Vector3(9.0, thick, length), Transform3D(b, centre + Vector3.UP * y), _mats.concrete)
	# Hazard stripes on the lip.
	_static_box(Vector3(22.2, 0.3, 0.6), Transform3D(Basis(Vector3.UP, 0.12), Basis(Vector3.UP, 0.12) * Vector3(0, 3.62, 10.8)), _mats.hazard, false)
	_static_box(Vector3(22.2, 0.3, 0.6), Transform3D(Basis(Vector3.UP, 0.12), Basis(Vector3.UP, 0.12) * Vector3(0, 3.62, -10.8)), _mats.hazard, false)


## Kicker ramps for big air across the open floor.
func _ramps() -> void:
	for i in 4:
		var a := TAU * i / 4.0 + PI * 0.25
		var p := Vector3(cos(a), 0, sin(a)) * 40.0
		var ang := deg_to_rad(16.0)
		var length := 9.0
		var thick := 5.0
		var b := Basis(Vector3.UP, -a + PI) * Basis(Vector3.RIGHT, ang)
		var y := length * 0.5 * sin(ang) - thick * 0.5 * cos(ang) - 0.05
		_static_box(Vector3(6.5, thick, length), Transform3D(b, p + Vector3.UP * y), _mats.concrete)


func _containers() -> void:
	var colors := ["rust", "navy", "bone", "teal"]
	var spots := [
		[Vector3(-30, 0, -14), 0.2, 1], [Vector3(-34, 0, 16), 1.4, 2], [Vector3(28, 0, -26), -0.5, 1],
		[Vector3(32, 0, 20), 0.9, 1], [Vector3(-8, 0, 44), 1.57, 1], [Vector3(10, 0, -46), 0.1, 2],
		[Vector3(52, 0, -2), 1.57, 1], [Vector3(-54, 0, -30), 0.6, 1],
	]
	for s in spots:
		var basis := Basis(Vector3.UP, s[1])
		for level in s[2]:
			var col: String = colors[_rng.randi() % colors.size()]
			var jitter := Basis(Vector3.UP, _rng.randf_range(-0.08, 0.08)) if level > 0 else Basis.IDENTITY
			_static_box(Vector3(2.44, 2.6, 12.2), Transform3D(basis * jitter, s[0] + Vector3.UP * (1.3 + level * 2.6)), _mats[col])


func _pillars() -> void:
	var spots := [Vector3(-18, 0, -30), Vector3(20, 0, 32), Vector3(-44, 0, 2), Vector3(44, 0, 38), Vector3(18, 0, 6), Vector3(-20, 0, 22)]
	for p in spots:
		var body := StaticBody3D.new()
		body.collision_layer = Car.LAYER_WORLD
		body.collision_mask = 0
		var cs := CollisionShape3D.new()
		var cyl := CylinderShape3D.new()
		cyl.radius = 1.3
		cyl.height = 9.0
		cs.shape = cyl
		body.add_child(cs)
		var mi := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 1.3
		cm.bottom_radius = 1.3
		cm.height = 9.0
		cm.radial_segments = 24
		mi.mesh = cm
		mi.material_override = _mats.concrete
		body.add_child(mi)
		body.position = p + Vector3.UP * 4.5
		add_child(body)
		var band := MeshInstance3D.new()
		var bm := CylinderMesh.new()
		bm.top_radius = 1.33
		bm.bottom_radius = 1.33
		bm.height = 0.6
		band.mesh = bm
		band.material_override = _mats.hazard
		band.position = p + Vector3.UP * 1.0
		add_child(band)


## Distant mesas so the horizon isn't empty above the rim.
func _backdrop() -> void:
	for i in 14:
		var a := TAU * i / 14.0 + _rng.randf_range(-0.1, 0.1)
		var r := _rng.randf_range(220.0, 340.0)
		var h := _rng.randf_range(30.0, 70.0)
		var size := Vector3(_rng.randf_range(60, 140), h, _rng.randf_range(50, 90))
		var mi := MeshInstance3D.new()
		mi.mesh = rock_mesh(size, 0.22)
		mi.material_override = _mats.rock
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.position = Vector3(cos(a) * r, h * 0.5 - 4.0, sin(a) * r)
		mi.rotation.y = _rng.randf_range(0, TAU)
		add_child(mi)


## A box roughed up into a rock: corners rounded off, faces pushed about by noise.
func rock_mesh(size: Vector3, roughness: float) -> Mesh:
	var bm := BoxMesh.new()
	bm.size = size
	bm.subdivide_width = 8
	bm.subdivide_height = 8
	bm.subdivide_depth = 8
	var arrays := bm.get_mesh_arrays()
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var noise := FastNoiseLite.new()
	noise.seed = _rng.randi()
	noise.frequency = 0.06
	noise.fractal_octaves = 3
	var half := size * 0.5
	var amp := minf(size.x, minf(size.y, size.z)) * roughness
	for i in verts.size():
		var v := verts[i]
		var u := v / half # -1..1 inside the box
		var corner := (absf(u.x * u.y) + absf(u.y * u.z) + absf(u.x * u.z)) / 3.0
		var dir := u.normalized()
		var n := noise.get_noise_3dv(v * 1.0)
		var bottom := clampf((u.y + 1.0) * 2.0, 0.0, 1.0) # keep the base sitting on the ground
		verts[i] = v * (1.0 - corner * 0.18) + dir * n * amp * bottom
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = null
	arrays[Mesh.ARRAY_TANGENT] = null
	var st := SurfaceTool.new()
	st.create_from_arrays(arrays)
	st.generate_normals()
	st.generate_tangents()
	return st.commit()
