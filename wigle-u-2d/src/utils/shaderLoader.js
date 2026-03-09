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
uniform sampler2D trait;
uniform sampler2D flow;
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
uniform float lineagePressure;
uniform float traitMutation;
uniform float nicheMemory;
uniform float asyncMix;
uniform float rotatedKernelMix;
uniform float flowCoupling;
uniform float flowMemory;
uniform float flowResponse;
uniform float framePhase;

float kernelWeightAt(
    float dist,
    float localInnerRadius,
    float localInnerStrength,
    float localOuterRadius,
    float localOuterStrength
) {
    float weight = 0.0;

    if (dist < localInnerRadius) {
        float t = 1.0 - (dist / max(0.0001, localInnerRadius));
        weight += localInnerStrength * t * t;
    }

    float ringStart = localInnerRadius + 1.0;
    float ringEnd = localOuterRadius;
    if (dist > ringStart && dist < ringEnd) {
        float t = (dist - ringStart) / max(0.0001, (ringEnd - ringStart));
        weight += localOuterStrength * exp(-2.0 * t * t);
    }

    return weight;
}

float growthFunctionAt(
    float potential,
    float currentEnergy,
    float localGrowthCenter,
    float localGrowthWidth
) {
    float width = max(0.00005, localGrowthWidth);
    float x = (potential - localGrowthCenter) / width;
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

float gradientMagnitudeChannelB(vec2 uv) {
    float left = texture2D(field, uv + vec2(-1.0, 0.0) * texelSize).z;
    float right = texture2D(field, uv + vec2(1.0, 0.0) * texelSize).z;
    float down = texture2D(field, uv + vec2(0.0, -1.0) * texelSize).z;
    float up = texture2D(field, uv + vec2(0.0, 1.0) * texelSize).z;
    vec2 grad = vec2(right - left, up - down);
    return length(grad) * 0.5;
}

vec2 rotateHexLike(vec2 offset) {
    const float cosA = 0.5;
    const float sinA = 0.8660254;
    return vec2(
        cosA * offset.x - sinA * offset.y,
        sinA * offset.x + cosA * offset.y
    );
}

float random(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void sampleKernel(
    vec2 uv,
    float sampleScale,
    float selfTerrain,
    vec2 flowVec,
    float localRotatedMix,
    float localInnerRadius,
    float localInnerStrength,
    float localOuterRadius,
    float localOuterStrength,
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

            if (dist <= localOuterRadius) {
                vec2 advectedUV = fract(uv + flowVec * flowCoupling * texelSize * 8.0 * sampleScale);
                vec2 rotatedOffset = rotateHexLike(offset);
                vec2 neighborUV = fract(advectedUV + offset * texelSize * sampleScale);
                vec2 rotatedUV = fract(advectedUV + rotatedOffset * texelSize * sampleScale);
                vec4 neighbor = mix(
                    texture2D(field, neighborUV),
                    texture2D(field, rotatedUV),
                    clamp(localRotatedMix, 0.0, 1.0)
                );
                float weight = kernelWeightAt(
                    dist,
                    localInnerRadius,
                    localInnerStrength,
                    localOuterRadius,
                    localOuterStrength
                );

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
    vec4 lineage = texture2D(trait, uv);
    vec4 flowState = texture2D(flow, uv);
    float chanR = state.r;
    float chanG = state.g;
    float liftZ = state.b;
    float prevEnergy = state.a;
    float traitSeparator = lineage.r;
    float traitLaminar = lineage.g;
    float traitBranching = lineage.b;
    float nicheMemoryValue = lineage.a;
    vec2 flowVec = flowState.xy;
    vec3 interaction = texture2D(interactionTexture, uv).rgb;
    float localInnerRadius = innerRadius;
    float localInnerStrength = innerStrength;
    float localOuterRadius = outerRadius;
    float localOuterStrength = outerStrength;

    float potBaseR;
    float potBaseG;
    float wBase;
    float structureScore = smoothstep(
        0.04,
        0.42,
        chanR + chanG * 0.55 + liftZ * 0.45
    );
    float nichePocket = smoothstep(0.01, 0.18, nicheMemoryValue) * (1.0 - smoothstep(0.2, 0.75, liftZ));
    localInnerRadius *= 1.0 + traitLaminar * 0.12 - traitSeparator * 0.08 + nichePocket * 0.04;
    localOuterRadius *= 1.0 + traitBranching * 0.18 + traitSeparator * 0.14 - traitLaminar * 0.07;
    localInnerStrength *= 1.0 + traitLaminar * 0.18 - traitSeparator * 0.12 + nichePocket * 0.08;
    localOuterStrength *= 1.0 + traitSeparator * 0.28 - traitBranching * 0.12;
    vec2 localFlowVec = flowVec * mix(0.08, 1.0, structureScore);
    float localRotatedMix = rotatedKernelMix * mix(0.2, 1.0, structureScore);
    sampleKernel(
        uv,
        1.0,
        chanG,
        localFlowVec,
        localRotatedMix,
        localInnerRadius,
        localInnerStrength,
        localOuterRadius,
        localOuterStrength,
        interaction.gb,
        potBaseR,
        potBaseG,
        wBase
    );

    float diffusionR = laplacianChannelR(uv) * diffusionRate;
    float diffusionG = laplacianChannelG(uv) * diffusionRate;

    float noiseR = (random(uv + chanR) - 0.5) * 0.001;
    float noiseG = (random(uv + chanG + 17.0) - 0.5) * 0.001;

    float newR = chanR;
    float newG = chanG;
    float newA = chanR;

    if (dynamicsMode < 0.5) {
        // ===== Terrain/Energy legacy mode (R=energy, G=terrain) =====
        float growth = growthFunctionAt(potBaseR, chanR, growthCenter, growthWidth) - 0.5;
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
        sampleKernel(
            uv,
            4.0,
            chanG,
            localFlowVec,
            localRotatedMix,
            localInnerRadius,
            localInnerStrength,
            localOuterRadius,
            localOuterStrength,
            interaction.gb,
            potCoarseR,
            potCoarseG,
            wCoarse
        );

        float localContrast = abs(potBaseR - chanR);
        float flipSignal = smoothstep(0.035, 0.24, abs(chanR - prevEnergy));
        float temporalEnvelope = 0.5 * (chanR + prevEnergy);
        float localHierarchyAlignment = max(
            0.015,
            hierarchyAlignment * (1.0 + traitLaminar * 0.16 - traitBranching * 0.18 + nichePocket * 0.08)
        );
        float scaleAgreement = exp(
            -pow((potBaseR - potCoarseR) / max(0.01, localHierarchyAlignment), 2.0) * 0.5
        );
        float pairSignal = smoothstep(0.03, 0.22, localContrast) * scaleAgreement;
        float echoGradient = gradientMagnitudeChannelB(uv);
        float centerSuppression = smoothstep(0.12, 0.9, liftZ);
        float edgeDifferentiation = smoothstep(0.01, 0.08, echoGradient) * smoothstep(0.05, 0.35, liftZ);
        float flipAgreement = exp(
            -pow((temporalEnvelope - potCoarseR) / max(0.015, localHierarchyAlignment * 1.35), 2.0) * 0.5
        );
        float phaseDifferentiation = flipSignal * flipAgreement * (1.0 - 0.45 * centerSuppression);
        float lineageBranchDrive = traitBranching * (0.08 + 0.24 * nicheMemoryValue);
        float lineageLaminarDrive = traitLaminar * scaleAgreement * 0.16;
        float lineageSeparation = traitSeparator * (0.05 + 0.22 * centerSuppression + 0.12 * nicheMemoryValue);
        float localGrowthCenter = growthCenter + traitSeparator * 0.085 - traitLaminar * 0.05 + traitBranching * 0.03 - nichePocket * 0.028;
        float localGrowthWidth = growthWidth * (1.0 + traitLaminar * 0.18 + traitBranching * 0.12 - traitSeparator * 0.1);
        float localPromotionThreshold = clamp(
            promotionThreshold + traitSeparator * 0.18 - traitBranching * 0.14 + traitLaminar * 0.06 + nichePocket * 0.08,
            0.05,
            0.95
        );
        // Existing promoted regions should not keep collapsing into a single empire.
        // Suppress fresh binding at the center and favor re-differentiation near echo edges.
        pairSignal *= (1.0 - 0.55 * centerSuppression);
        pairSignal += edgeDifferentiation * (0.12 + 0.48 * coarseFeedback) * (1.0 - pairSignal);
        pairSignal += phaseDifferentiation * (0.08 + 0.22 * coarseFeedback) * (1.0 - pairSignal);
        pairSignal += lineageBranchDrive * edgeDifferentiation * (1.0 - pairSignal);
        pairSignal += lineageLaminarDrive * smoothstep(0.02, 0.12, localContrast) * (1.0 - pairSignal);
        pairSignal *= (1.0 - 0.4 * lineageSeparation);

        float promotedPotential = mix(potBaseR, potCoarseR, clamp(coarseFeedback, 0.0, 1.0));
        float growth = growthFunctionAt(promotedPotential, chanR, localGrowthCenter, localGrowthWidth) - 0.5;
        growth -= globalAverage * suppressionFactor * (1.0 - 0.25 * chanG);
        growth += lineageLaminarDrive * 0.05;
        growth -= lineageSeparation * 0.04;

        float metabolism = chanR * chanR * decayRate + 0.1 * chanG + centerSuppression * 0.08 + lineageSeparation * 0.05;
        float reDiffDrive = edgeDifferentiation * (0.04 + 0.18 * coarseFeedback) + phaseDifferentiation * 0.07 + lineageBranchDrive * 0.08;
        float unitDrive = chanG * (0.08 + 0.18 * coarseFeedback) + traitLaminar * 0.035;
        float echoClamp = centerSuppression * (0.02 + 0.08 * coarseFeedback) + lineageSeparation * 0.03;
        float reDiffNoise = (random(uv + liftZ * 29.0 + chanG * 11.0) - 0.5) *
            (edgeDifferentiation + 0.45 * phaseDifferentiation) * 0.018;

        float interactionEnergy = interaction.r * 0.08;
        float diffusionDrive = diffusionR * (1.0 - 0.28 * traitSeparator + 0.08 * traitLaminar) + dot(localFlowVec, localFlowVec) * flowResponse * 0.01;
        float deltaEnergy = growthRate * (growth + unitDrive + reDiffDrive) - metabolism - echoClamp + diffusionDrive + interactionEnergy + noiseR + reDiffNoise;
        newR = chanR + deltaEnergy;

        float unitBuild = pairSignal * unitGain * (0.3 + 0.7 * smoothstep(0.08, 0.55, chanR));
        float unitDiffusion = laplacianChannelG(uv) * (0.02 + 0.03 * (1.0 - centerSuppression));
        newG = chanG + unitBuild - unitDecay * chanG + unitDiffusion + traitLaminar * 0.006 - traitSeparator * 0.004;

        float promotion = smoothstep(localPromotionThreshold, 1.0, max(chanG, newG));
        float echoDiffusion = laplacianChannelB(uv) * (0.015 + 0.06 * coarseFeedback);
        liftZ = liftZ + promotion * max(chanG, newG) * (0.045 + 0.03 * traitLaminar) - unitDecay * 0.45 * liftZ + echoDiffusion;

        // Promotion still costs local energy, but less than before so siblings can survive.
        newR -= promotion * max(chanG, newG) * 0.02;
    }

    newR = clamp(newR, 0.0, 1.0);
    newG = clamp(newG, 0.0, 1.0);
    liftZ = clamp(liftZ, 0.0, 1.0);
    newA = clamp(newA, 0.0, 1.0);

    float localPhase = mod(floor(gl_FragCoord.x) + 2.0 * floor(gl_FragCoord.y), 4.0);
    float activeMask = 1.0 - step(0.1, abs(localPhase - framePhase));
    float asyncFloor = mix(0.82, 0.95, structureScore);
    float updateGate = mix(
        1.0,
        asyncFloor + (1.0 - asyncFloor) * activeMask,
        clamp(asyncMix, 0.0, 1.0)
    );
    newR = mix(chanR, newR, updateGate);
    newG = mix(chanG, newG, updateGate);
    liftZ = mix(state.b, liftZ, updateGate);

    gl_FragColor = vec4(newR, newG, liftZ, newA);
}
`;
}

export function getTraitShader() {
  return `
uniform sampler2D field;
uniform sampler2D trait;
uniform sampler2D flow;
uniform vec2 texelSize;
uniform float dynamicsMode;
uniform float hierarchyAlignment;
uniform float coarseFeedback;
uniform float lineagePressure;
uniform float traitMutation;
uniform float nicheMemory;

float random(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 normalizeTraits(vec3 traits) {
    traits = max(traits, vec3(0.001));
    float sum = traits.x + traits.y + traits.z;
    return traits / max(0.001, sum);
}

float laplacianChannelTrait(sampler2D tex, vec2 uv, int channelIndex) {
    vec4 left = texture2D(tex, uv + vec2(-1.0, 0.0) * texelSize);
    vec4 right = texture2D(tex, uv + vec2(1.0, 0.0) * texelSize);
    vec4 down = texture2D(tex, uv + vec2(0.0, -1.0) * texelSize);
    vec4 up = texture2D(tex, uv + vec2(0.0, 1.0) * texelSize);
    vec4 center = texture2D(tex, uv);
    float l = channelIndex == 0 ? left.r : (channelIndex == 1 ? left.g : left.b);
    float r = channelIndex == 0 ? right.r : (channelIndex == 1 ? right.g : right.b);
    float d = channelIndex == 0 ? down.r : (channelIndex == 1 ? down.g : down.b);
    float u = channelIndex == 0 ? up.r : (channelIndex == 1 ? up.g : up.b);
    float c = channelIndex == 0 ? center.r : (channelIndex == 1 ? center.g : center.b);
    return l + r + d + u - 4.0 * c;
}

void main() {
    vec2 uv = gl_FragCoord.xy * texelSize;
    vec4 state = texture2D(field, uv);
    vec4 lineage = texture2D(trait, uv);
    vec4 flowState = texture2D(flow, uv);

    vec3 traits = lineage.rgb;
    float niche = lineage.a;

    float energy = state.r;
    float unitness = state.g;
    float echo = state.b;
    float prevEnergy = state.a;

    if (dynamicsMode < 0.5) {
        niche *= 0.995;
        gl_FragColor = vec4(normalizeTraits(mix(traits, vec3(0.34, 0.33, 0.33), 0.02)), niche);
        return;
    }

    float localContrast = abs(energy - prevEnergy);
    float echoGradient = length(vec2(
        texture2D(field, uv + vec2(1.0, 0.0) * texelSize).b - texture2D(field, uv + vec2(-1.0, 0.0) * texelSize).b,
        texture2D(field, uv + vec2(0.0, 1.0) * texelSize).b - texture2D(field, uv + vec2(0.0, -1.0) * texelSize).b
    )) * 0.5;

    float promotion = smoothstep(0.22, 0.78, max(unitness, echo));
    float activity = smoothstep(0.04, 0.36, energy + unitness * 0.8 + echo * 0.6);
    float localHierarchyAlignment = max(
        0.015,
        hierarchyAlignment * (1.0 + traits.g * 0.14 - traits.b * 0.12 + niche * 0.1)
    );
    float centerLock = smoothstep(0.08, 0.42, echo);
    float branchSignal = smoothstep(0.01, 0.09, echoGradient) * (0.4 + 0.6 * localContrast);
    float laminarSignal = exp(-pow(localContrast / max(0.015, localHierarchyAlignment * 1.15), 2.0) * 0.5) * smoothstep(0.08, 0.35, unitness);
    float separatorSignal = smoothstep(0.12, 0.75, echo) * (1.0 - smoothstep(0.0, 0.18, echoGradient));
    float flowSpeed = length(flowState.xy);
    branchSignal += flowSpeed * 0.18;
    separatorSignal += flowState.z * 0.08;

    vec3 target = normalizeTraits(
        vec3(0.34, 0.33, 0.33) * 0.18 +
        vec3(separatorSignal * 1.2, laminarSignal * 1.05, branchSignal * 1.25) +
        traits * (0.32 + 0.28 * centerLock)
    );

    vec3 neighborTraits = vec3(
        traits.r + laplacianChannelTrait(trait, uv, 0) * -0.25,
        traits.g + laplacianChannelTrait(trait, uv, 1) * -0.25,
        traits.b + laplacianChannelTrait(trait, uv, 2) * -0.25
    );
    neighborTraits = normalizeTraits(neighborTraits);

    float mutationA = (random(uv + energy * 17.0) - 0.5) * traitMutation;
    float mutationB = (random(uv + echo * 31.0 + 11.0) - 0.5) * traitMutation;
    float mutationC = (random(uv + unitness * 47.0 + 23.0) - 0.5) * traitMutation;
    vec3 mutation = vec3(mutationA, mutationB, mutationC) * (0.08 + 0.92 * promotion * (0.35 + 0.65 * branchSignal));

    float traitExchange = (0.0015 + 0.008 * coarseFeedback) * (0.2 + 0.8 * activity);
    vec3 nextTraits = mix(traits, neighborTraits, traitExchange);
    nextTraits = mix(nextTraits, target, lineagePressure * (0.12 + 0.88 * promotion));
    nextTraits = normalizeTraits(nextTraits + mutation);

    float nicheBuild = promotion * activity * (0.008 + 0.03 * branchSignal + 0.015 * separatorSignal);
    float nicheSpread = (
        texture2D(trait, uv + vec2(-1.0, 0.0) * texelSize).a +
        texture2D(trait, uv + vec2(1.0, 0.0) * texelSize).a +
        texture2D(trait, uv + vec2(0.0, -1.0) * texelSize).a +
        texture2D(trait, uv + vec2(0.0, 1.0) * texelSize).a -
        4.0 * niche
    ) * (0.001 + 0.0025 * branchSignal);
    float nicheSink = niche * (0.02 + 0.035 * (1.0 - activity) + centerLock * 0.012);
    float nextNiche = niche * mix(0.88, nicheMemory, activity) + nicheBuild + nicheSpread - nicheSink;

    gl_FragColor = vec4(nextTraits, clamp(nextNiche, 0.0, 1.0));
}
`;
}

export function getFlowShader() {
  return `
uniform sampler2D field;
uniform sampler2D trait;
uniform sampler2D flow;
uniform vec2 texelSize;
uniform float dynamicsMode;
uniform float flowMemory;
uniform float flowResponse;
uniform float flowCoupling;
uniform float lineagePressure;

float random(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = gl_FragCoord.xy * texelSize;
    vec4 state = texture2D(field, uv);
    vec4 lineage = texture2D(trait, uv);
    vec4 prev = texture2D(flow, uv);

    vec2 gradEnergy = vec2(
        texture2D(field, uv + vec2(1.0, 0.0) * texelSize).r - texture2D(field, uv + vec2(-1.0, 0.0) * texelSize).r,
        texture2D(field, uv + vec2(0.0, 1.0) * texelSize).r - texture2D(field, uv + vec2(0.0, -1.0) * texelSize).r
    ) * 0.5;
    vec2 gradEcho = vec2(
        texture2D(field, uv + vec2(1.0, 0.0) * texelSize).b - texture2D(field, uv + vec2(-1.0, 0.0) * texelSize).b,
        texture2D(field, uv + vec2(0.0, 1.0) * texelSize).b - texture2D(field, uv + vec2(0.0, -1.0) * texelSize).b
    ) * 0.5;

    vec2 tangentEcho = vec2(-gradEcho.y, gradEcho.x);
    vec3 traits = lineage.rgb;
    float niche = lineage.a;
    float speed = length(prev.xy);

    if (dynamicsMode < 0.5) {
        gl_FragColor = vec4(prev.xy * 0.92, prev.z * 0.96, prev.w * 0.96);
        return;
    }

    vec2 desired =
        (-gradEnergy) * (0.18 + 0.62 * traits.r) +
        tangentEcho * (0.08 + 0.44 * traits.b + 0.2 * niche) +
        gradEcho * (0.05 + 0.26 * traits.g);
    float structureScore = smoothstep(0.04, 0.48, state.r + state.g * 0.65 + state.b * 0.5);
    desired *= mix(0.12, 1.0, structureScore);

    float jitterX = (random(uv + state.a * 17.0 + niche * 11.0) - 0.5) * 0.04;
    float jitterY = (random(uv + state.g * 23.0 + niche * 13.0) - 0.5) * 0.04;
    desired += vec2(jitterX, jitterY) * (0.15 + 0.5 * traits.b);

    vec2 nextFlow = prev.xy * mix(0.6, flowMemory, structureScore) +
        desired * flowResponse * (0.2 + 0.8 * lineagePressure) * mix(0.25, 1.0, structureScore);
    float maxLen = 0.02 + 0.22 * flowCoupling;
    float len = length(nextFlow);
    if (len > maxLen) {
        nextFlow = nextFlow / len * maxLen;
    }

    float nextSpeed = mix(prev.z, len / maxLen, 0.18);
    float nextCurl = mix(prev.w, length(tangentEcho) * 8.0, 0.1);
    gl_FragColor = vec4(nextFlow, clamp(nextSpeed, 0.0, 1.0), clamp(nextCurl, 0.0, 1.0));
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
uniform sampler2D traitTexture;
uniform sampler2D flowTexture;
uniform int viewMode; // 0=composite,1=primary,2=secondary,3=lift,4=abSplit,5=phase,6=lineage,7=niche,8=flow
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
    vec4 trait = texture2D(traitTexture, vUv);
    vec4 flow = texture2D(flowTexture, vUv);
    float primary = state.r;
    float secondary = state.g;
    float lift = state.b;
    float phase = abs(primary - state.a);
    float niche = trait.a;

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
    } else if (viewMode == 5) {
        if (isHierarchyMode) {
            vec3 towardNow = vec3(1.0, 0.44, 0.18);
            vec3 towardPrev = vec3(0.2, 0.85, 1.0);
            float nowDominant = step(state.a, primary);
            vec3 phaseColor = mix(towardPrev, towardNow, nowDominant);
            color = phaseColor * (0.18 + phase * 1.6);
            color += vec3(0.12, 0.08, 0.02) * secondary;
        } else {
            color = vec3(phase, phase * 0.8, 1.0 - phase);
        }
    } else if (viewMode == 6) {
        if (isHierarchyMode) {
            color = vec3(trait.r, trait.g, trait.b);
            color += niche * vec3(0.2, 0.18, 0.1);
        } else {
            color = vec3(trait.r, trait.g, trait.b);
        }
    } else if (viewMode == 7) {
        float nicheViz = smoothstep(0.003, 0.06, niche);
        color = mix(vec3(0.01, 0.02, 0.05), vec3(1.0, 0.82, 0.32), nicheViz);
    } else if (viewMode == 8) {
        vec2 flowVec = flow.xy;
        color = vec3(0.5 + flowVec.x * 10.0, 0.5 + flowVec.y * 10.0, flow.z);
        color += flow.w * vec3(0.2, 0.16, 0.08);
    } else {
        if (isHierarchyMode) {
            color = energyGradient(primary);
            color += vec3(1.0, 0.68, 0.18) * secondary * 0.45;
            color += vec3(0.78, 0.7, 1.0) * lift * 0.5;
            color += vec3(1.0, 0.48, 0.2) * phase * 0.08;
            color = mix(color, color + trait.rgb * 0.35 + niche * vec3(0.12, 0.1, 0.04), 0.42);
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
