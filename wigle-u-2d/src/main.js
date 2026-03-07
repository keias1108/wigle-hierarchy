/**
 * Main Entry Point
 *
 * Initializes the Energy Life Simulation when DOM is ready.
 */

import { EnergyLifeSimulation } from './core/EnergyLifeSimulation.js';

window.addEventListener('DOMContentLoaded', () => {
  const simulation = new EnergyLifeSimulation({
    canvasSelector: '#canvas',
    containerSelector: '#canvasContainer',
    controlsSelector: '#controls',
    chartCanvasSelector: '#chartCanvas',
  });

  simulation.init();

  // Expose to window for debugging/testing
  window.energyLifeSim = simulation;
});
