import { useCallback, useRef, useState, type DragEvent } from "react";

const ACCEPT =
  "video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp,image/*";

interface DropZoneProps {
  disabled?: boolean;
  /** Landing = free.upscaler-style hero. Compact = workspace header swap. */
  variant?: "landing" | "compact";
  onFile: (file: File) => void;
}

export function DropZone({
  disabled,
  variant = "landing",
  onFile,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      const file = list?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragover(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  if (variant === "compact") {
    return (
      <>
        <button
          type="button"
          className="ghost sm"
          disabled={disabled}
          onClick={openPicker}
        >
          Replace file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
          hidden
        />
      </>
    );
  }

  return (
    <div
      className={`drop-panel${dragover ? " dragover" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={onDrop}
    >
      <h2>Choose a video or image to upscale</h2>
      <button
        type="button"
        className="dropzone-btn"
        disabled={disabled}
        onClick={openPicker}
      >
        Choose a video or image file
      </button>
      <p className="drop-hint">Or drag and drop · MP4, WebM, PNG, JPG</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
