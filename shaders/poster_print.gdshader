shader_type spatial;
// The print finish without outlines, for renderers that have no depth-and-normal
// buffer (web, low-end): halftone in the shadows, paper grain, vignette.
render_mode unshaded, depth_draw_never, depth_test_disabled, cull_disabled, fog_disabled;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float grain = 0.03;
uniform float vignette = 0.15;
uniform float halftone = 0.5;
uniform float halftone_px = 5.0;

void vertex() {
	POSITION = vec4(VERTEX.xy * 2.0, 1.0, 1.0);
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec3 col = texture(screen_tex, uv).rgb;
	float lum = dot(col, vec3(0.299, 0.587, 0.114));
	if (halftone > 0.0) {
		vec2 cell = FRAGCOORD.xy / halftone_px;
		vec2 rot = mat2(vec2(0.707, -0.707), vec2(0.707, 0.707)) * cell;
		float dist = length(fract(rot) - 0.5);
		float shade = clamp(1.0 - lum * 2.2, 0.0, 1.0);
		float dot_ = 1.0 - smoothstep(shade * 0.55 - 0.05, shade * 0.55 + 0.05, dist);
		col = mix(col, col * 0.55, dot_ * halftone);
	}
	col += (hash(FRAGCOORD.xy + fract(TIME) * 100.0) - 0.5) * grain * (0.4 + lum);
	vec2 c = uv - 0.5;
	col *= 1.0 - vignette * smoothstep(0.15, 0.75, dot(c, c) * 2.2);
	ALBEDO = max(col, vec3(0.0));
}
