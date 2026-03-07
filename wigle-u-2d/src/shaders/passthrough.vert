/**
 * Passthrough Vertex Shader
 * Simple fullscreen quad
 */
void main() {
    gl_Position = vec4(position, 1.0);
}
