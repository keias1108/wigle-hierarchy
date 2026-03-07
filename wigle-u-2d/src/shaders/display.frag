/**
 * Display Fragment Shader
 *
 * Maps energy values [0,1] to a vibrant color gradient:
 * 0.00-0.10: Black → Dark Blue
 * 0.10-0.30: Dark Blue → Medium Blue
 * 0.30-0.50: Medium Blue → Cyan
 * 0.50-0.70: Cyan → Green
 * 0.70-0.85: Green → Yellow
 * 0.85-1.00: Yellow → White (with sparkle effect)
 */
uniform sampler2D fieldTexture;
uniform int viewMode; // 0=composite,1=energy,2=terrain
varying vec2 vUv;

/**
 * Converts energy value to RGB color using gradient mapping.
 *
 * @param energy Energy level [0, 1]
 * @return RGB color
 */
vec3 energyGradient(float energy) {
    vec3 color;

    if (energy < 0.1) {
        // Black to dark blue
        color = mix(vec3(0.0, 0.0, 0.0), vec3(0.0, 0.0, 0.2), energy * 10.0);
    } else if (energy < 0.3) {
        // Dark blue to medium blue
        color = mix(vec3(0.0, 0.0, 0.2), vec3(0.0, 0.3, 0.8), (energy - 0.1) * 5.0);
    } else if (energy < 0.5) {
        // Medium blue to cyan
        color = mix(vec3(0.0, 0.3, 0.8), vec3(0.0, 0.8, 1.0), (energy - 0.3) * 5.0);
    } else if (energy < 0.7) {
        // Cyan to green
        color = mix(vec3(0.0, 0.8, 1.0), vec3(0.2, 1.0, 0.3), (energy - 0.5) * 5.0);
    } else if (energy < 0.85) {
        // Green to yellow
        color = mix(vec3(0.2, 1.0, 0.3), vec3(1.0, 1.0, 0.0), (energy - 0.7) * 6.67);
    } else {
        // Yellow to white with sparkle
        color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 1.0), (energy - 0.85) * 6.67);
        // Add sparkle effect for very high energy
        color += vec3(0.2) * sin(energy * 50.0);
    }

    // Add subtle brightness boost
    color += energy * 0.15;

    return color;
}

void main() {
    vec4 state = texture2D(fieldTexture, vUv);
    float energy = state.r;
    float terrain = state.g;

    vec3 color;

    if (viewMode == 1) {
        color = energyGradient(energy);
    } else if (viewMode == 2) {
        color = vec3(terrain) * vec3(0.8, 0.7, 0.3);
    } else {
        // Composite overlay
        color = energyGradient(energy);
        color += vec3(0.8, 0.7, 0.3) * terrain * 0.4;
    }

    gl_FragColor = vec4(color, 1.0);
}
