extends Node
## Look development: renders the same scene and cameras in one candidate
## visual direction, so directions can be compared side by side.
##
##   godot --fixed-fps 30 --path . res://tools/look_dev.tscn -- <premium|gritty|illustrated|current> <out_dir>
##
## Needs a real renderer (not --headless). This is exploration, not shipping code:
## the chosen direction gets rebuilt properly in the game's own materials.

const POST := preload("res://tools/look_post.gdshader")

var game: Node3D
var cam: Camera3D
var post: ShaderMaterial
var out := "looks"
var look := "current"


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	look = args[0] if args.size() > 0 else "current"
	out = args[1] if args.size() > 1 else "looks"
	DirAccess.make_dir_recursive_absolute(out)
	get_tree().physics_interpolation = false
	var game_script: GDScript = load("res://scripts/game.gd")
	game_script.set("autopilot", true)
	game_script.set("bot_count", 4)
	game = load("res://scenes/main.tscn").instantiate()
	add_child(game)
	game._timer = 999.0 # keep everyone parked
	game.hud.visible = false
	_make_camera()
	await wait(1.5)
	apply_look(look)
	await shoot_all()
	get_tree().quit()


func wait(seconds: float) -> void:
	var t := 0.0
	while t < seconds:
		await get_tree().process_frame
		t += get_process_delta_time()


func shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("%s/%s_%s.png" % [out, look, name])
	print("saved ", look, "_", name)


func _make_camera() -> void:
	cam = Camera3D.new()
	add_child(cam)
	cam.make_current()
	var quad := MeshInstance3D.new()
	var qm := QuadMesh.new()
	quad.mesh = qm
	quad.extra_cull_margin = 16384.0
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	post = ShaderMaterial.new()
	post.shader = POST
	quad.material_override = post
	cam.add_child(quad)
	quad.position = Vector3(0, 0, -1)


func aim(pos: Vector3, at: Vector3, fov: float) -> void:
	cam.global_position = pos
	cam.look_at(at, Vector3.UP)
	cam.fov = fov


func shoot_all() -> void:
	var cars: Array = game.cars
	var hero: Car = cars[0]
	var c := hero.global_position
	var xf := hero.global_transform
	aim(xf * Vector3(-3.6, 0.85, -5.0), c + Vector3.UP * 0.35, 36.0)
	await wait(0.3)
	await shot("car")

	aim(Vector3(78, 52, 78), Vector3(0, 0, 0), 55.0)
	await wait(0.3)
	await shot("arena")

	# A staged moment: chase view behind our car, a rival broadside ahead, a wreck going up.
	var rival: Car = cars[1]
	var wreck: Car = cars[2]
	_place(hero, Vector3(-3, 0.62, -38), 0.05)
	_place(rival, Vector3(1, 0.62, -49), PI * 0.5 - 0.3)
	_place(wreck, Vector3(-8, 0.62, -55), 2.2)
	await wait(0.6)
	wreck.take_damage(999.0, wreck.global_position, null)
	Impact.collision(rival.global_position + Vector3(-1.0, 0.4, 0.6), Vector3(-1, 0.3, 0.4).normalized(), 220.0, false)
	aim(Vector3(-4.2, 2.3, -30.5), Vector3(-1.5, 0.9, -49.0), 58.0)
	var t := 0.0
	var n := 0
	while n < 3:
		await get_tree().process_frame
		t += get_process_delta_time()
		if t > 0.12 + n * 0.1:
			await shot("action_%d" % n)
			n += 1
	print("hero ", hero.global_position, " rival ", rival.global_position, " wreck ", wreck.global_position)


func _place(car: Car, pos: Vector3, yaw: float) -> void:
	car.teleport(Transform3D(Basis(Vector3.UP, yaw), pos))


# --- Looks ---

func _materials() -> Dictionary:
	# Every StandardMaterial3D in the scene, tagged with the role it plays.
	var roles := {}
	for k in game.arena._mats:
		roles[game.arena._mats[k]] = String(k)
	for car: Car in game.cars:
		roles[car.visual.paint_mat] = "paint"
		roles[car.visual.trim_mat] = "trim"
		roles[car.visual.chrome_mat] = "chrome"
		roles[car.visual.glass_mat] = "glass"
	var found := {}
	for n in game.find_children("*", "MeshInstance3D", true, false):
		var m := (n as MeshInstance3D).material_override as StandardMaterial3D
		if m and not found.has(m):
			found[m] = roles.get(m, "rubber" if m.albedo_color.v < 0.05 else ("light" if m.emission_enabled else "other"))
	return found


func _env() -> Environment:
	return game.arena.find_children("*", "WorldEnvironment", true, false)[0].environment


func _sun() -> DirectionalLight3D:
	return game.arena.find_children("*", "DirectionalLight3D", true, false)[0]


func _sky() -> ProceduralSkyMaterial:
	return _env().sky.sky_material


func apply_look(name: String) -> void:
	match name:
		"premium":
			_premium()
		"gritty":
			_gritty()
		"illustrated":
			_illustrated()


func _flat(m: StandardMaterial3D, col: Color, keep_normal := 0.0) -> void:
	m.albedo_texture = null
	m.albedo_color = col
	if keep_normal <= 0.0:
		m.normal_enabled = false
	else:
		m.normal_scale = keep_normal


## Stylised premium: clean shapes and colour, saturated light, soft contact
## shadows, gentle depth of field. Art of Rally / Rocket League territory.
func _premium() -> void:
	var paints := [Color(0.85, 0.12, 0.08), Color(0.05, 0.32, 0.72), Color(0.98, 0.7, 0.12), Color(0.1, 0.55, 0.45), Color(0.92, 0.9, 0.86)]
	var i := 0
	var mats := _materials()
	for m: StandardMaterial3D in mats:
		match mats[m]:
			"sand": _flat(m, Color(0.95, 0.68, 0.46), 0.15)
			"rock": _flat(m, Color(0.86, 0.43, 0.3), 0.35)
			"concrete": _flat(m, Color(0.86, 0.83, 0.78), 0.1)
			"rust": _flat(m, Color(0.85, 0.28, 0.14))
			"navy": _flat(m, Color(0.12, 0.32, 0.66))
			"bone": _flat(m, Color(0.97, 0.93, 0.84))
			"teal": _flat(m, Color(0.08, 0.6, 0.58))
			"paint":
				m.albedo_color = paints[i % paints.size()]
				i += 1
				m.metallic = 0.35
				m.roughness = 0.22
				m.clearcoat = 1.0
			"trim":
				m.albedo_color = Color(0.12, 0.12, 0.14)
				m.roughness = 0.45
	var sky := _sky()
	sky.sky_top_color = Color(0.1, 0.3, 0.72)
	sky.sky_horizon_color = Color(1.0, 0.76, 0.56)
	sky.ground_horizon_color = Color(0.95, 0.7, 0.5)
	var sun := _sun()
	sun.rotation_degrees = Vector3(-34.0, -40.0, 0.0)
	sun.light_color = Color(1.0, 0.9, 0.76)
	sun.light_energy = 2.5
	var env := _env()
	env.ambient_light_energy = 0.6
	env.tonemap_exposure = 0.92
	env.ssao_intensity = 3.0
	env.ssao_radius = 2.2
	env.glow_intensity = 0.8
	env.glow_bloom = 0.1
	env.fog_density = 0.0009
	env.volumetric_fog_density = 0.0008
	env.adjustment_saturation = 1.3
	env.adjustment_contrast = 1.14
	var attrs := CameraAttributesPractical.new()
	attrs.dof_blur_far_enabled = true
	attrs.dof_blur_far_distance = 70.0
	attrs.dof_blur_far_transition = 80.0
	attrs.dof_blur_amount = 0.05
	cam.attributes = attrs
	post.set_shader_parameter("vignette", 0.22)


## Gritty and grounded: dust, grime, low hard sun, muted colour, film grain.
## Wreckfest / Mad Max territory.
func _gritty() -> void:
	var grime := NoiseTexture2D.new()
	var gn := FastNoiseLite.new()
	gn.frequency = 0.02
	gn.fractal_octaves = 6
	grime.noise = gn
	var gg := Gradient.new()
	gg.set_color(0, Color(0.42, 0.38, 0.33))
	gg.set_color(1, Color(1.0, 0.98, 0.95))
	grime.color_ramp = gg
	grime.seamless = true
	var paints := [Color(0.42, 0.12, 0.08), Color(0.16, 0.22, 0.26), Color(0.55, 0.42, 0.18), Color(0.22, 0.24, 0.2), Color(0.5, 0.48, 0.44)]
	var i := 0
	var mats := _materials()
	for m: StandardMaterial3D in mats:
		match mats[m]:
			"paint":
				m.albedo_color = paints[i % paints.size()]
				i += 1
				m.albedo_texture = grime
				m.uv1_scale = Vector3(2, 2, 2)
				m.metallic = 0.3
				m.roughness = 0.62
				m.clearcoat = 0.25
				m.clearcoat_roughness = 0.5
			"chrome":
				m.albedo_color = Color(0.45, 0.43, 0.4)
				m.roughness = 0.42
				m.albedo_texture = grime
			"glass":
				m.albedo_color = Color(0.1, 0.09, 0.08, 0.9)
				m.roughness = 0.35
	var sky := _sky()
	sky.sky_top_color = Color(0.38, 0.4, 0.42)
	sky.sky_horizon_color = Color(0.8, 0.66, 0.5)
	sky.ground_horizon_color = Color(0.6, 0.48, 0.36)
	var sun := _sun()
	sun.rotation_degrees = Vector3(-13.0, -62.0, 0.0)
	sun.light_color = Color(1.0, 0.74, 0.5)
	sun.light_energy = 2.6
	var env := _env()
	env.ambient_light_energy = 0.75
	env.tonemap_exposure = 1.3
	env.fog_density = 0.004
	env.fog_light_color = Color(0.72, 0.6, 0.46)
	env.volumetric_fog_density = 0.008
	env.volumetric_fog_albedo = Color(0.8, 0.66, 0.5)
	env.adjustment_saturation = 0.62
	env.adjustment_contrast = 1.22
	env.glow_intensity = 0.4
	post.set_shader_parameter("grain", 0.07)
	post.set_shader_parameter("vignette", 0.4)
	post.set_shader_parameter("tint", Color(1.0, 0.95, 0.88))


## 1970s illustrated: flat poster colour, two-tone cel shading, purple shadows,
## ink outlines and a halftone screen. A film poster or a period car magazine.
func _illustrated() -> void:
	var paints := [Color(0.82, 0.16, 0.1), Color(0.1, 0.38, 0.55), Color(0.98, 0.72, 0.15), Color(0.18, 0.5, 0.36), Color(0.95, 0.9, 0.8)]
	var i := 0
	var mats := _materials()
	for m: StandardMaterial3D in mats:
		var role: String = mats[m]
		m.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
		m.specular_mode = BaseMaterial3D.SPECULAR_TOON
		m.roughness = 0.25
		m.metallic = 0.0
		m.clearcoat_enabled = false
		match role:
			"sand": _flat(m, Color(0.98, 0.74, 0.44))
			"rock": _flat(m, Color(0.88, 0.38, 0.22))
			"concrete": _flat(m, Color(0.93, 0.87, 0.74))
			"rust": _flat(m, Color(0.75, 0.2, 0.12))
			"navy": _flat(m, Color(0.12, 0.3, 0.45))
			"bone": _flat(m, Color(0.97, 0.92, 0.8))
			"teal": _flat(m, Color(0.15, 0.5, 0.48))
			"hazard": _flat(m, Color(1.0, 0.8, 0.1))
			"paint":
				m.albedo_color = paints[i % paints.size()]
				i += 1
				m.metallic_specular = 0.8
			"chrome":
				m.albedo_color = Color(0.9, 0.88, 0.82)
			"trim":
				m.albedo_color = Color(0.14, 0.1, 0.1)
			"glass":
				m.albedo_color = Color(0.2, 0.32, 0.42, 1.0)
				m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
	var sky := _sky()
	sky.sky_top_color = Color(0.95, 0.45, 0.22)
	sky.sky_horizon_color = Color(1.0, 0.86, 0.52)
	sky.ground_horizon_color = Color(1.0, 0.8, 0.5)
	sky.sky_curve = 0.25
	var sun := _sun()
	sun.rotation_degrees = Vector3(-30.0, -40.0, 0.0)
	sun.light_color = Color(1.0, 0.95, 0.85)
	sun.light_energy = 1.6
	sun.shadow_blur = 0.0
	sun.light_angular_distance = 0.0
	var env := _env()
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.tonemap_exposure = 1.0
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.5, 0.36, 0.62)
	env.ambient_light_energy = 0.75
	env.ssao_enabled = false
	env.ssil_enabled = false
	env.volumetric_fog_enabled = false
	env.fog_density = 0.0012
	env.fog_light_color = Color(1.0, 0.82, 0.55)
	env.glow_intensity = 0.25
	env.adjustment_saturation = 1.1
	env.adjustment_contrast = 1.0
	post.set_shader_parameter("outline_px", 1.6)
	post.set_shader_parameter("outline_color", Color(0.14, 0.06, 0.06))
	post.set_shader_parameter("halftone", 0.55)
	post.set_shader_parameter("halftone_px", 5.0)
	post.set_shader_parameter("grain", 0.035)
	post.set_shader_parameter("vignette", 0.12)
