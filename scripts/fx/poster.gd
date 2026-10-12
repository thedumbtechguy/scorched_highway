class_name Poster
## The Drive-In Poster look: flat poster colour, two-tone cel shading and a fixed
## period palette. Every in-game material comes from here so the style stays consistent.

const INK := Color(0.14, 0.06, 0.06)
const CREAM := Color(0.98, 0.94, 0.85)
const SAND := Color(0.98, 0.74, 0.44)
const CANYON := Color(0.88, 0.38, 0.22)
const CONCRETE := Color(0.93, 0.87, 0.74)
const RUST := Color(0.75, 0.2, 0.12)
const NAVY := Color(0.12, 0.3, 0.45)
const TEAL := Color(0.15, 0.5, 0.48)
const MUSTARD := Color(1.0, 0.8, 0.1)
const PLUM := Color(0.5, 0.36, 0.62)
const SKIN := Color(0.94, 0.79, 0.63)

static var _shared := {}
static var _outline: ShaderMaterial


## The ink line drawn around every poster-style object.
static func outline() -> ShaderMaterial:
	if _outline == null:
		_outline = ShaderMaterial.new()
		_outline.shader = load("res://shaders/ink_outline.gdshader")
		_outline.set_shader_parameter("ink", INK)
	return _outline


## A cel-shaded material. Kinds: flat, paint (with a hard specular glint),
## chrome, glass, rubber, light (emissive).
static func mat(color: Color, kind := &"flat") -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
	m.specular_mode = BaseMaterial3D.SPECULAR_TOON
	m.metallic = 0.0
	m.roughness = 0.3
	m.metallic_specular = 0.3
	match kind:
		&"paint":
			m.roughness = 0.22
			m.metallic_specular = 0.8
		&"chrome":
			m.roughness = 0.1
			m.metallic_specular = 1.0
		&"glass":
			m.roughness = 0.12
			m.metallic_specular = 0.9
		&"rubber":
			m.roughness = 0.9
			m.metallic_specular = 0.0
		&"light":
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.emission_enabled = true
			m.emission = color
			m.emission_energy_multiplier = 2.5
	if kind != &"light" and kind != &"ground":
		m.next_pass = outline()
	return m


## Shared, never-modified materials (chrome, rubber, ink...), one per colour and kind.
static func shared(color: Color, kind := &"flat") -> StandardMaterial3D:
	var key := "%s/%s" % [color.to_html(), kind]
	if not _shared.has(key):
		_shared[key] = mat(color, kind)
	return _shared[key]
