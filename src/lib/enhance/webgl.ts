/**
 * Client-side quality pipeline via WebGL2 (or WebGL1 fallback).
 * 2× bicubic-style upscale + mild deblock + edge clarity.
 * Fully local — no network.
 */

export interface EnhanceProgress {
  phase: string;
  progress: number; // 0–100
}

export type ProgressCb = (p: EnhanceProgress) => void;

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "compile failed";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function link(
  gl: WebGLRenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) throw new Error("Could not create program");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || "link failed";
    gl.deleteProgram(prog);
    throw new Error(log);
  }
  return prog;
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/** Bicubic-ish Catmull-Rom upsample + mild deblock + unsharp. */
const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;      // 1/srcSize
uniform vec2 u_out_texel;  // 1/outSize
uniform float u_sharp;
uniform float u_deblock;

// Cubic weight (Catmull-Rom)
float w0(float a) { return (1.0/6.0)*(a*(a*(-a+3.0)-3.0)+1.0); }
float w1(float a) { return (1.0/6.0)*(a*a*(3.0*a-6.0)+4.0); }
float w2(float a) { return (1.0/6.0)*(a*(a*(-3.0*a+3.0)+3.0)+1.0); }
float w3(float a) { return (1.0/6.0)*(a*a*a); }

vec4 cubicSample(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 coord = uv / texel - 0.5;
  vec2 f = fract(coord);
  vec2 base = (floor(coord) - vec2(1.0)) * texel + texel * 0.5;

  float wx0 = w0(f.x), wx1 = w1(f.x), wx2 = w2(f.x), wx3 = w3(f.x);
  float wy0 = w0(f.y), wy1 = w1(f.y), wy2 = w2(f.y), wy3 = w3(f.y);

  vec4 row0 =
    texture2D(tex, base + texel * vec2(0.0, 0.0)) * wx0 +
    texture2D(tex, base + texel * vec2(1.0, 0.0)) * wx1 +
    texture2D(tex, base + texel * vec2(2.0, 0.0)) * wx2 +
    texture2D(tex, base + texel * vec2(3.0, 0.0)) * wx3;
  vec4 row1 =
    texture2D(tex, base + texel * vec2(0.0, 1.0)) * wx0 +
    texture2D(tex, base + texel * vec2(1.0, 1.0)) * wx1 +
    texture2D(tex, base + texel * vec2(2.0, 1.0)) * wx2 +
    texture2D(tex, base + texel * vec2(3.0, 1.0)) * wx3;
  vec4 row2 =
    texture2D(tex, base + texel * vec2(0.0, 2.0)) * wx0 +
    texture2D(tex, base + texel * vec2(1.0, 2.0)) * wx1 +
    texture2D(tex, base + texel * vec2(2.0, 2.0)) * wx2 +
    texture2D(tex, base + texel * vec2(3.0, 2.0)) * wx3;
  vec4 row3 =
    texture2D(tex, base + texel * vec2(0.0, 3.0)) * wx0 +
    texture2D(tex, base + texel * vec2(1.0, 3.0)) * wx1 +
    texture2D(tex, base + texel * vec2(2.0, 3.0)) * wx2 +
    texture2D(tex, base + texel * vec2(3.0, 3.0)) * wx3;

  return row0 * wy0 + row1 * wy1 + row2 * wy2 + row3 * wy3;
}

void main() {
  // Soft deblock: mix cubic with slightly blurred neighborhood
  vec4 sharp = cubicSample(u_tex, v_uv, u_texel);
  vec4 blur =
    cubicSample(u_tex, v_uv + u_texel * vec2(-1.0, 0.0), u_texel) * 0.2 +
    cubicSample(u_tex, v_uv + u_texel * vec2( 1.0, 0.0), u_texel) * 0.2 +
    cubicSample(u_tex, v_uv + u_texel * vec2( 0.0,-1.0), u_texel) * 0.2 +
    cubicSample(u_tex, v_uv + u_texel * vec2( 0.0, 1.0), u_texel) * 0.2 +
    sharp * 0.2;

  vec4 base = mix(sharp, blur, u_deblock);

  // Edge clarity (unsharp)
  vec4 high =
    cubicSample(u_tex, v_uv + u_out_texel * vec2(-1.0, 0.0), u_texel) * -0.25 +
    cubicSample(u_tex, v_uv + u_out_texel * vec2( 1.0, 0.0), u_texel) * -0.25 +
    cubicSample(u_tex, v_uv + u_out_texel * vec2( 0.0,-1.0), u_texel) * -0.25 +
    cubicSample(u_tex, v_uv + u_out_texel * vec2( 0.0, 1.0), u_texel) * -0.25 +
    base * 2.0;

  vec3 color = base.rgb + (base.rgb - high.rgb) * u_sharp;
  // Gentle contrast lift
  color = (color - 0.5) * 1.04 + 0.5;
  color = clamp(color, 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0);
}
`;

export class WebGLEnhancer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private buf: WebGLBuffer;
  private tex: WebGLTexture;
  private loc: {
    pos: number;
    tex: WebGLUniformLocation;
    texel: WebGLUniformLocation;
    outTexel: WebGLUniformLocation;
    sharp: WebGLUniformLocation;
    deblock: WebGLUniformLocation;
  };

  constructor() {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl", {
        preserveDrawingBuffer: true,
        premultipliedAlpha: false,
        alpha: false,
      }) ||
      (canvas.getContext("experimental-webgl", {
        preserveDrawingBuffer: true,
      }) as WebGLRenderingContext | null);

    if (!gl) throw new Error("WebGL is not available in this browser");

    this.canvas = canvas;
    this.gl = gl;
    this.program = link(gl, VERT, FRAG);

    const buf = gl.createBuffer();
    if (!buf) throw new Error("buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    this.buf = buf;

    const tex = gl.createTexture();
    if (!tex) throw new Error("texture");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.tex = tex;

    const pos = gl.getAttribLocation(this.program, "a_pos");
    const uTex = gl.getUniformLocation(this.program, "u_tex");
    const uTexel = gl.getUniformLocation(this.program, "u_texel");
    const uOut = gl.getUniformLocation(this.program, "u_out_texel");
    const uSharp = gl.getUniformLocation(this.program, "u_sharp");
    const uDeblock = gl.getUniformLocation(this.program, "u_deblock");
    if (!uTex || !uTexel || !uOut || !uSharp || !uDeblock) {
      throw new Error("uniform locations missing");
    }
    this.loc = {
      pos,
      tex: uTex,
      texel: uTexel,
      outTexel: uOut,
      sharp: uSharp,
      deblock: uDeblock,
    };
  }

  /** Enhance a source (image/video/canvas/bitmap) → 2× canvas (reused). */
  enhanceSource(
    source: TexImageSource,
    srcW: number,
    srcH: number,
    opts?: { scale?: number; sharp?: number; deblock?: number },
  ): HTMLCanvasElement {
    const scale = opts?.scale ?? 2;
    const sharp = opts?.sharp ?? 0.45;
    const deblock = opts?.deblock ?? 0.22;

    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));
    // Cap extreme sizes for memory safety
    const maxDim = 4096;
    let w = outW;
    let h = outH;
    if (w > maxDim || h > maxDim) {
      const r = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * r);
      h = Math.round(h * r);
    }

    const gl = this.gl;
    this.canvas.width = w;
    this.canvas.height = h;
    gl.viewport(0, 0, w, h);

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.loc.pos);
    gl.vertexAttribPointer(this.loc.pos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    gl.uniform1i(this.loc.tex, 0);
    gl.uniform2f(this.loc.texel, 1 / srcW, 1 / srcH);
    gl.uniform2f(this.loc.outTexel, 1 / w, 1 / h);
    gl.uniform1f(this.loc.sharp, sharp);
    gl.uniform1f(this.loc.deblock, deblock);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return this.canvas;
  }

  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.buf);
    gl.deleteTexture(this.tex);
    gl.deleteProgram(this.program);
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality = 0.95,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      type,
      quality,
    );
  });
}
