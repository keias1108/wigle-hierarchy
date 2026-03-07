# Parameters Guide

Complete guide to all simulation parameters and their effects.

---

## 🎛️ Dynamic Tension

Controls how cells attract and repel each other based on distance.

### **Inner Radius** (`innerRadius`)
- **Range:** 1.0 - 10.0
- **Default:** 3.5
- **Effect:** Size of attraction zone around each cell
- **Visual:** Larger = cells cluster more loosely

### **Inner Strength** (`innerStrength`)
- **Range:** 0.0 - 2.0
- **Default:** 0.9
- **Effect:** How strongly cells pull each other together
- **Visual:** Higher = tighter clusters, more cohesion

### **Outer Radius** (`outerRadius`)
- **Range:** 5.0 - 15.0
- **Default:** 7.5
- **Effect:** Size of repulsion zone (must be > innerRadius)
- **Visual:** Larger = cells push apart from farther away

### **Outer Strength** (`outerStrength`)
- **Range:** -2.0 - 0.0 (negative = repulsion)
- **Default:** -0.4
- **Effect:** How strongly cells push apart
- **Visual:** More negative = stronger separation

**💡 Tip:** The relationship between inner/outer creates dynamic balance.
- `innerRadius < outerRadius`: Stable patterns
- Strong inner + weak outer: Clustering
- Weak inner + strong outer: Dispersal

---

## 💰 Energy Economy

Controls energy lifecycle: decay, diffusion, and instability.

### **Decay Rate** (`decayRate`)
- **Range:** 0.0 - 1.0
- **Default:** 0.378
- **Effect:** Quadratic energy loss per frame (metabolism)
- **Formula:** `loss = energy² × decayRate`
- **Visual:** Higher = energy dissipates faster, shorter-lived patterns

### **Diffusion Rate** (`diffusionRate`)
- **Range:** 0.0 - 1.0
- **Default:** 0.333
- **Effect:** How fast energy spreads to neighbors (Laplacian)
- **Visual:** Higher = energy "bleeds" more, softer edges

### **Fission Threshold** (`fissionThreshold`)
- **Range:** 0.5 - 0.95
- **Default:** 0.796
- **Effect:** Energy level triggering chaos/instability
- **Visual:** Lower = more chaotic behavior, splitting patterns

**💡 Tip:** Balance metabolism vs. diffusion
- High decay + low diffusion: Isolated hotspots
- Low decay + high diffusion: Smooth gradients

---

## 📈 Growth Function

Determines energy gain/loss based on neighbor potential.

### **Growth Center** (`growthCenter`)
- **Range:** -2.0 - 2.0
- **Default:** -0.17
- **Effect:** Optimal neighbor energy for growth
- **Formula:** Gaussian bell curve centered here
- **Visual:** Cells grow best when neighbors match this value

### **Growth Width** (`growthWidth`)
- **Range:** 0.0001 - 1.0
- **Default:** 0.0183
- **Effect:** Tolerance around optimal value
- **Formula:** σ (sigma) in Gaussian: `exp(-(x - center)² / (2σ²))`
- **Visual:**
  - **Narrow (< 0.02):** Very sensitive, sharp patterns
  - **Wide (> 0.1):** Tolerant, smooth evolution

**🌊 Banana Wave:**
- Start: `growthWidth = 0.145`
- Slowly decrease to: `0.0156`
- Watch waves emerge!

### **Growth Rate** (`growthRate`)
- **Range:** 0.001 - 1.0
- **Default:** 0.607
- **Effect:** Speed multiplier for energy change
- **Visual:** Higher = faster evolution, more dynamic

---

## 🌍 Global Parameters

System-wide modulation (not in UI by default).

### **Suppression Factor** (`suppressionFactor`)
- **Default:** 1.0
- **Effect:** Reduces growth when global average is high
- **Purpose:** Prevents overpopulation, maintains balance

### **Instability Factor** (`instabilityFactor`)
- **Default:** 1.5
- **Effect:** Chaos strength above fission threshold
- **Purpose:** Breaks up high-energy concentrations

---

## 🔧 System Constants

Fixed values in `src/config/constants.js` (not user-editable).

| Constant | Value | Purpose |
|----------|-------|---------|
| `SIMULATION_SIZE` | 512 | Grid resolution (512×512) |
| `KERNEL_SIZE` | 10 | Neighbor sampling radius |
| `INITIAL_SEED_ENERGY` | 0.05 | Random initialization max |
| `INTERACTION_RADIUS` | 20 | Mouse interaction range |
| `AVERAGE_COMPUTE_THROTTLE` | 2 | Compute average every N frames |
| `FPS_UPDATE_INTERVAL` | 1000ms | FPS display refresh |

---

## 🎨 Preset Examples

### **Default (Balanced)**
```javascript
{
  innerRadius: 3.5,
  innerStrength: 0.9,
  outerRadius: 7.5,
  outerStrength: -0.4,
  growthCenter: -0.17,
  growthWidth: 0.0183,
  growthRate: 0.607,
  decayRate: 0.378,
  diffusionRate: 0.333,
  fissionThreshold: 0.796
}
```
**Effect:** Stable, self-organizing patterns

### **Banana Wave**
```javascript
{
  ...default,
  growthWidth: 0.0156  // Narrow tolerance
}
```
**Effect:** Flowing wave-like motion

### **Experiment Ideas**

**High Energy Chaos:**
- `fissionThreshold = 0.6`
- `instabilityFactor = 2.0`
- `growthRate = 0.8`

**Slow Crystallization:**
- `decayRate = 0.1`
- `diffusionRate = 0.5`
- `growthWidth = 0.05`

**Pulsing Bubbles:**
- `innerStrength = 1.5`
- `outerStrength = -0.8`
- `growthRate = 0.4`

---

## 🔬 Parameter Interactions

### **Most Sensitive Combinations:**

1. **growthWidth × growthCenter**
   - Defines "sweet spot" for life
   - Narrow width = fragile equilibrium

2. **innerStrength vs. outerStrength ratio**
   - Balance determines cluster size
   - `|inner| / |outer| > 2`: Tight clusters
   - `|inner| / |outer| < 1`: Loose networks

3. **decayRate × diffusionRate**
   - Decay > diffusion: Localized hotspots
   - Diffusion > decay: Spreading clouds

---

## 📊 Tuning Workflow

### **For Stable Patterns:**
1. Start with defaults
2. Adjust `growthWidth` slowly (±0.001)
3. Fine-tune `growthCenter` (±0.01)
4. Tweak strength ratios last

### **For Dynamic Chaos:**
1. Lower `fissionThreshold` (0.7)
2. Increase `growthRate` (0.8)
3. Raise `instabilityFactor` (2.0)
4. Reduce `decayRate` for longer life

### **For Smooth Aesthetics:**
1. Increase `diffusionRate` (0.5+)
2. Lower `growthRate` (0.3-0.5)
3. Use wider `growthWidth` (0.05+)

---

## 🎯 Quick Reference Card

| Want | Adjust | Direction |
|------|--------|-----------|
| Bigger clusters | `innerRadius` | ↑ |
| Tighter packing | `innerStrength` | ↑ |
| More separation | `outerStrength` | ↓ (more negative) |
| Faster evolution | `growthRate` | ↑ |
| Longer-lived patterns | `decayRate` | ↓ |
| Softer edges | `diffusionRate` | ↑ |
| More chaos | `fissionThreshold` | ↓ |
| Sharp patterns | `growthWidth` | ↓ |

---

**Pro Tip:** Save interesting configurations using the "Save" button!
Presets are stored in localStorage and persist across sessions.
