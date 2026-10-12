shader_type spatial;
// Inverted-hull ink outline, bold and uneven like a brush pen: the mesh is drawn again, grown outward and with
// its front faces culled, in flat ink. Works in every renderer (desktop, mobile,
// web). Meshes are centred on their origin, so growing each vertex along the
// sign of its position grows boxes evenly and keeps their corners closed.
render_mode unshaded, cull_front, shadows_disabled, fog_disabled;

uniform vec4 ink : source_color = vec4(0.14, 0.06, 0.06, 1.0);
uniform float width_near = 0.035; // metres, close to the camera
uniform float width_per_metre = 0.0042; // grows with distance so lines read on screen
uniform float width_max = 0.4;
uniform float wobble = 0.45; // how much the line's weight varies, like a brush pen

float hash(vec3 p) {
	return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

void vertex() {
	vec4 view = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	float w = min(width_near + max(-view.z, 0.0) * width_per_metre, width_max);
	// Each corner gets its own pen pressure, so line weight swells and thins along an edge.
	w *= 1.0 - wobble * 0.5 + wobble * hash(floor(VERTEX * 20.0));
	vec3 scale = vec3(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz), length(MODEL_MATRIX[2].xyz));
	VERTEX += sign(VERTEX) * w / max(scale, vec3(0.001));
}

void fragment() {
	ALBEDO = ink.rgb;
}
