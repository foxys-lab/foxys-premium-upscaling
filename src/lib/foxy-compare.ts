/**
 * Simple horizontal before/after slider for two canvases.
 * ImageCompare-viewer defaults to vertical + fights OffscreenCanvas sizing.
 */

export type FoxyCompareHandle = {
  setPosition: (pct: number) => void;
  destroy: () => void;
  root: HTMLElement;
};

export function mountFoxyCompare(root: HTMLElement): FoxyCompareHandle {
  // Prevent double-mount
  destroyFoxyCompare(root);

  root.classList.add('foxy-compare');

  const upscaled = root.querySelector('#upscaled') as HTMLCanvasElement | null;
  const original = root.querySelector('#original') as HTMLCanvasElement | null;
  if (!upscaled || !original) {
    throw new Error('Compare needs #original and #upscaled canvases');
  }

  // Layer order: AI full under, original clipped on left
  upscaled.classList.add('foxy-compare-layer', 'foxy-compare-ai');
  original.classList.add('foxy-compare-layer', 'foxy-compare-src');

  let clip = root.querySelector('.foxy-compare-clip') as HTMLElement | null;
  if (!clip) {
    clip = document.createElement('div');
    clip.className = 'foxy-compare-clip';
    // wrap original
    original.parentElement?.insertBefore(clip, original);
    clip.appendChild(original);
  }

  let bar = root.querySelector('.foxy-compare-bar') as HTMLElement | null;
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'foxy-compare-bar';
    bar.innerHTML = `<div class="foxy-compare-knob" aria-hidden="true"></div>`;
    root.appendChild(bar);
  }

  let labelL = root.querySelector('.foxy-compare-label-l') as HTMLElement | null;
  if (!labelL) {
    labelL = document.createElement('span');
    labelL.className = 'foxy-compare-label foxy-compare-label-l';
    labelL.textContent = 'Original';
    root.appendChild(labelL);
  }

  let labelR = root.querySelector('.foxy-compare-label-r') as HTMLElement | null;
  if (!labelR) {
    labelR = document.createElement('span');
    labelR.className = 'foxy-compare-label foxy-compare-label-r';
    labelR.textContent = 'AI 2×';
    root.appendChild(labelR);
  }

  const syncCanvasWidth = () => {
    // Original canvas must be full container width so clip reveals correctly
    const fullW = root.clientWidth || root.offsetWidth;
    if (fullW > 0) {
      root.style.setProperty('--compare-w', `${fullW}px`);
      original.style.width = `${fullW}px`;
      original.style.height = '100%';
      upscaled.style.width = '100%';
      upscaled.style.height = '100%';
    }
  };

  let pct = 50;
  const apply = (p: number) => {
    pct = Math.max(0, Math.min(100, p));
    clip!.style.width = `${pct}%`;
    bar!.style.left = `${pct}%`;
  };
  syncCanvasWidth();
  apply(pct);
  // Re-sync after layout
  requestAnimationFrame(syncCanvasWidth);
  setTimeout(syncCanvasWidth, 50);
  setTimeout(syncCanvasWidth, 200);

  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => syncCanvasWidth())
    : null;
  ro?.observe(root);

  let dragging = false;

  const posFromEvent = (clientX: number) => {
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0) return pct;
    return ((clientX - rect.left) / rect.width) * 100;
  };

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    root.setPointerCapture?.(e.pointerId);
    apply(posFromEvent(e.clientX));
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    apply(posFromEvent(e.clientX));
  };
  const onPointerUp = (e: PointerEvent) => {
    dragging = false;
    try {
      root.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);

  (root as any).__foxyCompareCleanup = () => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
    ro?.disconnect();
  };

  return {
    root,
    setPosition: apply,
    destroy: () => destroyFoxyCompare(root),
  };
}

export function destroyFoxyCompare(root: HTMLElement | null) {
  if (!root) return;
  const cleanup = (root as any).__foxyCompareCleanup;
  if (typeof cleanup === 'function') cleanup();
  delete (root as any).__foxyCompareCleanup;
}

/** Size the compare box to a fixed display height, preserving aspect. */
export function sizeCompareBox(
  outer: HTMLElement,
  mediaW: number,
  mediaH: number,
  displayH = 320
) {
  if (!mediaW || !mediaH) return;
  const w = Math.round((mediaW / mediaH) * displayH);
  outer.style.height = `${displayH}px`;
  outer.style.width = `${w}px`;
  outer.style.maxWidth = '100%';
  outer.style.margin = '0 auto';
  outer.style.position = 'relative';

  const inner = outer.querySelector('#image-compare') as HTMLElement | null;
  if (inner) {
    inner.style.width = '100%';
    inner.style.height = '100%';
    inner.style.position = 'relative';
  }

  outer.style.setProperty('--compare-w', `${Math.min(w, outer.parentElement?.clientWidth || w)}px`);

  // Display canvases fill the box (internal buffer stays at native 2× res)
  outer.querySelectorAll('canvas').forEach((c) => {
    const el = c as HTMLCanvasElement;
    el.style.height = '100%';
    el.style.display = 'block';
    el.style.maxWidth = 'none';
  });
  const up = outer.querySelector('#upscaled') as HTMLCanvasElement | null;
  const orig = outer.querySelector('#original') as HTMLCanvasElement | null;
  if (up) {
    up.style.width = '100%';
  }
  if (orig) {
    // full frame width (clip parent reveals portion)
    const full = outer.clientWidth || w;
    orig.style.width = `${full}px`;
  }
}
