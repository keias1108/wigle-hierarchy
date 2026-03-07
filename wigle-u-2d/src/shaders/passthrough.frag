/**
 * Passthrough Fragment Shader
 *
 * Simply copies input texture to output.
 * Used for texture initialization in GPU computation.
 */
uniform sampler2D passTexture;

void main() {
    vec2 uv = gl_FragCoord.xy / vec2({{SIZE_X}}, {{SIZE_Y}});
    gl_FragColor = texture2D(passTexture, uv);
}
