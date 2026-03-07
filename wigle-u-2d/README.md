# Energy Life Simulation

GPU-accelerated cellular automaton simulating emergent energy dynamics with WebGL/Three.js.

## 🎯 Overview

This project implements a **particle life system** where cells interact through distance-based kernels, creating complex self-organizing patterns. Energy flows, diffuses, and transforms through a carefully balanced set of rules inspired by biological systems.

**Key Features:**
- ⚡ Real-time GPU computation (GLSL shaders)
- 🎨 Interactive parameter controls
- 🖱️ Mouse interaction (inject energy, attract, repel)
- 📊 Live energy monitoring chart
- 💾 Save/load parameter presets
- 🔧 Resizable canvas

## 🚀 Quick Start

1. **Open** `index.html` in a modern browser (Chrome, Firefox, Edge)
2. **Watch** patterns emerge from random noise
3. **Experiment** with sliders to explore different behaviors
4. **Click and drag** on canvas to interact

**Try this:** Slowly adjust "Growth Width" from 0.145 down to 0.0156 for the "banana wave" pattern!

## 📁 Project Structure

```
wigle2/
├── src/
│   ├── core/                    # Core simulation logic
│   │   ├── EnergyLifeSimulation.js      # Main simulation class
│   │   └── GPUComputationRenderer.js    # GPU compute engine
│   ├── config/                  # Configuration files
│   │   ├── constants.js                 # All magic numbers
│   │   ├── defaults.js                  # Default parameters
│   │   └── presets.js                   # Named presets
│   ├── shaders/                 # GLSL shaders (documentation)
│   │   ├── lifecycle.glsl               # Main simulation shader
│   │   ├── display.vert/frag            # Display shaders
│   │   ├── downsample.frag              # Averaging shader
│   │   └── passthrough.vert/frag        # Utility shaders
│   ├── utils/                   # Utility functions
│   │   ├── shaderLoader.js              # Shader code loader
│   │   └── textureUtils.js              # Texture operations
│   └── main.js                  # Entry point
├── docs/                        # Documentation
│   ├── ARCHITECTURE.md          # System architecture
│   ├── PARAMETERS.md            # Parameter guide
│   └── SHADERS.md               # Shader explanation
├── tests/                       # Playwright tests
└── index.html                   # Main HTML file
```

## 🎮 Controls

### Dynamic Tension
- **Inner Radius/Strength**: Attraction zone (cells pull each other together)
- **Outer Radius/Strength**: Repulsion zone (cells push apart)

### Energy Economy
- **Decay Rate**: Energy loss over time (metabolism)
- **Diffusion Rate**: Energy spreading to neighbors
- **Fission Threshold**: Energy level triggering instability

### Growth Function
- **Growth Center**: Optimal neighbor energy level
- **Growth Width**: Tolerance around optimal level
- **Growth Rate**: Speed of energy change

### Interaction Modes
- **Energy**: Inject energy directly (red channel)
- **Attract**: Pull cells together (green channel)
- **Repel**: Push cells apart (blue channel)

### Speed Control
- **⏸ (0x)**: Pause simulation
- **▶ (1x)**: Normal speed
- **⏩ (2x)**: Double speed
- **⏩⏩ (5x)**: 5x speed

### Keyboard Shortcuts
- **Space**: Pause/resume

## 🔬 How It Works

1. **GPU Computation**: 512×512 grid updated via WebGL fragment shaders
2. **Neighbor Kernel**: Each cell samples neighbors within radius
3. **Growth Function**: Gaussian bell curve determines energy gain/loss
4. **Energy Flow**: Metabolism (decay) + diffusion + interaction
5. **Double Buffering**: Ping-pong between two textures for state update
6. **Display**: Energy mapped to color gradient (blue→cyan→green→yellow→white)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed explanation.

## 📚 Documentation

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)**: System design and data flow
- **[PARAMETERS.md](docs/PARAMETERS.md)**: In-depth parameter guide
- **[SHADERS.md](docs/SHADERS.md)**: Shader code explanation

### 🧬 Terrain (G) 풍화/퇴적
- `Terrain (G)` 토글을 켜면 R(에너지)이 지나갈 때 G(지형)이 깎이고 주변으로 퍼집니다.
- `레이어 보기`로 Composite/ Terrain을 전환해 지형 변화를 단독으로 확인할 수 있습니다.

## 🧪 Testing

```bash
npm install
npm run test:playwright
```

Tests verify:
- ✅ No console errors on load
- ✅ Parameter sliders sync with GPU uniforms
- ✅ Average energy calculation works
- ✅ UI controls respond correctly

## 🎨 Example Patterns

### Banana Wave
Set Growth Width to ~0.0156 for flowing wave patterns.

### Default
Balanced parameters produce stable, self-organizing structures.

*(More presets can be added to `src/config/presets.js`)*

## 🛠️ Development

### Prerequisites
- Modern browser with WebGL support
- Node.js (for testing only)

### File Organization Philosophy
This codebase is structured for **LLM-friendly navigation**:
- 📦 **Separation of Concerns**: Config, core logic, utils
- 📝 **JSDoc Everywhere**: Every class and method documented
- 🏷️ **Named Constants**: No magic numbers
- 📚 **Centralized Documentation**: All explanations in `docs/`

When a new LLM session starts, it can quickly understand:
1. What each file does (check `README.md`)
2. How the system works (check `docs/ARCHITECTURE.md`)
3. What parameters mean (check `docs/PARAMETERS.md`)
4. How shaders work (check `docs/SHADERS.md`)

## 📄 License

ISC

## 🙏 Acknowledgments

Inspired by:
- Lenia (continuous cellular automata)
- Particle Life systems
- Reaction-diffusion models
- SmoothLife

---

**Made with ⚡ and Three.js**
