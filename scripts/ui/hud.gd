class_name Hud
extends Control
## A small, quiet HUD: armour silhouette by zone, speed, ram charge and gun heat.
## Everything is drawn, so it stays crisp at any resolution.

const INK := Color(0.96, 0.93, 0.87)
const DIM := Color(0.96, 0.93, 0.87, 0.7)
const HOT := Color(1.0, 0.45, 0.12)
const BAD := Color(0.95, 0.16, 0.1)

var car: Car
var remaining := 0
var message := ""
var sub_message := ""
## A short prompt above the bottom edge (e.g. how to reset when stuck).
var hint := ""
## Car selection card; empty when not choosing.
var select_info := {}
var _zone_flash := { &"front": 0.0, &"left": 0.0, &"right": 0.0, &"rear": 0.0 }
var _hit_marker := 0.0
var _font: Font


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	process_mode = Node.PROCESS_MODE_ALWAYS
	_font = ThemeDB.fallback_font
	Impact.player_hit_confirmed.connect(func() -> void: _hit_marker = 1.0)


func watch(c: Car) -> void:
	car = c
	car.damaged.connect(func(_c: Car, _amount: float, zone: StringName, _by: Car) -> void:
		_zone_flash[zone] = 1.0)


func _process(delta: float) -> void:
	var dt := delta / maxf(Engine.time_scale, 0.001)
	for k in _zone_flash:
		_zone_flash[k] = maxf(0.0, _zone_flash[k] - dt * 2.0)
	_hit_marker = maxf(0.0, _hit_marker - dt * 4.0)
	queue_redraw()


func _draw() -> void:
	var vs := get_viewport_rect().size
	var u := vs.y / 1080.0 # layout unit
	if car:
		_draw_armour(Vector2(70, vs.y - 230 * u), u)
		_draw_speed(Vector2(vs.x - 70 * u, vs.y - 120 * u), u)
	if not select_info.is_empty():
		_draw_select(vs, u)
	if remaining > 0:
		_text("%d CARS RUNNING" % remaining, Vector2(vs.x * 0.5, 64 * u), 20 * u, DIM, true)
	if hint != "":
		_text(hint, Vector2(vs.x * 0.5, vs.y - 60 * u), 26 * u, HOT, true)
	if message != "":
		_text(message, Vector2(vs.x * 0.5, vs.y * 0.42), 84 * u, INK, true)
	if sub_message != "":
		_text(sub_message, Vector2(vs.x * 0.5, vs.y * 0.42 + 70 * u), 24 * u, DIM, true)
	if _hit_marker > 0.0:
		var c := vs * 0.5
		var r := 18.0 * u
		var col := Color(INK, _hit_marker)
		for d in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
			draw_line(c + d * r * 0.6, c + d * r * 1.2, col, 3.0 * u, true)


## Top-down silhouette, nose up. Each zone shades from ink to red as it takes damage.
func _draw_armour(origin: Vector2, u: float) -> void:
	var w := 62.0 * u
	var h := 132.0 * u
	var o := origin
	var zones := {
		&"front": Rect2(o, Vector2(w, h * 0.2)),
		&"left": Rect2(o + Vector2(0, h * 0.22), Vector2(w * 0.47, h * 0.56)),
		&"right": Rect2(o + Vector2(w * 0.53, h * 0.22), Vector2(w * 0.47, h * 0.56)),
		&"rear": Rect2(o + Vector2(0, h * 0.8), Vector2(w, h * 0.2)),
	}
	for z in zones:
		var dmg: float = clampf(car.zone_damage[z] / 80.0, 0.0, 1.0)
		var col := INK.lerp(HOT, clampf(dmg * 2.0, 0.0, 1.0)).lerp(BAD, clampf(dmg * 2.0 - 1.0, 0.0, 1.0))
		col.a = 0.82
		col = col.lerp(Color.WHITE, _zone_flash[z])
		draw_rect(zones[z].grow(2.0), Poster.INK)
		draw_rect(zones[z], col)
	# Hull integrity as a thin bar beside the silhouette.
	var frac := car.hp / car.max_hp
	var bar := Rect2(o + Vector2(w + 18 * u, 0), Vector2(6 * u, h))
	draw_rect(bar, DIM)
	var fill := Rect2(bar.position + Vector2(0, h * (1.0 - frac)), Vector2(bar.size.x, h * frac))
	draw_rect(fill, INK if frac > 0.35 else BAD)
	_text("HULL %d" % ceili(car.hp), o + Vector2(0, h + 34 * u), 18 * u, DIM)


func _draw_speed(right_edge: Vector2, u: float) -> void:
	var kmh := absf(car.speed) * 3.6
	_text("%d" % roundi(kmh), right_edge + Vector2(0, -20 * u), 72 * u, INK, false, true)
	_text("KM/H", right_edge + Vector2(0, 10 * u), 16 * u, DIM, false, true)
	var bw := 220.0 * u
	var bh := 5.0 * u
	var bx := right_edge.x - bw
	var y := right_edge.y + 38 * u
	_meter(Vector2(bx, y), Vector2(bw, bh), car.boost_meter / 100.0, HOT if car.boosting else INK)
	_text("RAM", Vector2(bx - 12 * u, y + 6 * u), 14 * u, DIM, false, true)
	var gun := car.gun as MachineGun
	if gun:
		_meter(Vector2(bx, y + 22 * u), Vector2(bw, bh), gun.heat, BAD if gun.overheated else DIM.lerp(HOT, gun.heat))
		_text("HEAT", Vector2(bx - 12 * u, y + 28 * u), 14 * u, DIM, false, true)
	var sp := car.special_node as Special
	if sp:
		var ready := sp.is_ready()
		var col := HOT if ready else DIM
		if not sp.is_available():
			col = BAD
		_meter(Vector2(bx, y + 44 * u), Vector2(bw, bh * 1.6), sp.charge, col)
		_text(sp.display_name.to_upper() + ("" if sp.is_available() else " · LOST"), Vector2(right_edge.x, y + 66 * u), 15 * u, INK if ready else DIM, false, true)


func _meter(pos: Vector2, size: Vector2, frac: float, col: Color) -> void:
	draw_rect(Rect2(pos, size).grow(2.0), Color(Poster.INK, 0.85))
	draw_rect(Rect2(pos, size), Color(1, 1, 1, 0.12))
	draw_rect(Rect2(pos, Vector2(size.x * clampf(frac, 0.0, 1.0), size.y)), col)


func _text(s: String, pos: Vector2, size: float, col: Color, centre := false, right := false) -> void:
	var fs := int(size)
	var width := _font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var p := pos
	if centre:
		p.x -= width * 0.5
	elif right:
		p.x -= width
	# An ink outline, poster-style, so text reads over bright sand and dark rock alike.
	var ink := Color(Poster.INK, minf(1.0, col.a * 1.6))
	draw_string_outline(_font, p, s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, maxi(3, int(size * 0.22)), ink)
	draw_string(_font, p, s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)


## The car-selection card: name, driver and show, class, special and stats.
func _draw_select(vs: Vector2, u: float) -> void:
	var x := 90.0 * u
	var y := vs.y - 420.0 * u
	var i := select_info
	_text("CHOOSE YOUR CAR", Vector2(x, y), 18 * u, DIM)
	_text(String(i.name).to_upper(), Vector2(x, y + 80 * u), 76 * u, INK)
	_text("%s · %s" % [i.driver, i.show], Vector2(x, y + 122 * u), 24 * u, INK)
	_text("%s · %.1f t · SPECIAL: %s" % [String(i["class"]).to_upper(), i.mass / 1000.0, String(i.special).to_upper()], Vector2(x, y + 156 * u), 18 * u, HOT)
	var row := 0
	for k in ["speed", "accel", "handling", "armour"]:
		var ry := y + 196 * u + row * 26 * u
		_text(k.to_upper(), Vector2(x, ry + 12 * u), 15 * u, DIM)
		for b in 5:
			var r := Rect2(Vector2(x + 130 * u + b * 34 * u, ry), Vector2(28 * u, 12 * u))
			draw_rect(r.grow(2.0), Poster.INK)
			draw_rect(r, HOT if b < int(i.stats[k]) else Color(1, 1, 1, 0.15))
		row += 1
	_text("A / D  CHOOSE     ENTER / START  DRIVE", Vector2(x, y + 330 * u), 18 * u, INK)
	_text("W / S  THROTTLE · BRAKE     A / D  STEER     SPACE  HANDBRAKE     SHIFT  RAM", Vector2(x, y + 366 * u), 15 * u, DIM)
	_text("J / LEFT MOUSE  MACHINE GUN     K / RIGHT MOUSE  SPECIAL     GAMEPAD WORKS TOO", Vector2(x, y + 390 * u), 15 * u, DIM)
