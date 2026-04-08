import React from "react";

/**
 * Accessibility Utilities for WCAG 2.1 Compliance
 * Helps ensure proper ARIA labels, focus management, and keyboard navigation
 */

/**
 * Generate unique IDs for ARIA relationships
 */
export const generateId = (prefix: string): string => {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Focus trap - Keep focus within a modal or dialog
 */
export const useFocusTrap = (ref: React.RefObject<HTMLDivElement>) => {
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const focusableElements = element.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[
      focusableElements.length - 1
    ] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    element.addEventListener("keydown", handleKeyDown);
    setTimeout(() => firstElement.focus(), 0);

    return () => element.removeEventListener("keydown", handleKeyDown);
  }, [ref]);
};

/**
 * Announce to screen readers live region updates
 */
export const announceToScreenReader = (
  message: string,
  priority: "polite" | "assertive" = "polite"
) => {
  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("role", "status");
  liveRegion.setAttribute("aria-live", priority);
  liveRegion.setAttribute("aria-atomic", "true");
  liveRegion.className = "sr-only";
  liveRegion.textContent = message;

  document.body.appendChild(liveRegion);
  setTimeout(() => liveRegion.remove(), 1000);
};

/**
 * Prevent focus from being lost after an action
 */
export const manageFocus = (
  focusTarget: HTMLElement | null,
  onFocusLoss?: () => void
) => {
  if (!focusTarget) return;

  const previouslyFocused = document.activeElement as HTMLElement;

  return () => {
    if (previouslyFocused && previouslyFocused.focus) {
      previouslyFocused.focus();
    } else if (onFocusLoss) {
      onFocusLoss();
    }
  };
};

/**
 * Accessible button component with proper ARIA attributes
 */
export interface AccessibleButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  ariaLabel?: string;
  ariaPressed?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
}

/**
 * WCAG 2.1 Color Contrast Checker
 * Validates that text colors have sufficient contrast for readability
 */
export const checkColorContrast = (
  foreground: string,
  background: string
): { ratio: number; passes: boolean } => {
  // Simplified contrast ratio calculation
  // In production, use a library like polished or chroma.js
  const getLuminance = (color: string): number => {
    // This is a simplified version - use a real library for accuracy
    const match = color.match(/\d+/g);
    if (!match || match.length < 3) return 0.5;

    const [r, g, b] = match.map((n) => {
      const v = parseInt(n) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    passes: ratio >= 4.5, // WCAG AA standard
  };
};

/**
 * Helper to add proper ARIA labels to interactive elements
 */
export const createAriaDescribedBy = (
  descriptions: string[]
): string | undefined => {
  return descriptions.filter(Boolean).length > 0
    ? descriptions.filter(Boolean).join(" ")
    : undefined;
};

/**
 * Accessibility context provider for global settings
 */
export const useReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] =
    React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  return prefersReducedMotion;
};
