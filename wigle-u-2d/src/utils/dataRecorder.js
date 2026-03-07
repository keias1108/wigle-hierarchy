/**
 * DataRecorder - Sensor/Logger for Energy Life Simulation
 *
 * Records raw energy grid data without analysis.
 * LLM performs all pattern detection and analysis.
 *
 * @class
 */
export class DataRecorder {
  constructor() {
    this.isRecording = false;
    this.pendingSnapshot = false; // Flag for deferred snapshot capture
    this.recordingHistory = [];
    this.recordingStartTime = null;
    this.recordingFrameInterval = 10; // Record every N frames
    this.frameCounter = 0;
    this.gridSize = 128; // Default grid size
    this.maxHistoryFrames = 1000; // Memory limit
  }

  /**
   * Start recording frames
   */
  startRecording() {
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    this.recordingHistory = [];
    this.frameCounter = 0;
    console.log('Recording started');
  }

  /**
   * Stop recording and return history data
   * @param {Object} simulation - EnergyLifeSimulation instance
   * @returns {Object} History JSON data
   */
  stopRecording(simulation) {
    this.isRecording = false;
    const recordingEndTime = Date.now();

    const historyData = {
      type: 'history',
      recordingStartTime: new Date(this.recordingStartTime).toISOString(),
      recordingEndTime: new Date(recordingEndTime).toISOString(),
      totalFrames: this.recordingHistory.length,
      recordingInterval: this.recordingFrameInterval,

      config: {
        gridSize: this.gridSize,
        params: { ...simulation.params },
      },

      frames: this.recordingHistory,

      note: 'LLM: ascii_binary를 프레임별로 비교하여 패턴 변화, 이동, 진동을 직접 찾아주세요.',
    };

    console.log(`Recording stopped. Captured ${this.recordingHistory.length} frames`);
    return historyData;
  }

  /**
   * Record a single frame (called from animate loop)
   * @param {Object} simulation - EnergyLifeSimulation instance
   * @param {THREE.WebGLRenderTarget} renderTarget - Current field render target
   */
  recordFrame(simulation, renderTarget) {
    if (!this.isRecording) return;

    this.frameCounter++;
    if (this.frameCounter % this.recordingFrameInterval !== 0) return;

    // Get grid size from UI if available
    const gridSizeSelect = document.getElementById('gridSize');
    if (gridSizeSelect) {
      this.gridSize = parseInt(gridSizeSelect.value);
    }

    // Extract energy grid
    const energyGrid = this.extractGridData(
      renderTarget,
      simulation.renderer,
      this.gridSize,
    );

    // Generate ASCII representations
    const asciiBinary = this.generateBinaryASCII(energyGrid);
    const asciiLevels = this.generateMultiLevelASCII(energyGrid);

    // Get basic stats
    const stats = this.getBasicStats(energyGrid);

    const frameData = {
      timestamp: new Date().toISOString(),
      frameNumber: simulation.frameCount || this.frameCounter,
      energyGrid: energyGrid,
      ascii_binary: asciiBinary,
      ascii_levels: asciiLevels,
      mean: stats.mean,
    };

    this.recordingHistory.push(frameData);

    // Memory management: limit to maxHistoryFrames
    if (this.recordingHistory.length > this.maxHistoryFrames) {
      this.recordingHistory.shift();
      console.warn(
        `Recording frame limit reached (${this.maxHistoryFrames}). Removing oldest frame.`,
      );
    }
  }

  /**
   * Request a snapshot to be captured on the next animation frame
   * (Actual capture happens in captureSnapshotNow called from animate loop)
   * @param {Object} simulation - EnergyLifeSimulation instance (optional)
   */
  captureSnapshot(simulation) {
    this.pendingSnapshot = true;
    console.log('Snapshot requested - will capture on next frame');

    // Force one animation frame if paused
    if (simulation && simulation.isPaused) {
      console.log('Simulation is paused - forcing one frame manually');
      // Manually execute one compute step without starting animation loop
      simulation.computeRenderer.compute();
      simulation.computeFrameCounter++;

      // Get the current render target after compute
      const currentRenderTarget =
        simulation.computeRenderer.getCurrentRenderTarget(
          simulation.computeVariables.field,
        );

      // Capture immediately
      this.pendingSnapshot = false;
      const snapshot = this.captureSnapshotNow(simulation, currentRenderTarget);
      this.downloadJSON(snapshot, 'energy-life-snapshot');

      // Visual feedback
      const btn = document.getElementById('captureSnapshot');
      if (btn) {
        btn.textContent = '✓ Saved!';
        setTimeout(() => {
          btn.textContent = '📸 Snapshot';
        }, 1500);
      }
    }
  }

  /**
   * Capture snapshot NOW - called from animation loop with fresh renderTarget
   * @param {Object} simulation - EnergyLifeSimulation instance
   * @param {THREE.WebGLRenderTarget} renderTarget - Fresh render target from current frame
   * @returns {Object} Snapshot JSON data
   */
  captureSnapshotNow(simulation, renderTarget) {
    // Get grid size from UI if available
    const gridSizeSelect = document.getElementById('gridSize');
    const gridSize = gridSizeSelect ? parseInt(gridSizeSelect.value) : 128;

    // Extract energy grid from FRESH render target
    const energyGrid = this.extractGridData(
      renderTarget,
      simulation.renderer,
      gridSize,
    );

    // Generate ASCII representations
    const asciiBinary = this.generateBinaryASCII(energyGrid);
    const asciiLevels = this.generateMultiLevelASCII(energyGrid);

    // Get basic stats
    const stats = this.getBasicStats(energyGrid);

    const snapshot = {
      type: 'snapshot',
      timestamp: new Date().toISOString(),
      frameNumber: simulation.frameCount || 0,

      config: {
        gridSize: gridSize,
        params: { ...simulation.params },
      },

      data: {
        gridSize: gridSize,
        energyGrid: energyGrid,

        basicStats: stats,

        ascii_binary: asciiBinary,
        ascii_levels: asciiLevels,

        note: 'LLM: ascii_binary를 보고 반복 패턴(■■■■□□□□), 체커보드, 대칭성 등을 직접 찾아주세요. energyGrid는 정확한 수치 분석용입니다.',
      },
    };

    console.log(`Snapshot captured: ${gridSize}×${gridSize} grid`);
    return snapshot;
  }

  /**
   * Extract energy grid from GPU texture
   * @param {THREE.WebGLRenderTarget} renderTarget - Render target to read from
   * @param {THREE.WebGLRenderer} renderer - WebGL renderer
   * @param {number} gridSize - Desired grid size (64/128/256/512)
   * @returns {Array<Array<number>>} 2D energy grid
   */
  extractGridData(renderTarget, renderer, gridSize) {
    // Use actual render target size (not hardcoded 512)
    const fullSize = renderTarget.width;
    const fullBuffer = new Float32Array(fullSize * fullSize * 4);

    // Read pixels directly from the render target
    // (GPUComputationRenderer has already rendered to it, so we can read directly)
    renderer.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      fullSize,
      fullSize,
      fullBuffer,
    );

    // Downsample to desired grid size
    const energyGrid = [];
    const step = fullSize / gridSize;

    for (let y = 0; y < gridSize; y++) {
      const row = [];
      for (let x = 0; x < gridSize; x++) {
        const srcX = Math.floor(x * step);
        const srcY = Math.floor(y * step);
        const idx = (srcY * fullSize + srcX) * 4;
        const energy = fullBuffer[idx]; // Red channel = energy [0,1]
        row.push(parseFloat(energy.toFixed(4))); // 4 decimal places
      }
      energyGrid.push(row);
    }

    // Data validation: count non-zero values
    const nonZeroCount = energyGrid.flat().filter((v) => v > 0).length;
    const totalCells = gridSize * gridSize;
    console.log(
      `Extracted ${gridSize}×${gridSize} grid: ${nonZeroCount}/${totalCells} non-zero values (${((nonZeroCount / totalCells) * 100).toFixed(1)}%)`,
    );

    return energyGrid;
  }

  /**
   * Generate binary ASCII map (■□ pattern)
   * Best for pattern detection
   * @param {Array<Array<number>>} grid - Energy grid
   * @param {number} threshold - Binary threshold (default 0.5)
   * @returns {string} ASCII representation
   */
  generateBinaryASCII(grid, threshold = 0.5) {
    const lines = [];
    for (const row of grid) {
      let s = '';
      for (const e of row) {
        s += e > threshold ? '■' : '□';
      }
      lines.push(s);
    }
    return lines.join('\n');
  }

  /**
   * Generate multi-level ASCII map (░▒▓█ gradient)
   * For visualization purposes
   * @param {Array<Array<number>>} grid - Energy grid
   * @param {Array<number>} thresholds - Energy level thresholds
   * @returns {string} ASCII representation
   */
  generateMultiLevelASCII(grid, thresholds = [0.2, 0.4, 0.6, 0.8]) {
    const chars = [' ', '░', '▒', '▓', '█'];
    const lines = [];

    for (const row of grid) {
      let s = '';
      for (const energy of row) {
        let charIndex = 0;
        for (let i = 0; i < thresholds.length; i++) {
          if (energy > thresholds[i]) charIndex = i + 1;
        }
        s += chars[charIndex];
      }
      lines.push(s);
    }

    return lines.join('\n');
  }

  /**
   * Calculate basic statistics (only what LLM can't easily compute)
   * @param {Array<Array<number>>} grid - Energy grid
   * @returns {Object} Basic statistics
   */
  getBasicStats(grid) {
    const flat = grid.flat();
    const sum = flat.reduce((a, b) => a + b, 0);
    const mean = sum / flat.length;
    const sorted = [...flat].sort((a, b) => a - b);

    return {
      mean: mean.toFixed(4),
      min: sorted[0].toFixed(4),
      max: sorted[sorted.length - 1].toFixed(4),
      median: sorted[Math.floor(sorted.length / 2)].toFixed(4),
    };
  }

  /**
   * Download data as JSON file
   * @param {Object} data - Data to download
   * @param {string} filenamePrefix - Filename prefix
   */
  downloadJSON(data, filenamePrefix) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${filenamePrefix}_${timestamp}.json`;

    // Convert to JSON string
    const jsonString = JSON.stringify(data, null, 2);

    // Create Blob
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    console.log(`Downloaded: ${filename} (${sizeMB} MB)`);
  }

  /**
   * Download data as plain text file
   * @param {string} text - Text content
   * @param {string} filenamePrefix - Filename prefix
   */
  downloadText(text, filenamePrefix) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${filenamePrefix}_${timestamp}.txt`;

    // Create Blob
    const blob = new Blob([text], { type: 'text/plain' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    console.log(`Downloaded: ${filename}`);
  }

  /**
   * Update recording duration display
   */
  updateRecordingDuration() {
    if (!this.isRecording) return;

    const elapsed = Date.now() - this.recordingStartTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    const durationEl = document.getElementById('recordingDuration');
    if (durationEl) {
      durationEl.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  }
}
