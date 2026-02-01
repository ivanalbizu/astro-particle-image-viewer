/**
 * SimpleLightbox - Lightbox without animations for users with prefers-reduced-motion
 * Does not use Three.js, only CSS and basic JS
 */
export class SimpleLightbox {
	private container: HTMLElement;
	private imageElement: HTMLImageElement;
	private closeButton: HTMLButtonElement;
	private prevButton: HTMLButtonElement;
	private nextButton: HTMLButtonElement;
	private captionElement: HTMLElement | null;
	private paginationElement: HTMLElement | null;
	private images: NodeListOf<HTMLElement>;
	private currentIndex: number = 0;
	private dotsContainer: HTMLElement | null = null;
	private prevPageButton: HTMLButtonElement | null = null;
	private nextPageButton: HTMLButtonElement | null = null;
	private paginationStartIndex: number = 0;
	private maxVisibleDots: number = 5;
	private touchStartX: number = 0;
	private touchStartY: number = 0;
	private readonly swipeThreshold: number = 50;
	private srcAttribute: string;

	// Bound event handlers for cleanup
	private boundKeydown!: (e: KeyboardEvent) => void;
	private boundTouchStart!: (e: TouchEvent) => void;
	private boundTouchEnd!: (e: TouchEvent) => void;
	private imageClickHandlers: Map<HTMLElement, () => void> = new Map();

	constructor(containerSelector: string, imageSelector: string, srcAttribute: string = 'src') {
		const container = document.querySelector(containerSelector);
		if (!container) throw new Error('Container element not found');
		this.container = container as HTMLElement;

		this.closeButton = this.container.querySelector<HTMLButtonElement>('.close-button')!;
		this.prevButton = this.container.querySelector<HTMLButtonElement>('.nav-button.prev')!;
		this.nextButton = this.container.querySelector<HTMLButtonElement>('.nav-button.next')!;
		this.captionElement = this.container.querySelector<HTMLElement>('.caption');
		this.paginationElement = this.container.querySelector<HTMLElement>('.pagination');

		this.images = document.querySelectorAll(imageSelector);
		this.srcAttribute = srcAttribute;

		this.imageElement = document.createElement('img');
		this.imageElement.className = 'simple-lightbox-image';
		Object.assign(this.imageElement.style, {
			position: 'fixed',
			top: '50%',
			left: '50%',
			transform: 'translate(-50%, -50%)',
			maxWidth: '90vw',
			maxHeight: '85vh',
			objectFit: 'contain',
			zIndex: '5',
		});
		this.container.appendChild(this.imageElement);

		const hasMultipleImages = this.images.length > 1;
		if (!hasMultipleImages) {
			this.prevButton.hidden = true;
			this.nextButton.hidden = true;
			if (this.paginationElement) this.paginationElement.hidden = true;
		}

		this.bindEvents();
		if (hasMultipleImages) this.initPagination();
	}

	private bindEvents(): void {
		this.images.forEach((item) => {
			const handler = () => this.open(item);
			this.imageClickHandlers.set(item, handler);
			item.addEventListener('click', handler);
		});

		this.closeButton.addEventListener('click', () => this.close());
		this.container.addEventListener('click', (e) => {
			if (e.target === this.container) this.close();
		});

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

		this.boundTouchStart = (e: TouchEvent) => {
			this.touchStartX = e.touches[0].clientX;
			this.touchStartY = e.touches[0].clientY;
		};
		this.container.addEventListener('touchstart', this.boundTouchStart, { passive: true });

		this.boundTouchEnd = (e: TouchEvent) => {
			if (!this.container.classList.contains('visible')) return;
			if (this.images.length <= 1) return;

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
				if (this.currentIndex !== index) {
					this.goTo(index);
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

	private getImageFromItem(item: HTMLElement): HTMLImageElement | null {
		return item instanceof HTMLImageElement ? item : item.querySelector('img');
	}

	public open(item: HTMLElement): void {
		const img = this.getImageFromItem(item);
		if (!img) return;

		this.currentIndex = Array.from(this.images).indexOf(item);
		this.updatePagination();

		const imgSrc = img.getAttribute(this.srcAttribute) || img.getAttribute('src');
		if (imgSrc) {
			this.imageElement.src = imgSrc;
			this.imageElement.alt = img.getAttribute('alt') || '';
		}

		if (this.captionElement) {
			this.captionElement.innerText = img.getAttribute('alt') || '';
			this.captionElement.classList.add('visible');
		}

		this.container.classList.add('visible');
		document.body.style.overflow = 'hidden';
		this.closeButton.focus();
	}

	public close(): void {
		this.container.classList.remove('visible');
		if (this.captionElement) this.captionElement.classList.remove('visible');
		document.body.style.overflow = '';

		if (this.images[this.currentIndex]) {
			this.images[this.currentIndex].focus();
		}
	}

	public next(): void {
		if (this.images.length <= 1) return;
		const nextIndex = (this.currentIndex + 1) % this.images.length;
		this.goTo(nextIndex);
	}

	public prev(): void {
		if (this.images.length <= 1) return;
		const prevIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
		this.goTo(prevIndex);
	}

	private goTo(index: number): void {
		const item = this.images[index];
		const img = this.getImageFromItem(item);
		if (!img) return;

		this.currentIndex = index;
		this.updatePagination();

		const imgSrc = img.getAttribute(this.srcAttribute) || img.getAttribute('src');
		if (imgSrc) {
			this.imageElement.src = imgSrc;
			this.imageElement.alt = img.getAttribute('alt') || '';
		}

		if (this.captionElement) {
			this.captionElement.innerText = img.getAttribute('alt') || '';
			this.captionElement.classList.add('visible');
		}
	}

	public destroy(): void {
		// Close if open
		if (this.container.classList.contains('visible')) {
			this.close();
		}

		// Remove global event listeners
		document.removeEventListener('keydown', this.boundKeydown);
		this.container.removeEventListener('touchstart', this.boundTouchStart);
		this.container.removeEventListener('touchend', this.boundTouchEnd);

		// Remove image click handlers
		this.imageClickHandlers.forEach((handler, item) => {
			item.removeEventListener('click', handler);
		});
		this.imageClickHandlers.clear();

		// Remove created image element
		if (this.imageElement.parentNode) {
			this.imageElement.parentNode.removeChild(this.imageElement);
		}
	}
}
