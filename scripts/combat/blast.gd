class_name Blast
## Explosions: damage and a shove for every car in range, falling off with distance.
## The hit lands on the side of the car facing the blast, so armour zones apply.


static func explode(context: Node, pos: Vector3, radius: float, damage: float, impulse: float, by: Car, skip: Car = null, lift := 0.8) -> int:
	var hits := 0
	var involves_player := by != null and by.is_player
	for n in context.get_tree().get_nodes_in_group(&"cars"):
		var c := n as Car
		if c == skip:
			continue
		var to := c.global_position - pos
		var d := to.length()
		if d > radius:
			continue
		var falloff := 1.0 - 0.6 * d / radius
		var flat := Vector3(to.x, 0.0, to.z)
		var dir := (flat.normalized() if flat.length() > 0.05 else Vector3.ZERO) + Vector3.UP * lift
		var face := c.global_position - (flat.normalized() if flat.length() > 0.05 else Vector3.ZERO) * 0.9
		c.take_hit(damage * falloff, face, dir.normalized() * impulse * falloff, by)
		hits += 1
		involves_player = involves_player or c.is_player
	Impact.blast(pos, radius, involves_player)
	return hits
