import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface AnimatedHeroProps {
  headline: string;
  subheadline: string;
  backgroundImage?: string;
  cta?: {
    text: string;
    onClick: () => void;
  };
  showScrollIndicator?: boolean;
}

/**
 * AnimatedHero: Modern, animated hero section with:
 * - Staggered text reveals (headline + subheadline)
 * - Parallax background image with fade effect
 * - Smooth entrance animations (200-300ms per line)
 * - Respects prefers-reduced-motion for accessibility
 */
export function AnimatedHero({
  headline,
  subheadline,
  backgroundImage,
  cta,
  showScrollIndicator = true,
}: AnimatedHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadlineRef = useRef<HTMLParagraphElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check user accessibility preference
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || !containerRef.current) return;

    // Apply staggered animations to text elements
    const timeline: Array<{ element: HTMLElement | null; delay: number; duration: number }> = [
      { element: imageRef.current, delay: 0, duration: 500 },
      { element: headlineRef.current, delay: 150, duration: 300 },
      { element: subheadlineRef.current, delay: 300, duration: 300 },
      { element: ctaRef.current, delay: 450, duration: 300 },
    ];

    timeline.forEach(({ element, delay, duration }) => {
      if (!element) return;

      // Initial state
      element.style.opacity = "0";
      element.style.transform = element === imageRef.current ? "scale(0.95)" : "translateY(20px)";

      // Animate in
      setTimeout(() => {
        element.style.transition = `opacity ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1), transform ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
        element.style.opacity = "1";
        element.style.transform = element === imageRef.current ? "scale(1)" : "translateY(0)";
      }, delay);
    });

    // Parallax effect on scroll
    const handleScroll = () => {
      if (!imageRef.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const scrollProgress = Math.max(0, 1 - rect.bottom / window.innerHeight);
      const translateY = scrollProgress * 40;

      imageRef.current.style.transform = `scale(1.05) translateY(${translateY}px)`;
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-black"
    >
      {/* Background Image with Overlay */}
      {backgroundImage && (
        <div
          ref={imageRef}
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "brightness(0.6)",
          }}
        />
      )}

      {/* Gradient Overlay Mesh */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/60 pointer-events-none" />

      {/* Animated Radial Gradients */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full filter blur-3xl animate-pulse opacity-40" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full filter blur-3xl animate-pulse opacity-30" />

      {/* Content Container */}
      <div className="relative z-10 max-w-4xl mx-auto px-6 sm:px-8 text-center space-y-8">
        {/* Main Headline */}
        <h1
          ref={headlineRef}
          className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-tight"
        >
          {headline.split(" ").map((word, idx) => (
            <span key={idx} className="inline-block mr-2 lg:mr-3 opacity-0">
              {word}
            </span>
          ))}
        </h1>

        {/* Subheadline */}
        <p
          ref={subheadlineRef}
          className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed font-light opacity-0"
        >
          {subheadline}
        </p>

        {/* CTA Button */}
        {cta && (
          <div className="pt-4">
            <button
              ref={ctaRef}
              onClick={cta.onClick}
              className="group px-8 sm:px-12 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-semibold rounded-lg shadow-lg hover:shadow-2xl transition-all duration-200 transform hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto opacity-0"
            >
              {cta.text}
              <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
            </button>
          </div>
        )}
      </div>

      {/* Scroll Indicator */}
      {showScrollIndicator && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 animate-bounce">
          <ChevronDown className="w-6 h-6 text-slate-400" />
        </div>
      )}
    </div>
  );
}
