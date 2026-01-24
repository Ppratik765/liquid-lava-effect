# Interactive 3D Liquid Lava Simulation

A high-performance, GPU-accelerated fluid simulation built with React, Three.js, and GLSL shaders. This application simulates viscous molten lava that flows, spreads, and cools down over time, reacting to user input with a simulated 3D volumetric appearance.

## Overview

This project implements a General-Purpose Computing on Graphics Processing Units (GPGPU) simulation. It uses "Ping-Pong" buffering to store the simulation state (heat and fluid density) in textures, allowing for complex physics calculations to run entirely on the GPU at 60+ FPS.

The visual style is achieved through custom fragment shaders that translate 2D heat data into a 3D-lit surface using normal mapping, specular highlights, and Fresnel rim lighting, followed by a post-processing Bloom pass.

## Features

### Physics & Simulation
* **Viscous Fluid Dynamics:** Implements a diffusion algorithm to simulate thick, syrup-like spreading suitable for lava.
* **Thermodynamics:** Simulates cooling over time. Lava starts hot (white/yellow), cools to magma (orange/red), and eventually hardens into rock (black/invisible).
* **Mouse & Touch Interaction:** Users can "inject" heat and fluid into the simulation using a brush-like cursor.
* **Mobile Compatibility:** Optimised to use `HalfFloatType` and `RGBAFormat` textures to ensure compatibility with mobile GPUs (iOS and Android).

### Visual Rendering
* **Volumetric 3D Fake:** Calculates surface normals in real-time based on the gradient of the heat map. This allows 2D data to interact with light as if it were a 3D object.
* **Phong Lighting Model:** Implements Ambient, Diffuse, and Specular (shininess) lighting to create a "wet" or oily look.
* **Fresnel Rim Lighting:** Adds a glowing edge to the fluid, enhancing the perception of volume and thickness.
* **Procedural Noise:** Uses GLSL noise functions to distort UV coordinates and heat values, adding organic turbulence and "crust" texture to the flow.
* **Post-Processing:** specific Bloom effect configuration to create an intense thermal glow.

## Tech Stack

* **Framework:** React (Vite)
* **3D Engine:** Three.js
* **Post-Processing:** `postprocessing` library (EffectComposer, BloomEffect)
* **Language:** JavaScript / GLSL (OpenGL Shading Language)

## Installation

1.  Clone the repository:
    ```bash
    git clone [https://github.com/your-username/liquid-lava-effect.git](https://github.com/your-username/liquid-lava-effect.git)
    ```

2.  Navigate to the project directory:
    ```bash
    cd liquid-lava-effect
    ```

3.  Install dependencies:
    ```bash
    npm install
    ```

4.  Start the development server:
    ```bash
    npm run dev
    ```

5.  Open your browser and navigate to `http://localhost:5173`.

## Controls

The simulation includes "Pen Up" and "Pen Down" logic to allow for precise drawing without constant flow.

  | Platform | Action              | Effect                                      |
  |----------|---------------------|---------------------------------------------|
  | Desktop  | Left Click (Hold)   | Draw/Emit Lava (Pen Down)                   |
  |          | Right Click         | Stop Drawing (Pen Up)                       |
  |          | Mouse Move          | Move the cursor position                    |
  |              |                   |                                            |
  | Mobile   | Touch & Drag        | Draw/Emit Lava                              |
  |          | Release Touch       | Stop Drawing                                |

## Technical Implementation Details

### 1. The Ping-Pong Buffer Strategy
The core of the simulation relies on two WebGLRenderTargets (`targetA` and `targetB`).
1.  **Read Step:** The shader reads the state of the previous frame from `targetA`.
2.  **Write Step:** The shader calculates the new physics state (diffusion, cooling, mouse input) and writes it to `targetB`.
3.  **Swap Step:** `targetA` and `targetB` are swapped. `targetB` becomes the source for the next frame.

### 2. Simulation Shader (`simMat`)
This shader handles the physics.
* **Diffusion:** It samples the 4 neighboring pixels (up, down, left, right) and the center pixel. It blends them using a Laplacian operator. The mix ratio controls viscosity. A lower mix value results in thicker fluid; a higher value results in gas-like spreading.
* **Decay:** Every frame, the heat value is multiplied by a decay factor (e.g., `0.985`) and subtracted by a small constant. This simulates cooling.

### 3. Display Shader (`displayMat`)
This shader handles the visualization.
* **Normal Calculation:** It samples the heat values of neighboring pixels to determine the "slope" of the fluid.
    ```glsl
    float hL = texture2D(tex, uv - vec2(px.x, 0.0)).r;
    float hR = texture2D(tex, uv + vec2(px.x, 0.0)).r;
    vec3 normal = normalize(vec3((hL - hR) * strength, ... , 1.0));
    ```
* **Color Ramp:** Instead of a simple texture lookup, it mixes colors procedurally based on heat thresholds:
    * Heat 0.0 - 0.15: Rock (Black/Dark Red)
    * Heat 0.15 - 0.4: Magma (Red)
    * Heat 0.4 - 0.8: Lava (Orange)
    * Heat 0.8 - 1.0: Core (Yellow/White)

## Customiasation

You can tweak the physics and visuals by modifying `src/components/FlameCanvas.jsx`.

### Adjusting Viscosity
In the `fragmentShader` of `simMat`:
  ```glsl
  // Lower value (0.5 - 0.6) = Thicker, viscous lava
  // Higher value (0.8 - 0.9) = Watery, fast-spreading
  float diff = mix(center, avg, 0.6);
  ```
### Adjusting Cooling Rate
In the `fragmentShader` of `simMat`:
  ```gshl
  // Multiplier: Controls how long heat lingers (0.99 = long, 0.90 = short)
  diff *= 0.985;
  // Subtraction: Controls how fast the faint trails disappear
  diff -= 0.002;
  ```
### Adjusting 3D "Bumpiness"
In the `fragmentShader` of `displayMat`:
  ```gshl
  // The multiplier (3.0) controls the steepness of the normals
  vec3 normal = normalize(vec3((hL - hR) * 3.0, (hD - hU) * 3.0, 0.05));
  ```
