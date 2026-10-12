shader_type spatial;
// The comic-ink surface: hard two-tone cel shading with tinted shadows, hand-drawn
// hatching in the shade (form shadow and cast shadow alike), painted-on grime,
// and ink cracks on the ground. Patterns live in object space so they stick to a
// moving car instead of swimming across it.
render_mode cull_back;

uniform vec3 albedo : source_color = vec3(0.8);
uniform vec3 ink : source_color = vec3(0.1, 0.06, 0.05);
uniform float spec = 0.3; // strength of the hard glint
uniform float gloss = 0.9; // glint threshold: higher is a smaller, sharper glint
uniform float hatch = 1.0; // how much ink goes into the shade
uniform float hatch_density = 5.0; // strokes per metre
uniform float fill = 0.4; // light that still reaches shade between the strokes
uniform float grime = 0.5;
uniform float cracks = 0.0; // ink cracks and pebbles (ground)
uniform float emission = 0.0;

varying vec3 opos;
varying vec3 onrm;

void vertex() {
	opos = VERTEX;
	onrm = NORMAL;
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
		mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Round dots scattered on a grid: one in `rarity` cells, of radius up to `size` (in cells).
float dots(vec2 p, float rarity, float size) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float on = step(1.0 - 1.0 / rarity, hash(i));
	vec2 c = vec2(hash(i + 3.7), hash(i + 9.1)) * 0.5 + 0.25;
	float r = size * (0.5 + 0.5 * hash(i + 5.3));
	float d = length(f - c);
	float aa = fwidth(d) + 0.001;
	return on * (1.0 - smoothstep(r - aa, r + aa, d));
}

float fbm(vec2 p) {
	return noise(p) * 0.6 + noise(p * 2.3 + 7.1) * 0.3 + noise(p * 5.1 + 3.3) * 0.1;
}

// Ink coverage (0-1) of diagonal strokes on a plane, wobbling like a pen line and
// thickening with `amount`. A second, crossing set comes in only in the deepest shade.
float strokes(vec2 uv, float amount) {
	float wob = (noise(uv * 1.7) - 0.5) * 0.35;
	float v = (uv.x + uv.y) * 0.7071 * hatch_density + wob;
	float aa = fwidth(v) * 1.2 + 0.001;
	float w = clamp(amount, 0.0, 1.0) * 0.32;
	float a = 1.0 - smoothstep(w - aa, w + aa, abs(fract(v) - 0.5) * 2.0);
	// Strokes break up along their length, like a quick hand.
	a *= smoothstep(0.25, 0.45, noise(vec2(floor(v), (uv.x - uv.y) * 1.3)));
	float v2 = (uv.x - uv.y) * 0.7071 * hatch_density * 1.15 - wob;
	float aa2 = fwidth(v2) * 1.2 + 0.001;
	float w2 = clamp(amount - 0.72, 0.0, 1.0) * 0.6;
	float b = 1.0 - smoothstep(w2 - aa2, w2 + aa2, abs(fract(v2) - 0.5) * 2.0);
	return max(a, b);
}

// Strokes laid on whichever object-space plane faces us most (no blending, so
// lines stay crisp instead of doubling up).
float hatching(float amount) {
	vec3 n = abs(onrm);
	vec2 uv = n.x > n.y && n.x > n.z ? opos.zy : (n.y > n.z ? opos.xz : opos.xy);
	return strokes(uv, amount);
}

// Distance to the nearest cell edge of a jittered grid: thin dark lines for cracks.
float crack_lines(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float d1 = 8.0;
	float d2 = 8.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 g = vec2(float(x), float(y));
			vec2 o = vec2(hash(i + g), hash(i + g + 19.19));
			float d = length(g + o - f);
			if (d < d1) {
				d2 = d1;
				d1 = d;
			} else if (d < d2) {
				d2 = d;
			}
		}
	}
	return d2 - d1;
}

void fragment() {
	vec3 col = albedo;
	vec3 n = abs(onrm);
	vec2 face_uv = n.x > n.y && n.x > n.z ? opos.zy : (n.y > n.z ? opos.xz : opos.xy);
	if (grime > 0.0) {
		// Dirt and wear: big soft blotches, and streaks running down the sides.
		float blotch = smoothstep(0.45, 0.85, fbm(face_uv * 0.6));
		float streak = n.y < 0.5 ? smoothstep(0.55, 0.9, noise(vec2(face_uv.x * 6.0, opos.y * 0.4))) * smoothstep(1.5, -0.5, opos.y) : 0.0;
		col *= 1.0 - grime * (blotch * 0.35 + streak * 0.25);
		// A few hard flecks of ink, the painted-texture look.
		float fleck = dots(face_uv * 9.0, 60.0, 0.3);
		col = mix(col, ink, fleck * grime * 0.6);
	}
	if (cracks > 0.0) {
		vec2 g = opos.xz;
		float c = crack_lines(g * 0.22 + fbm(g * 0.3) * 0.6);
		float aa = fwidth(c) + 0.002;
		float line = 1.0 - smoothstep(0.012, 0.012 + aa * 1.5, c);
		line *= smoothstep(0.35, 0.6, noise(g * 0.07));
		float pebble = dots(g * 1.6, 14.0, 0.28) * step(0.5, noise(g * 0.5));
		float dirt = smoothstep(0.5, 0.75, fbm(g * 0.05));
		col *= 1.0 - dirt * 0.18;
		col = mix(col, ink, max(line * 0.85, pebble * 0.5) * cracks);
	}
	ALBEDO = col;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
	EMISSION = col * emission;
}

void light() {
	float ndl = dot(NORMAL, LIGHT);
	if (!LIGHT_IS_DIRECTIONAL) {
		// Muzzle flashes and explosions: a plain hard-edged glow that falls off with
		// distance. The shade fill and hatching belong to the sun alone; giving them to
		// small lights lit everything in range at full strength (a screen flash).
		DIFFUSE_LIGHT += LIGHT_COLOR * smoothstep(-0.02, 0.05, ndl) * ATTENUATION / PI;
	} else {
		// One hard terminator, very slightly softened so it doesn't fizz.
		float lit = smoothstep(-0.02, 0.05, ndl) * ATTENUATION;
		float shade = 1.0 - lit;
		float ink_amount = hatch > 0.0 ? hatching(shade * (0.55 + 0.45 * smoothstep(0.0, -0.6, ndl)) * hatch) : 0.0;
		float energy = lit + shade * fill * (1.0 - ink_amount);
		DIFFUSE_LIGHT += LIGHT_COLOR * energy / PI;
		if (spec > 0.0) {
			vec3 h = normalize(LIGHT + VIEW);
			float glint = smoothstep(gloss - 0.01, gloss + 0.01, dot(NORMAL, h)) * lit;
			SPECULAR_LIGHT += LIGHT_COLOR * glint * spec;
		}
	}
}
