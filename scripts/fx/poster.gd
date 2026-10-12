class_name Poster
## The comic-ink look: bold ink outlines, hard cel shading with hatched shadows,
## grime painted on, and a dusty desert palette. Every in-game material comes
## from here so the style stays consistent.

const INK := Color(0.07, 0.05, 0.05)
const CREAM := Color(0.93, 0.88, 0.76)
const SAND := Color(0.86, 0.64, 0.4)
const CANYON := Color(0.74, 0.36, 0.22)
const CONCRETE := Color(0.76, 0.72, 0.62)
const RUST := Color(0.66, 0.22, 0.12)
const NAVY := Color(0.14, 0.27, 0.38)
const TEAL := Color(0.16, 0.45, 0.44)
const MUSTARD := Color(0.94, 0.7, 0.12)
const PLUM := Color(0.36, 0.33, 0.5)
const SKIN := Color(0.9, 0.72, 0.56)

static var _shared := {}
static var _outline: ShaderMaterial


## The ink line drawn around every poster-style object.
static func outline() -> ShaderMaterial:
	if _outline == null:
		_outline = ShaderMaterial.new()
		_outline.shader = load("res://shaders/ink_outline.gdshader")
		_outline.set_shader_parameter("ink", INK)
	return _outline


## A comic-ink material: hard cel shading, hatching in the shade, grime and an
## ink outline. Kinds: flat, paint (hard glint, cleaner), chrome, glass, rubber,
## ground (cracks, no outline) and light (emissive; a plain material).
static func mat(color: Color, kind := &"flat") -> Material:
	if kind == &"light":
		var lm := StandardMaterial3D.new()
		lm.albedo_color = color
		lm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		lm.emission_enabled = true
		lm.emission = color
		lm.emission_energy_multiplier = 2.5
		return lm
	var m := ShaderMaterial.new()
	m.shader = _surface_shader()
	m.set_shader_parameter("albedo", color)
	m.set_shader_parameter("ink", INK)
	match kind:
		&"paint":
			m.set_shader_parameter("spec", 0.35)
			m.set_shader_parameter("gloss", 0.985)
			m.set_shader_parameter("grime", 0.35)
		&"chrome":
			m.set_shader_parameter("spec", 1.2)
			m.set_shader_parameter("gloss", 0.8)
			m.set_shader_parameter("grime", 0.25)
			m.set_shader_parameter("fill", 0.45)
		&"glass":
			m.set_shader_parameter("spec", 0.8)
			m.set_shader_parameter("gloss", 0.97)
			m.set_shader_parameter("grime", 0.0)
			m.set_shader_parameter("hatch", 0.4)
		&"rubber":
			m.set_shader_parameter("spec", 0.0)
			m.set_shader_parameter("grime", 0.0)
			m.set_shader_parameter("hatch", 0.0)
		&"ground":
			m.set_shader_parameter("spec", 0.0)
			m.set_shader_parameter("grime", 0.0)
			m.set_shader_parameter("cracks", 1.0)
			m.set_shader_parameter("hatch_density", 4.0)
		_:
			m.set_shader_parameter("spec", 0.0)
			m.set_shader_parameter("grime", 0.6)
	if kind != &"ground":
		m.next_pass = outline()
	return m


static var _surface: Shader

static func _surface_shader() -> Shader:
	if _surface == null:
		_surface = load("res://shaders/ink_surface.gdshader")
	return _surface


## Shared, never-modified materials (chrome, rubber, ink...), one per colour and kind.
static func shared(color: Color, kind := &"flat") -> Material:
	var key := "%s/%s" % [color.to_html(), kind]
	if not _shared.has(key):
		_shared[key] = mat(color, kind)
	return _shared[key]
