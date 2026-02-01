/**
 * astro-particle-image-viewer
 *
 * WebGL particle image viewer for Astro using Three.js
 */

// Components (for Astro users)
export { default as ParticleImageViewer } from './src/components/ParticleImageViewer.astro';

// Types
export type { Props as ParticleImageViewerProps } from './src/components/ParticleImageViewer.astro';

// Library exports (for advanced usage)
export { ParticleViewer } from './src/lib/particle-viewer/ParticleViewer';
export type { ParticleViewerConfig } from './src/lib/particle-viewer/ParticleViewer';

// Performance detection utilities
export {
    shouldUseFallback,
    prefersReducedMotion,
    isLowPerformance,
    isWebGLSupported,
    getFallbackReason,
} from './src/lib/particle-viewer/performance';
