/**
 * Animation utilities following ui-ux-pro-max guidelines
 * - Duration: 150-300ms for micro-interactions, up to 600ms for major reveals
 * - Easing: cubic-bezier(0.34, 1.56, 0.64, 1) for spring/snap feel
 * - Performance: Use transform/opacity only (avoid width/height changes)
 * - Accessibility: Respect prefers-reduced-motion
 */

export interface AnimationConfig {
  duration?: number; // milliseconds
  delay?: number; // milliseconds
  easing?: string; // CSS easing function
}

const DEFAULT_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/**
 * Apply staggered fade-in animation to children
 * Each child gets sequential delay
 */
export function applyStaggerAnimation(
  container: HTMLElement | null,
  config: AnimationConfig = {}
) {
  if (!container) return;

  const { duration = 300, delay = 50, easing = DEFAULT_EASING } = config;
  const children = Array.from(container.children) as HTMLElement[];

  children.forEach((child, index) => {
    child.style.opacity = "0";
    child.style.transform = "translateY(20px)";
    child.style.transition = `opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`;

    setTimeout(() => {
      child.style.opacity = "1";
      child.style.transform = "translateY(0)";
    }, delay * index);
  });
}

/**
 * Fade in an element
 */
export function fadeIn(
  element: HTMLElement | null,
  config: AnimationConfig = {}
) {
  if (!element) return;

  const { duration = 300, delay = 0, easing = DEFAULT_EASING } = config;

  element.style.opacity = "0";
  element.style.transition = `opacity ${duration}ms ${easing}`;

  setTimeout(() => {
    element.style.opacity = "1";
  }, delay);
}

/**
 * Fade in and slide up animation
 */
export function slideInUp(
  element: HTMLElement | null,
  config: AnimationConfig = {}
) {
  if (!element) return;

  const { duration = 400, delay = 0, easing = DEFAULT_EASING } = config;

  element.style.opacity = "0";
  element.style.transform = "translateY(20px)";
  element.style.transition = `opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`;

  setTimeout(() => {
    element.style.opacity = "1";
    element.style.transform = "translateY(0)";
  }, delay);
}

/**
 * Scale in animation
 */
export function scaleIn(
  element: HTMLElement | null,
  config: AnimationConfig = {}
) {
  if (!element) return;

  const { duration = 350, delay = 0, easing = DEFAULT_EASING } = config;

  element.style.opacity = "0";
  element.style.transform = "scale(0.95)";
  element.style.transition = `opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`;

  setTimeout(() => {
    element.style.opacity = "1";
    element.style.transform = "scale(1)";
  }, delay);
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Conditionally apply animation based on user preference
 */
export function safeAnimate(
  element: HTMLElement | null,
  animationFn: (el: HTMLElement | null) => void,
  config: AnimationConfig = {}
) {
  if (prefersReducedMotion()) {
    // Instant state without animation
    if (element) {
      element.style.opacity = "1";
      element.style.transform = "none";
    }
  } else {
    animationFn(element);
  }
}
