import { DEFAULT_PARAMS, PARAM_CONTROL_IDS } from '../config/defaults.js';
import {
  SIMULATION_SIZE,
  INITIAL_CANVAS_WIDTH,
  INITIAL_CANVAS_HEIGHT,
  INTERACTION_MODES,
  INTERACTION_RADIUS,
  CHART_HISTORY_LENGTH,
  CHART_UPDATE_THROTTLE,
  CHART_DOWNSAMPLE_FACTOR,
  CHART_CANVAS_WIDTH,
  CHART_CANVAS_HEIGHT,
  CHART_GRID_DIVISIONS,
  FPS_UPDATE_INTERVAL,
  AVERAGE_COMPUTE_THROTTLE,
  MIN_CANVAS_WIDTH,
  MIN_CANVAS_HEIGHT,
  MAX_CANVAS_WIDTH_OFFSET,
  MAX_CANVAS_HEIGHT_OFFSET,
} from '../config/constants.js';
import {
  getLifecycleShader,
  getTraitShader,
  getFlowShader,
  getDisplayVertexShader,
  getDisplayFragmentShader,
  getDownsampleFragmentShader,
} from '../utils/shaderLoader.js';
import {
  seedPattern,
  seedTraitPattern,
  seedFlowPattern,
  clearTexture,
  updateInteractionTexture,
} from '../utils/textureUtils.js';
import { GPUComputationRenderer } from './GPUComputationRenderer.js';
import { DataRecorder } from '../utils/dataRecorder.js';

const THREE = window.THREE;

/**
 * Energy Life Simulation
 *
 * GPU-accelerated cellular automaton simulating energy dynamics.
 * Implements a particle life system with:
 * - Neighbor-based attraction/repulsion kernels
 * - Growth function based on local energy potential
 * - Energy metabolism and diffusion
 * - User interaction (inject energy, attract, repel)
 *
 * @class
 */
export class EnergyLifeSimulation {
  /**
   * Creates a new simulation instance
   *
   * @param {Object} options - Configuration options
   * @param {string} [options.canvasSelector='#canvas'] - CSS selector for WebGL canvas
   * @param {string} [options.containerSelector='#canvasContainer'] - CSS selector for canvas container
   * @param {string} [options.controlsSelector='#controls'] - CSS selector for control panel
   * @param {string} [options.chartCanvasSelector='#chartCanvas'] - CSS selector for chart canvas
   */
  constructor({
    canvasSelector = '#canvas',
    containerSelector = '#canvasContainer',
    controlsSelector = '#controls',
    chartCanvasSelector = '#chartCanvas',
  } = {}) {
    this.canvasSelector = canvasSelector;
    this.containerSelector = containerSelector;
    this.controlsSelector = controlsSelector;
    this.chartCanvasSelector = chartCanvasSelector;

    this.params = { ...DEFAULT_PARAMS };
    this.simulationSize = SIMULATION_SIZE;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.computeRenderer = null;
    this.computeVariables = {};
    this.material = null;

    this.isPaused = false;
    this.speedMultiplier = 1;
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.computeFrameCounter = 0; // For throttling average computation

    this.interactionTexture = null;
    this.interactionMode = 'energy';
    this.isMouseDown = false;
    this.mousePos = { x: 0, y: 0 };
    this.extendedMode = this.params.extendedMode > 0 ? 1 : 0;
    this.dynamicsMode = this.params.dynamicsMode ?? 0;
    this.viewMode = 0; // 0=composite, 1=primary, 2=secondary, 3=lift, 4=abSplit, 5=phase, 6=lineage, 7=niche, 8=flow
    this.simulationStep = 0;

    this.chartHistory = [];
    this.chartEnabled = false; // Chart toggle state
    this.chartUpdateCounter = 0; // For throttling chart updates
    this.downsamplePasses = [];
    this.downsampleScene = null;
    this.downsampleCamera = null;
    this.downsampleMesh = null;
    this.averageBuffer = null;
    this.chartCtx = null;

    this.canvasWidth = INITIAL_CANVAS_WIDTH;
    this.canvasHeight = INITIAL_CANVAS_HEIGHT;

    this.dom = {};
    this.dataRecorder = null; // DataRecorder for capturing visual data

    this.animate = this.animate.bind(this);
  }

  /**
   * Initializes the simulation
   *
   * Sets up all components: WebGL renderer, GPU computation,
   * UI controls, interaction handlers, and starts animation loop.
   */
  init() {
    this.#cacheDom();
    this.#setupCanvas();
    this.#setupRenderer();
    this.#setupWebGLErrorHandling();
    this.#initComputeRenderer();
    this.#setupDisplay();
    this.#setupControls();
    this.#setupChart();
    this.#setupInteraction();
    this.#setupKeyboard();
    this.#setupResize();
    requestAnimationFrame(this.animate);
  }

  animate() {
    requestAnimationFrame(this.animate);

    if (!this.isPaused && this.speedMultiplier > 0) {
      for (let i = 0; i < this.speedMultiplier; i++) {
        if (this.computeVariables.field?.material?.uniforms?.framePhase) {
          this.computeVariables.field.material.uniforms.framePhase.value =
            this.simulationStep % 4;
        }
        this.computeRenderer.compute();
        this.computeFrameCounter++;
        this.simulationStep++;
      }

      this.#updateInteractionTexture();

      const currentRenderTarget = this.computeRenderer.getCurrentRenderTarget(
        this.computeVariables.field,
      );

      // Throttle average computation for better performance
      if (this.computeFrameCounter >= AVERAGE_COMPUTE_THROTTLE) {
        const average = this.#computeAverage(currentRenderTarget.texture);
        this.computeVariables.field.material.uniforms.globalAverage.value =
          average;
        this.#updateAverageEnergy(average);
        this.computeFrameCounter = 0;
      }

      // Record frame if recording is active
      if (this.dataRecorder && this.dataRecorder.isRecording) {
        this.dataRecorder.recordFrame(this, currentRenderTarget);
        this.dataRecorder.updateRecordingDuration();
      }

      // Capture snapshot if requested (ensures fresh GPU data)
      if (this.dataRecorder && this.dataRecorder.pendingSnapshot) {
        this.dataRecorder.pendingSnapshot = false;
        const snapshot = this.dataRecorder.captureSnapshotNow(
          this,
          currentRenderTarget,
        );
        this.dataRecorder.downloadJSON(snapshot, 'energy-life-snapshot');

        // Visual feedback
        const btn = document.getElementById('captureSnapshot');
        if (btn) {
          btn.textContent = '✓ Saved!';
          setTimeout(() => {
            btn.textContent = '📸 Snapshot';
          }, 1500);
        }
      }

      this.material.uniforms.fieldTexture.value = currentRenderTarget.texture;
      if (this.computeVariables.trait && this.material.uniforms.traitTexture) {
        this.material.uniforms.traitTexture.value =
          this.computeRenderer.getCurrentRenderTarget(
            this.computeVariables.trait,
          ).texture;
      }
      if (this.computeVariables.flow && this.material.uniforms.flowTexture) {
        this.material.uniforms.flowTexture.value =
          this.computeRenderer.getCurrentRenderTarget(
            this.computeVariables.flow,
          ).texture;
      }
      if (this.material.uniforms.dynamicsMode) {
        this.material.uniforms.dynamicsMode.value = this.dynamicsMode;
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.#updateFps();
  }

  #cacheDom() {
    this.dom.canvas = document.querySelector(this.canvasSelector);
    this.dom.container = document.querySelector(this.containerSelector);
    this.dom.controls = document.querySelector(this.controlsSelector);
    this.dom.chartCanvas = document.querySelector(this.chartCanvasSelector);
    this.dom.toggleChart = document.getElementById('toggleChart');
    this.dom.chart = document.getElementById('chart');
    this.dom.toggleControls = document.getElementById('toggleControls');
    this.dom.simulationSize = document.getElementById('simulationSize');
    this.dom.dynamicsModeSelect = document.getElementById('dynamicsMode');
    this.dom.savePreset = document.getElementById('savePreset');
    this.dom.loadPreset = document.getElementById('loadPreset');
    this.dom.saveParamsFile = document.getElementById('saveParamsFile');
    this.dom.loadParamsFile = document.getElementById('loadParamsFile');
    this.dom.speedButtons = Array.from(document.querySelectorAll('.speed-btn'));
    this.dom.modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
    this.dom.fpsLabel = document.getElementById('fps');
    this.dom.avgLabel = document.getElementById('avgEnergy');
    this.dom.resizeHandles =
      this.dom.container.querySelectorAll('.resize-handle');
    this.dom.presetButtons = document.querySelector('.preset-buttons');
    this.dom.recordingControls = document.querySelector('.recording-controls');
    this.dom.extendedToggle = document.getElementById('extendedModeToggle');
    this.dom.layerSelect = document.getElementById('layerView');
    this.dom.terrainGroup = document.getElementById('terrainGroup');
    this.dom.hierarchyGroup = document.getElementById('hierarchyGroup');
  }

  #setupCanvas() {
    this.dom.container.style.width = `${this.canvasWidth}px`;
    this.dom.container.style.height = `${this.canvasHeight}px`;
  }

  #setupRenderer() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.dom.canvas,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(this.canvasWidth, this.canvasHeight);
  }

  /**
   * Sets up WebGL error handling
   * Handles context loss/restoration gracefully
   * @private
   */
  #setupWebGLErrorHandling() {
    this.dom.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      console.warn('WebGL context lost. Pausing simulation...');
      this.isPaused = true;

      // Show user-friendly message
      if (this.dom.avgLabel) {
        this.dom.avgLabel.textContent = 'WebGL context lost';
      }
    });

    this.dom.canvas.addEventListener('webglcontextrestored', () => {
      console.log('WebGL context restored. Reinitializing...');

      // Reinitialize renderer and computation
      try {
        this.#setupRenderer();
        this.#initComputeRenderer();
        this.#setupDisplay();
        this.isPaused = false;
        console.log('Simulation restored successfully');
      } catch (error) {
        console.error('Failed to restore WebGL context:', error);
        alert('Failed to restore WebGL. Please refresh the page.');
      }
    });
  }

  #initComputeRenderer() {
    this.computeRenderer = new GPUComputationRenderer(
      this.simulationSize,
      this.simulationSize,
      this.renderer,
    );

    const initialTexture = this.computeRenderer.createTexture();
    const initialTraitTexture = this.computeRenderer.createTexture();
    const initialFlowTexture = this.computeRenderer.createTexture();
    seedPattern(initialTexture, this.dynamicsMode);
    seedTraitPattern(initialTraitTexture);
    seedFlowPattern(initialFlowTexture);

    this.interactionTexture = this.computeRenderer.createTexture();
    clearTexture(this.interactionTexture);

    const fieldVariable = this.computeRenderer.addVariable(
      'field',
      getLifecycleShader(),
      initialTexture,
    );
    const traitVariable = this.computeRenderer.addVariable(
      'trait',
      getTraitShader(),
      initialTraitTexture,
    );
    const flowVariable = this.computeRenderer.addVariable(
      'flow',
      getFlowShader(),
      initialFlowTexture,
    );

    fieldVariable.material.uniforms = {
      innerRadius: { value: this.params.innerRadius },
      innerStrength: { value: this.params.innerStrength },
      outerRadius: { value: this.params.outerRadius },
      outerStrength: { value: this.params.outerStrength },
      dynamicsMode: { value: this.dynamicsMode },
      growthCenter: { value: this.params.growthCenter },
      growthWidth: { value: this.params.growthWidth },
      growthRate: { value: this.params.growthRate },
      suppressionFactor: { value: this.params.suppressionFactor },
      globalAverage: { value: 0.0 },
      decayRate: { value: this.params.decayRate },
      diffusionRate: { value: this.params.diffusionRate },
      fissionThreshold: { value: this.params.fissionThreshold },
      instabilityFactor: { value: this.params.instabilityFactor },
      interactionTexture: { value: this.interactionTexture },
      extendedMode: { value: this.extendedMode },
      erosionThreshold: { value: this.params.erosionThreshold },
      erosionRate: { value: this.params.erosionRate },
      terrainDiffusion: { value: this.params.terrainDiffusion },
      overflowCap: { value: this.params.overflowCap },
      overflowLeak: { value: this.params.overflowLeak },
      overflowNoise: { value: this.params.overflowNoise },
      terrainCostCoef: { value: this.params.terrainCostCoef },
      terrainRepelCoef: { value: this.params.terrainRepelCoef },
      hierarchyAlignment: { value: this.params.hierarchyAlignment },
      unitGain: { value: this.params.unitGain },
      unitDecay: { value: this.params.unitDecay },
      promotionThreshold: { value: this.params.promotionThreshold },
      coarseFeedback: { value: this.params.coarseFeedback },
      lineagePressure: { value: this.params.lineagePressure },
      traitMutation: { value: this.params.traitMutation },
      nicheMemory: { value: this.params.nicheMemory },
      asyncMix: { value: this.params.asyncMix },
      rotatedKernelMix: { value: this.params.rotatedKernelMix },
      flowCoupling: { value: this.params.flowCoupling },
      flowMemory: { value: this.params.flowMemory },
      flowResponse: { value: this.params.flowResponse },
      framePhase: { value: 0 },
      texelSize: {
        value: new THREE.Vector2(1.0 / this.simulationSize, 1.0 / this.simulationSize),
      },
    };

    traitVariable.material.uniforms = {
      dynamicsMode: { value: this.dynamicsMode },
      hierarchyAlignment: { value: this.params.hierarchyAlignment },
      coarseFeedback: { value: this.params.coarseFeedback },
      lineagePressure: { value: this.params.lineagePressure },
      traitMutation: { value: this.params.traitMutation },
      nicheMemory: { value: this.params.nicheMemory },
      flowCoupling: { value: this.params.flowCoupling },
      texelSize: {
        value: new THREE.Vector2(1.0 / this.simulationSize, 1.0 / this.simulationSize),
      },
    };

    flowVariable.material.uniforms = {
      dynamicsMode: { value: this.dynamicsMode },
      flowMemory: { value: this.params.flowMemory },
      flowResponse: { value: this.params.flowResponse },
      flowCoupling: { value: this.params.flowCoupling },
      lineagePressure: { value: this.params.lineagePressure },
      texelSize: {
        value: new THREE.Vector2(1.0 / this.simulationSize, 1.0 / this.simulationSize),
      },
    };

    this.computeRenderer.setVariableDependencies(fieldVariable, [
      fieldVariable,
      traitVariable,
      flowVariable,
    ]);
    this.computeRenderer.setVariableDependencies(traitVariable, [
      fieldVariable,
      traitVariable,
      flowVariable,
    ]);
    this.computeRenderer.setVariableDependencies(flowVariable, [
      fieldVariable,
      traitVariable,
      flowVariable,
    ]);
    this.computeVariables.field = fieldVariable;
    this.computeVariables.trait = traitVariable;
    this.computeVariables.flow = flowVariable;

    const error = this.computeRenderer.init();
    if (error !== null) {
      console.error(error);
    }
  }

  #setupDisplay() {
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        fieldTexture: { value: null },
        traitTexture: { value: null },
        flowTexture: { value: null },
        viewMode: { value: this.viewMode },
        dynamicsMode: { value: this.dynamicsMode },
      },
      vertexShader: getDisplayVertexShader(),
      fragmentShader: getDisplayFragmentShader(),
    });

    const mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(mesh);
  }

  #setupControls() {
    if (this.dom.toggleControls) {
      this.dom.toggleControls.addEventListener('click', () => {
        this.dom.controls.classList.toggle('collapsed');
      });
    }

    PARAM_CONTROL_IDS.forEach((param) => {
      const slider = document.getElementById(param);
      const input = document.getElementById(`${param}Value`);
      if (!slider || !input) return;

      const updateValue = (value) => {
        const numeric = parseFloat(value);
        if (Number.isNaN(numeric)) return;
        this.params[param] = numeric;
        slider.value = numeric;
        input.value = numeric;

        if (this.computeVariables.field?.material?.uniforms[param]) {
          this.computeVariables.field.material.uniforms[param].value = numeric;
        }
        if (this.computeVariables.trait?.material?.uniforms[param]) {
          this.computeVariables.trait.material.uniforms[param].value = numeric;
        }
        if (this.computeVariables.flow?.material?.uniforms[param]) {
          this.computeVariables.flow.material.uniforms[param].value = numeric;
        }
      };

      updateValue(this.params[param]);

      slider.addEventListener('input', (event) =>
        updateValue(event.target.value),
      );
      input.addEventListener('input', (event) =>
        updateValue(event.target.value),
      );
      slider.addEventListener('wheel', (event) => {
        event.preventDefault();
        const step = parseFloat(slider.step) || 0.01;
        const delta = event.deltaY > 0 ? -step : step;
        const nextValue = Math.max(
          parseFloat(slider.min),
          Math.min(
            parseFloat(slider.max),
            parseFloat(slider.value) + delta * 10,
          ),
        );
        updateValue(nextValue);
      });
    });

    this.dom.speedButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.dom.speedButtons.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        this.speedMultiplier = parseInt(button.dataset.speed, 10);
        this.isPaused = this.speedMultiplier === 0;
      });
    });

    this.dom.modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.dom.modeButtons.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        const mode = button.dataset.mode;
        if (INTERACTION_MODES.includes(mode)) {
          this.interactionMode = mode;
        }
      });
    });

    if (this.dom.savePreset) {
      this.dom.savePreset.addEventListener('click', () => {
        try {
          const preset = JSON.stringify(this.params);
          localStorage.setItem('energyLifePreset', preset);
          alert('Preset saved!');
        } catch (error) {
          console.error('Failed to save preset:', error);
          if (error.name === 'QuotaExceededError') {
            alert('Storage quota exceeded. Cannot save preset.');
          } else {
            alert('Failed to save preset. Check console for details.');
          }
        }
      });
    }

    if (this.dom.loadPreset) {
      this.dom.loadPreset.addEventListener('click', () => {
        try {
          const preset = localStorage.getItem('energyLifePreset');
          if (!preset) {
            alert('No saved preset found.');
            return;
          }

          const loaded = JSON.parse(preset);
          this.#applyLoadedParams(loaded);
          alert('Preset loaded!');
        } catch (error) {
          console.error('Failed to load preset:', error);
          alert('Failed to load preset. It may be corrupted.');
        }
      });
    }

    // Save/load params to JSON file
    if (this.dom.saveParamsFile) {
      this.dom.saveParamsFile.addEventListener('click', () => {
        this.#saveParamsToFile();
      });
    }

    if (this.dom.loadParamsFile) {
      this.dom.loadParamsFile.addEventListener('click', () => {
        this.#loadParamsFromFile();
      });
    }

    if (this.dom.simulationSize) {
      this.dom.simulationSize.addEventListener('change', (event) => {
        const newSize = parseInt(event.target.value, 10);
        if (newSize === this.simulationSize) return;

        this.simulationSize = newSize;
        this.#reinitializeSimulation();
      });
    }

    if (this.dom.dynamicsModeSelect) {
      this.dom.dynamicsModeSelect.value = this.#getDynamicsModeKey(this.dynamicsMode);
      this.dom.dynamicsModeSelect.addEventListener('change', (event) => {
        const modeMap = {
          hierarchy: 1,
          terrain: 0,
        };
        const nextMode = modeMap[event.target.value] ?? 0;
        if (nextMode === this.dynamicsMode) return;
        this.#applyDynamicsMode(nextMode, true);
      });
    }

    // Recording controls
    if (document.getElementById('startRecording')) {
      this.dataRecorder = new DataRecorder();

      document
        .getElementById('startRecording')
        .addEventListener('click', () => {
          this.dataRecorder.startRecording();
          document.getElementById('recordingStatus').textContent =
            '🔴 Recording';
          document
            .getElementById('recordingStatus')
            .classList.add('recording');
          document.getElementById('startRecording').disabled = true;
          document.getElementById('stopRecording').disabled = false;
        });

      document.getElementById('stopRecording').addEventListener('click', () => {
        const data = this.dataRecorder.stopRecording(this);
        this.dataRecorder.downloadJSON(data, 'energy-life-history');
        document.getElementById('recordingStatus').textContent =
          '⚫ Not Recording';
        document
          .getElementById('recordingStatus')
          .classList.remove('recording');
        document.getElementById('startRecording').disabled = false;
        document.getElementById('stopRecording').disabled = true;
      });

      document
        .getElementById('captureSnapshot')
        .addEventListener('click', () => {
          // Request snapshot - actual capture happens in next animate frame
          // Pass simulation instance to handle paused state
          this.dataRecorder.captureSnapshot(this);
          // Visual feedback moved to animate loop after actual capture
        });

      document
        .getElementById('recordInterval')
        .addEventListener('change', (e) => {
          this.dataRecorder.recordingFrameInterval = parseInt(e.target.value);
        });
    }

    // Extended R/M/C toggle (defaults off to preserve legacy look)
    if (this.dom.extendedToggle) {
      this.dom.extendedToggle.checked = this.extendedMode > 0;
      this.dom.extendedToggle.addEventListener('change', (e) => {
        this.extendedMode = e.target.checked ? 1 : 0;
        this.params.extendedMode = this.extendedMode;
        if (this.computeVariables.field?.material?.uniforms.extendedMode) {
          this.computeVariables.field.material.uniforms.extendedMode.value =
            this.extendedMode;
        }
      });
    }

    // Layer view selector
    if (this.dom.layerSelect) {
      this.dom.layerSelect.value = 'composite';
      this.dom.layerSelect.addEventListener('change', (e) => {
        const modeMap = {
          composite: 0,
          energy: 1,
          secondary: 2,
          lift: 3,
          abSplit: 4,
          phase: 5,
          lineage: 6,
          niche: 7,
          flow: 8,
        };
        this.viewMode = modeMap[e.target.value] ?? 0;
        if (this.material?.uniforms?.viewMode) {
          this.material.uniforms.viewMode.value = this.viewMode;
        }
      });
    }

    this.#syncModeUiState();
  }

  #setupChart() {
    if (!this.dom.chartCanvas) return;
    this.chartCtx = this.dom.chartCanvas.getContext('2d');
    this.dom.chartCanvas.width = CHART_CANVAS_WIDTH;
    this.dom.chartCanvas.height = CHART_CANVAS_HEIGHT;

    this.dom.chartCanvas.style.display = this.chartEnabled ? 'block' : 'none';
    if (this.dom.chart) {
      this.dom.chart.classList.toggle('is-open', this.chartEnabled);
    }
    if (this.dom.toggleChart) {
      this.dom.toggleChart.classList.toggle('active', this.chartEnabled);
    }
    if (this.dom.recordingControls) {
      this.dom.recordingControls.classList.toggle(
        'chart-open',
        this.chartEnabled,
      );
    }

    // Setup chart toggle button
    if (this.dom.toggleChart) {
      this.dom.toggleChart.addEventListener('click', () => {
        this.chartEnabled = !this.chartEnabled;
        this.dom.toggleChart.classList.toggle('active', this.chartEnabled);
        if (this.dom.chart) {
          this.dom.chart.classList.toggle('is-open', this.chartEnabled);
        }
        if (this.dom.recordingControls) {
          this.dom.recordingControls.classList.toggle(
            'chart-open',
            this.chartEnabled,
          );
        }
        this.dom.chartCanvas.style.display = this.chartEnabled
          ? 'block'
          : 'none';
      });
    }
  }

  #updateChart(avgEnergy) {
    if (!this.chartCtx) return;
    this.chartHistory.push(avgEnergy);
    if (this.chartHistory.length > CHART_HISTORY_LENGTH) {
      this.chartHistory.shift();
    }

    const { width, height } = this.chartCtx.canvas;
    this.chartCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    this.chartCtx.fillRect(0, 0, width, height);

    this.chartCtx.strokeStyle = '#00ffcc';
    this.chartCtx.lineWidth = 2;
    this.chartCtx.beginPath();

    // Downsample for performance: draw every Nth point
    const step = CHART_DOWNSAMPLE_FACTOR;
    for (let i = 0; i < this.chartHistory.length; i += step) {
      const x = (i / CHART_HISTORY_LENGTH) * width;
      const y = height - this.chartHistory[i] * height * 2;
      if (i === 0) {
        this.chartCtx.moveTo(x, y);
      } else {
        this.chartCtx.lineTo(x, y);
      }
    }

    this.chartCtx.stroke();

    this.chartCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.chartCtx.lineWidth = 0.5;
    for (let i = 0; i <= CHART_GRID_DIVISIONS; i++) {
      const y = (i / CHART_GRID_DIVISIONS) * height;
      this.chartCtx.beginPath();
      this.chartCtx.moveTo(0, y);
      this.chartCtx.lineTo(width, y);
      this.chartCtx.stroke();
    }
  }

  #setupInteraction() {
    this.dom.canvas.addEventListener('mousedown', (event) => {
      this.isMouseDown = true;
      this.#updateMousePos(event);
    });

    this.dom.canvas.addEventListener('mousemove', (event) => {
      if (this.isMouseDown) {
        this.#updateMousePos(event);
      }
    });

    const endInteraction = () => {
      this.isMouseDown = false;
      clearTexture(this.interactionTexture);
      this.#updateInteractionTexture();
    };

    this.dom.canvas.addEventListener('mouseup', endInteraction);
    this.dom.canvas.addEventListener('mouseleave', endInteraction);
  }

  #setupKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        this.isPaused = !this.isPaused;
        this.speedMultiplier = this.isPaused ? 0 : 1;
        this.dom.speedButtons.forEach((btn) => {
          btn.classList.toggle(
            'active',
            parseInt(btn.dataset.speed, 10) === this.speedMultiplier,
          );
        });
      } else if (event.code === 'Digit2') {
        event.preventDefault();
        this.isPaused = false;
        this.speedMultiplier = 2;
        this.dom.speedButtons.forEach((btn) => {
          btn.classList.toggle(
            'active',
            parseInt(btn.dataset.speed, 10) === this.speedMultiplier,
          );
        });
      } else if (event.code === 'Digit3') {
        event.preventDefault();
        this.isPaused = false;
        this.speedMultiplier = 5;
        this.dom.speedButtons.forEach((btn) => {
          btn.classList.toggle(
            'active',
            parseInt(btn.dataset.speed, 10) === this.speedMultiplier,
          );
        });
      }
    });
  }

  #setupResize() {
    let isResizing = false;
    let currentHandle = null;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    this.dom.resizeHandles.forEach((handle) => {
      handle.addEventListener('mousedown', (event) => {
        isResizing = true;
        currentHandle = handle;
        startX = event.clientX;
        startY = event.clientY;
        startWidth = this.canvasWidth;
        startHeight = this.canvasHeight;
        event.preventDefault();
      });
    });

    document.addEventListener('mousemove', (event) => {
      if (!isResizing) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (currentHandle.classList.contains('right')) {
        this.canvasWidth = Math.max(
          MIN_CANVAS_WIDTH,
          Math.min(
            window.innerWidth - MAX_CANVAS_WIDTH_OFFSET,
            startWidth + deltaX,
          ),
        );
      } else if (currentHandle.classList.contains('bottom')) {
        this.canvasHeight = Math.max(
          MIN_CANVAS_HEIGHT,
          Math.min(
            window.innerHeight - MAX_CANVAS_HEIGHT_OFFSET,
            startHeight + deltaY,
          ),
        );
      } else if (currentHandle.classList.contains('corner')) {
        this.canvasWidth = Math.max(
          MIN_CANVAS_WIDTH,
          Math.min(
            window.innerWidth - MAX_CANVAS_WIDTH_OFFSET,
            startWidth + deltaX,
          ),
        );
        this.canvasHeight = Math.max(
          MIN_CANVAS_HEIGHT,
          Math.min(
            window.innerHeight - MAX_CANVAS_HEIGHT_OFFSET,
            startHeight + deltaY,
          ),
        );
      }

      this.dom.container.style.width = `${this.canvasWidth}px`;
      this.dom.container.style.height = `${this.canvasHeight}px`;
      this.renderer.setSize(this.canvasWidth, this.canvasHeight);
    });

    document.addEventListener('mouseup', () => {
      isResizing = false;
      currentHandle = null;
    });
  }

  #updateMousePos(event) {
    const rect = this.dom.canvas.getBoundingClientRect();
    this.mousePos.x = (event.clientX - rect.left) / rect.width;
    this.mousePos.y = 1.0 - (event.clientY - rect.top) / rect.height;
  }

  #computeAverage(fieldTexture) {
    this.#ensureDownsamplePipeline();

    let currentTexture = fieldTexture;
    for (const pass of this.downsamplePasses) {
      pass.material.uniforms.inputTexture.value = currentTexture;
      pass.material.uniforms.texelSize.value.set(
        1 / pass.inputSize,
        1 / pass.inputSize,
      );
      this.downsampleMesh.material = pass.material;
      this.renderer.setRenderTarget(pass.renderTarget);
      this.renderer.render(this.downsampleScene, this.downsampleCamera);
      currentTexture = pass.renderTarget.texture;
    }

    const lastPass = this.downsamplePasses[this.downsamplePasses.length - 1];
    this.renderer.setRenderTarget(null);
    this.renderer.readRenderTargetPixels(
      lastPass.renderTarget,
      0,
      0,
      1,
      1,
      this.averageBuffer,
    );

    return this.averageBuffer[0];
  }

  #ensureDownsamplePipeline() {
    if (this.downsamplePasses.length > 0) {
      return;
    }

    this.downsampleScene = new THREE.Scene();
    this.downsampleCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.downsampleMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial(),
    );
    this.downsampleScene.add(this.downsampleMesh);

    let size = this.simulationSize;
    while (size > 1) {
      const outputSize = Math.max(1, size >> 1);
      const renderTarget = new THREE.WebGLRenderTarget(outputSize, outputSize, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
      });
      renderTarget.texture.wrapS = THREE.ClampToEdgeWrapping;
      renderTarget.texture.wrapT = THREE.ClampToEdgeWrapping;

      const material = new THREE.ShaderMaterial({
        uniforms: {
          inputTexture: { value: null },
          texelSize: { value: new THREE.Vector2(1 / size, 1 / size) },
        },
        vertexShader: `void main() { gl_Position = vec4(position, 1.0); }`,
        fragmentShader: getDownsampleFragmentShader(),
      });

      this.downsamplePasses.push({
        inputSize: size,
        outputSize,
        renderTarget,
        material,
      });

      size = outputSize;
    }

    this.averageBuffer = new Float32Array(4);
  }

  #updateInteractionTexture() {
    if (this.isMouseDown) {
      updateInteractionTexture(
        this.interactionTexture,
        this.mousePos,
        this.interactionMode,
        this.simulationSize,
        INTERACTION_RADIUS,
      );
    }

    if (this.computeVariables.field) {
      this.computeVariables.field.material.uniforms.interactionTexture.value =
        this.interactionTexture;
    }
  }

  #updateAverageEnergy(average) {
    if (this.dom.avgLabel) {
      this.dom.avgLabel.textContent = average.toFixed(3);
    }

    // Only update chart if enabled and throttle counter reached
    if (this.chartEnabled) {
      this.chartUpdateCounter++;
      if (this.chartUpdateCounter >= CHART_UPDATE_THROTTLE) {
        this.#updateChart(average);
        this.chartUpdateCounter = 0;
      }
    }
  }

  #updateFps() {
    this.frameCount += 1;
    const currentTime = performance.now();
    if (currentTime - this.lastTime > FPS_UPDATE_INTERVAL) {
      const fps =
        (this.frameCount * FPS_UPDATE_INTERVAL) / (currentTime - this.lastTime);
      if (this.dom.fpsLabel) {
        this.dom.fpsLabel.textContent = fps.toFixed(1);
      }
      this.frameCount = 0;
      this.lastTime = currentTime;
    }
  }

  #applyDynamicsMode(modeValue, reinitialize = false) {
    this.dynamicsMode = modeValue;
    this.params.dynamicsMode = this.dynamicsMode;

    if (this.dom.dynamicsModeSelect) {
      this.dom.dynamicsModeSelect.value = this.#getDynamicsModeKey(this.dynamicsMode);
    }

    if (this.computeVariables.field?.material?.uniforms?.dynamicsMode) {
      this.computeVariables.field.material.uniforms.dynamicsMode.value = this.dynamicsMode;
    }

    if (this.computeVariables.trait?.material?.uniforms?.dynamicsMode) {
      this.computeVariables.trait.material.uniforms.dynamicsMode.value = this.dynamicsMode;
    }

    if (this.computeVariables.flow?.material?.uniforms?.dynamicsMode) {
      this.computeVariables.flow.material.uniforms.dynamicsMode.value = this.dynamicsMode;
    }

    if (this.material?.uniforms?.dynamicsMode) {
      this.material.uniforms.dynamicsMode.value = this.dynamicsMode;
    }

    this.#syncModeUiState();

    if (reinitialize) {
      this.#reinitializeSimulation();
    }
  }

  #getDynamicsModeKey(modeValue) {
    if (modeValue > 0.5) return 'hierarchy';
    return 'terrain';
  }

  #syncModeUiState() {
    const isTerrainMode = this.dynamicsMode < 0.5;
    if (this.dom.extendedToggle) {
      this.dom.extendedToggle.disabled = !isTerrainMode;
    }

    if (this.dom.layerSelect) {
      const labels = {
        terrain: ['Composite', 'Energy', 'Terrain', 'Lift', 'Channel Split', 'Phase Flip', 'Lineage', 'Niche', 'Flow'],
        hierarchy: ['Composite', 'Energy', 'Unitness', 'Echo', 'RGB Split', 'Phase Flip', 'Lineage', 'Niche', 'Flow'],
      };
      const modeKey = this.#getDynamicsModeKey(this.dynamicsMode);
      const current = labels[modeKey];
      const options = this.dom.layerSelect.options;
      if (options[0]) options[0].textContent = current[0];
      if (options[1]) options[1].textContent = current[1];
      if (options[2]) options[2].textContent = current[2];
      if (options[3]) options[3].textContent = current[3];
      if (options[4]) options[4].textContent = current[4];
      if (options[5]) options[5].textContent = current[5];
      if (options[6]) options[6].textContent = current[6];
      if (options[7]) options[7].textContent = current[7];
      if (options[8]) options[8].textContent = current[8];
    }

    if (this.dom.terrainGroup) {
      this.dom.terrainGroup.style.display = isTerrainMode ? 'block' : 'none';
    }

    if (this.dom.hierarchyGroup) {
      this.dom.hierarchyGroup.style.display = isTerrainMode ? 'none' : 'block';
    }
  }

  #applyLoadedParams(loaded) {
    let reinitializeNeeded = false;

    Object.keys(loaded).forEach((key) => {
      if (!(key in this.params)) return;
      this.params[key] = loaded[key];
      const slider = document.getElementById(key);
      const input = document.getElementById(`${key}Value`);
      if (slider) slider.value = loaded[key];
      if (input) input.value = loaded[key];
      if (this.computeVariables.field?.material?.uniforms[key]) {
        this.computeVariables.field.material.uniforms[key].value = loaded[key];
      }
      if (this.computeVariables.trait?.material?.uniforms[key]) {
        this.computeVariables.trait.material.uniforms[key].value = loaded[key];
      }
      if (this.computeVariables.flow?.material?.uniforms[key]) {
        this.computeVariables.flow.material.uniforms[key].value = loaded[key];
      }
      if (key === 'dynamicsMode') {
        reinitializeNeeded = true;
      }
      if (key === 'extendedMode') {
        this.extendedMode = loaded[key] > 0 ? 1 : 0;
        if (this.dom.extendedToggle) {
          this.dom.extendedToggle.checked = this.extendedMode > 0;
        }
        if (this.computeVariables.field?.material?.uniforms.extendedMode) {
          this.computeVariables.field.material.uniforms.extendedMode.value =
            this.extendedMode;
        }
      }
    });

    if ('dynamicsMode' in loaded) {
      this.#applyDynamicsMode(loaded.dynamicsMode, false);
    }

    if (reinitializeNeeded) {
      this.#reinitializeSimulation();
    }
  }

  async #saveParamsToFile() {
    const data = JSON.stringify(this.params, null, 2);
    const filename = `energy-params-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`;
    try {
      if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker();
        const folderHandle = await dirHandle.getDirectoryHandle('saved-params', {
          create: true,
        });
        const fileHandle = await folderHandle.getFileHandle(filename, {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        alert(`Saved to saved-params/${filename}`);
        return;
      }
    } catch (error) {
      console.error('Directory save failed, falling back to download:', error);
    }

    // Fallback: simple download
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async #loadParamsFromFile() {
    try {
      if (!window.showOpenFilePicker) {
        alert('File picker not supported in this browser.');
        return;
      }
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] },
          },
        ],
        excludeAcceptAllOption: false,
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      const loaded = JSON.parse(text);
      this.#applyLoadedParams(loaded);
      alert('Parameters loaded from file.');
    } catch (error) {
      console.error('Failed to load params from file:', error);
      alert('Failed to load params file. See console for details.');
    }
  }

  #reinitializeSimulation() {
    // Dispose old compute renderer
    if (this.computeRenderer) {
      this.computeRenderer.dispose();
    }

    this.computeVariables = {};
    this.#disposeDownsamplePipeline();
    this.simulationStep = 0;

    // Clear chart history
    this.chartHistory = [];

    // Reinitialize compute renderer with new size
    this.#initComputeRenderer();
  }

  #disposeDownsamplePipeline() {
    for (const pass of this.downsamplePasses) {
      if (pass.material) pass.material.dispose();
      if (pass.renderTarget) pass.renderTarget.dispose();
    }
    this.downsamplePasses = [];
    this.downsampleScene = null;
    this.downsampleCamera = null;
    this.downsampleMesh = null;
    this.averageBuffer = null;
  }
}
