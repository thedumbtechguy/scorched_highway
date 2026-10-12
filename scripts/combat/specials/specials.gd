class_name Specials
## Builds a car's signature special from its definition.


static func create(car: Car) -> Special:
	match car.def.special:
		&"thunder_cannons": return ThunderCannons.new(car)
		&"riot_gun": return RiotGun.new(car)
		&"fourth_of_july": return FourthOfJuly.new(car)
		&"good_vibrations": return GoodVibrations.new(car)
		&"scrap_bomb": return ScrapBomb.new(car)
		&"tow_hook": return TowHook.new(car)
		&"ground_pound": return GroundPound.new(car)
		&"tail_gunner": return TailGunner.new(car)
	return null
