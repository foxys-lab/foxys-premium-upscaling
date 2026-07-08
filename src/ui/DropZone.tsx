import { useCallback, useRef, useState, type DragEvent } from "react";

const ACCEPT =
  "video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp,image/*";

interface DropZoneProps {
  disabled?: boolean;
  onFile: (file: File) => void;
}

export function DropZone({ disabled, onFile }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      const file = list?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragover(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`dropzone${dragover ? " dragover" : ""}`}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={onDrop}
    >
      <h2>Drop a video or image</h2>
      <p>MP4 / WebM / PNG / JPG — processed locally, never uploaded.</p>
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
