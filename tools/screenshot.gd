extends Node
## Takes screenshots of a bot match for checking the look:
##   godot --path . res://tools/screenshot.tscn -- out_dir seconds...
## Needs a real renderer (not --headless).

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var out := args[0] if args.size() > 0 else "shots"
	var times: Array[float] = []
	for a in args.slice(1):
		times.append(float(a))
	if times.is_empty():
		times = [1.0, 6.0, 12.0]
	DirAccess.make_dir_recursive_absolute(out)
	var game_script: GDScript = load("res://scripts/game.gd")
	game_script.set("autopilot", true)
	var game: Node = load("res://scenes/main.tscn").instantiate()
	add_child(game)
	var t := 0.0
	for when in times:
		while t < when:
			await get_tree().process_frame
			t += get_process_delta_time()
		await RenderingServer.frame_post_draw
		var img := get_viewport().get_texture().get_image()
		img.save_png("%s/shot_%05.1f.png" % [out, when])
		print("saved %s/shot_%05.1f.png" % [out, when])
	get_tree().quit()
