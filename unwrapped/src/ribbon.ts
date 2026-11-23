// Glowing silk ribbons drawn by a fragment shader. Used live behind the story and offscreen for the GIF.

export type Pose = [x: number, y: number, angle: number, scale: number];

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uPose;
uniform float uReveal;
uniform float uGrain;

vec3 grad(float x) {
  vec3 a = vec3(0.07, 0.40, 1.00);
  vec3 b = vec3(0.56, 0.22, 1.00);
  vec3 c = vec3(1.00, 0.40, 0.27);
  return x < 0.5 ? mix(a, b, x * 2.0) : mix(b, c, x * 2.0 - 1.0);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv -= uPose.xy;
  float a = uPose.z;
  uv = mat2(cos(a), -sin(a), sin(a), cos(a)) * uv / uPose.w;

  float t = uTime;
  // Colour runs blue (bottom left) to coral (top right) across the screen, whatever the pose.
  vec2 sc = gl_FragCoord.xy / uRes;
  float g = clamp(sc.x * 0.55 + sc.y * 0.55 - 0.05, 0.0, 1.0);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x;
    float center = 0.17 * sin(x * 2.1 + t * 0.32 + fi * 1.9) + 0.06 * sin(x * 4.3 - t * 0.47 + fi) + (fi - 1.0) * 0.07;
    float twist = x * 2.2 + t * 0.41 + fi * 2.3;
    float w = 0.13 * abs(sin(twist)) + 0.008;
    float d = abs(uv.y - center);
    float inside = smoothstep(w, w - 0.003, d);
    float across = clamp(d / w, 0.0, 1.0);
    float sheen = pow(0.5 + 0.5 * cos(twist * 1.3 + across * 2.2), 3.0);
    float edge = pow(across, 10.0);
    vec3 c = grad(clamp(g + (fi - 1.0) * 0.08 + 0.06 * sin(twist), 0.0, 1.0));
    float weight = fi == 1.0 ? 1.0 : 0.55;
    float body = inside * (0.16 + 0.75 * sheen + 1.1 * edge) * weight;
    float glow = exp(-max(d - w, 0.0) * 30.0) * 0.16 * (1.0 - inside) * weight;
    col += c * (body + glow) + vec3(1.0) * inside * sheen * sheen * 0.12 * weight;
  }

  float sweep = mix(-1.6, 1.8, uReveal);
  col *= smoothstep(sweep, sweep - 0.35, uv.x);

  col = col / (1.0 + col * 0.3);
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) * uGrain;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

export class Ribbon {
  private gl: WebGLRenderingContext;
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(readonly canvas: HTMLCanvasElement, keepPixels = false) {
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: keepPixels });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    const prog = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uRes', 'uTime', 'uPose', 'uReveal', 'uGrain']) this.u[n] = gl.getUniformLocation(prog, n);
  }

  // Grain makes GIF frames compress badly, so the share card turns it off.
  render(time: number, pose: Pose, reveal = 1, grain = 0.05) {
    const { gl, canvas } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(this.u.uRes, canvas.width, canvas.height);
    gl.uniform1f(this.u.uTime, time);
    gl.uniform4f(this.u.uPose, ...pose);
    gl.uniform1f(this.u.uReveal, reveal);
    gl.uniform1f(this.u.uGrain, grain);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
