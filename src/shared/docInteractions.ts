// Shared interaction wiring for rendered doc components (carousels, marker
// hotspots, tabs). Used by BOTH the reader (DocReader) and the admin editor
// preview so the two surfaces never drift apart again — the original bug was
// that these attach functions lived in App.tsx and were only called from the
// editor, leaving every component dead in the reader.

type AnimeAnimationHandle = {
  play?: () => void;
  resume?: () => void;
  pause?: () => void;
  restart?: () => void;
  remove?: () => void;
  cancel?: () => void;
};
type AnimeRuntime = {
  animate?: (targets: unknown, parameters: Record<string, unknown>) => AnimeAnimationHandle;
  createTimeline?: (parameters?: Record<string, unknown>) => {
    add: (targets: unknown, parameters: Record<string, unknown>, position?: string | number) => unknown;
    pause?: () => void;
    play?: () => void;
    cancel?: () => void;
    remove?: () => void;
  };
};

const ANIME_JS_ESM_URL = 'https://cdn.jsdelivr.net/npm/animejs/+esm';
let animeRuntimePromise: Promise<AnimeRuntime | null> | null = null;

export function clampPct(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export function clampBetween(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function readPctData(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? clampPct(parsed) : clampPct(fallback);
}

function resolveAnimeRuntime(source: unknown): AnimeRuntime | null {
  if (!source || typeof source !== 'object') return null;
  const runtime = source as Record<string, unknown>;
  const animate = typeof runtime.animate === 'function' ? runtime.animate as AnimeRuntime['animate'] : undefined;
  const createTimeline = typeof runtime.createTimeline === 'function' ? runtime.createTimeline as AnimeRuntime['createTimeline'] : undefined;
  if (!animate && !createTimeline) return null;
  return { animate, createTimeline };
}

function readGlobalAnimeRuntime(): AnimeRuntime | null {
  if (typeof window === 'undefined') return null;
  const runtime = resolveAnimeRuntime((window as unknown as { anime?: unknown }).anime);
  return runtime;
}

async function loadAnimeRuntime() {
  const existing = readGlobalAnimeRuntime();
  if (existing) return existing;
  if (animeRuntimePromise) return animeRuntimePromise;
  animeRuntimePromise = (async () => {
    try {
      const moduleRuntime = await import(/* @vite-ignore */ ANIME_JS_ESM_URL);
      const resolved = resolveAnimeRuntime(moduleRuntime)
        ?? resolveAnimeRuntime((moduleRuntime as { default?: unknown }).default)
        ?? readGlobalAnimeRuntime();
      return resolved;
    } catch (error) {
      console.warn('Anime.js failed to load for hotspot animations', error);
      return null;
    }
  })();
  return animeRuntimePromise;
}

function setHotspotOpenState(marker: HTMLElement, open: boolean) {
  marker.classList.toggle('is-open', open);
  marker.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function positionHotspotPopover(marker: HTMLElement) {
  const popover = marker.querySelector<HTMLElement>('.doc-marker-popover');
  if (!popover) return;
  const stage = marker.closest<HTMLElement>('.annotated-image');
  if (!stage) return;
  const markerRect = marker.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height || !popoverRect.width || !popoverRect.height) return;
  const defaultX = ((markerRect.left - stageRect.left) + markerRect.width * 0.5) / stageRect.width * 100;
  const defaultY = ((markerRect.top - stageRect.top) + markerRect.height + 10) / stageRect.height * 100;
  const desiredX = readPctData(marker.dataset.popoverX, defaultX);
  const desiredY = readPctData(marker.dataset.popoverY, defaultY);
  const desiredLeft = stageRect.width * (desiredX / 100);
  const desiredTop = stageRect.height * (desiredY / 100);
  const clampedLeft = clampBetween(desiredLeft, 8, Math.max(8, stageRect.width - popoverRect.width - 8));
  const clampedTop = clampBetween(desiredTop, 8, Math.max(8, stageRect.height - popoverRect.height - 8));
  const markerOffsetLeft = markerRect.left - stageRect.left;
  const markerOffsetTop = markerRect.top - stageRect.top;
  popover.style.left = `${clampedLeft - markerOffsetLeft}px`;
  popover.style.top = `${clampedTop - markerOffsetTop}px`;
  popover.style.transform = 'translate(0, 0)';
}

function closeHotspotMarkers(scope: ParentNode, except: HTMLElement | null = null) {
  scope.querySelectorAll<HTMLElement>('.doc-marker[data-kind="link"], .doc-marker[data-kind="pointer"]').forEach((marker) => {
    if (marker.classList.contains('cms-draggable-marker')) return;
    if (except && marker === except) return;
    const wasOpen = marker.classList.contains('is-open');
    setHotspotOpenState(marker, false);
    if (wasOpen) marker.dispatchEvent(new CustomEvent('hotspot-close'));
  });
}

function attachMarkerHotspotAnimations(scope: HTMLElement, markerSelector: string) {
  let disposed = false;
  const markerAnimations = new Map<HTMLElement, AnimeAnimationHandle[]>();
  const markerPressAnimations = new Map<HTMLElement, AnimeAnimationHandle>();
  const detachMarkerListeners: Array<() => void> = [];

  const setAmbientAnimationState = (marker: HTMLElement) => {
    const shouldAnimate = marker.dataset.animated === 'true';
    markerAnimations.get(marker)?.forEach((animation) => {
      try {
        if (shouldAnimate) {
          // anime.js requires `this` bound to the animation. Detaching via
          // ?? loses the binding, which crashes `resume` inside animejs.
          if (typeof animation.resume === 'function') animation.resume();
          else if (typeof animation.play === 'function') animation.play();
        } else {
          if (typeof animation.pause === 'function') animation.pause();
        }
      } catch {
        // Defensive: some anime.js timelines are in a transient state
        // (just-created or just-completed) where resume/pause throws.
        // The state will reconcile on the next animation tick.
      }
    });
  };

  const animateMarkerPress = (marker: HTMLElement, open: boolean, anime: AnimeRuntime) => {
    markerPressAnimations.get(marker)?.cancel?.();
    if (!anime.animate) return;
    const markerAnimation = anime.animate(marker, {
      scale: open ? [1, 1.06, 1.02] : [1.02, 1],
      duration: open ? 280 : 180,
      ease: 'outQuad',
    });
    if (markerAnimation) markerPressAnimations.set(marker, markerAnimation);
    const popover = marker.querySelector<HTMLElement>('.doc-marker-popover');
    if (!popover || !open) return;
    anime.animate(popover, {
      opacity: [0, 1],
      scale: [.96, 1],
      translateY: [6, 0],
      duration: 220,
      ease: 'outQuad',
    });
  };

  void loadAnimeRuntime().then((anime) => {
    if (disposed || !anime?.animate) return;
    const markers = Array.from(scope.querySelectorAll<HTMLElement>(markerSelector));

    markers.forEach((marker) => {
      const waves = Array.from(marker.querySelectorAll<HTMLElement>('.doc-marker-wave'));
      const coreGlow = marker.querySelector<HTMLElement>('.doc-marker-core-glow');
      const handles: AnimeAnimationHandle[] = [];

      if (waves.length) {
        const waveAnimation = anime.animate?.(waves, {
          scale: [0.76, 1.68],
          opacity: [0.46, 0],
          duration: 2100,
          ease: 'outQuad',
          loop: true,
          delay: (_target: unknown, index: number) => index * 380,
        });
        if (waveAnimation) handles.push(waveAnimation);
      }

      if (coreGlow) {
        const glowAnimation = anime.animate?.(coreGlow, {
          scale: [0.94, 1.08, 0.94],
          opacity: [0.28, 0.48, 0.28],
          duration: 1800,
          ease: 'inOutSine',
          loop: true,
        });
        if (glowAnimation) handles.push(glowAnimation);
      }

      markerAnimations.set(marker, handles);
      setAmbientAnimationState(marker);
      const onEnter = () => setAmbientAnimationState(marker);
      const onLeave = () => setAmbientAnimationState(marker);
      const onOpen = () => animateMarkerPress(marker, true, anime);
      const onClose = () => animateMarkerPress(marker, false, anime);
      marker.addEventListener('mouseenter', onEnter, { passive: true });
      marker.addEventListener('mouseleave', onLeave, { passive: true });
      marker.addEventListener('hotspot-open', onOpen);
      marker.addEventListener('hotspot-close', onClose);
      detachMarkerListeners.push(() => {
        marker.removeEventListener('mouseenter', onEnter);
        marker.removeEventListener('mouseleave', onLeave);
        marker.removeEventListener('hotspot-open', onOpen);
        marker.removeEventListener('hotspot-close', onClose);
      });
    });
  });

  return () => {
    disposed = true;
    detachMarkerListeners.forEach((detach) => detach());
    markerPressAnimations.forEach((animation) => animation.cancel?.());
    markerAnimations.forEach((animations) => animations.forEach((animation) => animation.cancel?.()));
    markerPressAnimations.clear();
    markerAnimations.clear();
  };
}

export function attachMarkerHotspotInteractions(scope: HTMLElement) {
  const markerSelector = '.doc-marker[data-kind="link"], .doc-marker[data-kind="pointer"]';
  const detachAnimations = attachMarkerHotspotAnimations(scope, markerSelector);

  const resolveMarker = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return null;
    const marker = target.closest<HTMLElement>(markerSelector);
    if (!marker || marker.classList.contains('cms-draggable-marker') || !scope.contains(marker)) return null;
    return marker;
  };

  const onScopeClick = (event: Event) => {
    if (!(event instanceof MouseEvent)) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('.doc-marker-popover-cta')) return;
    if (target instanceof HTMLElement && target.closest('.doc-marker-popover')) return;
    const marker = resolveMarker(target);
    if (!marker) return;
    event.preventDefault();
    event.stopPropagation();
    const nextOpen = !marker.classList.contains('is-open');
    closeHotspotMarkers(scope, nextOpen ? marker : null);
    if (nextOpen) positionHotspotPopover(marker);
    setHotspotOpenState(marker, nextOpen);
    marker.dispatchEvent(new CustomEvent(nextOpen ? 'hotspot-open' : 'hotspot-close'));
  };

  const onScopeKeyDown = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.target instanceof HTMLElement && event.target.closest('.doc-marker-popover-cta')) return;
    if (event.key === 'Escape') {
      closeHotspotMarkers(scope, null);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const marker = resolveMarker(event.target);
    if (!marker) return;
    event.preventDefault();
    const nextOpen = !marker.classList.contains('is-open');
    closeHotspotMarkers(scope, nextOpen ? marker : null);
    if (nextOpen) positionHotspotPopover(marker);
    setHotspotOpenState(marker, nextOpen);
    marker.dispatchEvent(new CustomEvent(nextOpen ? 'hotspot-open' : 'hotspot-close'));
  };

  const onDocumentPointerDown = (event: Event) => {
    if (!(event.target instanceof Node)) return;
    if (!scope.contains(event.target)) {
      closeHotspotMarkers(scope, null);
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('.doc-marker-popover')) return;
    const marker = resolveMarker(event.target);
    if (!marker) closeHotspotMarkers(scope, null);
  };

  scope.addEventListener('click', onScopeClick);
  scope.addEventListener('keydown', onScopeKeyDown);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  const onResize = () => {
    scope.querySelectorAll<HTMLElement>(`${markerSelector}.is-open`).forEach((item) => positionHotspotPopover(item));
  };
  window.addEventListener('resize', onResize);

  return () => {
    detachAnimations();
    scope.removeEventListener('click', onScopeClick);
    scope.removeEventListener('keydown', onScopeKeyDown);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    window.removeEventListener('resize', onResize);
  };
}

export function attachDocCarouselInteractions(scope: ParentNode) {
  const detachments: Array<() => void> = [];
  const carousels = Array.from(scope.querySelectorAll<HTMLElement>('[data-doc-carousel]'));

  carousels.forEach((carousel) => {
    const viewport = carousel.querySelector<HTMLElement>('.doc-carousel-viewport');
    const track = carousel.querySelector<HTMLElement>('.doc-carousel-track');
    const slides = Array.from(carousel.querySelectorAll<HTMLElement>('.doc-carousel-slide'));
    if (!viewport || !track || !slides.length) return;

    // Off-track slides never intersect the viewport, so lazy images inside
    // a carousel are never requested. Force-load them.
    carousel.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((image) => {
      image.loading = 'eager';
    });

    let index = 0;
    let width = 0;
    let dragging = false;
    let pointerId: number | null = null;
    let startX = 0;
    let deltaX = 0;

    const prevButton = carousel.querySelector<HTMLButtonElement>('[data-carousel-prev]');
    const nextButton = carousel.querySelector<HTMLButtonElement>('[data-carousel-next]');
    const dotButtons = Array.from(carousel.querySelectorAll<HTMLButtonElement>('[data-carousel-dot]'));

    const setTransform = (pixelOffset = 0, animate = true) => {
      width = viewport.getBoundingClientRect().width || width || 1;
      track.style.transition = animate ? 'transform .26s ease' : 'none';
      const baseOffset = -(index * width);
      track.style.transform = `translate3d(${baseOffset + pixelOffset}px, 0, 0)`;
    };

    const syncControls = () => {
      if (prevButton) prevButton.disabled = index <= 0;
      if (nextButton) nextButton.disabled = index >= slides.length - 1;
      dotButtons.forEach((button) => {
        const dotIndex = Number(button.dataset.carouselDot || '0');
        const active = dotIndex === index;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      slides.forEach((slide, slideIndex) => {
        slide.setAttribute('aria-hidden', slideIndex === index ? 'false' : 'true');
      });
    };

    const goTo = (nextIndex: number, animate = true) => {
      index = clampBetween(Math.round(nextIndex), 0, slides.length - 1);
      setTransform(0, animate);
      syncControls();
    };

    const onPrev = () => goTo(index - 1);
    const onNext = () => goTo(index + 1);

    const onPointerDown = (event: PointerEvent) => {
      if (slides.length <= 1) return;
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      deltaX = 0;
      viewport.setPointerCapture(event.pointerId);
      carousel.classList.add('dragging');
      setTransform(0, false);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || pointerId !== event.pointerId) return;
      deltaX = event.clientX - startX;
      setTransform(deltaX, false);
    };

    const finishDrag = (event: PointerEvent) => {
      if (!dragging || pointerId !== event.pointerId) return;
      dragging = false;
      carousel.classList.remove('dragging');
      const threshold = Math.max(40, (width || viewport.getBoundingClientRect().width || 1) * 0.14);
      if (Math.abs(deltaX) > threshold) {
        goTo(index + (deltaX < 0 ? 1 : -1), true);
      } else {
        goTo(index, true);
      }
      deltaX = 0;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      pointerId = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(index + 1);
      }
    };

    prevButton?.addEventListener('click', onPrev);
    nextButton?.addEventListener('click', onNext);
    dotButtons.forEach((button) => {
      const dotIndex = Number(button.dataset.carouselDot || '0');
      const onDotClick = () => goTo(dotIndex);
      button.addEventListener('click', onDotClick);
      detachments.push(() => button.removeEventListener('click', onDotClick));
    });
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', finishDrag);
    viewport.addEventListener('pointercancel', finishDrag);
    carousel.addEventListener('keydown', onKeyDown);

    const onResize = () => goTo(index, false);
    window.addEventListener('resize', onResize);
    goTo(0, false);

    detachments.push(() => {
      prevButton?.removeEventListener('click', onPrev);
      nextButton?.removeEventListener('click', onNext);
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', finishDrag);
      viewport.removeEventListener('pointercancel', finishDrag);
      carousel.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    });
  });

  return () => {
    detachments.forEach((detach) => detach());
  };
}

// Tab switching for BOTH markup eras:
//   current — <button class="doc-tab" data-component-item-id> + panels with
//             data-for / data-component-item-id
//   legacy  — <div class="doc-tab-list"><span>…</span></div> + panels in DOM
//             order (no item ids on the tabs), as stored by older documents.
export function attachDocTabInteractions(scope: HTMLElement) {
  const onClick = (event: Event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const tab = event.target.closest<HTMLElement>('.doc-tab, .doc-tab-list > span');
    if (!tab || !scope.contains(tab)) return;
    const list = tab.closest<HTMLElement>('.doc-tabs, .doc-tab-list');
    const wrap = tab.closest<HTMLElement>('.doc-component-tabs');
    if (!list || !wrap) return;
    const tabs = Array.from(list.querySelectorAll<HTMLElement>('.doc-tab, :scope > span'));
    const panels = Array.from(wrap.querySelectorAll<HTMLElement>('.doc-tab-panel'));
    if (!tabs.length || !panels.length) return;
    tabs.forEach((item) => {
      const on = item === tab;
      item.classList.toggle('active', on);
      item.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const itemId = tab.getAttribute('data-component-item-id');
    if (itemId) {
      panels.forEach((panel) => {
        const matches = panel.getAttribute('data-for') === itemId
          || panel.getAttribute('data-component-item-id') === itemId;
        if (matches) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
      });
    } else {
      // Legacy spans carry no item id — switch the panel at the same index.
      const tabIndex = tabs.indexOf(tab);
      panels.forEach((panel, panelIndex) => {
        if (panelIndex === tabIndex) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
      });
    }
  };
  scope.addEventListener('click', onClick);
  return () => scope.removeEventListener('click', onClick);
}

// One call that wires every doc component interaction on a rendered-content
// scope. Both the reader and the editor preview use this.
export function attachDocComponentInteractions(scope: HTMLElement) {
  const detachments = [
    attachMarkerHotspotInteractions(scope),
    attachDocCarouselInteractions(scope),
    attachDocTabInteractions(scope),
  ];
  return () => detachments.forEach((detach) => detach());
}
