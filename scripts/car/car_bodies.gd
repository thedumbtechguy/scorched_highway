class_name CarBodies
## The eight roster silhouettes, built from primitives with CarVisual's helpers.
## Car space: -Z is forward, +Y up, origin at the body's centre. Each body is
## designed to read from behind first, because that's what the chase camera sees.
## Zone panels come off in order as that zone takes damage; parts come off as
## the car's health drops.


static func build(v: CarVisual, def: Dictionary) -> void:
	match def.id:
		&"sundowner": sundowner(v, def)
		&"lawdog": lawdog(v, def)
		&"picket_fence": picket_fence(v, def)
		&"moonbeam": moonbeam(v, def)
		&"gravel_queen": gravel_queen(v, def)
		&"long_haul": long_haul(v, def)
		&"sidewinder": sidewinder(v, def)
		&"double_trouble": double_trouble(v, def)


## The car's main body, extruded from its poster illustration (CarProfiles).
## Below the beltline it's `width` across; above it, the cabin narrows to
## `cabin` of that, with the glass just proud of it. `paints` maps a decal
## colour from the drawing to how it's used: "band" (full width) or "sides".
static func _profile_body(v: CarVisual, id: StringName, width: float, belt := -INF, cabin := 1.0, paints := {}) -> void:
	for shape in CarProfiles.SHAPES[id]:
		var kind: String = shape[0]
		var outline := PackedVector2Array(shape[1])
		match kind:
			"body", "accent":
				var m := v.paint_mat if kind == "body" else v.accent_mat
				if belt == -INF:
					v.profile(outline, width, m)
					continue
				var b := CarVisual._bounds(outline)
				var below := PackedVector2Array([Vector2(b.position.x - 1, b.position.y - 1), Vector2(b.end.x + 1, b.position.y - 1), Vector2(b.end.x + 1, belt), Vector2(b.position.x - 1, belt)])
				var above := PackedVector2Array([Vector2(b.position.x - 1, belt), Vector2(b.end.x + 1, belt), Vector2(b.end.x + 1, b.end.y + 1), Vector2(b.position.x - 1, b.end.y + 1)])
				for piece in Geometry2D.intersect_polygons(outline, below):
					v.profile(piece, width, m)
				for piece in Geometry2D.intersect_polygons(outline, above):
					v.profile(piece, width * cabin, m)
			"glass":
				v.profile(outline, width * cabin + 0.04, v.glass_mat)
			_:
				if kind.begins_with("decal:") and paints.has(kind.substr(6)):
					var how: String = paints[kind.substr(6)]
					var m := Poster.mat(Color(kind.substr(6)), &"paint")
					if how == "band":
						v.profile(outline, width + 0.02, m)
					else:
						v.side_paint(outline, width, m)


## The parts every saloon shares: sills, bumpers, lights, doors and flares.
static func _saloon(v: CarVisual, w: float, length: float, front_z: float, rear_z: float, rear_lights := true) -> void:
	v.box(Vector3(w - 0.3, 0.16, length - 0.3), Vector3(0, -0.22, 0), v.trim_mat)
	v.box(Vector3(w + 0.04, 0.26, 0.2), Vector3(0, -0.08, length * 0.5 + 0.02), v.chrome_mat, &"rear")
	for side in [-1.0, 1.0]:
		var zone: StringName = &"left" if side < 0.0 else &"right"
		v.box(Vector3(0.3, 0.12, 1.05), Vector3(side * (w * 0.5 + 0.08), 0.18, rear_z), v.paint_mat, zone)
		v.box(Vector3(0.28, 0.12, 0.95), Vector3(side * (w * 0.5 + 0.07), 0.18, front_z), v.paint_mat, zone)
		v.light(Vector3(0.34, 0.12, 0.05), Vector3(side * 0.6, 0.1, -length * 0.5 + 0.02), Poster.CREAM)
		if rear_lights:
			v.light(Vector3(0.4, 0.1, 0.05), Vector3(side * 0.58, 0.14, length * 0.5 - 0.02), Color(0.95, 0.12, 0.06))


static func sundowner(v: CarVisual, def: Dictionary) -> void:
	var w := 1.72
	_profile_body(v, &"sundowner", w, 0.36, 0.8)
	# Racing stripes and a scoop on the hood.
	for x in [-0.22, 0.22]:
		v.box(Vector3(0.18, 0.03, 1.3), Vector3(x, 0.31, -1.45), v.accent_mat)
	v.box(Vector3(0.55, 0.14, 0.9), Vector3(0, 0.38, -1.3), v.trim_mat, &"front")
	v.box(Vector3(w + 0.36, 0.3, 0.22), Vector3(0, -0.05, -2.32), v.chrome_mat, &"front") # ram bar
	v.box(Vector3(w * 0.7, 0.16, 0.06), Vector3(0, 0.12, -2.2), v.trim_mat)
	# From behind: ducktail, a full-width tail-light bar, twin pipes.
	v.box(Vector3(w * 0.94, 0.06, 0.36), Vector3(0, 0.36, 2.0), v.paint_mat, &"rear", Vector3(-12, 0, 0))
	v.light(Vector3(w * 0.86, 0.1, 0.05), Vector3(0, 0.16, 2.3), Color(0.95, 0.12, 0.06))
	for side in [-1.0, 1.0]:
		var zone: StringName = &"left" if side < 0.0 else &"right"
		v.box(Vector3(0.05, 0.34, 1.35), Vector3(side * (w * 0.5 + 0.02), 0.1, 0.2), v.paint_mat, zone)
		v.label("1", Vector3(side * (w * 0.5 + 0.05), 0.1, 0.2), 90.0 * side, 0.45)
		v.cyl(0.06, 0.3, Vector3(side * 0.5, -0.24, 2.36), v.chrome_mat, &"", Vector3(90, 0, 0))
		# Thunder Cannons, one on each front fender.
		v.box(Vector3(0.22, 0.18, 0.5), Vector3(side * 0.6, 0.4, -1.0), v.trim_mat)
		v.cyl(0.07, 1.1, Vector3(side * 0.6, 0.42, -1.6), v.trim_mat, &"", Vector3(90, 0, 0))
	_saloon(v, w, 4.6, def.wheels[0][1], def.wheels[2][1], false)
	v.gun_mount = Vector3(0, 0.78, 0.1)
	v.special_mount = Vector3(0, 0.42, -2.2)


static func lawdog(v: CarVisual, def: Dictionary) -> void:
	var w := 1.72
	_profile_body(v, &"lawdog", w, 0.35, 0.82)
	var trunk := v.box(Vector3(w * 0.86, 0.06, 1.0), Vector3(0, 0.3, 1.7), v.paint_mat, &"rear")
	v.label("PURSUIT", Vector3(0, -0.12, 0.53), 0.0, 0.28, Poster.CREAM, trunk)
	# Two-tone doors with a star.
	for side in [-1.0, 1.0]:
		var zone: StringName = &"left" if side < 0.0 else &"right"
		var door := v.box(Vector3(0.05, 0.36, 2.2), Vector3(side * (w * 0.5 + 0.02), 0.08, 0.1), v.accent_mat, zone)
		v.label("★", Vector3(side * 0.04, 0.0, 0.0), 90.0 * side, 0.5, Poster.MUSTARD, door)
	# Push bar: the reinforced nose.
	var push := v.group(Vector3(0, 0, -2.36))
	for x in [-0.35, 0.35]:
		v.box(Vector3(0.08, 0.55, 0.08), Vector3(x, 0.02, 0), v.chrome_mat, &"", Vector3.ZERO, push)
	for y in [0.22, -0.16]:
		v.box(Vector3(w * 0.75, 0.08, 0.08), Vector3(0, y, -0.02), v.chrome_mat, &"", Vector3.ZERO, push)
	v._panels[&"front"] = [push]
	# The light bar, first thing to go.
	var bar := v.group(Vector3(0, 0.81, 0.1))
	v.box(Vector3(0.95, 0.08, 0.28), Vector3.ZERO, v.trim_mat, &"", Vector3.ZERO, bar)
	v.light(Vector3(0.44, 0.1, 0.24), Vector3(-0.24, 0.08, 0), Color(0.95, 0.12, 0.06), bar)
	v.light(Vector3(0.44, 0.1, 0.24), Vector3(0.24, 0.08, 0), Color(0.17, 0.37, 0.95), bar)
	v.part(&"light_bar", bar, 0.25)
	v.cyl(0.05, 0.6, Vector3(0.45, 0.4, -1.45), v.trim_mat, &"", Vector3(90, 0, 0)) # riot gun
	_saloon(v, w, 4.4, def.wheels[0][1], def.wheels[2][1])
	v.gun_mount = Vector3(0, 0.78, 0.6)
	v.special_mount = Vector3(0.45, 0.4, -1.8)


static func picket_fence(v: CarVisual, def: Dictionary) -> void:
	var w := 1.72
	_profile_body(v, &"picket_fence", w, 0.42, 0.84) # the long roof comes from the drawing
	var wood := v.accent_mat
	for side in [-1.0, 1.0]:
		var zone: StringName = &"left" if side < 0.0 else &"right"
		var panel := v.box(Vector3(0.05, 0.26, 4.0), Vector3(side * (w * 0.5 + 0.02), 0.03, 0.05), wood, zone)
		for z in [-1.4, -0.4, 0.6, 1.6]:
			v.box(Vector3(0.02, 0.26, 0.04), Vector3(side * 0.02, 0, z), v.trim_mat, &"", Vector3.ZERO, panel)
	v.box(Vector3(w * 0.9, 0.3, 0.05), Vector3(0, 0.08, 2.32), wood, &"rear") # wood tailgate
	# The kids, watching you through the back window.
	for k in [[-0.35, 0.52, 1.75], [0.0, 0.55, 1.8], [0.35, 0.5, 1.75]]:
		v.ball(0.13, Vector3(k[0], k[1], k[2]), Poster.shared(Poster.SKIN))
		v.box(Vector3(0.24, 0.07, 0.24), Vector3(k[0], k[1] + 0.11, k[2]), Poster.shared(Color(0.54, 0.35, 0.2)))
	# Roof rack full of fireworks.
	var rack := v.group(Vector3(0, 0.8, 0.6))
	for x in [-0.6, 0.6]:
		v.box(Vector3(0.05, 0.05, 2.6), Vector3(x, 0, 0), v.trim_mat, &"", Vector3.ZERO, rack)
	v.box(Vector3(0.5, 0.26, 0.5), Vector3(-0.3, 0.14, 0.7), Poster.shared(Poster.RUST), &"", Vector3.ZERO, rack)
	v.box(Vector3(0.45, 0.22, 0.4), Vector3(0.3, 0.12, 0.1), Poster.shared(Poster.MUSTARD), &"", Vector3.ZERO, rack)
	for x in [-0.3, 0.0, 0.3]:
		v.cyl(0.08, 0.7, Vector3(x, 0.32, -0.7), Poster.shared(Poster.CREAM), &"", Vector3(-35, 0, 0), rack)
	v.part(&"roof_rack", rack, 0.35)
	_saloon(v, w, 4.6, def.wheels[0][1], def.wheels[2][1])
	v.gun_mount = Vector3(0, 0.8, -0.6)
	v.special_mount = Vector3(0, 1.2, 0.0)


static func moonbeam(v: CarVisual, def: Dictionary) -> void:
	var w := 1.76
	_profile_body(v, &"moonbeam", w, -INF, 1.0, {"fbf1dc": "band"})
	v.box(Vector3(w * 0.7, 0.3, 0.04), Vector3(0, 0.88, 2.26), v.glass_mat)
	for side in [-1.0, 1.0]:
		var zone: StringName = &"left" if side < 0.0 else &"right"
		# Flower power, painted big.
		var flower := v.group(Vector3(side * (w * 0.5 + 0.03), 0.3, 0.3))
		for i in 6:
			var a := TAU * i / 6.0
			v.cyl(0.15, 0.03, Vector3(0, sin(a) * 0.2, cos(a) * 0.2), Poster.shared(Poster.MUSTARD), &"", Vector3(0, 0, 90), flower)
		v.cyl(0.13, 0.04, Vector3.ZERO, Poster.shared(Poster.CANYON), &"", Vector3(0, 0, 90), flower)
		v._panels[zone] = [flower]
	# Ladder up the back.
	var ladder := v.group(Vector3(0, 0.5, 2.29))
	for x in [-0.35, 0.35]:
		v.box(Vector3(0.04, 1.1, 0.04), Vector3(x, 0, 0), v.chrome_mat, &"", Vector3.ZERO, ladder)
	for y in [-0.4, -0.1, 0.2, 0.5]:
		v.box(Vector3(0.7, 0.03, 0.03), Vector3(0, y, 0), v.chrome_mat, &"", Vector3.ZERO, ladder)
	v._panels[&"rear"] = [ladder]
	v.box(Vector3(w + 0.04, 0.22, 0.2), Vector3(0, -0.12, -2.3), v.chrome_mat, &"front")
	v.box(Vector3(w + 0.04, 0.22, 0.2), Vector3(0, -0.12, 2.3), v.chrome_mat, &"rear")
	# Speaker stacks: the weapon.
	var stacks := v.group(Vector3(0, 1.4, 0.3))
	for x in [-0.45, 0.45]:
		v.box(Vector3(0.45, 0.55, 0.4), Vector3(x, 0, 0), v.trim_mat, &"", Vector3.ZERO, stacks)
		for y in [0.12, -0.12]:
			v.cyl(0.13, 0.04, Vector3(x, y, 0.21), Poster.shared(Poster.CREAM), &"", Vector3(90, 0, 0), stacks)
	v.part(&"speakers", stacks, 0.4)
	for side in [-1.0, 1.0]:
		v.cyl(0.13, 0.05, Vector3(side * 0.6, 0.25, -2.27), Poster.mat(Poster.CREAM, &"light"), &"", Vector3(90, 0, 0))
		v.light(Vector3(0.18, 0.3, 0.05), Vector3(side * 0.72, 0.35, 2.26), Color(0.95, 0.12, 0.06))
	v.box(Vector3(w - 0.3, 0.16, 4.2), Vector3(0, -0.22, 0), v.trim_mat)
	v.gun_mount = Vector3(0, 1.2, -1.3)
	v.special_mount = Vector3(0, 1.5, 0.3)


static func gravel_queen(v: CarVisual, _def: Dictionary) -> void:
	v.box(Vector3(1.6, 0.3, 6.0), Vector3(0, -0.45, 0), v.trim_mat)
	_profile_body(v, &"gravel_queen", 2.2)
	v.box(Vector3(2.5, 0.75, 0.15), Vector3(0, -0.35, -3.45), v.chrome_mat, &"front", Vector3(18, 0, 0)) # plough
	for side in [-1.0, 1.0]:
		var zone: StringName = &"left" if side < 0.0 else &"right"
		v.box(Vector3(0.06, 0.9, 1.4), Vector3(side * 1.18, 0.75, 0.4), v.paint_mat, zone)
		v.box(Vector3(0.06, 0.9, 1.4), Vector3(side * 1.18, 0.75, 1.85), v.paint_mat, zone)
		v.light(Vector3(0.3, 0.2, 0.05), Vector3(side * 0.6, 0.2, -3.31), Poster.CREAM)
		v.light(Vector3(0.25, 0.35, 0.05), Vector3(side * 0.95, 0.2, 2.9), Color(0.95, 0.12, 0.06))
		v.box(Vector3(0.5, 0.55, 0.04), Vector3(side * 0.85, -0.55, 2.85), v.trim_mat, &"rear") # mud flaps
	v.label("5", Vector3(1.22, 0.75, 1.1), 90.0, 0.7)
	v.label("5", Vector3(-1.22, 0.75, 1.1), -90.0, 0.7)
	var gate := v.box(Vector3(2.3, 1.2, 0.12), Vector3(0, 0.75, 2.82), v.paint_mat, &"rear")
	v.label("MA'S", Vector3(0, 0.0, 0.07), 0.0, 0.55, Poster.INK, gate)
	# The scrap load spills in three heaps as she takes hits.
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	for heap in 3:
		var g := v.group(Vector3(0, 1.45, -0.3 + heap * 1.15))
		for i in 4:
			v.box(Vector3(rng.randf_range(0.3, 0.8), rng.randf_range(0.2, 0.45), rng.randf_range(0.3, 0.7)),
				Vector3(rng.randf_range(-0.7, 0.7), rng.randf_range(0.0, 0.25), rng.randf_range(-0.4, 0.4)),
				Poster.shared(Color(0.55, 0.48, 0.42) if i % 2 else Poster.RUST), &"",
				Vector3(rng.randf_range(-20, 20), rng.randf_range(0, 90), rng.randf_range(-20, 20)), g)
		v.part(StringName("scrap_%d" % heap), g, 0.2 + heap * 0.25)
	v.cyl(0.1, 1.6, Vector3(1.0, 1.4, -1.25), v.chrome_mat)
	v.gun_mount = Vector3(0, 1.32, -1.95)
	v.special_mount = Vector3(0, 0.8, 3.1)


static func long_haul(v: CarVisual, _def: Dictionary) -> void:
	v.box(Vector3(1.3, 0.3, 6.2), Vector3(0, -0.45, 0.1), v.trim_mat)
	_profile_body(v, &"long_haul", 2.1, -INF, 1.0, {"f2b134": "sides"})
	v.box(Vector3(1.3, 0.9, 0.08), Vector3(0, 0.25, -3.12), v.chrome_mat, &"front") # grille
	v.box(Vector3(2.3, 0.35, 0.3), Vector3(0, -0.35, -3.2), v.chrome_mat, &"front")
	v.box(Vector3(0.5, 0.3, 0.4), Vector3(0, 0.05, -3.35), v.trim_mat) # winch
	v.label("MULE", Vector3(0, 1.2, 1.71), 0.0, 0.5, Poster.CREAM)
	for side in [-1.0, 1.0]:
		var zone: StringName = &"left" if side < 0.0 else &"right"
		v.cyl(0.3, 1.0, Vector3(side * 1.05, -0.35, 0.6), v.chrome_mat, zone, Vector3(90, 0, 0)) # fuel tanks
		v.light(Vector3(0.3, 0.2, 0.05), Vector3(side * 0.75, 0.1, -3.13), Poster.CREAM)
		v.light(Vector3(0.2, 0.3, 0.05), Vector3(side * 0.95, 0.0, 3.1), Color(0.95, 0.12, 0.06))
		v.box(Vector3(0.6, 0.6, 0.04), Vector3(side * 0.85, -0.45, 3.0), v.chrome_mat, &"rear") # mud flaps
		# Twin stacks, smoking.
		var stack := v.group(Vector3(side * 1.15, 1.5, 0.55))
		v.cyl(0.1, 2.8, Vector3.ZERO, v.chrome_mat, &"", Vector3.ZERO, stack)
		v.cyl(0.12, 0.15, Vector3(0, 1.4, 0), v.trim_mat, &"", Vector3.ZERO, stack)
		v.part(StringName("stack_%d" % int(side)), stack, 0.3 if side < 0.0 else 0.6)
	v.box(Vector3(1.2, 0.12, 1.0), Vector3(0, -0.2, 2.3), v.trim_mat) # fifth wheel
	v.gun_mount = Vector3(0, 2.05, 0.3)
	v.special_mount = Vector3(0, 0.05, -3.6)


static func sidewinder(v: CarVisual, _def: Dictionary) -> void:
	v.box(Vector3(1.3, 0.4, 2.7), Vector3(0, -0.05, 0), v.paint_mat)
	v.box(Vector3(1.2, 0.3, 0.6), Vector3(0, -0.05, -1.55), v.paint_mat, &"front", Vector3(15, 0, 0))
	v.box(Vector3(1.0, 0.1, 2.6), Vector3(0, -0.28, 0), v.trim_mat)
	# Roll cage.
	var cage := v.group()
	for z in [-0.4, 0.75]:
		for x in [-0.5, 0.5]:
			v.bar(Vector3(x * 1.1, 0.15, z), Vector3(x * 0.9, 0.95, z), 0.045, v.trim_mat, cage)
		v.bar(Vector3(-0.45, 0.95, z), Vector3(0.45, 0.95, z), 0.045, v.trim_mat, cage)
	for x in [-0.45, 0.45]:
		v.bar(Vector3(x, 0.95, -0.4), Vector3(x, 0.95, 0.75), 0.045, v.trim_mat, cage)
		v.bar(Vector3(x, 0.95, 0.75), Vector3(x * 0.9, 0.15, 1.45), 0.045, v.trim_mat, cage)
	v.part(&"cage", cage, 0.6)
	v.ball(0.17, Vector3(0, 0.6, 0.2), Poster.shared(Poster.CREAM))
	v.box(Vector3(0.22, 0.09, 0.05), Vector3(0, 0.62, 0.04), v.glass_mat)
	v.box(Vector3(0.8, 0.45, 0.7), Vector3(0, 0.15, 1.55), v.chrome_mat, &"rear") # exposed engine
	for x in [-0.25, 0.25]:
		v.cyl(0.06, 0.5, Vector3(x, 0.1, 2.0), v.trim_mat, &"rear", Vector3(70, 0, 0))
	var spare := v.group(Vector3(0, 0.62, 1.15))
	v.cyl(0.3, 0.18, Vector3.ZERO, v.rubber_mat, &"", Vector3(70, 0, 0), spare, 16)
	v.cyl(0.17, 0.2, Vector3.ZERO, v.chrome_mat, &"", Vector3(70, 0, 0), spare, 6)
	v.part(&"spare", spare, 0.3)
	for side in [-1.0, 1.0]:
		v.label("7", Vector3(side * 0.66, -0.02, 0.0), 90.0 * side, 0.4)
		v.light(Vector3(0.14, 0.14, 0.05), Vector3(side * 0.2, 0.95, -0.44), Poster.CREAM)
		v.light(Vector3(0.12, 0.1, 0.05), Vector3(side * 0.4, 0.0, 1.36), Color(0.95, 0.12, 0.06))
	v.gun_mount = Vector3(0, 1.05, 0.2)
	v.special_mount = Vector3(0, -0.3, 0)


static func double_trouble(v: CarVisual, _def: Dictionary) -> void:
	var bx := -0.35
	# The bike.
	v.box(Vector3(0.28, 0.5, 1.7), Vector3(bx, 0.05, -0.05), v.paint_mat)
	v.box(Vector3(0.34, 0.25, 0.6), Vector3(bx, 0.38, -0.4), v.paint_mat, &"front")
	v.box(Vector3(0.3, 0.1, 0.7), Vector3(bx, 0.36, 0.25), v.trim_mat)
	v.box(Vector3(0.36, 0.3, 0.45), Vector3(bx, -0.1, 0.0), v.chrome_mat)
	v.bar(Vector3(bx, 0.55, -0.75), Vector3(bx, -0.3, -1.3), 0.04, v.chrome_mat)
	v.bar(Vector3(bx - 0.3, 0.75, -0.75), Vector3(bx + 0.3, 0.75, -0.75), 0.03, v.trim_mat)
	v.cyl(0.05, 0.9, Vector3(bx + 0.18, -0.2, 0.6), v.chrome_mat, &"rear", Vector3(90, 0, 0))
	v.box(Vector3(0.3, 0.08, 0.6), Vector3(bx, 0.3, 1.05), v.paint_mat, &"rear")
	v.cyl(0.1, 0.06, Vector3(bx, 0.45, -0.98), Poster.mat(Poster.CREAM, &"light"), &"", Vector3(90, 0, 0))
	v.light(Vector3(0.12, 0.08, 0.04), Vector3(bx, 0.36, 1.36), Color(0.95, 0.12, 0.06))
	# Stan, riding.
	v.box(Vector3(0.36, 0.55, 0.3), Vector3(bx, 0.72, 0.05), v.trim_mat, &"", Vector3(-20, 0, 0))
	v.ball(0.17, Vector3(bx, 1.1, -0.05), v.accent_mat)
	# The sidecar, with Stella on the gun. At 70% damage it's gone, and so is the special.
	var car := v.group()
	v.box(Vector3(0.8, 0.55, 1.7), Vector3(0.75, 0.0, 0.15), v.accent_mat, &"", Vector3.ZERO, car)
	v.box(Vector3(0.6, 0.4, 0.5), Vector3(0.75, -0.02, -0.85), v.accent_mat, &"", Vector3(20, 0, 0), car)
	v.box(Vector3(0.82, 0.08, 1.72), Vector3(0.75, 0.1, 0.15), v.paint_mat, &"", Vector3.ZERO, car)
	v.bar(Vector3(-0.2, -0.1, 0.2), Vector3(0.4, -0.1, 0.2), 0.04, v.chrome_mat, car)
	v.ball(0.15, Vector3(0.75, 0.52, 0.35), v.paint_mat, car)
	v.label("8", Vector3(1.16, 0.02, 0.15), 90.0, 0.4, Poster.INK, car)
	var turret := Node3D.new()
	turret.position = Vector3(0.75, 0.62, 0.55)
	car.add_child(turret)
	v.box(Vector3(0.2, 0.16, 0.3), Vector3.ZERO, v.trim_mat, &"", Vector3.ZERO, turret)
	v.cyl(0.05, 0.9, Vector3(0, 0.02, 0.45), v.trim_mat, &"", Vector3(90, 0, 0), turret)
	v.turret = turret
	v.part(&"sidecar", car, 0.7)
	v.gun_mount = Vector3(bx, 0.6, -0.9)
	v.special_mount = Vector3(0.75, 0.62, 0.55)
