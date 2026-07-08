import { useCallback, useRef, useState, type DragEvent } from "react";

const ACCEPT =
  "video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp,image/*";

interface DropZoneProps {
  disabled?: boolean;
  fileName?: string | null;
  onFile: (file: File) => void;
}

export function DropZone({ disabled, fileName, onFile }: DropZoneProps) {
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
      className={`dropzone${dragover ? " dragover" : ""}${fileName ? " has-file" : ""}`}
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
      <div className="dropzone-icon" aria-hidden>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <rect
            x="4"
            y="8"
            width="32"
            height="24"
            rx="4"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M12 26l6-8 4 5 3-3 5 6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="27" cy="15" r="2.2" fill="currentColor" />
        </svg>
      </div>
      <h2>{fileName ? "Replace media" : "Drop video or image"}</h2>
      <p>
        {fileName
          ? "Click or drop another file to swap"
          : "MP4 · WebM · PNG · JPG — 100% on-device, never uploaded"}
      </p>
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
