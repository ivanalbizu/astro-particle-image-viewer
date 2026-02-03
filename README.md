# Astro Particle Image Viewer

[![npm version](https://img.shields.io/npm/v/@ivanalbizu/astro-particle-image-viewer.svg)](https://www.npmjs.com/package/@ivanalbizu/astro-particle-image-viewer)

An Astro component that displays images with a stunning WebGL particle animation effect using Three.js. When users click on a thumbnail, the image explodes into particles that animate and reassemble into a fullscreen view.

## Features

- WebGL-powered particle animations using Three.js
- Smooth transitions between images
- Keyboard navigation (Arrow keys, Escape)
- Touch-friendly navigation buttons
- **Swipe gestures** for mobile navigation
- Responsive design with mobile optimizations
- Customizable animation parameters
- **Sliding window pagination** with WCAG-compliant 44px touch targets
- Accessible with ARIA labels and focus management
- **Focus-visible styles** for keyboard users
- **Respects accessibility preferences** - uses SimpleLightbox fallback for reduced motion, low-performance devices, and no WebGL support
- **Dynamic imports** - only loads Three.js when needed (code-splitting)
- **CSS custom properties** for easy theming
- **View Transitions compatible** - works seamlessly with Astro View Transitions

## Installation

```bash
npm install @ivanalbizu/astro-particle-image-viewer
```

## Usage

```astro
---
import { ParticleImageViewer } from '@ivanalbizu/astro-particle-image-viewer';
---

<ParticleImageViewer
  config={{
    openDuration: 2000,
    closeDuration: 1200,
    maxWidth: 1440,
  }}
>
  <img src="/image-1.jpg" width="300" alt="Description 1" />
  <img src="/image-2.jpg" width="300" alt="Description 2" />
  <img src="/image-3.jpg" width="300" alt="Description 3" />
</ParticleImageViewer>
```

The component uses a slot, so you can add any `<img>` elements as children. Each image will automatically be wrapped in an accessible button.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | - | Optional title above the gallery |
| `class` | `string` | - | Additional CSS class for the wrapper |
| `config` | `ParticleViewerConfig` | `{}` | Animation configuration options |

### ParticleViewerConfig

```typescript
interface ParticleViewerConfig {
  segments?: number;       // Particle grid resolution (default: 180, mobile: 80)
  padding?: number;        // Image padding multiplier (default: 1.1)
  openDuration?: number;   // Open animation duration in ms (default: 2000)
  closeDuration?: number;  // Close animation duration in ms (default: 1200)
  crossfadeStart?: number; // When to start crossfade 0-1 (default: 0.2)
  srcAttribute?: string;   // Attribute for image source (default: 'src')
  maxWidth?: number;       // Maximum image width in pixels (default: 0 = no limit)
}
```

### Lazy Loading Support

Use `srcAttribute` to work with lazy loading libraries that use custom attributes like `data-src`:

```astro
<ParticleImageViewer
  config={{
    srcAttribute: 'data-src'
  }}
>
  <img data-src="/image-1.jpg" src="/placeholder.jpg" alt="Description" />
</ParticleImageViewer>
```

## Styling

The component uses CSS custom properties that you can override:

```css
.particle-image-viewer-wrapper {
  /* Colors */
  --piv-title-color: #333;
  --piv-text-color: white;
  --piv-text-color-inverse: #111;
  --piv-shadow: rgba(0, 0, 0, 0.1);
  --piv-overlay-bg: rgba(0, 0, 0, 0.25);
  --piv-caption-bg: rgba(0, 0, 0, 0.5);
  --piv-button-bg: rgba(0, 0, 0, 0.6);
  --piv-button-bg-hover: rgba(0, 0, 0, 0.8);
  --piv-button-border: rgba(255, 255, 255, 0.5);
  --piv-button-border-hover: rgba(255, 255, 255, 0.8);
  --piv-button-shadow: rgba(0, 0, 0, 0.3);
  --piv-active-bg: rgba(255, 255, 255, 0.9);
  --piv-active-glow: rgba(255, 255, 255, 0.4);
  --piv-focus-ring: rgba(255, 255, 255, 0.9);

  /* Spacing */
  --piv-spacing-sm: 8px;
  --piv-spacing-md: 20px;
  --piv-spacing-lg: 30px;
  --piv-caption-bottom: 90px;
  --piv-pagination-bottom: 30px;

  /* Sizes */
  --piv-button-size: 50px;
  --piv-dot-size: 44px;
  --piv-border-radius: 8px;
  --piv-border-radius-round: 50%;
  --piv-border-radius-pill: 20px;
  --piv-border-width: 2px;

  /* Typography */
  --piv-font-size-close: 32px;
  --piv-font-size-nav: 24px;
  --piv-font-size-caption: 18px;
  --piv-font-size-dot: 14px;

  /* Blur */
  --piv-blur-overlay: 5px;
  --piv-blur-button: 4px;
  --piv-blur-caption: 10px;

  /* Transitions */
  --piv-transition-fast: 0.2s ease;
  --piv-transition-normal: 0.3s ease;
  --piv-transition-slow: 0.5s ease;

  /* Z-index */
  --piv-z-container: 1000;
  --piv-z-controls: 10;
  --piv-z-pagination: 20;
}
```

## Keyboard Navigation

When the viewer is open:
- **Escape**: Close the viewer
- **Arrow Left**: Previous image
- **Arrow Right**: Next image
- **Tab**: Navigate between controls (with focus trap)

## Touch Navigation

- **Swipe left**: Next image
- **Swipe right**: Previous image
- **Tap outside image**: Close viewer

## Accessibility & Performance

The component automatically provides a simplified lightbox experience when:

- User has **`prefers-reduced-motion: reduce`** enabled
- Browser has **Data Saver** mode enabled
- Connection is **2G or slow-2g**
- **WebGL is not supported**

When any of these conditions are detected, `SimpleLightbox` is used instead of `ParticleViewer`. This provides the same navigation functionality without WebGL animations, respecting user preferences and network conditions.

**Privacy browser compatible**: Works with Brave and other privacy-focused browsers that may falsify hardware information.

### Manual fallback detection

```typescript
import { shouldUseFallback, getFallbackReason } from '@ivanalbizu/astro-particle-image-viewer';

if (shouldUseFallback()) {
  console.log('Using SimpleLightbox:', getFallbackReason());
  // 'prefers-reduced-motion' | 'low-performance-device' | 'webgl-not-supported'
}
```

## View Transitions Support

The component is fully compatible with [Astro View Transitions](https://docs.astro.build/en/guides/view-transitions/). It automatically:

- **Cleans up resources** before page navigation (`astro:before-swap`)
- **Reinitializes** after navigation completes (`astro:page-load`)
- **Prevents memory leaks** by properly disposing WebGL contexts and event listeners
- **Works without View Transitions** - the component functions normally on pages without View Transitions enabled

No additional configuration is needed. The component handles both scenarios transparently.

## Advanced Usage

For more control, you can use the classes directly:

```typescript
import { ParticleViewer, SimpleLightbox } from '@ivanalbizu/astro-particle-image-viewer';

// WebGL version with particle animations
const viewer = new ParticleViewer(
  '.my-container',
  '.my-image-buttons',
  { openDuration: 3000, srcAttribute: 'data-src' }
);

// Simple version without animations (for reduced motion)
const lightbox = new SimpleLightbox(
  '.my-container',
  '.my-image-buttons',
  'data-src' // optional: custom source attribute
);

// Clean up when done
viewer.destroy();
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build site
npm run build

# Publish to npm
npm publish --access public
```

## License

MIT
