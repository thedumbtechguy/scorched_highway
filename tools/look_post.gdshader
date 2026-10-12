shader_type spatial;
// Full-screen look pass for look development: ink outlines from depth and
// normals, paper/film grain, halftone in the shadows, and a vignette.
render_mode unshaded, depth_draw_never, depth_test_disabled, cull_disabled, fog_disabled;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform sampler2D depth_tex : hint_depth_texture, filter_nearest;
uniform sampler2D normal_tex : hint_normal_roughness_texture, filter_nearest;

uniform float outline_px = 0.0;
uniform vec3 outline_color : source_color = vec3(0.08, 0.05, 0.04);
uniform float grain = 0.0;
uniform float vignette = 0.0;
uniform float halftone = 0.0;
uniform float halftone_px = 6.0;
uniform vec3 tint : source_color = vec3(1.0);

void vertex() {
	POSITION = vec4(VERTEX.xy * 2.0, 1.0, 1.0);
}

float lin_depth(vec2 uv, mat4 inv_proj) {
	float z = texture(depth_tex, uv).r;
	vec4 v = inv_proj * vec4(uv * 2.0 - 1.0, z, 1.0);
	return -v.z / v.w;
}

vec3 normal_at(vec2 uv) {
	return normalize(texture(normal_tex, uv).xyz * 2.0 - 1.0);
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec3 col = texture(screen_tex, uv).rgb * tint;
	float lum = dot(col, vec3(0.299, 0.587, 0.114));

	if (outline_px > 0.0) {
		vec2 px = outline_px / VIEWPORT_SIZE;
		float d = lin_depth(uv, INV_PROJECTION_MATRIX);
		vec3 n = normal_at(uv);
		float edge = 0.0;
		vec2 offs[4] = { vec2(px.x, 0.0), vec2(-px.x, 0.0), vec2(0.0, px.y), vec2(0.0, -px.y) };
		for (int i = 0; i < 4; i++) {
			float dn = lin_depth(uv + offs[i], INV_PROJECTION_MATRIX);
			edge = max(edge, smoothstep(0.04, 0.09, abs(dn - d) / max(d, 0.001)));
			vec3 nn = normal_at(uv + offs[i]);
			edge = max(edge, smoothstep(0.35, 0.6, 1.0 - dot(n, nn)));
		}
		// Fade outlines out with distance so the horizon doesn't turn to scribble.
		edge *= 1.0 - smoothstep(120.0, 300.0, d);
		col = mix(col, outline_color, edge);
	}

	if (halftone > 0.0) {
		vec2 cell = FRAGCOORD.xy / halftone_px;
		vec2 rot = mat2(vec2(0.707, -0.707), vec2(0.707, 0.707)) * cell;
		float dist = length(fract(rot) - 0.5);
		float shade = clamp(1.0 - lum * 2.2, 0.0, 1.0);
		float dot_ = 1.0 - smoothstep(shade * 0.55 - 0.05, shade * 0.55 + 0.05, dist);
		col = mix(col, col * 0.55, dot_ * halftone);
	}

	if (grain > 0.0) {
		float g = hash(FRAGCOORD.xy + fract(TIME) * 100.0) - 0.5;
		col += g * grain * (0.4 + lum);
	}

	if (vignette > 0.0) {
		vec2 c = uv - 0.5;
		col *= 1.0 - vignette * smoothstep(0.15, 0.75, dot(c, c) * 2.2);
	}

	ALBEDO = max(col, vec3(0.0));
}
