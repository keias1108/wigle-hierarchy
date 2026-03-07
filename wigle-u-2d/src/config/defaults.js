/**
 * Default Simulation Parameters
 *
 * These values define the initial state of the simulation.
 * Each parameter is carefully tuned to produce interesting emergent patterns.
 */

/**
 * Default parameter values for the energy lifecycle simulation
 *
 * @typedef {Object} SimulationParams
 * @property {number} innerRadius - Inner attraction zone radius (grid cells)
 * @property {number} innerStrength - Inner attraction strength (positive = attract)
 * @property {number} outerRadius - Outer repulsion zone radius (grid cells)
 * @property {number} outerStrength - Outer repulsion strength (negative = repel)
 * @property {number} growthCenter - Center of growth function bell curve
 * @property {number} growthWidth - Width of growth function bell curve
 * @property {number} growthRate - Growth speed multiplier
 * @property {number} suppressionFactor - Global population suppression factor
 * @property {number} decayRate - Energy metabolism rate (quadratic decay)
 * @property {number} diffusionRate - Energy diffusion rate (Laplacian)
 * @property {number} fissionThreshold - Energy level triggering instability
 * @property {number} instabilityFactor - Fission chaos strength
 */
export const DEFAULT_PARAMS = {
  // Dynamic Tension: controls neighbor interactions
  innerRadius: 3.5,
  innerStrength: 0.9,
  outerRadius: 7.5,
  outerStrength: -0.4,

  // Growth Function: controls energy gain/loss based on neighbors
  growthCenter: -0.17,
  growthWidth: 0.0183,
  growthRate: 0.607,

  // Global suppression (prevents overpopulation)
  suppressionFactor: 1.0,

  // Energy Economy: controls energy lifecycle
  decayRate: 0.378,
  diffusionRate: 0.333,
  fissionThreshold: 0.796,
  instabilityFactor: 1.5,

  // Main mode: 0 = legacy terrain/energy, 1 = hierarchy
  dynamicsMode: 1,

  // Hierarchy mode: difference -> alignment -> unit -> echo
  hierarchyAlignment: 0.12,
  unitGain: 0.22,
  unitDecay: 0.018,
  promotionThreshold: 0.42,
  coarseFeedback: 0.28,

  // Terrain (G) erosion/transport (always on)
  extendedMode: 1, // reuse toggle: 1 = terrain 활성, 0 = 비활성
  erosionThreshold: 0.8,
  erosionRate: 0.139,
  terrainDiffusion: 0.62,
  overflowCap: 0.2,
  overflowLeak: 0.05,
  overflowNoise: 0.1,
  terrainCostCoef: 0.0,
  terrainRepelCoef: 0.03,
};

/**
 * UI control IDs that map to simulation parameters
 * Used for automatic slider/input binding
 */
export const PARAM_CONTROL_IDS = [
  'innerRadius',
  'innerStrength',
  'outerRadius',
  'outerStrength',
  'growthCenter',
  'growthWidth',
  'growthRate',
  'decayRate',
  'diffusionRate',
  'fissionThreshold',
  // Hierarchy controls
  'hierarchyAlignment',
  'unitGain',
  'unitDecay',
  'promotionThreshold',
  'coarseFeedback',
  // Terrain controls live under Energy section
  'erosionThreshold',
  'erosionRate',
  'terrainDiffusion',
  'overflowCap',
  'overflowLeak',
  'overflowNoise',
  'terrainCostCoef',
  'terrainRepelCoef',
];

/**
 * Speed preset configurations
 * Maps UI buttons to simulation speed multipliers
 */
export const SPEED_PRESETS = [
  { selector: '.speed-btn[data-speed="0"]', value: 0 }, // Pause
  { selector: '.speed-btn[data-speed="1"]', value: 1 }, // Normal
  { selector: '.speed-btn[data-speed="2"]', value: 2 }, // 2x
  { selector: '.speed-btn[data-speed="5"]', value: 5 }, // 5x
];
