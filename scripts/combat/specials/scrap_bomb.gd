class_name ScrapBomb
extends Special
## Gravel Queen: tips the bed and dumps a load of scrap behind her. Each piece
## bursts after a short fuse, or as soon as a rival drives over it.

const PIECES := 8
const RADIUS := 3.6
const DAMAGE := 13.0
const IMPULSE := 4500.0


func _init(owner_car: Car) -> void:
	super(owner_car)
	display_name = "Scrap Bomb"
	recharge = 9.0


func activate() -> void:
	var back := -car.forward()
	var side := car.global_basis.x
	for i in PIECES:
		var b := Bomblet.new()
		b.shooter = car
		b.fuse = randf_range(1.0, 1.6)
		car.get_parent().add_child(b)
		b.global_position = global_position + side * randf_range(-0.9, 0.9) + Vector3.UP * randf_range(0.0, 0.5)
		b.linear_velocity = car.linear_velocity * 0.5 + back * randf_range(4.0, 10.0) + side * randf_range(-3.0, 3.0) + Vector3.UP * randf_range(2.0, 4.0)
		b.angular_velocity = Vector3(randf_range(-6, 6), randf_range(-6, 6), randf_range(-6, 6))
	Sfx.play(&"crunch", global_position, 2.0, 0.7)


func ai_wants(target: Car) -> bool:
	# Someone on her tail, or a crowd around her.
	return Aim.nearest(car, 30.0, deg_to_rad(130.0)) != null or Aim.count_within(car, 9.0) >= 2


## One piece of scrap with a fuse.
class Bomblet:
	extends RigidBody3D

	var shooter: Car
	var fuse := 1.2
	var _age := 0.0

	func _ready() -> void:
		collision_layer = Car.LAYER_DEBRIS
		collision_mask = Car.LAYER_WORLD
		mass = 30.0
		var cs := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = Vector3(0.4, 0.25, 0.35)
		cs.shape = box
		add_child(cs)
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = box.size
		mi.mesh = bm
		mi.material_override = Poster.shared(Poster.RUST)
		add_child(mi)

	func _physics_process(delta: float) -> void:
		_age += delta
		var armed := _age > 0.35
		if armed:
			for n in get_tree().get_nodes_in_group(&"cars"):
				var c := n as Car
				if c != shooter and not c.is_wrecked and c.global_position.distance_to(global_position) < 2.4:
					_burst()
					return
		if _age >= fuse:
			_burst()

	func _burst() -> void:
		var by: Car = shooter if is_instance_valid(shooter) else null
		Blast.explode(self, global_position, RADIUS, DAMAGE, IMPULSE, by, by)
		queue_free()
