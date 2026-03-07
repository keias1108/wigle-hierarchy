/**
 * Energy Life Simulation - Lifecycle Shader
 *
 * This shader implements the core energy lifecycle mechanics:
 * - Neighbor influence kernel (inner attraction, outer repulsion)
 * - Growth function (bell curve based on potential)
 * - Energy metabolism (quadratic decay)
 * - Diffusion (Laplacian)
 * - Fission instability (high energy chaos)
 * - User interaction (energy injection, attraction, repulsion)
 */

// Uniforms from GPU computation
uniform sampler2D field;
uniform float extendedMode;
uniform float innerRadius;
uniform float innerStrength;
uniform float outerRadius;
uniform float outerStrength;
uniform float growthCenter;
uniform float growthWidth;
uniform float growthRate;
uniform float suppressionFactor;
uniform float globalAverage;
uniform float decayRate;
uniform float diffusionRate;
uniform float fissionThreshold;
uniform float instabilityFactor;
uniform sampler2D interactionTexture;
uniform vec2 texelSize;
uniform float erosionThreshold;
uniform float erosionRate;
uniform float terrainDiffusion;
uniform float overflowCap;
uniform float overflowLeak;
uniform float overflowNoise;
uniform float terrainCostCoef;
uniform float terrainRepelCoef;

/**
 * Computes the influence weight based on distance from a cell.
 *
 * Inner zone: Quadratic falloff attraction (promotes clustering)
 * Outer zone: Gaussian repulsion (prevents overcrowding)
 *
 * @param dist Distance to neighbor in grid units
 * @return Weight value (positive = attraction, negative = repulsion)
 */
float kernelWeight(float dist) {
    float weight = 0.0;

    // Inner attraction zone: quadratic falloff
    if (dist < innerRadius) {
        float t = 1.0 - (dist / innerRadius);
        weight += innerStrength * t * t;
    }

    // Outer repulsion zone: Gaussian envelope
    float ringStart = innerRadius + 1.0;
    float ringEnd = outerRadius;
    if (dist > ringStart && dist < ringEnd) {
        float t = (dist - ringStart) / (ringEnd - ringStart);
        weight += outerStrength * exp(-2.0 * t * t);
    }

    return weight;
}

/**
 * Growth function determining energy change based on neighbor potential.
 *
 * Uses a Gaussian bell curve centered at growthCenter with width growthWidth.
 * High-energy cells (above fissionThreshold) experience instability.
 *
 * @param potential Weighted average of neighbor energies
 * @param currentEnergy Current cell energy level
 * @return Growth factor (centered around 0)
 */
float growthFunction(float potential, float currentEnergy) {
    float x = (potential - growthCenter) / growthWidth;
    float bellCurve = exp(-x * x * 0.5);

    // Fission instability: reduce growth when energy is too high
    if (currentEnergy > fissionThreshold) {
        float excess = (currentEnergy - fissionThreshold) / (1.0 - fissionThreshold);
        bellCurve -= excess * instabilityFactor;
    }

    return bellCurve;
}

/**
 * Computes the discrete Laplacian for diffusion.
 *
 * Uses 4-neighbor stencil (von Neumann neighborhood):
 * Δu = u(x+1) + u(x-1) + u(y+1) + u(y-1) - 4*u(x,y)
 *
 * @param uv Texture coordinates
 * @return Laplacian value
 */
float laplacian(vec2 uv) {
    float sum = 0.0;
    sum += texture2D(field, uv + vec2(-1.0, 0.0) * texelSize).x;
    sum += texture2D(field, uv + vec2(1.0, 0.0) * texelSize).x;
    sum += texture2D(field, uv + vec2(0.0, -1.0) * texelSize).x;
    sum += texture2D(field, uv + vec2(0.0, 1.0) * texelSize).x;
    sum -= 4.0 * texture2D(field, uv).x;
    return sum;
}

/**
 * Pseudo-random number generator for noise.
 *
 * @param co Seed coordinate
 * @return Random value in [0, 1]
 */
float random(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy * texelSize;

    vec4 state = texture2D(field, uv);
    float currentEnergy = state.r;
    float terrain = state.g;
    float bChan = state.b;
    float aChan = state.a;
    vec3 interaction = texture2D(interactionTexture, uv).rgb;

    // ========== STEP 1: Compute neighborhood potential ==========
    float potential = 0.0;
    float totalWeight = 0.0;

    // Kernel loop: sample neighbors within outerRadius
    // Note: kernelSize should match outerRadius ceiling
    int kernelSize = 10;
    for (int dy = -kernelSize; dy <= kernelSize; dy++) {
        for (int dx = -kernelSize; dx <= kernelSize; dx++) {
            vec2 offset = vec2(float(dx), float(dy));
            float dist = length(offset);

            if (dist <= outerRadius) {
                vec2 neighborUV = fract(uv + offset * texelSize);
                float neighborEnergy = texture2D(field, neighborUV).x;
                float neighborTerrain = texture2D(field, neighborUV).g;
                float selfTerrain = terrain;
                float weight = kernelWeight(dist);

                // Apply interaction modifiers
                // Green channel = attract, Blue channel = repel
                weight += interaction.g * 2.0 - interaction.b * 2.0;

                // Terrain repulsion: push away from higher terrain along offset
                float slope = (neighborTerrain - selfTerrain);
                weight -= terrainRepelCoef * slope;

                potential += neighborEnergy * weight;
                totalWeight += abs(weight);
            }
        }
    }

    // Normalize potential
    if (totalWeight > 0.0) {
        potential /= totalWeight;
    }

    // ========== STEP 2: Compute growth ==========
    float growth = growthFunction(potential, currentEnergy) - 0.5;
    growth -= globalAverage * suppressionFactor;

    // ========== STEP 3: Compute metabolism (energy cost) ==========
    float metabolism = currentEnergy * currentEnergy * decayRate;
    float terrainCost = terrainCostCoef * terrain;

    // ========== STEP 4: Compute diffusion ==========
    float diffusion = laplacian(uv) * diffusionRate;

    // ========== STEP 5: Fission noise (chaos at high energy) ==========
    float fissionNoise = 0.0;
    if (currentEnergy > fissionThreshold) {
        float excess = (currentEnergy - fissionThreshold) / (1.0 - fissionThreshold);
        float chaos = sin(dot(uv * 100.0 + currentEnergy * 50.0, vec2(12.9898, 78.233)));
        fissionNoise = chaos * excess * 0.1;
    }

    // ========== STEP 6: User interaction (energy injection) ==========
    // Red channel = direct energy injection
    float interactionEnergy = interaction.r * 0.1;

    // ========== STEP 7: Update energy ==========
    float deltaEnergy = growthRate * growth - metabolism - terrainCost + diffusion + fissionNoise + interactionEnergy;
    float newEnergy = currentEnergy + deltaEnergy;

    // Add tiny noise to prevent stagnation
    float noise = (random(uv + currentEnergy) - 0.5) * 0.001;
    newEnergy += noise;

    // ========== STEP 8+: Terrain erosion/transport (G only) ==========
    if (extendedMode > 0.5) {
        float erosion = 0.0;
        if (currentEnergy > erosionThreshold) {
            erosion = erosionRate * (currentEnergy - erosionThreshold);
        }

        float gLoss = min(terrain, erosion);
        terrain -= gLoss;

        // Immediate deposit with soft overflow
        terrain += gLoss;
        float cap = 1.0 + overflowCap;
        if (terrain > cap) {
            terrain = cap;
        }

        float overflow = max(0.0, terrain - 1.0);
        float leakJitter = 1.0 + (random(uv + currentEnergy) - 0.5) * overflowNoise;
        float leak = overflowLeak * leakJitter;
        terrain -= min(overflow, leak);

        float diffusionBoost = 1.0 + overflow * 2.0;
        terrain += laplacian(uv) * terrainDiffusion * diffusionBoost;
    }

    // Clamp to valid range
    newEnergy = clamp(newEnergy, 0.0, 1.0);
    terrain = clamp(terrain, 0.0, 1.0);

    gl_FragColor = vec4(newEnergy, terrain, bChan, aChan);
}
