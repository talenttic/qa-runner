/**
 * Performance Optimization Configuration
 * Strategies to improve bundle size, loading times, and runtime performance
 */

// Image optimization guide
export const IMAGE_OPTIMIZATION = {
  formats: ['webp', 'png', 'jpg'],
  sizes: {
    thumbnail: 64,
    small: 256,
    medium: 512,
    large: 1024,
  },
};

// Recommended code splitting strategy
export const CODE_SPLITTING_STRATEGY = {
  // Lazy load pages/sections
  manualTestingPage: 'dynamic',
  onboardingModal: 'dynamic',
  
  // Pre-load dependencies
  vendor: 'static',
  router: 'static',
  
  // On-demand loading
  heavyComponents: 'dynamic',
};

// Bundle size targets (in KB)
export const BUNDLE_TARGETS = {
  vendor: 150,
  router: 30,
  pages: 150,
  ui: 100,
  main: 100,
};

/**
 * Performance monitoring utilities
 */
export const performanceMonitoring = {
  /**
   * Measure Core Web Vitals
   */
  measureCoreWebVitals: () => {
    if ('web-vital' in window) {
      console.info('Core Web Vitals monitoring active');
    }
  },

  /**
   * Measure component render time
   */
  measureRenderTime: (componentName: string, duration: number) => {
    if (duration > 100) {
      console.warn(
        `Slow render detected: ${componentName} took ${duration}ms`
      );
    }
  },

  /**
   * Log bundle chunk load times
   */
  logChunkLoadTime: (chunkName: string, duration: number) => {
    if (duration > 1000) {
      console.warn(
        `Slow chunk load: ${chunkName} took ${duration}ms`
      );
    }
  },
};

/**
 * Recommended lazy loading components
 * These should use React.lazy() for code splitting
 */
export const LAZY_LOAD_COMPONENTS = [
  'ManualTestingPage',
  'OnboardingModal',
  'ReportModal',
  'AdvancedFilters',
  'TestGenerationWizard',
];

/**
 * Prefetch strategy for network resources
 */
export const prefetchResources = () => {
  // Prefetch important resources
  const preloadLinks = [
    { rel: 'prefetch', href: '/api/suites', as: 'fetch' },
    { rel: 'prefetch', href: '/api/runs', as: 'fetch' },
  ];

  preloadLinks.forEach((link) => {
    const element = document.createElement('link');
    element.rel = link.rel;
    element.href = link.href;
    element.as = link.as as any;
    document.head.appendChild(element);
  });
};

/**
 * Service Worker caching strategy
 */
export const CACHE_STRATEGY = {
  static: 'CacheFirst', // index.html, css, js
  api: 'NetworkFirst', // API calls
  images: 'CacheFirst',
  documents: 'StaleWhileRevalidate',
};
