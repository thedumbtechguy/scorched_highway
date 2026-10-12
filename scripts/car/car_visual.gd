class_name CarVisual
extends Node3D
## A car body built from primitives in the poster style. CarBodies describes each
## car with the helpers here; the car and the specials rely on the rest: wheels,
## panels that come off by zone, signature parts that come off as health drops,
## and the mount points for guns.

var paint_mat: Material
var accent_mat: Material
var trim_mat: Material
var chrome_mat: Material
var glass_mat: Material
var rubber_mat: Material

## Where the machine gun and the special sit, in car space. Set by the body.
var gun_mount := Vector3(0, 0.8, -0.4)
var special_mount := Vector3(0, 0.5, -2.0)
## Optional node a special can aim (Double Trouble's sidecar gun).
var turret: Node3D

var _panels := {} # zone -> Array of nodes, in the order they come off
var _detached := {}
var _parts: Array[Dictionary] = [] # signature parts: {name, node, at (fraction of health lost)}
var _lights: Array[MeshInstance3D] = []

const DETACH_AT := [22.0, 48.0, 80.0]


func build(def: Dictionary) -> void:
	paint_mat = Poster.mat(def.paint, &"paint")
	accent_mat = Poster.mat(def.accent, &"paint")
	trim_mat = Poster.shared(Color(0.16, 0.12, 0.11))
	chrome_mat = Poster.shared(Color(0.9, 0.88, 0.82), &"chrome")
	glass_mat = Poster.shared(Color(0.2, 0.36, 0.46), &"glass")
	rubber_mat = Poster.shared(Color(0.09, 0.07, 0.07), &"rubber")
	CarBodies.build(self, def)


# --- Building helpers (used by CarBodies) ---

func box(size: Vector3, pos: Vector3, m: Material, zone := &"", rot := Vector3.ZERO, parent: Node3D = null) -> MeshInstance3D:
	var bm := BoxMesh.new()
	bm.size = size
	return _add(bm, pos, m, zone, rot, parent)


func cyl(radius: float, height: float, pos: Vector3, m: Material, zone := &"", rot := Vector3.ZERO, parent: Node3D = null, sides := 16) -> MeshInstance3D:
	var cm := CylinderMesh.new()
	cm.top_radius = radius
	cm.bottom_radius = radius
	cm.height = height
	cm.radial_segments = sides
	cm.rings = 1
	return _add(cm, pos, m, zone, rot, parent)


func ball(radius: float, pos: Vector3, m: Material, parent: Node3D = null) -> MeshInstance3D:
	var sm := SphereMesh.new()
	sm.radius = radius
	sm.height = radius * 2.0
	sm.radial_segments = 16
	sm.rings = 8
	return _add(sm, pos, m, &"", Vector3.ZERO, parent)


## A round bar from a to b (roll cages, forks, ladders).
func bar(a: Vector3, b: Vector3, radius: float, m: Material, parent: Node3D = null) -> MeshInstance3D:
	var mi := cyl(radius, a.distance_to(b), (a + b) * 0.5, m, &"", Vector3.ZERO, parent, 8)
	var dir := (b - a).normalized()
	var axis := Vector3.UP.cross(dir)
	if axis.length() > 0.0001:
		mi.basis = Basis(axis.normalized(), Vector3.UP.angle_to(dir))
	return mi


func light(size: Vector3, pos: Vector3, color: Color, parent: Node3D = null) -> MeshInstance3D:
	var mi := box(size, pos, Poster.mat(color, &"light"), &"", Vector3.ZERO, parent)
	_lights.append(mi)
	return mi


## Poster lettering painted on the body (numbers, names, stencils).
func label(text: String, pos: Vector3, rot_y: float, size := 0.5, color := Poster.CREAM, parent: Node3D = null) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.font_size = 128
	l.pixel_size = size / 128.0
	l.outline_size = 22
	l.modulate = color
	l.outline_modulate = Poster.INK
	l.shaded = false
	l.double_sided = false
	l.position = pos
	l.rotation_degrees.y = rot_y
	(parent if parent else self).add_child(l)
	return l


## A solid extruded from a side outline: `outline` is (z, y) points in car space,
## extruded `width` across the car and centred at x. The mesh is centred on its
## own bounds so the ink outline grows evenly around it.
func profile(outline: PackedVector2Array, width: float, m: Material, zone := &"", parent: Node3D = null, x := 0.0) -> MeshInstance3D:
	var mesh := extrude(outline, width)
	if mesh == null:
		return null
	var b := _bounds(outline)
	var mi := _add(mesh, Vector3(x, b.get_center().y, b.get_center().x), m, zone, Vector3.ZERO, parent)
	return mi


## Paint on both flanks only (two-tone panels, wood siding, stripes): a thin
## extrusion just proud of each side of a body `width` wide.
func side_paint(outline: PackedVector2Array, width: float, m: Material, zone := &"") -> void:
	for side in [-1.0, 1.0]:
		profile(outline, 0.03, m, zone, null, side * (width * 0.5 + 0.005))


static func _bounds(outline: PackedVector2Array) -> Rect2:
	var r := Rect2(outline[0], Vector2.ZERO)
	for p in outline:
		r = r.expand(p)
	return r


## Builds the extruded mesh, centred on the outline's bounds. Flat-shaded, which
## suits the two-tone cel shading.
static func extrude(outline: PackedVector2Array, width: float) -> ArrayMesh:
	if outline.size() < 3:
		return null
	var c := _bounds(outline).get_center()
	var pts := PackedVector2Array()
	for p in outline:
		pts.append(p - c)
	var tris := Geometry2D.triangulate_polygon(pts)
	if tris.is_empty():
		return null
	var area := 0.0
	for i in pts.size():
		var a := pts[i]
		var b := pts[(i + 1) % pts.size()]
		area += a.x * b.y - b.x * a.y
	var ccw := area > 0.0
	var hw := width * 0.5
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	# 2D (z, y) maps to 3D (x, y, z).
	var to3 := func(p: Vector2, x: float) -> Vector3: return Vector3(x, p.y, p.x)
	for side in [-1.0, 1.0]:
		var n := Vector3(side, 0, 0)
		for i in range(0, tris.size(), 3):
			_tri(st, to3.call(pts[tris[i]], side * hw), to3.call(pts[tris[i + 1]], side * hw), to3.call(pts[tris[i + 2]], side * hw), n)
	for i in pts.size():
		var a := pts[i]
		var b := pts[(i + 1) % pts.size()]
		var e := b - a
		var n2 := Vector2(e.y, -e.x) if ccw else Vector2(-e.y, e.x)
		var n := Vector3(0, n2.y, n2.x).normalized()
		var a0: Vector3 = to3.call(a, -hw)
		var a1: Vector3 = to3.call(a, hw)
		var b0: Vector3 = to3.call(b, -hw)
		var b1: Vector3 = to3.call(b, hw)
		_tri(st, a0, b0, b1, n)
		_tri(st, a0, b1, a1, n)
	return st.commit()


## One triangle, wound so its front face looks along `n` (Godot's front faces are clockwise).
static func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, n: Vector3) -> void:
	var order := [a, b, c] if (b - a).cross(c - a).dot(n) < 0.0 else [a, c, b]
	for p in order:
		st.set_normal(n)
		st.add_vertex(p)


## A container for parts that come off together.
func group(pos := Vector3.ZERO) -> Node3D:
	var n := Node3D.new()
	n.position = pos
	add_child(n)
	return n


## A signature part that comes off once `at` (0-1) of the car's health is gone.
func part(name: StringName, node: Node3D, at: float) -> void:
	_parts.append({"name": name, "node": node, "at": at})


func has_part(name: StringName) -> bool:
	for p in _parts:
		if p.name == name:
			return true
	return false


func _add(mesh: Mesh, pos: Vector3, m: Material, zone: StringName, rot: Vector3, parent: Node3D) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = m
	mi.position = pos
	mi.rotation_degrees = rot
	(parent if parent else self).add_child(mi)
	if zone != &"":
		if not _panels.has(zone):
			_panels[zone] = []
		_panels[zone].append(mi)
	return mi


# --- Wheels ---

func add_wheel(mount: Vector3, radius: float, side: float, width := 0.3) -> Node3D:
	var pivot := Node3D.new() # steers around Y, follows suspension
	pivot.position = mount
	add_child(pivot)
	var spin := Node3D.new() # spins around X
	pivot.add_child(spin)
	cyl(radius, width, Vector3.ZERO, rubber_mat, &"", Vector3(0, 0, 90), spin, 20)
	# A chunky hex rim reads as spinning, and as a hubcap from behind.
	cyl(radius * 0.58, width + 0.02, Vector3.ZERO, chrome_mat, &"", Vector3(0, 0, 90), spin, 6)
	cyl(radius * 0.18, width + 0.04, Vector3.ZERO, trim_mat, &"", Vector3(0, 0, 90), spin, 8)
	return pivot


func update_wheels(wheels: Array[Dictionary], steer_angle: float, rest_length: float) -> void:
	for w in wheels:
		var pivot: Node3D = w.node
		# The wheel centre sits one radius above the contact patch: mount - rest + compression.
		pivot.position.y = w.mount.y - rest_length + w.comp
		pivot.rotation.y = steer_angle if w.front else 0.0
		var spin: Node3D = pivot.get_child(0)
		spin.rotation.x = -fmod(w.spin, TAU)


# --- Damage ---

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
		var n: Node3D = list.pop_front()
		if is_instance_valid(n) and n.is_inside_tree():
			Impact.detach_panel(n, car)


## Signature parts come off as health drops (a light bar, a roof rack, a sidecar).
func hp_lost(fraction: float, car: Node3D) -> void:
	for p in _parts.duplicate():
		if fraction >= p.at:
			_parts.erase(p)
			if is_instance_valid(p.node):
				Impact.detach_panel(p.node, car)


func char_paint() -> void:
	for m: ShaderMaterial in [paint_mat, accent_mat]:
		var c: Color = m.get_shader_parameter("albedo")
		m.set_shader_parameter("albedo", c.darkened(0.8))
	for l in _lights:
		if is_instance_valid(l):
			var m: StandardMaterial3D = l.material_override
			m.emission_energy_multiplier = 0.0
			m.albedo_color = m.albedo_color.darkened(0.7)
