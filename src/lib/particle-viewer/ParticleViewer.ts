import type {
	Scene,
	Clock,
	OrthographicCamera,
	WebGLRenderer,
	Points,
	Mesh,
	Texture,
	ShaderMaterial,
	MeshBasicMaterial,
} from 'three';
import vertexShader from './shaders/particles.vert?raw';
import fragmentShader from './shaders/particles.frag?raw';
import { isLowPerformance, prefersReducedMotion } from './performance';

export interface ParticleViewerConfig {
	segments?: number;
	padding?: number;
	openDuration?: number;
	closeDuration?: number;
	crossfadeStart?: number;
	srcAttribute?: string;
}

const defaultConfig: Required<ParticleViewerConfig> = {
	segments: 180,
	padding: 1.1,
	openDuration: 2000,
	closeDuration: 1200,
	crossfadeStart: 0.2,
	srcAttribute: 'src',
};

type ThreeModule = typeof import('./three-proxy');

export class ParticleViewer {
	private container!: HTMLElement;
	private canvas!: HTMLCanvasElement;
	private closeButton!: HTMLButtonElement;
	private prevButton!: HTMLButtonElement;
	private nextButton!: HTMLButtonElement;
	private captionElement: HTMLElement | null = null;
	private paginationElement: HTMLElement | null = null;
	private images!: NodeListOf<HTMLElement>;
	private scene: Scene | null = null;
	private clock: Clock | null = null;
	private camera: OrthographicCamera | null = null;
	private renderer: WebGLRenderer | null = null;
	private currentPoints: Points | null = null;
	private currentMesh: Mesh | null = null;
	private isAnimating: boolean = false;
	private sourceImage: HTMLImageElement | null = null;
	private animationId: number | null = null;
	private renderId: number | null = null;
	private currentIndex: number = 0;
	private config: Required<ParticleViewerConfig>;
	private imageWidth: number = 0;
	private imageHeight: number = 0;
	private paginationStartIndex: number = 0;
	private maxVisibleDots: number = 5;
	private dotsContainer: HTMLElement | null = null;
	private prevPageButton: HTMLButtonElement | null = null;
	private nextPageButton: HTMLButtonElement | null = null;

	private THREE: ThreeModule | null = null;
	private threeLoading: Promise<ThreeModule> | null = null;
	private touchStartX: number = 0;
	private touchStartY: number = 0;
	private readonly swipeThreshold: number = 50;

	// Bound event handlers for cleanup
	private boundKeydown!: (e: KeyboardEvent) => void;
	private boundResize!: () => void;
	private boundTouchStart!: (e: TouchEvent) => void;
	private boundTouchEnd!: (e: TouchEvent) => void;
	private imageHandlers: Map<HTMLElement, { click: () => void; mouseenter: () => void; touchstart: () => void }> = new Map();

	constructor(
		containerSelector: string,
		imageSelector: string,
		userConfig: ParticleViewerConfig = {}
	) {
		const container = document.querySelector(containerSelector);
		if (!container) throw new Error('Container element not found');
		this.container = container as HTMLElement;

		this.canvas = this.container.querySelector<HTMLCanvasElement>('canvas.webgl-canvas')!;
		this.closeButton = this.container.querySelector<HTMLButtonElement>('.close-button')!;
		this.prevButton = this.container.querySelector<HTMLButtonElement>('.nav-button.prev')!;
		this.nextButton = this.container.querySelector<HTMLButtonElement>('.nav-button.next')!;
		this.captionElement = this.container.querySelector<HTMLElement>('.caption');
		this.paginationElement = this.container.querySelector<HTMLElement>('.pagination');

		this.images = document.querySelectorAll(imageSelector);

		const hasMultipleImages = this.images.length > 1;
		if (!hasMultipleImages) {
			this.prevButton.hidden = true;
			this.nextButton.hidden = true;
			if (this.paginationElement) this.paginationElement.hidden = true;
		}

		const isMobile = window.innerWidth < 768;
		const isLowPerf = isLowPerformance();

		this.config = {
			...defaultConfig,
			...userConfig,
			// Drastically reduce segments on slow devices (40) or mobile (80)
			segments: userConfig.segments ?? (isLowPerf ? 40 : (isMobile ? 80 : defaultConfig.segments)),
		};

		if (prefersReducedMotion()) {
			this.config.openDuration = 0;
			this.config.closeDuration = 0;
		}

		this.bindEvents();
		if (hasMultipleImages) this.initPagination();
	}

	private async loadThree(): Promise<ThreeModule> {
		if (this.THREE) return this.THREE;
		if (this.threeLoading) return this.threeLoading;

		this.threeLoading = import('./three-proxy').then((module) => {
			this.THREE = module;
			return module;
		});

		return this.threeLoading;
	}

	private initThreeJS(): void {
		if (!this.THREE || this.scene) return;

		const isMobile = window.innerWidth < 768;

		this.scene = new this.THREE.Scene();
		this.clock = new this.THREE.Clock();
		this.camera = new this.THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
		this.camera.position.z = 100;

		this.renderer = new this.THREE.WebGLRenderer({
			canvas: this.canvas,
			alpha: true,
			antialias: !isMobile,
			powerPreference: "high-performance"
		});
	}

	private bindEvents(): void {
		this.images.forEach((item) => {
			const handlers = {
				click: () => this.open(item),
				mouseenter: () => this.loadThree(),
				touchstart: () => this.loadThree(),
			};
			this.imageHandlers.set(item, handlers);
			item.addEventListener('click', handlers.click);
			item.addEventListener('mouseenter', handlers.mouseenter);
			item.addEventListener('touchstart', handlers.touchstart, { passive: true });
		});

		this.closeButton.addEventListener('click', () => this.close());

		this.prevButton.addEventListener('click', (e) => {
			e.stopPropagation();
			this.prev();
		});

		this.nextButton.addEventListener('click', (e) => {
			e.stopPropagation();
			this.next();
		});

		this.boundKeydown = (event: KeyboardEvent) => {
			if (this.container.classList.contains('visible')) {
				if (event.key === 'Escape') this.close();
				if (event.key === 'ArrowLeft') {
					event.preventDefault();
					this.prev();
				}
				if (event.key === 'ArrowRight') {
					event.preventDefault();
					this.next();
				}

				if (event.key === 'Tab') {
					const focusable = this.images.length > 1
						? [this.closeButton, this.prevButton, this.nextButton]
						: [this.closeButton];
					const first = focusable[0];
					const last = focusable[focusable.length - 1];

					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault();
						last.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first.focus();
					}
				}
			}
		};
		document.addEventListener('keydown', this.boundKeydown);

		this.boundResize = () => {
			if (this.container.classList.contains('visible')) {
				this.updateCamera();
				this.updateStartPositions();
			}
		};
		window.addEventListener('resize', this.boundResize);

		this.boundTouchStart = (e: TouchEvent) => {
			this.touchStartX = e.touches[0].clientX;
			this.touchStartY = e.touches[0].clientY;
		};
		this.container.addEventListener('touchstart', this.boundTouchStart, { passive: true });

		this.boundTouchEnd = (e: TouchEvent) => {
			if (!this.container.classList.contains('visible')) return;
			if (this.images.length <= 1 || this.isAnimating) return;

			const touchEndX = e.changedTouches[0].clientX;
			const touchEndY = e.changedTouches[0].clientY;
			const deltaX = touchEndX - this.touchStartX;
			const deltaY = touchEndY - this.touchStartY;

			if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.swipeThreshold) {
				if (deltaX > 0) {
					this.prev();
				} else {
					this.next();
				}
			}
		};
		this.container.addEventListener('touchend', this.boundTouchEnd, { passive: true });
	}

	private initPagination(): void {
		if (!this.paginationElement) return;
		this.paginationElement.innerHTML = '';

		const totalImages = this.images.length;
		const needsNavigation = totalImages > this.maxVisibleDots;

		if (needsNavigation) {
			this.prevPageButton = document.createElement('button');
			this.prevPageButton.className = 'pagination-nav';
			this.prevPageButton.innerHTML = '&#10094;';
			this.prevPageButton.ariaLabel = 'Imagen anterior';
			this.prevPageButton.addEventListener('click', (e) => {
				e.stopPropagation();
				this.prev();
			});
			this.paginationElement.appendChild(this.prevPageButton);
		}

		this.dotsContainer = document.createElement('div');
		this.dotsContainer.className = 'pagination-dots';
		this.paginationElement.appendChild(this.dotsContainer);

		this.images.forEach((_, index) => {
			const dot = document.createElement('button');
			dot.className = 'pagination-dot';
			dot.innerText = (index + 1).toString();
			dot.ariaLabel = `Ir a imagen ${index + 1}`;
			dot.addEventListener('click', (e) => {
				e.stopPropagation();
				if (this.currentIndex !== index && !this.isAnimating) {
					this.transitionTo(index);
				}
			});
			this.dotsContainer!.appendChild(dot);
		});

		if (needsNavigation) {
			this.nextPageButton = document.createElement('button');
			this.nextPageButton.className = 'pagination-nav';
			this.nextPageButton.innerHTML = '&#10095;';
			this.nextPageButton.ariaLabel = 'Imagen siguiente';
			this.nextPageButton.addEventListener('click', (e) => {
				e.stopPropagation();
				this.next();
			});
			this.paginationElement.appendChild(this.nextPageButton);
		}

		this.updatePaginationVisibility();
	}

	private updatePaginationVisibility(): void {
		if (!this.dotsContainer) return;

		const dots = this.dotsContainer.children;
		const total = this.images.length;

		let startIndex = this.paginationStartIndex;
		const endIndex = Math.min(startIndex + this.maxVisibleDots, total);

		if (endIndex - startIndex < this.maxVisibleDots && total >= this.maxVisibleDots) {
			startIndex = total - this.maxVisibleDots;
		}

		for (let i = 0; i < dots.length; i++) {
			const dot = dots[i] as HTMLElement;
			const isVisible = i >= startIndex && i < endIndex;
			dot.style.display = isVisible ? 'flex' : 'none';
		}
	}

	private updatePagination(): void {
		if (!this.dotsContainer) return;

		const dots = this.dotsContainer.children;
		for (let i = 0; i < dots.length; i++) {
			dots[i].classList.toggle('active', i === this.currentIndex);
		}

		const total = this.images.length;
		if (total > this.maxVisibleDots) {
			const minStart = Math.max(0, this.currentIndex - this.maxVisibleDots + 1);
			const maxStart = Math.min(this.currentIndex, total - this.maxVisibleDots);

			if (this.paginationStartIndex < minStart) {
				this.paginationStartIndex = minStart;
			} else if (this.paginationStartIndex > maxStart) {
				this.paginationStartIndex = maxStart;
			}
		}

		this.updatePaginationVisibility();
	}

	public async open(item: HTMLElement): Promise<void> {
		if (this.isAnimating) return;
		if (this.currentPoints) this.cleanupScene();

		const img = this.getImageFromItem(item);
		if (!img) return;

		const THREE = await this.loadThree();
		this.initThreeJS();

		if (!this.scene || !this.renderer || !this.camera || !this.clock) return;

		this.currentIndex = Array.from(this.images).indexOf(item);
		this.updatePagination();

		this.sourceImage = img;

		if (this.captionElement) {
			this.captionElement.innerText = img.getAttribute('alt') || '';
			this.captionElement.classList.add('visible');
		}

		const imgSrc = img.getAttribute(this.config.srcAttribute) || img.getAttribute('src');
		new THREE.TextureLoader().load(imgSrc!, (texture: Texture) => {
			texture.colorSpace = THREE.SRGBColorSpace;

			const textureImage = texture.image as HTMLImageElement;
			const reducedMotion = prefersReducedMotion();
			const bgDuration = reducedMotion ? 0 : this.config.openDuration;
			const bgDelay = reducedMotion ? 0 : 600;
			this.updateBackground(imgSrc!, bgDuration, bgDelay);

			const imgWidth = textureImage.naturalWidth;
			const imgHeight = textureImage.naturalHeight;
			this.imageWidth = imgWidth;
			this.imageHeight = imgHeight;
			const geometry = new THREE.PlaneGeometry(
				imgWidth,
				imgHeight,
				this.config.segments,
				this.config.segments
			);

			const imgRect = img.getBoundingClientRect();
			const vpWidth = window.innerWidth;
			const vpHeight = window.innerHeight;
			const imgAspect = imgWidth / imgHeight;
			const vpAspect = vpWidth / vpHeight;
			let viewWidth, viewHeight;
			if (imgAspect > vpAspect) {
				viewWidth = imgWidth * this.config.padding;
				viewHeight = viewWidth / vpAspect;
			} else {
				viewHeight = imgHeight * this.config.padding;
				viewWidth = viewHeight * vpAspect;
			}

			const count = geometry.attributes.position.count;
			const startPositions = new Float32Array(count * 3);
			const curveOffsets = new Float32Array(count * 3);
			const delays = new Float32Array(count);
			const rotationSpeeds = new Float32Array(count);
			const uvs = geometry.attributes.uv.array;

			const maxDistance = Math.sqrt(0.5 * 0.5 + 0.5 * 0.5);

			for (let i = 0; i < count; i++) {
				const u = uvs[i * 2];
				const v = uvs[i * 2 + 1];

				const sourcePx = imgRect.left + u * imgRect.width;
				const sourcePy = imgRect.top + (1.0 - v) * imgRect.height;

				const startX = (sourcePx / vpWidth) * viewWidth - viewWidth / 2;
				const startY = -(sourcePy / vpHeight) * viewHeight + viewHeight / 2;

				startPositions[i * 3] = startX;
				startPositions[i * 3 + 1] = startY;
				startPositions[i * 3 + 2] = 0;

				curveOffsets[i * 3] = (Math.random() - 0.5) * 4.0;
				curveOffsets[i * 3 + 1] = (Math.random() - 0.5) * 4.0;
				curveOffsets[i * 3 + 2] = 0.0;

				const centerU = u - 0.5;
				const centerV = v - 0.5;
				const distanceFromCenter = Math.sqrt(centerU * centerU + centerV * centerV);
				const normalizedDistance = distanceFromCenter / maxDistance;
				delays[i] = (1.0 - normalizedDistance) * 0.25 + Math.random() * 0.05;
				rotationSpeeds[i] = (Math.random() - 0.5) * 20.0;
			}
			geometry.setAttribute('aStartPosition', new THREE.BufferAttribute(startPositions, 3));
			geometry.setAttribute('aCurveOffset', new THREE.BufferAttribute(curveOffsets, 3));
			geometry.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1));
			geometry.setAttribute('aRotationSpeed', new THREE.BufferAttribute(rotationSpeeds, 1));

			const material = new THREE.ShaderMaterial({
				vertexShader: vertexShader,
				fragmentShader: fragmentShader,
				uniforms: {
					uTime: { value: 0 },
					uTexture: { value: texture },
					uTextureNext: { value: texture },
					uTextureMix: { value: 0.0 },
					uProgress: { value: 0.0 },
					uSize: { value: 2.0 },
					uOpacity: { value: 1.0 },
					uMode: { value: 0.0 },
					uDispersion: { value: 0.0 },
				},
				transparent: true,
				depthWrite: false,
				blending: THREE.NormalBlending,
			});

			this.currentPoints = new THREE.Points(geometry, material);
			this.scene!.add(this.currentPoints);

			const meshMaterial = new THREE.MeshBasicMaterial({
				map: texture,
				transparent: true,
				opacity: 0.0,
			});
			this.currentMesh = new THREE.Mesh(geometry, meshMaterial);
			this.currentMesh.visible = false;
			this.scene!.add(this.currentMesh);

			this.container.classList.add('visible');
			document.body.style.overflow = 'hidden';
			this.closeButton.focus();

			this.updateCamera();
			this.tweenProgress(1.0, this.config.openDuration);

			if (!this.renderId) this.animate();
		});
	}

	public close(): void {
		if (this.isAnimating || !this.currentPoints) return;

		if (this.currentMesh) {
			this.currentMesh.visible = false;
			(this.currentMesh.material as MeshBasicMaterial).opacity = 0.0;
		}
		if (this.currentPoints) {
			this.currentPoints.visible = true;
			(this.currentPoints.material as ShaderMaterial).uniforms.uOpacity.value = 1.0;
			(this.currentPoints.material as ShaderMaterial).uniforms.uMode.value = 1.0;
		}

		const bgImages = this.container.querySelectorAll<HTMLElement>('.particle-bg');
		bgImages.forEach(child => {
			child.style.transition = `opacity ${this.config.closeDuration}ms ease`;
			child.style.opacity = '0';
		});

		const onAnimationComplete = () => {
			this.container.classList.remove('visible');
			if (this.captionElement) this.captionElement.classList.remove('visible');
			document.body.style.overflow = '';
			this.cleanupScene();

			this.container.querySelectorAll('.particle-bg').forEach(img => img.remove());

			if (this.images[this.currentIndex]) {
				this.images[this.currentIndex].focus();
			}
		};

		this.tweenProgress(0.0, this.config.closeDuration, onAnimationComplete);
	}

	public next(): void {
		if (this.isAnimating || this.images.length <= 1) return;
		const nextIndex = (this.currentIndex + 1) % this.images.length;
		this.transitionTo(nextIndex);
	}

	public prev(): void {
		if (this.isAnimating || this.images.length <= 1) return;
		const prevIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
		this.transitionTo(prevIndex);
	}

	private transitionTo(newIndex: number): void {
		if (this.isAnimating || !this.THREE) return;
		this.isAnimating = true;

		const THREE = this.THREE;
		const newItem = this.images[newIndex];
		const newImage = this.getImageFromItem(newItem);
		const newImgSrc = newImage?.getAttribute(this.config.srcAttribute) || newImage?.getAttribute('src');
		if (!newImgSrc || !this.currentPoints || !this.currentMesh) {
			this.isAnimating = false;
			return;
		}

		if (this.captionElement) this.captionElement.classList.remove('visible');

		const loader = new THREE.TextureLoader();
		loader.load(newImgSrc, (newTexture: Texture) => {
			newTexture.colorSpace = THREE.SRGBColorSpace;

			if (prefersReducedMotion()) {
				this.swapImageContent(newItem, newTexture);
				if (this.currentMesh) {
					this.currentMesh.visible = true;
					(this.currentMesh.material as MeshBasicMaterial).opacity = 1.0;
				}
				if (this.currentPoints) this.currentPoints.visible = false;
				this.isAnimating = false;
				return;
			}

			if (this.currentMesh) this.currentMesh.visible = false;
			if (this.currentPoints) {
				this.currentPoints.visible = true;
				(this.currentPoints.material as ShaderMaterial).uniforms.uOpacity.value = 1.0;
				(this.currentPoints.material as ShaderMaterial).uniforms.uTextureNext.value = newTexture;
			}

			const disperseDuration = 800;
			const startTime = Date.now();

			const disperseFrame = () => {
				const elapsed = Date.now() - startTime;
				let progress = Math.min(elapsed / disperseDuration, 1.0);
				const ease = progress * progress * (3 - 2 * progress);

				if (this.currentPoints) {
					(this.currentPoints.material as ShaderMaterial).uniforms.uDispersion.value = ease;
					(this.currentPoints.material as ShaderMaterial).uniforms.uTextureMix.value = ease;
				}

				if (progress < 1.0) {
					this.animationId = requestAnimationFrame(disperseFrame);
				} else {
					this.swapImageContent(newItem, newTexture);
					this.animateReassembly();
				}
			};
			this.animationId = requestAnimationFrame(disperseFrame);
		}, undefined, (err: unknown) => {
			console.error('Error loading texture:', err);
			this.isAnimating = false;
		});
	}

	private swapImageContent(newItem: HTMLElement, newTexture: Texture): void {
		if (!this.currentPoints || !this.currentMesh || !this.THREE) return;

		const THREE = this.THREE;
		const newImage = this.getImageFromItem(newItem);
		if (!newImage) return;

		const textureImage = newTexture.image as HTMLImageElement;
		const bgDuration = prefersReducedMotion() ? 0 : 1200;
		this.updateBackground(newImage.getAttribute(this.config.srcAttribute) || newImage.getAttribute('src')!, bgDuration);

		this.sourceImage = newImage;
		this.currentIndex = Array.from(this.images).indexOf(newItem);
		this.updatePagination();

		if (this.captionElement) {
			this.captionElement.innerText = newImage.getAttribute('alt') || '';
			this.captionElement.classList.add('visible');
		}

		(this.currentPoints.material as ShaderMaterial).uniforms.uTexture.value = newTexture;
		(this.currentPoints.material as ShaderMaterial).uniforms.uTextureNext.value = newTexture;
		(this.currentPoints.material as ShaderMaterial).uniforms.uTextureMix.value = 0.0;
		(this.currentMesh.material as MeshBasicMaterial).map = newTexture;

		const imgWidth = textureImage.naturalWidth;
		const imgHeight = textureImage.naturalHeight;

		const tempGeo = new THREE.PlaneGeometry(imgWidth, imgHeight, this.config.segments, this.config.segments);

		this.currentPoints.geometry.setAttribute('position', tempGeo.getAttribute('position')!);

		this.imageWidth = imgWidth;
		this.imageHeight = imgHeight;

		tempGeo.dispose();

		this.updateStartPositions();
		this.updateCamera();
	}

	private animateReassembly(): void {
		const assembleDuration = 800;
		const startTime = Date.now();

		const assembleFrame = () => {
			const elapsed = Date.now() - startTime;
			let progress = Math.min(elapsed / assembleDuration, 1.0);
			const ease = 1 - Math.pow(1 - progress, 4);
			const dispersionValue = 1.0 - ease;

			if (this.currentPoints) {
				(this.currentPoints.material as ShaderMaterial).uniforms.uDispersion.value = dispersionValue;
			}

			const crossfadeStart = 0.5;
			if (progress > crossfadeStart && this.currentMesh && this.currentPoints) {
				this.currentMesh.visible = true;
				const fadeProgress = (progress - crossfadeStart) / (1.0 - crossfadeStart);
				(this.currentMesh.material as MeshBasicMaterial).opacity = fadeProgress;
				(this.currentPoints.material as ShaderMaterial).uniforms.uOpacity.value = 1.0 - fadeProgress;
			}

			if (progress < 1.0) {
				this.animationId = requestAnimationFrame(assembleFrame);
			} else {
				this.isAnimating = false;
				if (this.currentMesh) {
					this.currentMesh.visible = true;
					(this.currentMesh.material as MeshBasicMaterial).opacity = 1.0;
				}
				if (this.currentPoints) this.currentPoints.visible = false;
			}
		};
		this.animationId = requestAnimationFrame(assembleFrame);
	}

	private updateCamera(): void {
		if (!this.currentPoints || !this.renderer || !this.camera) return;

		const vpWidth = window.innerWidth;
		const vpHeight = window.innerHeight;
		this.renderer.setSize(vpWidth, vpHeight);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		const { viewWidth, viewHeight } = this.calculateViewDimensions();

		this.camera.left = -viewWidth / 2;
		this.camera.right = viewWidth / 2;
		this.camera.top = viewHeight / 2;
		this.camera.bottom = -viewHeight / 2;
		this.camera.updateProjectionMatrix();

		const scale = vpHeight / viewHeight;
		const pointWorldSize = this.imageWidth / this.config.segments;
		const pointPixelSize = pointWorldSize * scale * this.renderer.getPixelRatio();
		(this.currentPoints.material as ShaderMaterial).uniforms.uSize.value = Math.max(pointPixelSize, 2.0);
	}

	private updateStartPositions(): void {
		if (!this.currentPoints || !this.sourceImage) return;

		const geometry = this.currentPoints.geometry;
		const startAttribute = geometry.getAttribute('aStartPosition');
		const startPositions = startAttribute.array as Float32Array;
		const imgRect = this.sourceImage.getBoundingClientRect();
		const vpWidth = window.innerWidth;
		const vpHeight = window.innerHeight;
		const { viewWidth, viewHeight } = this.calculateViewDimensions();
		const uvs = geometry.attributes.uv.array;
		const count = startAttribute.count;

		for (let i = 0; i < count; i++) {
			const u = uvs[i * 2];
			const v = uvs[i * 2 + 1];
			const sourcePx = imgRect.left + u * imgRect.width;
			const sourcePy = imgRect.top + (1.0 - v) * imgRect.height;
			startPositions[i * 3] = (sourcePx / vpWidth) * viewWidth - viewWidth / 2;
			startPositions[i * 3 + 1] = -(sourcePy / vpHeight) * viewHeight + viewHeight / 2;
		}
		startAttribute.needsUpdate = true;
	}

	private tweenProgress(target: number, duration: number, onComplete?: () => void): void {
		if (!this.currentPoints) return;

		const effectiveDuration = prefersReducedMotion() ? 0 : duration;

		if (effectiveDuration <= 0) {
			const material = this.currentPoints.material as ShaderMaterial;
			material.uniforms.uProgress.value = target;

			if (target === 1.0) {
				if (this.currentMesh) {
					this.currentMesh.visible = true;
					(this.currentMesh.material as MeshBasicMaterial).opacity = 1.0;
				}
				if (this.currentPoints) {
					this.currentPoints.visible = false;
					material.uniforms.uOpacity.value = 0.0;
				}
				if (this.renderer && this.scene && this.camera) {
					this.renderer.render(this.scene, this.camera);
				}
			} else if (target === 0.0) {
				this.container.classList.remove('visible');
				if (this.captionElement) this.captionElement.classList.remove('visible');
			}

			if (onComplete) onComplete();
			return;
		}

		this.isAnimating = true;
		const material = this.currentPoints.material as ShaderMaterial;
		const startValue = material.uniforms.uProgress.value;
		const startTime = Date.now();

		const frame = () => {
			const elapsed = Date.now() - startTime;
			let progress = Math.min(elapsed / duration, 1.0);
			const easedProgress = 1 - Math.pow(1 - progress, 4);

			material.uniforms.uProgress.value = startValue + (target - startValue) * easedProgress;

			if (target === 0.0 && progress > 0.6 && this.container.classList.contains('visible')) {
				this.container.classList.remove('visible');
				if (this.captionElement) this.captionElement.classList.remove('visible');
			}

			if (target === 1.0 && this.currentMesh) {
				const meshMaterial = this.currentMesh.material as MeshBasicMaterial;
				if (progress > this.config.crossfadeStart) {
					this.currentMesh.visible = true;
					const fadeProgress = (progress - this.config.crossfadeStart) / (1.0 - this.config.crossfadeStart);
					meshMaterial.opacity = fadeProgress;
					material.uniforms.uOpacity.value = 1.0 - fadeProgress;
				} else {
					this.currentMesh.visible = false;
					meshMaterial.opacity = 0.0;
					material.uniforms.uOpacity.value = 1.0;
				}
			}

			if (progress < 1.0) {
				this.animationId = requestAnimationFrame(frame);
			} else {
				if (target === 1.0) {
					if (this.currentPoints) {
						this.currentPoints.visible = false;
						material.uniforms.uOpacity.value = 0.0;
					}
					if (this.currentMesh) {
						this.currentMesh.visible = true;
						(this.currentMesh.material as MeshBasicMaterial).opacity = 1.0;
					}
				}
				this.isAnimating = false;
				if (onComplete) onComplete();
			}
		};
		if (this.animationId !== null) cancelAnimationFrame(this.animationId);
		frame();
	}

	private cleanupScene(): void {
		if (this.animationId !== null) cancelAnimationFrame(this.animationId);
		this.isAnimating = false;

		if (this.currentPoints && this.scene) {
			const geometry = this.currentPoints.geometry;
			const material = this.currentPoints.material as ShaderMaterial;
			const texture = material.uniforms.uTexture.value;
			const textureNext = material.uniforms.uTextureNext.value;

			this.scene.remove(this.currentPoints);
			material.dispose();
			this.currentPoints = null;
			this.sourceImage = null;

			if (this.currentMesh) {
				this.scene.remove(this.currentMesh);
				(this.currentMesh.material as MeshBasicMaterial).dispose();
				this.currentMesh = null;
			}

			geometry.dispose();
			texture.dispose();
			if (textureNext !== texture) {
				textureNext.dispose();
			}
		}
	}

	private animate(): void {
		if (!this.container.classList.contains('visible') && !this.isAnimating) {
			this.renderId = null;
			return;
		}

		if (this.currentPoints && this.clock) {
			(this.currentPoints.material as ShaderMaterial).uniforms.uTime.value = this.clock.getElapsedTime();
		}
		if (this.renderer && this.scene && this.camera) {
			this.renderer.render(this.scene, this.camera);
		}
		this.renderId = requestAnimationFrame(this.animate.bind(this));
	}

	private getImageFromItem(item: HTMLElement): HTMLImageElement | null {
		return item instanceof HTMLImageElement ? item : item.querySelector('img');
	}

	private calculateViewDimensions(): { viewWidth: number; viewHeight: number } {
		const vpWidth = window.innerWidth;
		const vpHeight = window.innerHeight;
		const imgAspect = this.imageWidth / this.imageHeight;
		const vpAspect = vpWidth / vpHeight;

		if (imgAspect > vpAspect) {
			const viewWidth = this.imageWidth * this.config.padding;
			return { viewWidth, viewHeight: viewWidth / vpAspect };
		} else {
			const viewHeight = this.imageHeight * this.config.padding;
			return { viewWidth: viewHeight * vpAspect, viewHeight };
		}
	}

	private updateBackground(src: string, duration: number = 1200, delay: number = 0): void {
		const img = document.createElement('img');
		img.src = src;
		img.classList.add('particle-bg');
		Object.assign(img.style, {
			position: 'absolute',
			top: '0',
			left: '0',
			width: '100%',
			height: '100%',
			objectFit: 'cover',
			filter: 'blur(30px) brightness(0.4)',
			transform: 'scale(1.1)',
			opacity: '0',
			transition: `opacity ${duration}ms ease ${delay}ms`,
			willChange: 'opacity',
			pointerEvents: 'none',
			zIndex: '-1',
		});

		this.container.insertBefore(img, this.canvas);

		const existingBgs = this.container.querySelectorAll('.particle-bg');

		img.getBoundingClientRect(); // Force reflow
		requestAnimationFrame(() => {
			img.style.opacity = '1';
		});

		if (existingBgs.length > 1) {
			for (let i = 0; i < existingBgs.length - 1; i++) {
				const oldImg = existingBgs[i] as HTMLElement;
				setTimeout(() => {
					if (oldImg.parentNode === this.container) {
						this.container.removeChild(oldImg);
					}
				}, duration);
			}
		}
	}

	public destroy(): void {
		// Close if open
		if (this.container.classList.contains('visible')) {
			this.container.classList.remove('visible');
			document.body.style.overflow = '';
		}

		// Cancel animations
		if (this.animationId !== null) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
		if (this.renderId !== null) {
			cancelAnimationFrame(this.renderId);
			this.renderId = null;
		}

		// Clean up Three.js resources
		this.cleanupScene();
		if (this.renderer) {
			this.renderer.dispose();
			this.renderer = null;
		}

		// Remove global event listeners
		document.removeEventListener('keydown', this.boundKeydown);
		window.removeEventListener('resize', this.boundResize);
		this.container.removeEventListener('touchstart', this.boundTouchStart);
		this.container.removeEventListener('touchend', this.boundTouchEnd);

		// Remove image event listeners
		this.imageHandlers.forEach((handlers, item) => {
			item.removeEventListener('click', handlers.click);
			item.removeEventListener('mouseenter', handlers.mouseenter);
			item.removeEventListener('touchstart', handlers.touchstart);
		});
		this.imageHandlers.clear();

		// Clean up background images
		this.container.querySelectorAll('.particle-bg').forEach(img => img.remove());
	}
}
