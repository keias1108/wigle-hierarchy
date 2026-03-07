/**
 * Downsample Fragment Shader
 *
 * Performs 2x2 average downsampling for hierarchical reduction.
 * Used in multi-pass pipeline to compute global average energy.
 *
 * Input: N×N texture
 * Output: (N/2)×(N/2) texture with averaged values
 */
uniform sampler2D inputTexture;
uniform vec2 texelSize;

void main() {
    // Current fragment position in output texture
    vec2 coord = gl_FragCoord.xy - vec2(0.5);

    // Map to 2x2 block in input texture
    vec2 base = coord * 2.0;

    // Sample 4 neighbors
    vec2 uv00 = (base + vec2(0.5, 0.5)) * texelSize;
    vec2 uv10 = (base + vec2(1.5, 0.5)) * texelSize;
    vec2 uv01 = (base + vec2(0.5, 1.5)) * texelSize;
    vec2 uv11 = (base + vec2(1.5, 1.5)) * texelSize;

    // Average the 4 samples
    float sum = (
        texture2D(inputTexture, uv00).x +
        texture2D(inputTexture, uv10).x +
        texture2D(inputTexture, uv01).x +
        texture2D(inputTexture, uv11).x
    ) * 0.25;

    gl_FragColor = vec4(sum, 0.0, 0.0, 1.0);
}
