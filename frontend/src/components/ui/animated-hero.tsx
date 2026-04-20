import { ChevronDown } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface AnimatedHeroProps {
  headline: string;
  subheadline: string;
  backgroundImage: string;
  cta: {
    text: string;
    onClick: () => void;
  };
  showScrollIndicator?: boolean;
}

export const AnimatedHero: React.FC<AnimatedHeroProps> = ({
  headline,
  subheadline,
  backgroundImage,
  cta,
  showScrollIndicator = true,
}) => {
  const imageRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadlineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const scrollIndicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      // Skip animations if user prefers reduced motion
      return;
    }

    // Helper to apply animation
    const animateElement = (
      el: HTMLElement | null,
      delay: number,
      duration: number = 600,
    ) => {
      if (!el) return;

      el.style.opacity = "0";
      el.style.transform = "translateY(20px)";
      el.style.transition = `all ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;

      // Trigger animation after a small delay to ensure transition is applied
      setTimeout(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      }, delay);
    };

    // Stagger animations: image (0ms), headline (150ms), subheadline (300ms), CTA (450ms)
    animateElement(imageRef.current, 0, 500);
    animateElement(headlineRef.current, 150, 600);
    animateElement(subheadlineRef.current, 300, 600);
    animateElement(ctaRef.current, 450, 600);

    // Scroll indicator pulse animation
    if (scrollIndicatorRef.current && showScrollIndicator) {
      scrollIndicatorRef.current.style.animation = "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite";
    }

    // Parallax effect on scroll
    const handleScroll = () => {
      if (!imageRef.current) return;
      const scrolled = window.scrollY;
      imageRef.current.style.transform = `translateY(${scrolled * 0.5}px)`;
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [showScrollIndicator]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-gradient-to-b from-teal-900/40 via-emerald-900/20 to-slate-900/40">
      {/* Background Image with Parallax */}
      <div
        ref={imageRef}
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('${backgroundImage}')`,
          filter: "brightness(0.6) contrast(1.1) saturate(1.2)",
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-900/50 to-slate-950/70" />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center sm:px-6 lg:px-8">
        {/* Headline with staggered character animation */}
        <h1
          ref={headlineRef}
          className="mb-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-7xl"
          style={{
            textShadow: "0 10px 40px rgba(0, 0, 0, 0.5), 0 0 30px rgba(16, 185, 129, 0.2)",
            letterSpacing: "-0.02em",
          }}
        >
          {headline.split(" ").map((word, i) => (
            <span
              key={i}
              className="inline-block mr-4 animate-fade-in-up"
              style={{
                animationDelay: `${100 + i * 50}ms`,
              }}
            >
              {word}
            </span>
          ))}
        </h1>

        {/* Subheadline */}
        <p
          ref={subheadlineRef}
          className="mb-12 max-w-2xl text-lg text-emerald-100 sm:text-xl lg:text-2xl"
          style={{
            textShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
            lineHeight: "1.6",
          }}
        >
          {subheadline}
        </p>

        {/* CTA Button */}
        <div ref={ctaRef} className="flex gap-4 flex-wrap justify-center">
          <Button
            onClick={cta.onClick}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-8 py-3 rounded-lg font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
            style={{
              boxShadow: "0 20px 40px rgba(16, 185, 129, 0.3), 0 0 60px rgba(20, 184, 166, 0.15)",
            }}
          >
            {cta.text}
          </Button>
        </div>

        {/* Scroll Indicator */}
        {showScrollIndicator && (
          <div
            ref={scrollIndicatorRef}
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce"
          >
            <ChevronDown className="w-8 h-8 text-emerald-300" />
          </div>
        )}
      </div>

      {/* Accent light rays effect */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full filter blur-3xl opacity-30" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-500/10 rounded-full filter blur-3xl opacity-20" />
    </div>
  );
};
