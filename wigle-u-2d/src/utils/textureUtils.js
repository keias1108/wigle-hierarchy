/**
 * Texture Utility Functions
 *
 * Helper functions for manipulating GPU textures.
 */

import { INITIAL_SEED_ENERGY } from '../config/constants.js';

/**
 * Seeds a texture with random low-energy values
 *
 * Creates initial conditions for the simulation with sparse,
 * low-energy random noise that will evolve into patterns.
 *
 * @param {THREE.DataTexture} texture - Target texture to seed
 * @param {number} [dynamicsMode=0] - 0=terrain/energy, 1=hierarchy
 */
export function seedPattern(texture, dynamicsMode = 0) {
  const data = texture.image.data;
  const isHierarchyMode = dynamicsMode > 0.5;

  for (let i = 0; i < data.length; i += 4) {
    const value = Math.random() * INITIAL_SEED_ENERGY;

    if (isHierarchyMode) {
      data[i] = value; // Red channel = energy
      data[i + 1] = Math.random() * 0.02; // Green channel = unit memory
      data[i + 2] = 0.0; // Blue channel = coarse echo
      data[i + 3] = value; // Alpha channel = previous-frame energy trace
      continue;
    }

    data[i] = value; // Red channel = energy
    data[i + 1] = 0.5; // Green channel = terrain height
    data[i + 2] = 0.0; // Blue channel = lifted divergence storage
    data[i + 3] = value; // Alpha channel = previous-frame energy trace
  }
}

/**
 * Seeds the slower phylogenetic trait field.
 *
 * RGB stores lineage mixture weights, A stores niche memory.
 *
 * @param {THREE.DataTexture} texture - Target texture to seed
 */
export function seedTraitPattern(texture) {
  const data = texture.image.data;

  for (let i = 0; i < data.length; i += 4) {
    const driftA = (Math.random() - 0.5) * 0.03;
    const driftB = (Math.random() - 0.5) * 0.03;
    const driftC = (Math.random() - 0.5) * 0.03;

    let separator = 0.34 + driftA;
    let laminar = 0.33 + driftB;
    let branching = 0.33 + driftC;

    separator = Math.max(0.05, separator);
    laminar = Math.max(0.05, laminar);
    branching = Math.max(0.05, branching);

    const sum = separator + laminar + branching;
    data[i] = separator / sum;
    data[i + 1] = laminar / sum;
    data[i + 2] = branching / sum;
    data[i + 3] = 0.0; // niche memory starts empty
  }

  texture.needsUpdate = true;
}

/**
 * Seeds the continuous flow field.
 *
 * RG stores subpixel drift, B stores speed memory, A stores curvature memory.
 *
 * @param {THREE.DataTexture} texture - Target texture to seed
 */
export function seedFlowPattern(texture) {
  const data = texture.image.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = (Math.random() - 0.5) * 0.004;
    data[i + 1] = (Math.random() - 0.5) * 0.004;
    data[i + 2] = 0.0;
    data[i + 3] = 0.0;
  }

  texture.needsUpdate = true;
}

/**
 * Clears a texture to all zeros
 *
 * Used to reset interaction textures and other temporary buffers.
 *
 * @param {THREE.DataTexture} texture - Target texture to clear
 */
export function clearTexture(texture) {
  const data = texture.image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 1;
  }
}

/**
 * Updates interaction texture with mouse input
 *
 * Writes interaction data to texture based on mouse position and mode:
 * - Red channel: energy injection
 * - Green channel: attraction force
 * - Blue channel: repulsion force
 *
 * @param {THREE.DataTexture} texture - Interaction texture
 * @param {Object} mousePos - Mouse position {x: [0,1], y: [0,1]}
 * @param {string} mode - Interaction mode: 'energy', 'attract', or 'repel'
 * @param {number} simulationSize - Size of simulation grid
 * @param {number} radius - Interaction radius in grid cells
 */
export function updateInteractionTexture(
  texture,
  mousePos,
  mode,
  simulationSize,
  radius,
) {
  const data = texture.image.data;
  const centerX = Math.floor(mousePos.x * simulationSize);
  const centerY = Math.floor(mousePos.y * simulationSize);
  const radiusSquared = radius * radius;

  const minX = Math.max(0, centerX - radius);
  const maxX = Math.min(simulationSize - 1, centerX + radius);
  const minY = Math.max(0, centerY - radius);
  const maxY = Math.min(simulationSize - 1, centerY + radius);

  for (let y = minY; y <= maxY; y++) {
    const dy = y - centerY;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centerX;
      const distSq = dx * dx + dy * dy;
      if (distSq >= radiusSquared) continue;

      // Falloff: stronger at center, weaker at edges
      const intensity = 1.0 - Math.sqrt(distSq) / radius;
      const i = (y * simulationSize + x) * 4;

      if (mode === 'energy') {
        data[i] = intensity; // Red = energy
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else if (mode === 'attract') {
        data[i] = 0;
        data[i + 1] = intensity; // Green = attract
        data[i + 2] = 0;
      } else if (mode === 'repel') {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = intensity; // Blue = repel
      }
    }
  }

  texture.needsUpdate = true;
}
