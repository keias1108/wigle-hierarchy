/**
 * Constants and Magic Numbers
 *
 * All hardcoded values extracted to a single location for:
 * - Easy tuning and experimentation
 * - Clear documentation of what each value means
 * - LLM-friendly code navigation
 */

// ========== Simulation Grid ==========
/**
 * Size of the simulation grid (both width and height)
 * Must be power of 2 for efficient GPU computation
 * Larger = more detail but slower performance
 */
export const SIMULATION_SIZE = 256;

/**
 * Maximum kernel radius for neighbor sampling in lifecycle shader
 * Should be >= ceil(outerRadius) to avoid clipping
 * Larger = slower shader execution (quadratic cost)
 */
export const KERNEL_SIZE = 10;

// ========== Canvas Dimensions ==========
/** Initial canvas width in pixels */
export const INITIAL_CANVAS_WIDTH = 800;

/** Initial canvas height in pixels */
export const INITIAL_CANVAS_HEIGHT = 600;

/** Minimum canvas width when resizing */
export const MIN_CANVAS_WIDTH = 400;

/** Maximum canvas width when resizing */
export const MAX_CANVAS_WIDTH_OFFSET = 100; // window.innerWidth - this

/** Minimum canvas height when resizing */
export const MIN_CANVAS_HEIGHT = 300;

/** Maximum canvas height when resizing */
export const MAX_CANVAS_HEIGHT_OFFSET = 100; // window.innerHeight - this

// ========== Interaction ==========
/** Radius of mouse interaction in grid cells */
export const INTERACTION_RADIUS = 20;

/**
 * Strength multiplier for attraction/repulsion interaction modes
 * Applied to kernel weight in lifecycle shader
 */
export const INTERACTION_WEIGHT_MULTIPLIER = 2.0;

/**
 * Energy injection amount per interaction
 * Multiplied by interaction texture red channel
 */
export const INTERACTION_ENERGY_AMOUNT = 0.1;

// ========== Initialization ==========
/**
 * Maximum random energy value for initial seeding
 * Lower = slower emergence, Higher = faster chaos
 */
export const INITIAL_SEED_ENERGY = 0.05;

// ========== Lifecycle Shader Coefficients ==========
/**
 * Fission noise amplitude coefficient
 * Controls chaos intensity at high energy levels
 */
export const FISSION_NOISE_AMPLITUDE = 0.1;

/**
 * Tiny noise amplitude to prevent stagnation
 * Adds randomness each frame to avoid dead states
 */
export const STAGNATION_NOISE_AMPLITUDE = 0.001;

// ========== Chart ==========
/**
 * Number of data points in energy history chart
 * Higher = longer history displayed
 */
export const CHART_HISTORY_LENGTH = 1000;

/**
 * Chart update throttle (frames)
 * Update chart every N frames instead of every average computation
 * Higher = better performance, less smooth chart
 */
export const CHART_UPDATE_THROTTLE = 5;

/** Chart canvas width in pixels */
export const CHART_CANVAS_WIDTH = 280;

/** Chart canvas height in pixels */
export const CHART_CANVAS_HEIGHT = 130;

/**
 * Chart downsampling factor
 * Draw every Nth point for performance
 * Higher = faster rendering, less detail
 */
export const CHART_DOWNSAMPLE_FACTOR = 10;

/**
 * Number of horizontal grid lines in chart
 * Actual lines drawn = this + 1
 */
export const CHART_GRID_DIVISIONS = 4;

// ========== Performance ==========
/**
 * FPS update interval in milliseconds
 * How often to recalculate and display FPS
 */
export const FPS_UPDATE_INTERVAL = 1000;

/**
 * Average energy computation throttle (frames)
 * Compute average every N frames instead of every frame
 * Higher = better performance, lower = more responsive feedback
 */
export const AVERAGE_COMPUTE_THROTTLE = 2;

// ========== Interaction Modes ==========
/** Available interaction modes for mouse clicks */
export const INTERACTION_MODES = ['energy', 'attract', 'repel'];
