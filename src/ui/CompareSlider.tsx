import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";

interface CompareSliderProps {
  beforeUrl?: string | null;
  afterUrl?: string | null;
  /** Prefer live WebGPU canvas when blob after is black/broken. */
  afterCanvas?: HTMLCanvasElement | null;
  beforeLabel?: string;
  afterLabel?: string;
  emptyHint?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Left = original (beforeUrl), right = enhanced (afterUrl or afterCanvas).
 */
export function CompareSlider({
  beforeUrl,
  afterUrl,
  afterCanvas,
  beforeLabel = "Original",
  afterLabel = "Enhanced",
  emptyHint = "Load a file and run enhance to compare quality here.",
  compact = false,
  className = "",
}: CompareSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const afterSlotRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [trackW, setTrackW] = useState(0);
  const [aspect, setAspect] = useState<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    setPos(50);
  }, [beforeUrl, afterUrl, afterCanvas]);

  // Mount live canvas into the after layer (free.upscaler approach)
  useEffect(() => {
    const slot = afterSlotRef.current;
    if (!slot) return;
    slot.replaceChildren();
    if (afterCanvas) {
      afterCanvas.style.width = "100%";
      afterCanvas.style.height = "100%";
      afterCanvas.style.objectFit = "contain";
      afterCanvas.style.display = "block";
      afterCanvas.style.position = "absolute";
      afterCanvas.style.inset = "0";
      afterCanvas.style.opacity = "1";
      afterCanvas.style.left = "0";
      afterCanvas.style.top = "0";
      afterCanvas.style.pointerEvents = "none";
      slot.appendChild(afterCanvas);
      if (afterCanvas.width > 0 && afterCanvas.height > 0) {
        setAspect(afterCanvas.width / afterCanvas.height);
      }
    }
    return () => {
      // Don't destroy the canvas node ownership fully if parent reuses it
      if (afterCanvas && afterCanvas.parentElement === slot) {
        slot.removeChild(afterCanvas);
      }
    };
  }, [afterCanvas]);

  useEffect(() => {
    const url = afterUrl || beforeUrl;
    if (!url || afterCanvas) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = url;
  }, [beforeUrl, afterUrl, afterCanvas]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [beforeUrl, afterUrl, afterCanvas, aspect]);

  const setFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, x)));
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setFromClientX(e.clientX);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPos((p) => Math.max(0, p - 2));
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setPos((p) => Math.min(100, p + 2));
    }
  };

  const hasBefore = Boolean(beforeUrl);
  const hasAfter = Boolean(afterUrl || afterCanvas);
  const hasMedia = hasBefore || hasAfter;

  const trackStyle =
    aspect != null
      ? { aspectRatio: `${aspect}`, maxHeight: "min(70vh, 640px)" as const }
      : undefined;

  return (
    <div className={`compare${compact ? " compare-compact" : ""}`}>
      {!compact && (
        <div className="section-head">
          <h3>Quality compare</h3>
          <p>Drag — left original, right AI enhanced.</p>
        </div>
      )}

      <div
        ref={trackRef}
        className={`compare-track${hasMedia ? " has-media" : ""} ${className}`.trim()}
        style={trackStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-label="Original versus enhanced"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {!hasMedia && (
          <div className="compare-empty">
            <span>{emptyHint}</span>
          </div>
        )}

        {hasMedia && (
          <>
            {/* Full enhanced underneath (right side when scrubbed) */}
            <div className="compare-layer compare-base">
              <div ref={afterSlotRef} className="compare-after-slot" />
              {!afterCanvas && afterUrl && (
                <img src={afterUrl} alt={afterLabel} draggable={false} />
              )}
              {!afterCanvas && !afterUrl && beforeUrl && (
                <img src={beforeUrl} alt={beforeLabel} draggable={false} />
              )}
            </div>

            {/* Original on top, clipped to left */}
            {hasBefore && beforeUrl && (
              <div
                className="compare-layer compare-reveal"
                style={{ width: `${pos}%` }}
              >
                <div
                  className="compare-reveal-inner"
                  style={{ width: trackW > 0 ? `${trackW}px` : "100vw" }}
                >
                  <img src={beforeUrl} alt={beforeLabel} draggable={false} />
                </div>
              </div>
            )}

            <div
              className="compare-handle"
              style={{ left: `${pos}%` }}
              aria-hidden
            >
              <div className="compare-line" />
              <div className="compare-knob">
                <span className="knob-tri knob-left" />
                <span className="knob-tri knob-right" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
