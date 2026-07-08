/**
 * Multi-pass local enhancer (WebGL).
 * Designed for visible quality gains on AI art / anime / compressed media:
 *   1) Sharp 2× upscale (multi-tap cubic)
 *   2) Line restore + edge push (Anime4K-inspired)
 *   3) Contrast-adaptive sharpen (CAS-style)
 *   4) Local contrast / clarity + vibrance
 */

export interface EnhanceProgress {
  phase: string;
  progress: number;
}

export type ProgressCb = (p: EnhanceProgress) => void;

export interface EnhanceOpts {
  scale?: number;
  /** 0–1 overall strength (default 0.85 — intentionally strong). */
  strength?: number;
}

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
  v_uv = vec2(a_pos.x * 0.5 + 0.5, a_pos.y * 0.5 + 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/** Pass A: high-quality 2× (or N×) cubic upscale — intentionally crisp, not blurry bilinear. */
const FRAG_UPSCALE = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel; // 1/src

float w0(float a) {
  a = abs(a);
  return (1.0/6.0) * (((-a + 3.0) * a - 3.0) * a + 1.0);
}
float w1(float a) {
  a = abs(a);
  return (1.0/6.0) * ((3.0 * a - 6.0) * a * a + 4.0);
}
float w2(float a) {
  a = abs(a);
  return (1.0/6.0) * (((-3.0 * a + 3.0) * a + 3.0) * a + 1.0);
}
float w3(float a) {
  a = abs(a);
  return (1.0/6.0) * (a * a * a);
}

vec4 cubic(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 coord = uv / texel - 0.5;
  vec2 f = fract(coord);
  vec2 base = floor(coord) - 1.0;
  base = base * texel + texel * 0.5;

  float wx0 = w0(f.x), wx1 = w1(f.x), wx2 = w2(f.x), wx3 = w3(f.x);
  float wy0 = w0(f.y), wy1 = w1(f.y), wy2 = w2(f.y), wy3 = w3(f.y);

  vec4 c0 =
    texture2D(tex, base + texel * vec2(0.0, 0.0)) * wx0 +
    texture2D(tex, base + texel * vec2(1.0, 0.0)) * wx1 +
    texture2D(tex, base + texel * vec2(2.0, 0.0)) * wx2 +
    texture2D(tex, base + texel * vec2(3.0, 0.0)) * wx3;
  vec4 c1 =
    texture2D(tex, base + texel * vec2(0.0, 1.0)) * wx0 +
    texture2D(tex, base + texel * vec2(1.0, 1.0)) * wx1 +
    texture2D(tex, base + texel * vec2(2.0, 1.0)) * wx2 +
    texture2D(tex, base + texel * vec2(3.0, 1.0)) * wx3;
  vec4 c2 =
    texture2D(tex, base + texel * vec2(0.0, 2.0)) * wx0 +
    texture2D(tex, base + texel * vec2(1.0, 2.0)) * wx1 +
    texture2D(tex, base + texel * vec2(2.0, 2.0)) * wx2 +
    texture2D(tex, base + texel * vec2(3.0, 2.0)) * wx3;
  vec4 c3 =
    texture2D(tex, base + texel * vec2(0.0, 3.0)) * wx0 +
    texture2D(tex, base + texel * vec2(1.0, 3.0)) * wx1 +
    texture2D(tex, base + texel * vec2(2.0, 3.0)) * wx2 +
    texture2D(tex, base + texel * vec2(3.0, 3.0)) * wx3;

  return c0 * wy0 + c1 * wy1 + c2 * wy2 + c3 * wy3;
}

void main() {
  // Mild pre-ring control: mix cubic with a tiny bit of bilinear for stability
  vec4 c = cubic(u_tex, v_uv, u_texel);
  vec4 b = texture2D(u_tex, v_uv);
  gl_FragColor = vec4(mix(b.rgb, c.rgb, 0.92), 1.0);
}
`;

/**
 * Pass B: visible “premium” restore.
 * - Anime-style line darken / edge boost
 * - CAS-like adaptive sharpen
 * - Local contrast (clarity)
 * - Vibrance
 */
const FRAG_RESTORE = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel; // 1/out size
uniform float u_strength;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 sampleRgb(vec2 uv) {
  return texture2D(u_tex, clamp(uv, 0.0, 1.0)).rgb;
}

void main() {
  float s = clamp(u_strength, 0.0, 1.2);
  vec3 c = sampleRgb(v_uv);
  float l = luma(c);

  // 3x3 neighborhood
  vec3 n  = sampleRgb(v_uv + u_texel * vec2( 0.0, -1.0));
  vec3 s1 = sampleRgb(v_uv + u_texel * vec2( 0.0,  1.0));
  vec3 e  = sampleRgb(v_uv + u_texel * vec2( 1.0,  0.0));
  vec3 w  = sampleRgb(v_uv + u_texel * vec2(-1.0,  0.0));
  vec3 ne = sampleRgb(v_uv + u_texel * vec2( 1.0, -1.0));
  vec3 nw = sampleRgb(v_uv + u_texel * vec2(-1.0, -1.0));
  vec3 se = sampleRgb(v_uv + u_texel * vec2( 1.0,  1.0));
  vec3 sw = sampleRgb(v_uv + u_texel * vec2(-1.0,  1.0));

  float ln = luma(n), ls = luma(s1), le = luma(e), lw = luma(w);
  float lne = luma(ne), lnw = luma(nw), lse = luma(se), lsw = luma(sw);

  // Sobel edge magnitude
  float gx = -lnw - 2.0*lw - lsw + lne + 2.0*le + lse;
  float gy = -lnw - 2.0*ln - lne + lsw + 2.0*ls + lse;
  float edge = clamp(length(vec2(gx, gy)) * 1.8, 0.0, 1.0);

  // Soft blur for de-mush / local contrast base
  vec3 blur = (n + s1 + e + w + ne + nw + se + sw) * 0.1 + c * 0.2;
  float lb = luma(blur);

  // --- 1) Local contrast / "clarity" (very visible on flat AI shading) ---
  float clarityAmt = 0.55 * s;
  float lBoost = l + (l - lb) * clarityAmt;
  // keep chroma, replace luma
  vec3 clarity = c * (l > 1e-5 ? (lBoost / l) : 1.0);

  // --- 2) Contrast Adaptive Sharpen (CAS-like) ---
  float mn = min(l, min(min(ln, ls), min(le, lw)));
  float mx = max(l, max(max(ln, ls), max(le, lw)));
  float amp = clamp(min(mn, 1.0 - mx) / max(mx - mn, 1e-4), 0.0, 1.0);
  // weight neighbors
  float wsum = 4.0;
  float soft = (ln + ls + le + lw) / wsum;
  float casSharp = mix(0.0, 1.15 * s, amp);
  float lCas = l + (l - soft) * casSharp;
  vec3 cas = clarity * (l > 1e-5 ? (lCas / max(luma(clarity), 1e-5)) : 1.0);

  // --- 3) Anime / line restore: darken thin dark lines, boost edge chroma slightly ---
  float lineMask = edge * edge;
  // If pixel is darker than blur → likely line or shadow edge
  float darker = clamp((lb - l) * 4.0, 0.0, 1.0);
  float line = lineMask * darker;
  vec3 lined = cas * (1.0 - line * 0.22 * s);
  // Edge micro-contrast pop on bright side of edges
  float brighter = clamp((l - lb) * 3.0, 0.0, 1.0);
  lined += (cas - blur) * brighter * edge * 0.65 * s;

  // --- 4) Gradient push along edges (fake detail) ---
  vec2 gdir = vec2(gx, gy);
  float glen = length(gdir);
  vec2 dir = glen > 1e-4 ? gdir / glen : vec2(0.0);
  vec3 p1 = sampleRgb(v_uv + dir * u_texel * 1.25);
  vec3 p2 = sampleRgb(v_uv - dir * u_texel * 1.25);
  vec3 pushed = mix(lined, lined * 1.5 - 0.25 * (p1 + p2), edge * 0.35 * s);

  // --- 5) Vibrance (sat more on muted colors, protect skin-ish reds lightly) ---
  float maxc = max(pushed.r, max(pushed.g, pushed.b));
  float minc = min(pushed.r, min(pushed.g, pushed.b));
  float sat = maxc > 1e-5 ? (maxc - minc) / maxc : 0.0;
  float vib = (1.0 - sat) * 0.35 * s;
  float lp = luma(pushed);
  vec3 vibrant = mix(vec3(lp), pushed, 1.0 + vib);

  // --- 6) Mild global contrast + black point for punch ---
  vec3 outc = (vibrant - 0.5) * (1.0 + 0.12 * s) + 0.5;
  outc = pow(clamp(outc, 0.0, 1.0), vec3(0.96)); // slight lift midtones clarity

  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
`;

interface Fbo {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export class WebGLEnhancer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private progUpscale: WebGLProgram;
  private progRestore: WebGLProgram;
  private buf: WebGLBuffer;
  private srcTex: WebGLTexture;
  private posLocUpscale: number;
  private posLocRestore: number;

  constructor() {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl", {
        preserveDrawingBuffer: true,
        premultipliedAlpha: false,
        alpha: false,
        antialias: false,
      }) ||
      (canvas.getContext("experimental-webgl", {
        preserveDrawingBuffer: true,
      }) as WebGLRenderingContext | null);

    if (!gl) throw new Error("WebGL is not available in this browser");

    // Prefer high precision
    gl.getExtension("OES_texture_float");
    gl.getExtension("OES_texture_half_float");

    this.canvas = canvas;
    this.gl = gl;
    this.progUpscale = link(gl, VERT, FRAG_UPSCALE);
    this.progRestore = link(gl, VERT, FRAG_RESTORE);

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
    this.srcTex = tex;
    this.bindTexParams(tex);

    this.posLocUpscale = gl.getAttribLocation(this.progUpscale, "a_pos");
    this.posLocRestore = gl.getAttribLocation(this.progRestore, "a_pos");
  }

  private bindTexParams(tex: WebGLTexture) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private createFbo(w: number, h: number): Fbo {
    const gl = this.gl;
    const tex = gl.createTexture();
    const fb = gl.createFramebuffer();
    if (!tex || !fb) throw new Error("FBO alloc failed");
    this.bindTexParams(tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0,
    );
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Framebuffer incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }

  private destroyFbo(f: Fbo) {
    const gl = this.gl;
    gl.deleteFramebuffer(f.fb);
    gl.deleteTexture(f.tex);
  }

  private drawFull(prog: WebGLProgram, posLoc: number) {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * Enhance source → output canvas at scale× resolution with strong restore.
   */
  enhanceSource(
    source: TexImageSource,
    srcW: number,
    srcH: number,
    opts?: EnhanceOpts,
  ): HTMLCanvasElement {
    const scale = opts?.scale ?? 2;
    const strength = opts?.strength ?? 0.9;

    let outW = Math.max(2, Math.round(srcW * scale));
    let outH = Math.max(2, Math.round(srcH * scale));
    const maxDim = 4096;
    if (outW > maxDim || outH > maxDim) {
      const r = Math.min(maxDim / outW, maxDim / outH);
      outW = Math.max(2, Math.round(outW * r));
      outH = Math.max(2, Math.round(outH * r));
    }

    const gl = this.gl;

    // Upload source
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source,
    );

    // --- Pass 1: upscale into FBO ---
    const fbo = this.createFbo(outW, outH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.progUpscale);
    gl.uniform1i(gl.getUniformLocation(this.progUpscale, "u_tex"), 0);
    gl.uniform2f(
      gl.getUniformLocation(this.progUpscale, "u_texel"),
      1 / srcW,
      1 / srcH,
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    this.drawFull(this.progUpscale, this.posLocUpscale);

    // --- Pass 2: restore to screen canvas ---
    this.canvas.width = outW;
    this.canvas.height = outH;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.progRestore);
    gl.uniform1i(gl.getUniformLocation(this.progRestore, "u_tex"), 0);
    gl.uniform2f(
      gl.getUniformLocation(this.progRestore, "u_texel"),
      1 / outW,
      1 / outH,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.progRestore, "u_strength"),
      strength,
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
    this.drawFull(this.progRestore, this.posLocRestore);

    this.destroyFbo(fbo);
    return this.canvas;
  }

  destroy() {
    const gl = this.gl;
    gl.deleteBuffer(this.buf);
    gl.deleteTexture(this.srcTex);
    gl.deleteProgram(this.progUpscale);
    gl.deleteProgram(this.progRestore);
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
