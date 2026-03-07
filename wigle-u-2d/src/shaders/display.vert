/**
 * Display Vertex Shader
 * Simple passthrough for fullscreen quad
 */
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
