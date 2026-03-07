/**
 * GPU Computation Renderer
 *
 * Implements General-Purpose GPU (GPGPU) computation using WebGL.
 * Uses ping-pong rendering between two textures to simulate iterative updates.
 *
 * Based on THREE.js GPUComputationRenderer pattern.
 * @class
 */

const THREE = window.THREE;

export class GPUComputationRenderer {
  /**
   * Creates a GPU computation renderer
   *
   * @param {number} sizeX - Width of computation texture
   * @param {number} sizeY - Height of computation texture
   * @param {THREE.WebGLRenderer} renderer - Three.js WebGL renderer
   */
  constructor(sizeX, sizeY, renderer) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.renderer = renderer;

    this.passThruUniforms = {
      passTexture: { value: null },
    };
    this.passThruShader = this.#createPassThroughShader();
    this.variables = [];
    this.currentTextureIndex = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.camera.position.z = 1;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.passThruShader,
    );
    this.scene.add(this.mesh);
  }

  /**
   * Creates a floating-point data texture for GPU computation
   *
   * @returns {THREE.DataTexture} Float texture initialized to zero
   */
  createTexture() {
    const data = new Float32Array(this.sizeX * this.sizeY * 4);
    const texture = new THREE.DataTexture(
      data,
      this.sizeX,
      this.sizeY,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    texture.needsUpdate = true;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  /**
   * Adds a computation variable (shader + render targets)
   *
   * Creates ping-pong render targets for double buffering.
   *
   * @param {string} variableName - Uniform name for the variable
   * @param {string} fragmentShader - GLSL fragment shader code
   * @param {THREE.DataTexture} initialTexture - Initial state texture
   * @returns {Object} Variable object with material and render targets
   */
  addVariable(variableName, fragmentShader, initialTexture) {
    const material = new THREE.ShaderMaterial({
      fragmentShader,
      vertexShader: this.#getPassThroughVertexShader(),
    });

    const variable = {
      name: variableName,
      renderTargets: [],
      material,
      dependencies: [],
    };

    // Create two render targets for ping-pong rendering
    for (let i = 0; i < 2; i++) {
      const renderTarget = new THREE.WebGLRenderTarget(this.sizeX, this.sizeY, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
      });
      variable.renderTargets.push(renderTarget);
    }

    // Initialize both buffers
    this.renderTexture(initialTexture, variable.renderTargets[0]);
    this.renderTexture(initialTexture, variable.renderTargets[1]);

    this.variables.push(variable);
    return variable;
  }

  /**
   * Sets dependencies for a variable
   *
   * Dependencies are other variables whose textures will be
   * bound as uniforms in this variable's shader.
   *
   * @param {Object} variable - The variable to configure
   * @param {Array<Object>} dependencies - Array of dependent variables
   */
  setVariableDependencies(variable, dependencies) {
    variable.dependencies = dependencies;
  }

  /**
   * Initializes the computation renderer
   *
   * @returns {null} Returns null on success (for compatibility)
   */
  init() {
    return null;
  }

  /**
   * Performs one computation step
   *
   * Executes all variable shaders, ping-ponging between buffers.
   * Reads from current buffer, writes to next buffer, then swaps.
   */
  compute() {
    const currentTextureIndex = this.currentTextureIndex;
    const nextTextureIndex = (currentTextureIndex + 1) % 2;

    for (let i = 0; i < this.variables.length; i++) {
      const variable = this.variables[i];

      // Bind dependencies as uniforms
      for (let d = 0; d < variable.dependencies.length; d++) {
        const dependency = variable.dependencies[d];
        const name = dependency.name;
        variable.material.uniforms[name] = {
          value: dependency.renderTargets[currentTextureIndex].texture,
        };
      }

      // Execute shader: read from current, write to next
      this.mesh.material = variable.material;
      this.renderer.setRenderTarget(variable.renderTargets[nextTextureIndex]);
      this.renderer.render(this.scene, this.camera);
    }

    this.renderer.setRenderTarget(null);
    this.currentTextureIndex = nextTextureIndex;
  }

  /**
   * Gets the current (most recent) render target for a variable
   *
   * @param {Object} variable - The variable
   * @returns {THREE.WebGLRenderTarget} Current render target
   */
  getCurrentRenderTarget(variable) {
    return variable.renderTargets[this.currentTextureIndex];
  }

  /**
   * Renders a texture to a render target
   *
   * Used for initializing buffers.
   *
   * @param {THREE.Texture} texture - Source texture
   * @param {THREE.WebGLRenderTarget} renderTarget - Destination render target
   */
  renderTexture(texture, renderTarget) {
    this.passThruUniforms.passTexture.value = texture;
    this.mesh.material = this.passThruShader;
    this.renderer.setRenderTarget(renderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  /**
   * Creates the passthrough shader material
   * @private
   * @returns {THREE.ShaderMaterial} Passthrough shader material
   */
  #createPassThroughShader() {
    return new THREE.ShaderMaterial({
      uniforms: this.passThruUniforms,
      vertexShader: this.#getPassThroughVertexShader(),
      fragmentShader: this.#getPassThroughFragmentShader(),
    });
  }

  /**
   * Returns passthrough vertex shader
   * @private
   * @returns {string} GLSL vertex shader code
   */
  #getPassThroughVertexShader() {
    return `
                    void main() {
                        gl_Position = vec4(position, 1.0);
                    }
                `;
  }

  /**
   * Returns passthrough fragment shader
   * @private
   * @returns {string} GLSL fragment shader code
   */
  #getPassThroughFragmentShader() {
    return `
                    uniform sampler2D passTexture;
                    void main() {
                        vec2 uv = gl_FragCoord.xy / vec2(${this.sizeX}.0, ${this.sizeY}.0);
                        gl_FragColor = texture2D(passTexture, uv);
                    }
                `;
  }

  /**
   * Disposes of all GPU resources
   *
   * Cleans up render targets, materials, and textures to free GPU memory.
   */
  dispose() {
    // Dispose all variable render targets and materials
    for (let i = 0; i < this.variables.length; i++) {
      const variable = this.variables[i];

      // Dispose render targets
      for (let j = 0; j < variable.renderTargets.length; j++) {
        variable.renderTargets[j].dispose();
      }

      // Dispose material
      if (variable.material) {
        variable.material.dispose();
      }
    }

    // Dispose passthrough shader
    if (this.passThruShader) {
      this.passThruShader.dispose();
    }

    // Clear variables array
    this.variables = [];
  }
}
