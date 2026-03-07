# Architecture

Energy Life Simulation - System Architecture Documentation

## 📐 High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       User Interface (HTML)                  │
│  Controls Panel │ Canvas │ Chart │ Speed/Mode Buttons        │
└────────────┬────────────────────────────────────────────────┘
             │
             ├──> DOM Events (clicks, sliders, keyboard)
             │
┌────────────▼────────────────────────────────────────────────┐
│              EnergyLifeSimulation (Main Class)               │
│  ┌──────────┬──────────┬──────────┬──────────┬────────────┐ │
│  │  Params  │   GPU    │ Display  │  Chart   │ Interaction│ │
│  │  Control │  Compute │  Render  │  Update  │   Handler  │ │
│  └──────────┴──────────┴──────────┴──────────┴────────────┘ │
└────────────┬────────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼──────────┐ ┌───▼──────────────────┐
│   THREE.js   │ │ GPUComputationRenderer│
│  WebGLRenderer│ │ (Ping-Pong Buffers)  │
└───┬──────────┘ └───┬──────────────────┘
    │                │
    │      ┌─────────▼─────────┐
    │      │ Lifecycle Shader  │
    │      │  (GLSL Fragment)  │
    │      └─────────┬─────────┘
    │                │
┌───▼────────────────▼────┐
│   GPU (WebGL Context)   │
│  512×512 Float Textures │
└─────────────────────────┘
```

---

## 🏗️ Core Components

### 1. **EnergyLifeSimulation** (`src/core/EnergyLifeSimulation.js`)

**Main orchestrator class** - manages entire simulation lifecycle.

**Responsibilities:**
- Initialize WebGL renderer and GPU computation
- Handle user interactions (mouse, keyboard, sliders)
- Update display and charts
- Manage simulation parameters
- Error handling (WebGL context loss, localStorage)

**Key Data Flows:**
1. **Init**: DOM → WebGL setup → Shader compilation → Start loop
2. **Animate Loop**: Compute → Read average → Update uniforms → Render
3. **User Input**: Slider change → Update params → Update shader uniforms

---

### 2. **GPUComputationRenderer** (`src/core/GPUComputationRenderer.js`)

**GPGPU computation engine** using WebGL render-to-texture.

**Ping-Pong Pattern:**
```
Frame N:   Read from Buffer A → Compute → Write to Buffer B
Frame N+1: Read from Buffer B → Compute → Write to A
...repeat
```

**Why Ping-Pong?**
- Cannot read and write same texture simultaneously in WebGL
- Alternates between two render targets each frame

**API:**
- `createTexture()`: Creates Float32Array data texture
- `addVariable()`: Adds shader + render targets
- `compute()`: Executes one simulation step
- `getCurrentRenderTarget()`: Gets latest result

---

### 3. **Lifecycle Shader** (`src/utils/shaderLoader.js` → `getLifecycleShader()`)

**Heart of the simulation** - GLSL fragment shader running on GPU.

**Executed:** 512×512 = 262,144 times per frame (one per pixel)

**Algorithm (per cell):**
```glsl
1. Sample 21×21 neighbor kernel
2. Compute weighted potential from neighbors
3. Apply growth function (Gaussian bell curve)
4. Calculate metabolism (quadratic energy decay)
5. Add diffusion (Laplacian)
6. Add fission noise (if energy > threshold)
7. Add user interaction (if mouse active)
8. Update energy and clamp to [0, 1]
```

**Parameters (from uniforms):**
- **Kernel**: innerRadius, innerStrength, outerRadius, outerStrength
- **Growth**: growthCenter, growthWidth, growthRate
- **Economy**: decayRate, diffusionRate, fissionThreshold
- **Global**: globalAverage, suppressionFactor
- **Interaction**: interactionTexture (3-channel: energy/attract/repel)

---

## 🔄 Data Flow

### **Main Render Loop** (60 FPS target)

```
requestAnimationFrame()
   │
   ├─> For each speed multiplier iteration:
   │   ├─> GPUComputationRenderer.compute()
   │   │    └─> Execute lifecycle shader (GPU)
   │   │         └─> Update field texture
   │   │
   │   └─> Throttled every N frames:
   │        └─> Compute global average (downsample pipeline)
   │             └─> Update globalAverage uniform
   │
   ├─> Update interaction texture (if mouse down)
   │    └─> Write to RGB channels based on mode
   │
   ├─> Update display
   │    └─> Render field texture with color gradient shader
   │
   └─> Update UI (FPS, chart)
```

---

## 🧮 Average Computation (Downsample Pipeline)

**Problem:** Need to compute average of 262,144 values efficiently.

**Solution:** Hierarchical reduction using GPU

```
512×512 → 256×256 → 128×128 → ... → 1×1
(texture)  (RT)      (RT)           (final avg)
```

**Each pass:**
- Sample 2×2 block from input
- Average the 4 values
- Write to 1 pixel in output
- Result size = input size / 2

**Final:** Read single pixel from CPU for global average

---

## 🎨 Display Pipeline

### **Field → Screen**

```
Field Texture (512×512 floats)
   │
   ├─> Vertex Shader: Fullscreen quad
   │
   └─> Fragment Shader: Energy to RGB gradient
        ├─> 0.0-0.1: Black → Dark Blue
        ├─> 0.1-0.3: Dark Blue → Blue
        ├─> 0.3-0.5: Blue → Cyan
        ├─> 0.5-0.7: Cyan → Green
        ├─> 0.7-0.85: Green → Yellow
        └─> 0.85-1.0: Yellow → White (with sparkle)
```

---

## 🖱️ Interaction System

**Interaction Texture:** RGB channels encode different forces

```
Red Channel:   Energy injection
Green Channel: Attraction (pull cells together)
Blue Channel:  Repulsion (push cells apart)
```

**Flow:**
1. User clicks → `isMouseDown = true`
2. `updateInteractionTexture()` writes to texture
   - Radial falloff: `intensity = 1.0 - distance / radius`
   - Only update dirty region (performance optimization)
3. Shader reads interactionTexture
   - Red → Add energy directly
   - Green/Blue → Modify kernel weights

---

## 📊 Configuration Architecture

### **Separation of Concerns**

```
src/config/
├── constants.js   → System constants (sizes, limits)
├── defaults.js    → Simulation parameters
└── presets.js     → Named parameter sets
```

**Why separate?**
- `constants`: Technical limits (don't change often)
- `defaults`: Tunable parameters (users experiment)
- `presets`: Saved configurations (shareable)

---

## 🔧 Error Handling

### **WebGL Context Loss**
```
Event: webglcontextlost
  → Pause simulation
  → Show message to user

Event: webglcontextrestored
  → Reinitialize renderer
  → Recreate GPU resources
  → Resume simulation
```

### **LocalStorage**
```
Try: JSON.stringify + setItem
Catch QuotaExceededError: Alert user
Catch other: Log and notify
```

---

## ⚡ Performance Optimizations

### **1. Throttled Average Computation**
- **Before:** Every frame (60 FPS)
- **After:** Every N frames (configurable via `AVERAGE_COMPUTE_THROTTLE`)
- **Savings:** ~50% CPU time for average calculation

### **2. Partial Texture Updates**
- Interaction texture only updates dirty region
- No full clear every frame

### **3. GPU Shader**
- All computation on GPU (262K cells/frame)
- Float textures for precision
- No CPU involvement in simulation logic

---

## 🗂️ File Responsibilities

| File | Purpose | Key Exports |
|------|---------|-------------|
| `core/EnergyLifeSimulation.js` | Main simulation class | `EnergyLifeSimulation` |
| `core/GPUComputationRenderer.js` | GPU compute engine | `GPUComputationRenderer` |
| `utils/shaderLoader.js` | GLSL shader code | `getLifecycleShader()`, etc. |
| `utils/textureUtils.js` | Texture manipulation | `seedPattern()`, `clearTexture()` |
| `config/constants.js` | System constants | All `CAPS_CASE` exports |
| `config/defaults.js` | Simulation parameters | `DEFAULT_PARAMS` |
| `config/presets.js` | Named presets | `NAMED_PRESETS` |
| `main.js` | Entry point | Instantiates simulation |

---

## 🧪 Testing Architecture

**Playwright E2E Tests** (`tests/console.spec.js`)

**Coverage:**
- ✅ No console errors on load
- ✅ Slider ↔ GPU uniform synchronization
- ✅ Average energy calculation
- ✅ UI responsiveness

**Philosophy:** Test critical paths without mocking WebGL

---

## 🔮 Future Extensibility

### **Adding New Parameters:**
1. Add to `src/config/defaults.js` (`DEFAULT_PARAMS`)
2. Add to `PARAM_CONTROL_IDS` array
3. Add slider to `index.html`
4. Shader automatically picks up uniform

### **Adding New Presets:**
1. Add entry to `src/config/presets.js` (`NAMED_PRESETS`)
2. (Future) Create UI for preset selector

### **Adding New Shaders:**
1. Create `.glsl` file in `src/shaders/`
2. Add loader function in `src/utils/shaderLoader.js`
3. Use in `EnergyLifeSimulation.js`

---

## 📚 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No Three.js npm** (CDN) | Simpler setup, no build step required |
| **512×512 grid** | Balance: detail vs. performance |
| **Float32 textures** | Precision for energy values |
| **Ping-pong buffers** | WebGL read/write limitation |
| **JSDoc instead of TS** | Lower barrier, still typed |
| **Inline shaders** | Avoid fetch/bundling complexity |

---

## 🔗 Dependencies

- **Three.js r128** (via CDN): WebGL abstraction
- **Playwright** (dev): E2E testing
- **Browser Requirements**: WebGL + Float texture support

---

**For LLM Context:**
This architecture document provides a complete mental model of the codebase.
When modifying code, understand:
1. Where in the pipeline your change occurs
2. Which components need updates
3. How data flows through the system
