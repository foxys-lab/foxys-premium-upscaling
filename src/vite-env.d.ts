/// <reference types="vite/client" />

interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
}

interface GPUAdapter {
  requestDevice(): Promise<GPUDevice>;
}

interface GPUDevice {
  destroy(): void;
}

interface Navigator {
  gpu?: GPU;
}
