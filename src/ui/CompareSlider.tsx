import { useCallback, useRef, useState, type PointerEvent } from "react";

interface CompareSliderProps {
  /** Object URL or empty placeholder mode */
  beforeUrl?: string | null;
  afterUrl?: string | null;
  beforeLabel?: string;
  afterLabel?: string;
  emptyHint?: string;
}

/**
 * Polished before/after scrubber.
 * Works with image URLs; video frames plug in the same way later.
 */
export function CompareSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = "Original",
  afterLabel = "Enhanced",
  emptyHint = "Load a file and run a preview to compare quality here.",
}: CompareSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, x)));
  }, []);

  const onPointerDown = (e: PointerEvent) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;
    setFromClientX(e.clientX);
  };

  const onPointerUp = (e: PointerEvent) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const hasMedia = Boolean(beforeUrl || afterUrl);

  return (
    <div className="compare">
      <div className="section-head">
        <h3>Quality compare</h3>
        <p>Drag the handle — judge edges, noise, and faces at 100% feel.</p>
      </div>

      <div
        ref={trackRef}
        className="compare-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-label="Before after comparison"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 3));
          if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 3));
        }}
      >
        {!hasMedia && (
          <div className="compare-empty">
            <span>{emptyHint}</span>
          </div>
        )}

        {hasMedia && (
          <>
            <div className="compare-layer compare-before">
              {beforeUrl ? (
                <img src={beforeUrl} alt={beforeLabel} draggable={false} />
              ) : (
                <div className="compare-ph">{beforeLabel}</div>
              )}
            </div>
            <div
              className="compare-layer compare-after"
              style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
            >
              {afterUrl ? (
                <img src={afterUrl} alt={afterLabel} draggable={false} />
              ) : (
                <div className="compare-ph enhanced">{afterLabel}</div>
              )}
            </div>
            <div className="compare-handle" style={{ left: `${pos}%` }}>
              <div className="compare-line" />
              <div className="compare-knob" aria-hidden>
                ‹ ›
              </div>
            </div>
            <span className="compare-tag left">{beforeLabel}</span>
            <span className="compare-tag right">{afterLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
