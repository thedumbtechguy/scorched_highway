class_name CarProfiles
## Side profiles for the saloons, vans and trucks, traced from the roster
## poster illustrations: each shape is [kind, outline as (z, y) points in car
## space]. CarBodies extrudes them into the car's body. Generated from the
## roster page's drawings (heights stretched 1.6x to car proportions); kinds are body, accent, glass, chrome, trim, or decal:<hex>.

const SHAPES := {
	&"sundowner": [
		["trim", [Vector2(-0.171, 1.058), Vector2(-0.695, 1.106), Vector2(-0.695, 0.993)]],
		["trim", [Vector2(-0.695, 1.074), Vector2(-1.218, 1.09), Vector2(-1.218, 1.026)]],
		["body", [Vector2(2.145, -0.408), Vector2(2.185, 0.188), Vector2(1.923, 0.317), Vector2(0.836, 0.365), Vector2(0.332, 0.816), Vector2(-0.493, 0.881), Vector2(-0.916, 0.381), Vector2(-2.135, 0.284), Vector2(-2.215, -0.038)]],
		["trim", [Vector2(2.185, 0.381), Vector2(1.843, 0.349), Vector2(1.843, 0.252)]],
		["glass", [Vector2(0.212, 0.736), Vector2(-0.453, 0.784), Vector2(-0.755, 0.397)]],
		["chrome", [Vector2(1.944, 0.059), Vector2(-2.124, 0.059), Vector2(-2.124, -0.07)]],
		["trim", [Vector2(-1.218, 0.349), Vector2(-1.641, 0.349), Vector2(-1.581, 0.494)]],
		["chrome", [Vector2(-2.155, 0.027), Vector2(-2.366, 0.027), Vector2(-2.366, -0.441)]],
		["decal:#e0612f", [Vector2(2.185, 0.156), Vector2(2.085, 0.156), Vector2(2.085, -0.006)]],
	],
	&"lawdog": [
		["body", [Vector2(2.12, -0.41), Vector2(2.14, 0.15), Vector2(1.72, 0.31), Vector2(0.82, 0.342), Vector2(0.36, 0.87), Vector2(-0.68, 0.886), Vector2(-1.08, 0.342), Vector2(-2.13, 0.246)]],
		["decal:#fbf1dc", [Vector2(1.0, 0.278), Vector2(-1.0, 0.278), Vector2(-1.0, -0.266)]],
		["glass", [Vector2(0.26, 0.79), Vector2(-0.63, 0.806), Vector2(-0.93, 0.374)]],
		["decal:#c8321f", [Vector2(0.08, 0.998), Vector2(-0.18, 0.998), Vector2(-0.18, 0.886)]],
		["decal:#2b5fb0", [Vector2(-0.18, 0.998), Vector2(-0.44, 0.998), Vector2(-0.44, 0.886)]],
		["chrome", [Vector2(-2.16, 0.31), Vector2(-2.4, 0.31), Vector2(-2.4, -0.49)]],
	],
	&"picket_fence": [
		["decal:#c8321f", [Vector2(1.7, 1.11), Vector2(1.32, 1.11), Vector2(1.32, 0.95)]],
		["decal:#f2b134", [Vector2(1.26, 1.142), Vector2(0.86, 1.142), Vector2(0.86, 0.95)]],
		["body", [Vector2(2.16, -0.41), Vector2(2.18, 0.758), Vector2(1.9, 0.902), Vector2(-0.48, 0.934), Vector2(-0.9, 0.438), Vector2(-2.13, 0.31)]],
		["glass", [Vector2(1.84, 0.79), Vector2(1.14, 0.806), Vector2(1.14, 0.438)]],
		["glass", [Vector2(1.04, 0.806), Vector2(0.24, 0.822), Vector2(0.24, 0.438)]],
		["glass", [Vector2(0.14, 0.822), Vector2(-0.44, 0.838), Vector2(-0.7, 0.438)]],
		["decal:#8a5a33", [Vector2(2.12, 0.278), Vector2(-2.12, 0.214), Vector2(-2.12, -0.202)]],
		["chrome", [Vector2(2.22, -0.234), Vector2(-2.3, -0.234), Vector2(-2.3, -0.426)]],
	],
	&"moonbeam": [
		["trim", [Vector2(0.84, 1.43), Vector2(0.58, 1.782), Vector2(0.32, 1.782)]],
		["trim", [Vector2(-0.08, 1.43), Vector2(-0.32, 1.782), Vector2(-0.58, 1.782)]],
		["body", [Vector2(2.12, -0.41), Vector2(2.12, 1.174), Vector2(1.9, 1.43), Vector2(-1.38, 1.462), Vector2(-1.88, 1.11), Vector2(-2.2, 0.47)]],
		["decal:#fbf1dc", [Vector2(2.1, 0.758), Vector2(2.1, 1.158), Vector2(1.89, 1.398), Vector2(-1.36, 1.43), Vector2(-1.72, 1.142)]],
		["glass", [Vector2(1.72, 1.142), Vector2(1.0, 1.158), Vector2(1.0, 0.79)]],
		["glass", [Vector2(0.82, 1.158), Vector2(0.0, 1.174), Vector2(0.0, 0.79)]],
		["glass", [Vector2(-1.38, 1.27), Vector2(-1.72, 1.062), Vector2(-1.86, 0.79)]],
		["chrome", [Vector2(2.22, -0.234), Vector2(-2.3, -0.234), Vector2(-2.3, -0.426)]],
	],
	&"gravel_queen": [
		["trim", [Vector2(2.829, -0.486), Vector2(-2.83, -0.486), Vector2(-2.83, -0.889)]],
		["decal:#8a7a6a", [Vector2(2.527, 1.043), Vector2(2.049, 1.526), Vector2(1.421, 1.325), Vector2(0.842, 1.646), Vector2(-0.013, 1.284), Vector2(-0.239, 1.123)]],
		["body", [Vector2(2.779, -0.527), Vector2(2.804, 0.962), Vector2(-0.265, 1.244)]],
		["accent", [Vector2(2.779, 0.318), Vector2(-0.315, 0.479), Vector2(-0.34, 0.198)]],
		["body", [Vector2(-0.717, -0.527), Vector2(-0.717, 1.204), Vector2(-1.748, 1.325), Vector2(-2.151, 0.721), Vector2(-2.78, 0.6)]],
		["glass", [Vector2(-0.969, 1.043), Vector2(-1.673, 1.143), Vector2(-2.0, 0.681)]],
		["chrome", [Vector2(-2.83, 0.198), Vector2(-3.132, 0.399), Vector2(-3.132, -1.01)]],
	],
	&"long_haul": [
		["chrome", [Vector2(1.712, -0.499), Vector2(1.712, 2.791), Vector2(1.554, 2.791)]],
		["trim", [Vector2(3.267, -0.457), Vector2(-2.981, -0.457), Vector2(-2.981, -0.837)]],
		["trim", [Vector2(3.135, -0.373), Vector2(3.135, 0.724), Vector2(2.608, 1.019), Vector2(2.45, 0.808), Vector2(2.925, 0.555)]],
		["body", [Vector2(1.527, -0.499), Vector2(1.527, 2.031), Vector2(-0.055, 2.158), Vector2(-0.213, 1.61), Vector2(-0.476, 1.61)]],
		["body", [Vector2(-0.476, -0.499), Vector2(-0.476, 1.23), Vector2(-2.691, 1.061), Vector2(-2.902, 0.597)]],
		["glass", [Vector2(0.974, 1.652), Vector2(0.183, 1.694), Vector2(0.183, 1.019)]],
		["glass", [Vector2(-0.055, 1.947), Vector2(-0.424, 1.567), Vector2(-0.424, 1.019)]],
		["chrome", [Vector2(-2.744, 0.935), Vector2(-2.981, 0.808), Vector2(-2.981, -0.415)]],
		["decal:#f2b134", [Vector2(-0.582, 0.175), Vector2(-2.691, 0.175), Vector2(-2.691, -0.035)]],
	],
}
