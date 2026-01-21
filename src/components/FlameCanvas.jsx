import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect } from "postprocessing";

export default function FlameCanvas() {
  const mountRef = useRef();
  // mouse.z = 1.0 (Pen Down / Drawing), 0.0 (Pen Up / Not Drawing)
  const mouse = useRef({ x: 0.5, y: 0.5, z: 1.0 });

  useEffect(() => {
    // 1. Setup Renderer
    const renderer = new THREE.WebGLRenderer({ 
      alpha: true, 
      powerPreference: "high-performance",
      antialias: false,
      stencil: false,
      depth: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // 2. Render Targets
    const simRes = 256; 
    const createRT = () =>
      new THREE.WebGLRenderTarget(simRes, simRes, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });

    let targetA = createRT();
    let targetB = createRT();

    // 3. Simulation Shader (Physics - Preserved "Faster Cooling")
    const simMat = new THREE.ShaderMaterial({
      uniforms: {
        prev: { value: targetA.texture },
        mouse: { value: new THREE.Vector3(0, 0, 0) },
        resolution: { value: new THREE.Vector2(simRes, simRes) },
        aspect: { value: window.innerWidth / window.innerHeight },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D prev;
        uniform vec3 mouse;
        uniform vec2 resolution;
        uniform float aspect;

        void main() {
          vec2 uv = vUv;
          vec2 px = 1.0 / resolution;

          float center = texture2D(prev, uv).r;
          float top = texture2D(prev, uv + vec2(0.0, px.y)).r;
          float bottom = texture2D(prev, uv - vec2(0.0, px.y)).r;
          float left = texture2D(prev, uv - vec2(px.x, 0.0)).r;
          float right = texture2D(prev, uv + vec2(px.x, 0.0)).r;

          float avg = (top + bottom + left + right + center) / 5.0;
          float diff = mix(center, avg, 0.6); // Viscosity

          // Faster Cooling Settings
          diff *= 0.98;  
          diff -= 0.003; 

          vec2 m = mouse.xy;
          vec2 d = uv - m;
          d.x *= aspect;
          float len = length(d);
          
          if(len < 0.08) {
             float heat = smoothstep(0.08, 0.0, len);
             diff += heat * 0.8 * mouse.z; 
          }

          gl_FragColor = vec4(max(diff, 0.0), 0.0, 0.0, 1.0);
        }
      `,
    });

    // 4. Display Shader (Visuals - UPGRADED for 3D Look)
    const displayMat = new THREE.ShaderMaterial({
      uniforms: {
        tex: { value: targetA.texture },
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) } // Passed screen res for normal calc
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tex;
        uniform float time;
        uniform vec2 resolution;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        // Fractal Noise for crust detail
        float fbm(vec2 p) {
            float v = 0.0;
            v += noise(p) * 0.5;
            v += noise(p * 2.0) * 0.25;
            v += noise(p * 4.0) * 0.125;
            return v;
        }

        void main() {
          float heat = texture2D(tex, vUv).r;
          if (heat < 0.005) discard;

          // 1. Calculate Pseudo-3D Normals (Bump Map)
          vec2 px = 1.0 / resolution;
          float hRight = texture2D(tex, vUv + vec2(px.x * 2.0, 0.0)).r;
          float hUp = texture2D(tex, vUv + vec2(0.0, px.y * 2.0)).r;
          
          // The "slope" of the lava
          float dX = (heat - hRight) * 30.0; // 30.0 = Surface Steepness
          float dY = (heat - hUp) * 30.0;
          vec3 normal = normalize(vec3(dX, dY, 1.0));

          // 2. Lighting Simulation
          vec3 lightDir = normalize(vec3(-0.5, 0.5, 1.0)); // Light from top-left
          float diffuse = max(dot(normal, lightDir), 0.0);
          float specular = pow(max(dot(reflect(-lightDir, normal), vec3(0,0,1)), 0.0), 16.0); // Wetness/Gloss

          // 3. Texture & Color
          // Sharp noise for "crust" chunks
          float n = fbm(vUv * 6.0 + vec2(time * 0.1, time * 0.05));
          
          // Darken the heat value with noise to create "rocks"
          float rockHeat = heat - (n * 0.2); 

          vec3 color = vec3(0.0);
          
          // Color Palette
          vec3 rock = vec3(0.05, 0.02, 0.02); // Almost black crust
          vec3 dullRed = vec3(0.4, 0.05, 0.0);
          vec3 brightRed = vec3(0.9, 0.1, 0.0);
          vec3 orange = vec3(1.0, 0.5, 0.0);
          vec3 yellow = vec3(1.0, 0.9, 0.2);

          if (rockHeat < 0.15) {
              color = mix(rock, dullRed, smoothstep(0.0, 0.15, rockHeat));
          } else if (rockHeat < 0.4) {
              color = mix(dullRed, brightRed, (rockHeat - 0.15) / 0.25);
          } else if (rockHeat < 0.7) {
              color = mix(brightRed, orange, (rockHeat - 0.4) / 0.3);
          } else {
              color = mix(orange, yellow, clamp((rockHeat - 0.7) / 0.3, 0.0, 1.0));
          }

          // 4. Apply Lighting
          // Shadow darkens the rock/red parts more
          color *= (0.6 + 0.4 * diffuse); 
          
          // Specular highlight adds "white/yellow" shine to hot areas
          color += specular * 0.4 * smoothstep(0.2, 1.0, heat); 

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      transparent: true,
    });

    const plane = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(plane, simMat);
    scene.add(mesh);

    // 5. Post-Processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, new BloomEffect({
        intensity: 2.0,
        luminanceThreshold: 0.2,
        radius: 0.6 
    })));

    function animate(t) {
      const timeVal = t * 0.001;

      // Simulation
      mesh.material = simMat;
      simMat.uniforms.prev.value = targetA.texture;
      simMat.uniforms.mouse.value.set(mouse.current.x, 1.0 - mouse.current.y, mouse.current.z);
      
      renderer.setRenderTarget(targetB);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      const temp = targetA;
      targetA = targetB;
      targetB = temp;

      // Display
      mesh.material = displayMat;
      displayMat.uniforms.tex.value = targetA.texture;
      displayMat.uniforms.time.value = timeVal;

      composer.render();
      requestAnimationFrame(animate);
    }

    animate(0);

    // --- INPUT HANDLING ---

    function onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h);
        composer.setSize(w, h);
        simMat.uniforms.aspect.value = w / h;
        // Update display shader resolution for correct lighting calc
        displayMat.uniforms.resolution.value.set(w, h); 
    }

    function onMouseMove(e) {
      mouse.current.x = e.clientX / window.innerWidth;
      mouse.current.y = e.clientY / window.innerHeight;
    }

    function onMouseDown(e) {
      if (e.button === 0) mouse.current.z = 1.0;
      if (e.button === 2) mouse.current.z = 0.0;
    }

    function onContextMenu(e) {
      e.preventDefault();
    }

    function updateTouch(e) {
        if(e.touches.length > 0) {
            const touch = e.touches[0];
            mouse.current.x = touch.clientX / window.innerWidth;
            mouse.current.y = touch.clientY / window.innerHeight;
        }
    }

    function onTouchStart(e) {
        if (e.cancelable) e.preventDefault(); 
        mouse.current.z = 1.0; 
        updateTouch(e);
    }

    function onTouchMove(e) {
        if (e.cancelable) e.preventDefault();
        updateTouch(e);
    }

    function onTouchEnd(e) {
        mouse.current.z = 0.0;
    }

    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("contextmenu", onContextMenu);
    
    window.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);

      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      targetA.dispose();
      targetB.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 10, cursor: 'crosshair' }} />;
}