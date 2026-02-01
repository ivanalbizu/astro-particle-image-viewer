/**
 * Performance detection and accessibility fallbacks for Particle Image Viewer
 */

interface NavigatorWithExtensions extends Navigator {
	connection?: {
		saveData?: boolean;
		effectiveType?: string;
	};
	deviceMemory?: number;
}

/**
 * Detects if the user prefers reduced motion (accessibility setting)
 */
export function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Detects if the device is likely low-performance based on hardware heuristics
 */
export function isLowPerformance(): boolean {
	const nav = navigator as NavigatorWithExtensions;

	// 1. Data Saver mode enabled
	if (nav.connection?.saveData) {
		return true;
	}

	// 2. Slow connection (2G or slow-2g)
	const effectiveType = nav.connection?.effectiveType;
	if (effectiveType === '2g' || effectiveType === 'slow-2g') {
		return true;
	}

	// 3. Low device memory (less than 4GB RAM) - Chrome/Edge only
	const memory = nav.deviceMemory;
	if (memory !== undefined && memory < 4) {
		return true;
	}

	// 4. Low CPU cores (2 or fewer)
	const cores = navigator.hardwareConcurrency;
	if (cores !== undefined && cores <= 2) {
		return true;
	}

	return false;
}

/**
 * Checks if WebGL is supported and functional
 */
export function isWebGLSupported(): boolean {
	try {
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
		return gl !== null;
	} catch {
		return false;
	}
}

/**
 * Determines if the fallback (non-WebGL) mode should be used
 */
export function shouldUseFallback(): boolean {
	return prefersReducedMotion() || isLowPerformance() || !isWebGLSupported();
}

/**
 * Returns the reason why fallback mode is being used (for debugging)
 */
export function getFallbackReason(): string | null {
	if (prefersReducedMotion()) return 'prefers-reduced-motion';
	if (!isWebGLSupported()) return 'webgl-not-supported';
	if (isLowPerformance()) return 'low-performance-device';
	return null;
}
