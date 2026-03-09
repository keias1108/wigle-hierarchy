/**
 * Preset Configurations
 *
 * Curated parameter sets that produce interesting patterns.
 * Users can save/load custom presets via localStorage.
 */

/**
 * Named presets for interesting simulation behaviors
 * Each preset is a complete set of simulation parameters
 */
export const NAMED_PRESETS = {
  /**
   * Default balanced preset
   * Produces stable, self-organizing patterns
   */
  default: {
    innerRadius: 3.5,
    innerStrength: 0.9,
    outerRadius: 7.5,
    outerStrength: -0.55,
    growthCenter: -0.17,
    growthWidth: 0.0183,
    growthRate: 0.607,
    suppressionFactor: 1.0,
    decayRate: 0.378,
    diffusionRate: 0.285,
    fissionThreshold: 0.796,
    instabilityFactor: 1.5,
    dynamicsMode: 1,
    hierarchyAlignment: 0.09,
    unitGain: 0.26,
    unitDecay: 0.012,
    promotionThreshold: 0.58,
    coarseFeedback: 0.17,
    lineagePressure: 0.24,
    traitMutation: 0.11,
    nicheMemory: 0.985,
    asyncMix: 0.0,
    rotatedKernelMix: 0.0,
    flowCoupling: 0.0,
    flowMemory: 0.0,
    flowResponse: 0.0,
  },

  /**
   * Banana Wave preset (from README.md)
   * Produces flowing wave-like patterns
   * Instructions: Start with growthWidth 0.145, slowly lower to 0.0156
   */
  bananaWave: {
    innerRadius: 3.5,
    innerStrength: 0.9,
    outerRadius: 7.5,
    outerStrength: -0.55,
    growthCenter: -0.17,
    growthWidth: 0.0156, // Target value for wave pattern
    growthRate: 0.607,
    suppressionFactor: 1.0,
    decayRate: 0.378,
    diffusionRate: 0.285,
    fissionThreshold: 0.796,
    instabilityFactor: 1.5,
    dynamicsMode: 1,
    hierarchyAlignment: 0.09,
    unitGain: 0.26,
    unitDecay: 0.012,
    promotionThreshold: 0.58,
    coarseFeedback: 0.17,
    lineagePressure: 0.24,
    traitMutation: 0.11,
    nicheMemory: 0.985,
    asyncMix: 0.0,
    rotatedKernelMix: 0.0,
    flowCoupling: 0.0,
    flowMemory: 0.0,
    flowResponse: 0.0,
  },

  // Additional presets can be added here
  // Example:
  // chaos: { ... },
  // crystals: { ... },
  // etc.
};

/**
 * LocalStorage key for user-saved preset
 */
export const PRESET_STORAGE_KEY = 'energyLifePreset';
