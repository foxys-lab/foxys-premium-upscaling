/// <reference types="vite/client" />

interface GPUAdapter {
  // minimal stub
}

interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
}

interface Navigator {
  gpu?: GPU;
}
