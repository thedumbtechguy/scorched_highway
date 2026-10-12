extends Node
## Autoload "Sfx": procedurally synthesised sound until real recordings arrive.
## Impacts are layered (sub-bass thump + metal crunch); the player's engine is
## a live generator whose note follows revs, gear and throttle.

const RATE := 22050

var _streams := {}
var _pool: Array[AudioStreamPlayer3D] = []
var _next := 0
var _engine_player: AudioStreamPlayer
var _engine_playback: AudioStreamGeneratorPlayback
var _engine_car: Car
var _phase := 0.0
var _phase2 := 0.0
var _rumble := 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_streams[&"thump"] = _make(0.55, _thump)
	_streams[&"crunch"] = _make(0.6, _crunch)
	_streams[&"cannon"] = _make(0.9, _cannon)
	_streams[&"shell_hit"] = _make(0.5, _shell_hit)
	_streams[&"explosion"] = _make(2.2, _explosion)
	for i in 24:
		var p := AudioStreamPlayer3D.new()
		p.unit_size = 14.0
		p.max_db = 6.0
		p.attenuation_filter_cutoff_hz = 9000.0
		add_child(p)
		_pool.append(p)


func play(name: StringName, pos: Vector3, volume_db := 0.0, pitch := 1.0) -> void:
	if not _streams.has(name):
		return
	var p := _pool[_next]
	_next = (_next + 1) % _pool.size()
	p.stream = _streams[name]
	p.volume_db = volume_db
	p.pitch_scale = pitch
	p.global_position = pos
	p.play()


func attach_engine(car: Car) -> void:
	_engine_car = car
	if _engine_player == null:
		_engine_player = AudioStreamPlayer.new()
		var gen := AudioStreamGenerator.new()
		gen.mix_rate = RATE
		gen.buffer_length = 0.1
		_engine_player.stream = gen
		_engine_player.volume_db = -7.0
		# Browsers default to pre-rendered samples; a live generator needs streaming.
		_engine_player.playback_type = AudioServer.PLAYBACK_TYPE_STREAM
		add_child(_engine_player)
	_engine_player.play()
	_engine_playback = _engine_player.get_stream_playback()


func _process(_delta: float) -> void:
	if _engine_playback == null or not is_instance_valid(_engine_car):
		return
	var car := _engine_car
	var load := clampf(absf(car.throttle) + (0.6 if car.boosting else 0.0), 0.0, 1.4)
	if car.is_wrecked:
		load = 0.0
	var revs := car.rpm if not car.is_wrecked else 0.0
	if car.grounded_wheels == 0:
		revs = minf(1.0, revs + 0.25 * load) # free-revving in the air
	var freq := 26.0 + revs * 70.0 + car.gear * 3.0
	var amp := 0.18 + load * 0.22
	var frames := _engine_playback.get_frames_available()
	for i in frames:
		_phase = fmod(_phase + freq / RATE, 1.0)
		_phase2 = fmod(_phase2 + freq * 0.5 / RATE, 1.0)
		# A lumpy V8-ish waveform: fundamental, a sub-octave, a hard-clipped edge and some grit.
		var s := sin(_phase * TAU) * 0.55 + sin(_phase2 * TAU) * 0.45 + sin(_phase * TAU * 3.0) * 0.18 * load
		_rumble = lerpf(_rumble, randf_range(-1.0, 1.0), 0.08)
		s += _rumble * 0.35 * (0.4 + load)
		s = clampf(s * (1.0 + load), -1.0, 1.0) * amp
		_engine_playback.push_frame(Vector2(s, s))


# --- Synthesis ---

func _make(seconds: float, gen: Callable) -> AudioStreamWAV:
	var n := int(seconds * RATE)
	var data := PackedByteArray()
	data.resize(n * 2)
	var state := {"lp": 0.0, "lp2": 0.0, "phase": 0.0}
	for i in n:
		var t := float(i) / RATE
		var v: float = clampf(gen.call(t, state), -1.0, 1.0)
		data.encode_s16(i * 2, int(v * 32000.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = RATE
	wav.stereo = false
	wav.data = data
	return wav


func _boom(t: float, state: Dictionary, f0: float, f1: float, decay: float) -> float:
	var f := lerpf(f1, f0, exp(-t * 18.0))
	state.phase += f / RATE
	return sin(state.phase * TAU) * exp(-t * decay)


func _noise_lp(state: Dictionary, k: float) -> float:
	state.lp = lerpf(state.lp, randf_range(-1.0, 1.0), k)
	return state.lp


func _thump(t: float, s: Dictionary) -> float:
	return _boom(t, s, 120.0, 38.0, 7.0) * 1.1 + _noise_lp(s, 0.25) * exp(-t * 30.0) * 0.9


func _crunch(t: float, s: Dictionary) -> float:
	# Bursts of filtered noise, gated in uneven grains like tearing metal.
	var grain := 1.0 if fmod(t * 37.0 + sin(t * 91.0), 1.0) < 0.55 else 0.25
	var n := _noise_lp(s, 0.5)
	s.lp2 = lerpf(s.lp2, n, 0.6)
	var ring := sin(t * TAU * 840.0) * 0.18 + sin(t * TAU * 1310.0) * 0.12
	return (s.lp2 * 1.4 * grain + ring * exp(-t * 9.0)) * exp(-t * 6.5)


func _cannon(t: float, s: Dictionary) -> float:
	var crack := randf_range(-1.0, 1.0) * exp(-t * 60.0)
	var body := _boom(t, s, 180.0, 46.0, 5.5) * 1.2
	var tail := _noise_lp(s, 0.06) * exp(-t * 4.0) * 1.8
	return crack + body + tail


func _shell_hit(t: float, s: Dictionary) -> float:
	var clang := (sin(t * TAU * 620.0) + sin(t * TAU * 1475.0) * 0.6) * exp(-t * 14.0) * 0.5
	return clang + _boom(t, s, 140.0, 50.0, 12.0) * 0.8 + randf_range(-1.0, 1.0) * exp(-t * 45.0) * 0.6


func _explosion(t: float, s: Dictionary) -> float:
	var n := _noise_lp(s, lerpf(0.5, 0.03, minf(t / 0.6, 1.0)))
	var boom := _boom(t, s, 90.0, 28.0, 2.2) * 1.3
	return (n * 2.4 * exp(-t * 1.6) + boom) * minf(t * 400.0, 1.0)
