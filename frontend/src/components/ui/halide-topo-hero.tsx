import React, { useEffect, useRef } from "react";

const HalideLanding: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const x = (window.innerWidth / 2 - e.pageX) / 25;
      const y = (window.innerHeight / 2 - e.pageY) / 25;

      canvas.style.transform = `rotateX(${55 + y / 2}deg) rotateZ(${-25 + x / 2}deg)`;

      layersRef.current.forEach((layer, index) => {
        if (!layer) return;
        const depth = (index + 1) * 15;
        const moveX = x * (index + 1) * 0.2;
        const moveY = y * (index + 1) * 0.2;
        layer.style.transform = `translateZ(${depth}px) translate(${moveX}px, ${moveY}px)`;
      });
    };

    canvas.style.opacity = "0";
    canvas.style.transform = "rotateX(90deg) rotateZ(0deg) scale(0.8)";

    const timeout = setTimeout(() => {
      canvas.style.transition = "all 2.5s cubic-bezier(0.16, 1, 0.3, 1)";
      canvas.style.opacity = "1";
      canvas.style.transform = "rotateX(55deg) rotateZ(-25deg) scale(1)";
    }, 300);

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <section className="relative min-h-[90vh] overflow-hidden rounded-3xl border border-border bg-[#0a0a0a] text-[#e0e0e0]">
      <style>{`
        .halide-grain {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          pointer-events: none;
          z-index: 30;
          opacity: 0.15;
        }
        .viewport {
          perspective: 2000px;
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
        }
        .canvas-3d {
          position: relative;
          width: min(800px, 84vw);
          height: min(500px, 62vh);
          transform-style: preserve-3d;
        }
        .layer {
          position: absolute;
          inset: 0;
          border: 1px solid rgba(224, 224, 224, 0.1);
          background-size: cover;
          background-position: center;
          transition: transform 0.5s ease;
          border-radius: 16px;
        }
        .layer-1 { background-image: url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1200'); filter: grayscale(1) contrast(1.2) brightness(0.5); }
        .layer-2 { background-image: url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&q=80&w=1200'); filter: grayscale(1) contrast(1.1) brightness(0.7); opacity: 0.6; mix-blend-mode: screen; }
        .layer-3 { background-image: url('https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&q=80&w=1200'); filter: grayscale(1) contrast(1.3) brightness(0.8); opacity: 0.4; mix-blend-mode: overlay; }
        .contours {
          position: absolute;
          width: 200%; height: 200%;
          top: -50%; left: -50%;
          background-image: repeating-radial-gradient(circle at 50% 50%, transparent 0, transparent 40px, rgba(255,255,255,0.05) 41px, transparent 42px);
          transform: translateZ(120px);
          pointer-events: none;
        }
      `}</style>

      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </svg>

      <div className="halide-grain" style={{ filter: "url(#grain)" }}></div>

      <div className="absolute inset-0 z-20 grid grid-cols-1 md:grid-cols-2 grid-rows-[auto_1fr_auto] p-6 md:p-10 pointer-events-none">
        <div className="font-bold">ECO_SCAN_CORE</div>
        <div className="hidden md:block text-right font-mono text-[0.7rem] text-orange-400">
          <div>LATITUDE: 37.2860° N</div>
          <div>FOCAL DEPTH: 80MM</div>
        </div>
        <h1 className="col-span-full self-center text-[clamp(2.3rem,9vw,8rem)] leading-[0.85] tracking-[-0.04em] mix-blend-difference">
          SPECIES
          <br />
          PRESSURE
        </h1>
        <div className="col-span-full flex items-end justify-between">
          <div className="font-mono text-xs md:text-sm">
            <p>[ COYOTE VALLEY 2026 ]</p>
            <p>SURFACE TENSION & TOPOGRAPHICAL STRESS</p>
          </div>
          <a
            href="#upload"
            className="pointer-events-auto inline-flex bg-zinc-100 text-zinc-900 px-5 py-3 font-semibold [clip-path:polygon(0_0,100%_0,100%_70%,85%_100%,0_100%)] hover:bg-orange-500 hover:text-white transition-colors"
          >
            EXPLORE DEPTH
          </a>
        </div>
      </div>

      <div className="viewport min-h-[90vh]">
        <div className="canvas-3d" ref={canvasRef}>
          <div className="layer layer-1" ref={(el) => (layersRef.current[0] = el!)}></div>
          <div className="layer layer-2" ref={(el) => (layersRef.current[1] = el!)}></div>
          <div className="layer layer-3" ref={(el) => (layersRef.current[2] = el!)}></div>
          <div className="contours"></div>
        </div>
      </div>
    </section>
  );
};

export default HalideLanding;
