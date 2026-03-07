/**
 * Shader Loader Utilities
 *
 * Functions to load and manage GLSL shader code.
 * In production, shaders would be loaded via fetch() or bundled.
 * For now, we inline them as strings for compatibility.
 */

import { KERNEL_SIZE } from '../config/constants.js';

/**
 * Gets the lifecycle shader code with template replacements
 *
 * @returns {string} GLSL fragment shader code
 */
export function getLifecycleShader() {
  // In a more advanced setup, this would load from lifecycle.glsl
  // For now, we inline the shader content
  return `
uniform sampler2D field;
uniform float extendedMode;
uniform float dynamicsMode; // 0=terrain/energy, 1=hierarchy
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
uniform float hierarchyAlignment;
uniform float unitGain;
uniform float unitDecay;
uniform float promotionThreshold;
uniform float coarseFeedback;

float kernelWeight(float dist) {
    float weight = 0.0;

    if (dist < innerRadius) {
        float t = 1.0 - (dist / innerRadius);
        weight += innerStrength * t * t;
    }

    float ringStart = innerRadius + 1.0;
    float ringEnd = outerRadius;
    if (dist > ringStart && dist < ringEnd) {
        float t = (dist - ringStart) / (ringEnd - ringStart);
        weight += outerStrength * exp(-2.0 * t * t);
    }

    return weight;
}

float growthFunction(float potential, float currentEnergy) {
    float width = max(0.00005, growthWidth);
    float x = (potential - growthCenter) / width;
    float bellCurve = exp(-x * x * 0.5);

    if (currentEnergy > fissionThreshold) {
        float excess = (currentEnergy - fissionThreshold) / max(0.0001, (1.0 - fissionThreshold));
        bellCurve -= excess * instabilityFactor;
    }

    return bellCurve;
}

float laplacianChannelR(vec2 uv) {
    float sum = 0.0;
    sum += texture2D(field, uv + vec2(-1.0, 0.0) * texelSize).x;
    sum += texture2D(field, uv + vec2(1.0, 0.0) * texelSize).x;
    sum += texture2D(field, uv + vec2(0.0, -1.0) * texelSize).x;
    sum += texture2D(field, uv + vec2(0.0, 1.0) * texelSize).x;
    sum -= 4.0 * texture2D(field, uv).x;
    return sum;
}

float laplacianChannelG(vec2 uv) {
    float sum = 0.0;
    sum += texture2D(field, uv + vec2(-1.0, 0.0) * texelSize).y;
    sum += texture2D(field, uv + vec2(1.0, 0.0) * texelSize).y;
    sum += texture2D(field, uv + vec2(0.0, -1.0) * texelSize).y;
    sum += texture2D(field, uv + vec2(0.0, 1.0) * texelSize).y;
    sum -= 4.0 * texture2D(field, uv).y;
    return sum;
}

float laplacianChannelB(vec2 uv) {
    float sum = 0.0;
    sum += texture2D(field, uv + vec2(-1.0, 0.0) * texelSize).z;
    sum += texture2D(field, uv + vec2(1.0, 0.0) * texelSize).z;
    sum += texture2D(field, uv + vec2(0.0, -1.0) * texelSize).z;
    sum += texture2D(field, uv + vec2(0.0, 1.0) * texelSize).z;
    sum -= 4.0 * texture2D(field, uv).z;
    return sum;
}

float random(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void sampleKernel(
    vec2 uv,
    float sampleScale,
    float selfTerrain,
    vec2 interactionForce,
    out float potentialR,
    out float potentialG,
    out float totalWeight
) {
    potentialR = 0.0;
    potentialG = 0.0;
    totalWeight = 0.0;

    int kernelSize = ${KERNEL_SIZE};
    for (int dy = -kernelSize; dy <= kernelSize; dy++) {
        for (int dx = -kernelSize; dx <= kernelSize; dx++) {
            vec2 offset = vec2(float(dx), float(dy));
            float dist = length(offset);

            if (dist <= outerRadius) {
                vec2 neighborUV = fract(uv + offset * texelSize * sampleScale);
                vec4 neighbor = texture2D(field, neighborUV);
                float weight = kernelWeight(dist);

                // Green=attract, Blue=repel mouse modes
                weight += interactionForce.x * 2.0 - interactionForce.y * 2.0;

                if (dynamicsMode < 0.5) {
                    // Terrain mode: slope modifies transport pressure
                    float slope = (neighbor.y - selfTerrain);
                    weight -= terrainRepelCoef * slope;
                }

                potentialR += neighbor.x * weight;
                potentialG += neighbor.y * weight;
                totalWeight += abs(weight);
            }
        }
    }

    if (totalWeight > 0.0) {
        potentialR /= totalWeight;
        potentialG /= totalWeight;
    }
}

void main() {
    vec2 uv = gl_FragCoord.xy * texelSize;

    vec4 state = texture2D(field, uv);
    float chanR = state.r;
    float chanG = state.g;
    float liftZ = state.b;
    vec3 interaction = texture2D(interactionTexture, uv).rgb;

    float potBaseR;
    float potBaseG;
    float wBase;
    sampleKernel(uv, 1.0, chanG, interaction.gb, potBaseR, potBaseG, wBase);

    float diffusionR = laplacianChannelR(uv) * diffusionRate;
    float diffusionG = laplacianChannelG(uv) * diffusionRate;

    float noiseR = (random(uv + chanR) - 0.5) * 0.001;
    float noiseG = (random(uv + chanG + 17.0) - 0.5) * 0.001;

    float newR = chanR;
    float newG = chanG;

    if (dynamicsMode < 0.5) {
        // ===== Terrain/Energy legacy mode (R=energy, G=terrain) =====
        float growth = growthFunction(potBaseR, chanR) - 0.5;
        growth -= globalAverage * suppressionFactor;

        float metabolism = chanR * chanR * decayRate;
        float terrainCost = terrainCostCoef * chanG;

        float fissionNoise = 0.0;
        if (chanR > fissionThreshold) {
            float excess = (chanR - fissionThreshold) / max(0.0001, (1.0 - fissionThreshold));
            float chaos = sin(dot(uv * 100.0 + chanR * 50.0, vec2(12.9898, 78.233)));
            fissionNoise = chaos * excess * 0.1;
        }

        float interactionEnergy = interaction.r * 0.1;

        float deltaEnergy = growthRate * growth - metabolism - terrainCost + diffusionR + fissionNoise + interactionEnergy;
        newR = chanR + deltaEnergy + noiseR;

        if (extendedMode > 0.5) {
            float erosion = 0.0;
            if (chanR > erosionThreshold) {
                erosion = erosionRate * (chanR - erosionThreshold);
            }

            float gLoss = min(chanG, erosion);
            chanG -= gLoss;

            chanG += gLoss;
            float cap = 1.0 + overflowCap;
            if (chanG > cap) {
              chanG = cap;
            }

            float overflow = max(0.0, chanG - 1.0);
            float leakJitter = 1.0 + (random(uv + chanR) - 0.5) * overflowNoise;
            float leak = overflowLeak * leakJitter;
            chanG -= min(overflow, leak);

            float diffusionBoost = 1.0 + overflow * 2.0;
            chanG += laplacianChannelG(uv) * terrainDiffusion * diffusionBoost;
        }

    } else {
        // ===== Hierarchy mode (R=energy, G=unitness, B=echo) =====
        float potCoarseR;
        float potCoarseG;
        float wCoarse;
        sampleKernel(uv, 4.0, chanG, interaction.gb, potCoarseR, potCoarseG, wCoarse);

        float localContrast = abs(potBaseR - chanR);
        float scaleAgreement = exp(
            -pow((potBaseR - potCoarseR) / max(0.01, hierarchyAlignment), 2.0) * 0.5
        );
        float pairSignal = smoothstep(0.03, 0.22, localContrast) * scaleAgreement;

        float promotedPotential = mix(potBaseR, potCoarseR, clamp(coarseFeedback, 0.0, 1.0));
        float growth = growthFunction(promotedPotential, chanR) - 0.5;
        growth -= globalAverage * suppressionFactor * (1.0 - 0.4 * chanG);

        float metabolism = chanR * chanR * decayRate + 0.12 * chanG;
        float echoPull = liftZ * (0.12 + 0.55 * coarseFeedback);
        float unitDrive = chanG * (0.1 + 0.3 * coarseFeedback);

        float interactionEnergy = interaction.r * 0.08;
        float deltaEnergy = growthRate * (growth + unitDrive + echoPull) - metabolism + diffusionR + interactionEnergy + noiseR;
        newR = chanR + deltaEnergy;

        float unitBuild = pairSignal * unitGain * (0.35 + 0.65 * smoothstep(0.08, 0.55, chanR));
        float unitDiffusion = laplacianChannelG(uv) * 0.035;
        newG = chanG + unitBuild - unitDecay * chanG + unitDiffusion;

        float promotion = smoothstep(promotionThreshold, 1.0, max(chanG, newG));
        float echoDiffusion = laplacianChannelB(uv) * (0.02 + 0.08 * coarseFeedback);
        liftZ = liftZ + promotion * max(chanG, newG) * 0.08 - unitDecay * 0.6 * liftZ + echoDiffusion;

        // Promotion costs a little local energy so the collapse feels like a transfer.
        newR -= promotion * max(chanG, newG) * 0.03;
    }

    newR = clamp(newR, 0.0, 1.0);
    newG = clamp(newG, 0.0, 1.0);
    liftZ = clamp(liftZ, 0.0, 1.0);

    gl_FragColor = vec4(newR, newG, liftZ, 1.0);
}
`;
}

/**
 * Gets the display vertex shader
 * @returns {string} GLSL vertex shader code
 */
export function getDisplayVertexShader() {
  return `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;
}

/**
 * Gets the display fragment shader
 * @returns {string} GLSL fragment shader code
 */
export function getDisplayFragmentShader() {
  return `
uniform sampler2D fieldTexture;
uniform int viewMode; // 0=composite,1=primary,2=secondary,3=lift,4=abSplit
uniform float dynamicsMode; // 0=terrain/energy, 1=hierarchy
varying vec2 vUv;

vec3 energyGradient(float energy) {
    vec3 color;

    if (energy < 0.1) {
        color = mix(vec3(0.0, 0.0, 0.0), vec3(0.0, 0.0, 0.2), energy * 10.0);
    } else if (energy < 0.3) {
        color = mix(vec3(0.0, 0.0, 0.2), vec3(0.0, 0.3, 0.8), (energy - 0.1) * 5.0);
    } else if (energy < 0.5) {
        color = mix(vec3(0.0, 0.3, 0.8), vec3(0.0, 0.8, 1.0), (energy - 0.3) * 5.0);
    } else if (energy < 0.7) {
        color = mix(vec3(0.0, 0.8, 1.0), vec3(0.2, 1.0, 0.3), (energy - 0.5) * 5.0);
    } else if (energy < 0.85) {
        color = mix(vec3(0.2, 1.0, 0.3), vec3(1.0, 1.0, 0.0), (energy - 0.7) * 6.67);
    } else {
        color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 1.0), (energy - 0.85) * 6.67);
        color += vec3(0.2) * sin(energy * 50.0);
    }

    color += energy * 0.15;

    return color;
}

void main() {
    vec4 state = texture2D(fieldTexture, vUv);
    float primary = state.r;
    float secondary = state.g;
    float lift = state.b;

    bool isHierarchyMode = dynamicsMode > 0.5;
    vec3 color;

    if (viewMode == 1) {
        color = energyGradient(primary);
    } else if (viewMode == 2) {
        if (isHierarchyMode) {
            color = mix(vec3(0.06, 0.02, 0.0), vec3(1.0, 0.72, 0.18), secondary);
        } else {
            color = vec3(secondary) * vec3(0.8, 0.7, 0.3);
        }
    } else if (viewMode == 3) {
        if (isHierarchyMode) {
            color = mix(vec3(0.02, 0.0, 0.06), vec3(0.9, 0.8, 1.0), lift);
        } else {
            color = vec3(lift * 0.2, lift * 0.8, lift);
        }
    } else if (viewMode == 4) {
        if (isHierarchyMode) {
            color = vec3(primary, secondary, lift);
        } else {
            color = vec3(primary, secondary, 0.2 * lift);
        }
    } else {
        if (isHierarchyMode) {
            color = energyGradient(primary);
            color += vec3(1.0, 0.68, 0.18) * secondary * 0.45;
            color += vec3(0.78, 0.7, 1.0) * lift * 0.5;
        } else {
            // Composite: energy base + terrain overlay
            color = energyGradient(primary);
            color += vec3(0.8, 0.7, 0.3) * secondary * 0.4;
        }
    }

    gl_FragColor = vec4(color, 1.0);
}
`;
}

/**
 * Gets the downsample fragment shader for averaging
 * @returns {string} GLSL fragment shader code
 */
export function getDownsampleFragmentShader() {
  return `
uniform sampler2D inputTexture;
uniform vec2 texelSize;
void main() {
    vec2 coord = gl_FragCoord.xy - vec2(0.5);
    vec2 base = coord * 2.0;
    vec2 uv00 = (base + vec2(0.5, 0.5)) * texelSize;
    vec2 uv10 = (base + vec2(1.5, 0.5)) * texelSize;
    vec2 uv01 = (base + vec2(0.5, 1.5)) * texelSize;
    vec2 uv11 = (base + vec2(1.5, 1.5)) * texelSize;
    float sum = (
        texture2D(inputTexture, uv00).x +
        texture2D(inputTexture, uv10).x +
        texture2D(inputTexture, uv01).x +
        texture2D(inputTexture, uv11).x
    ) * 0.25;
    gl_FragColor = vec4(sum, 0.0, 0.0, 1.0);
}
`;
}
