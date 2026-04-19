import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

gsap.registerPlugin(ScrollTrigger);

type Vec3 = { x: number; y: number; z: number };

type ThreeBundle = {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  composer: EffectComposer | null;
  stars: THREE.Points[];
  mountains: THREE.Mesh[];
  sun: THREE.Mesh | null;
  frameId: number | null;
  targetCamera: Vec3;
  smoothCamera: Vec3;
};

const SECTION_TITLES = ["HORIZON", "COSMOS", "INFINITY"];
const SECTION_SUBTITLES = [
  "Where vision meets reality, we shape the future of tomorrow.",
  "Beyond the boundaries of imagination lies the universe of possibilities.",
  "In the space between thought and creation, we protect what matters first.",
];

function mountStarField(scene: THREE.Scene, starsRef: THREE.Points[]) {
  for (let layer = 0; layer < 3; layer += 1) {
    const starCount = 1800;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i += 1) {
      const radius = 160 + Math.random() * 820;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const color = new THREE.Color();
      const roll = Math.random();
      if (roll < 0.7) color.setHSL(0, 0, 0.88 + Math.random() * 0.12);
      else if (roll < 0.9) color.setHSL(0.08, 0.68, 0.75);
      else color.setHSL(0.64, 0.6, 0.8);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = Math.random() * 2 + 0.45;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        depth: { value: layer },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float time;
        uniform float depth;
        void main() {
          vColor = color;
          vec3 p = position;
          float angle = time * 0.04 * (1.0 - depth * 0.28);
          mat2 r = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          p.xy = r * p.xy;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = size * (250.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float a = 1.0 - smoothstep(0.0, 0.5, d);
          gl_FragColor = vec4(vColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const field = new THREE.Points(geometry, material);
    scene.add(field);
    starsRef.push(field);
  }
}

function mountMountain(scene: THREE.Scene, mountainsRef: THREE.Mesh[]) {
  const layers = [
    { depth: -120, tone: 0x5b2b9d, opacity: 0.9, amp: 86 },
    { depth: -180, tone: 0x283f97, opacity: 0.86, amp: 105 },
    { depth: -240, tone: 0x090f3d, opacity: 0.95, amp: 124 },
  ];

  layers.forEach((layer, index) => {
    const points: THREE.Vector2[] = [];
    const segments = 44;
    for (let i = 0; i <= segments; i += 1) {
      const x = (i / segments - 0.5) * 1000;
      const y = Math.sin(i * 0.18 + index) * layer.amp + Math.cos(i * 0.07 + index) * 35 - 170;
      points.push(new THREE.Vector2(x, y));
    }
    points.push(new THREE.Vector2(1000, -380));
    points.push(new THREE.Vector2(-1000, -380));

    const shape = new THREE.Shape(points);
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({
      color: layer.tone,
      transparent: true,
      opacity: layer.opacity,
      side: THREE.DoubleSide,
    });

    const mountain = new THREE.Mesh(geometry, material);
    mountain.position.z = layer.depth;
    mountain.position.y = 42;
    scene.add(mountain);
    mountainsRef.push(mountain);
  });
}

export function HorizonHeroSection() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const subtitleRef = useRef<HTMLParagraphElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const [scrollProgress, setScrollProgress] = useState(0);
  const [section, setSection] = useState(0);
  const [ready, setReady] = useState(false);

  const threeRef = useRef<ThreeBundle>({
    scene: null,
    camera: null,
    renderer: null,
    composer: null,
    stars: [],
    mountains: [],
    sun: null,
    frameId: null,
    targetCamera: { x: 0, y: 32, z: 280 },
    smoothCamera: { x: 0, y: 32, z: 280 },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const refs = threeRef.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03050b, 0.00045);
    refs.scene = scene;

    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2200);
    camera.position.set(0, 30, 280);
    refs.camera = camera;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.56;
    refs.renderer = renderer;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.72, 0.45, 0.86));
    refs.composer = composer;

    mountStarField(scene, refs.stars);
    mountMountain(scene, refs.mountains);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(72, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xc5dcff, transparent: true, opacity: 0.95 }),
    );
    sun.position.set(0, 40, -360);
    refs.sun = sun;
    scene.add(sun);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(110, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x8bb2ff,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.copy(sun.position);
    scene.add(halo);

    const animate = () => {
      refs.frameId = requestAnimationFrame(animate);
      const t = Date.now() * 0.001;

      refs.stars.forEach((points) => {
        const material = points.material as THREE.ShaderMaterial;
        if (material.uniforms?.time) material.uniforms.time.value = t;
      });

      refs.smoothCamera.x += (refs.targetCamera.x - refs.smoothCamera.x) * 0.055;
      refs.smoothCamera.y += (refs.targetCamera.y - refs.smoothCamera.y) * 0.055;
      refs.smoothCamera.z += (refs.targetCamera.z - refs.smoothCamera.z) * 0.055;

      camera.position.set(
        refs.smoothCamera.x + Math.sin(t * 0.12) * 1.5,
        refs.smoothCamera.y + Math.cos(t * 0.16) * 0.95,
        refs.smoothCamera.z,
      );
      camera.lookAt(0, 24, -620);

      refs.mountains.forEach((m, idx) => {
        m.position.x = Math.sin(t * 0.1 + idx * 0.7) * (idx + 1) * 1.6;
      });

      halo.scale.setScalar(1 + Math.sin(t * 1.4) * 0.02);

      refs.composer?.render();
    };

    animate();
    setReady(true);

    const handleResize = () => {
      if (!refs.camera || !refs.renderer || !refs.composer) return;
      refs.camera.aspect = window.innerWidth / window.innerHeight;
      refs.camera.updateProjectionMatrix();
      refs.renderer.setSize(window.innerWidth, window.innerHeight);
      refs.composer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (refs.frameId) cancelAnimationFrame(refs.frameId);
      refs.stars.forEach((s) => {
        s.geometry.dispose();
        (s.material as THREE.Material).dispose();
      });
      refs.mountains.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      refs.sun?.geometry.dispose();
      (refs.sun?.material as THREE.Material | undefined)?.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const tl = gsap.timeline();
    tl.from(menuRef.current, { x: -40, opacity: 0, duration: 0.7, ease: "power3.out" });
    tl.from(titleRef.current, { y: 90, opacity: 0, duration: 1, ease: "power4.out" }, "-=0.35");
    tl.from(subtitleRef.current, { y: 36, opacity: 0, duration: 0.8, ease: "power3.out" }, "-=0.7");
    tl.from(progressRef.current, { y: 20, opacity: 0, duration: 0.6 }, "-=0.55");
    return () => tl.kill();
  }, [ready]);

  useEffect(() => {
    const onScroll = () => {
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(window.scrollY / max, 1);
      setScrollProgress(progress);

      const rawSection = Math.min(2, Math.floor(progress * 3));
      setSection(rawSection);

      const refs = threeRef.current;
      const cameraStops: Vec3[] = [
        { x: 0, y: 30, z: 280 },
        { x: 0, y: 42, z: 20 },
        { x: 0, y: 52, z: -600 },
      ];
      refs.targetCamera = cameraStops[rawSection] || cameraStops[0];
    };
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="relative min-h-[82vh] overflow-hidden rounded-[28px] border border-border/70 bg-[#05070d]">
      <style>{`
        .horizon-hero-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
          display: block;
        }
        .horizon-overlay {
          position: relative;
          z-index: 2;
          min-height: 82vh;
          display: grid;
          grid-template-rows: auto 1fr auto;
          padding: clamp(1rem, 2.4vw, 1.8rem);
        }
        .horizon-menu {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          color: #95a6d6;
          font-size: 0.72rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .horizon-bars {
          display: inline-grid;
          gap: 0.2rem;
        }
        .horizon-bars span {
          width: 18px;
          height: 1px;
          background: #95a6d6;
        }
        .horizon-center {
          align-self: center;
          max-width: 780px;
        }
        .horizon-kicker {
          margin: 0;
          text-align: center;
          color: #d8defa;
          font-size: clamp(0.72rem, 1.3vw, 0.92rem);
          letter-spacing: 0.06em;
        }
        .horizon-title {
          margin: 0.3rem 0 0;
          text-align: center;
          font-family: "Space Grotesk", "Inter", sans-serif;
          font-size: clamp(3rem, 13vw, 8rem);
          line-height: 0.92;
          letter-spacing: 0.02em;
          color: #ff4b60;
          text-shadow: 0 0 28px rgba(255, 75, 96, 0.4);
        }
        .horizon-subtitle {
          margin: 0.3rem auto 0;
          max-width: 620px;
          text-align: center;
          color: #c1ccf3;
          font-size: clamp(0.86rem, 1.8vw, 1.06rem);
        }
        .horizon-progress {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.8rem;
          color: #9eb0dc;
          font-size: 0.72rem;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }
        .horizon-track {
          flex: 1;
          height: 2px;
          background: rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          overflow: hidden;
        }
        .horizon-fill {
          height: 100%;
          background: linear-gradient(90deg, #ff4b60, #ffffff);
          transition: width 0.2s ease;
        }
      `}</style>
      <canvas ref={canvasRef} className="horizon-hero-canvas" />
      <div className="horizon-overlay">
        <div ref={menuRef} className="horizon-menu">
          <span className="horizon-bars">
            <span></span>
            <span></span>
            <span></span>
          </span>
          Space
        </div>
        <div className="horizon-center">
          <p className="horizon-kicker">{SECTION_SUBTITLES[section]}</p>
          <h1 ref={titleRef} className="horizon-title">
            {SECTION_TITLES[section]}
          </h1>
          <p ref={subtitleRef} className="horizon-subtitle">
            Species intelligence that keeps focus on one clear conservation action path.
          </p>
        </div>
        <div ref={progressRef} className="horizon-progress">
          <span>Scroll</span>
          <span className="horizon-track">
            <span className="horizon-fill" style={{ width: `${Math.round(scrollProgress * 100)}%` }} />
          </span>
          <span>{String(section + 1).padStart(2, "0")} / 03</span>
        </div>
      </div>
    </section>
  );
}
