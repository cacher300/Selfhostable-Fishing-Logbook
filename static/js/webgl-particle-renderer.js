const VERTEX_SHADER_1 = `
attribute vec2 a_position;
uniform vec2 u_resolution;
varying vec2 v_position;
void main() {
  v_position = a_position;
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAGMENT_SHADER_1 = `
precision mediump float;
uniform vec4 u_color;
uniform sampler2D u_water_mask;
uniform float u_use_water_mask;
uniform float u_apply_water_mask;
uniform vec2 u_resolution;
varying vec2 v_position;
float waterCoverage() {
  vec2 uv = vec2(v_position.x / u_resolution.x, 1.0 - v_position.y / u_resolution.y);
  return texture2D(u_water_mask, uv).a;
}
void main() {
  if (u_apply_water_mask > 0.5) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, waterCoverage());
    return;
  }
  vec4 color = u_color;
  if (u_use_water_mask > 0.5) color.a *= waterCoverage();
  gl_FragColor = color;
}`;

const VERTEX_SHADER_2 = `#version 300 es
in vec2 a_position;
uniform vec2 u_resolution;
out vec2 v_position;
void main() {
  v_position = a_position;
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAGMENT_SHADER_2 = `#version 300 es
precision mediump float;
uniform vec4 u_color;
uniform sampler2D u_water_mask;
uniform float u_use_water_mask;
uniform float u_apply_water_mask;
uniform vec2 u_resolution;
in vec2 v_position;
out vec4 out_color;
float waterCoverage() {
  vec2 uv = vec2(v_position.x / u_resolution.x, 1.0 - v_position.y / u_resolution.y);
  return texture(u_water_mask, uv).a;
}
void main() {
  if (u_apply_water_mask > 0.5) {
    out_color = vec4(1.0, 1.0, 1.0, waterCoverage());
    return;
  }
  vec4 color = u_color;
  if (u_use_water_mask > 0.5) color.a *= waterCoverage();
  out_color = color;
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function parseRgb(value) {
  const text = String(value || "");
  const hex = /^#([\da-f]{6})$/i.exec(text);
  if (hex) return [1, 3, 5].map((offset) => Number.parseInt(hex[1].slice(offset - 1, offset + 1), 16) / 255);
  const channels = text.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || [];
  return channels.length === 3 ? channels.map((channel) => Math.max(0, Math.min(255, channel)) / 255) : [1, 1, 1];
}

function strokeGeometry(segments, width) {
  const vertices = new Float32Array(segments.length * 12);
  let offset = 0;
  const halfWidth = width / 2;
  for (const [x1, y1, x2, y2] of segments) {
    const dx = x2 - x1, dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < 1e-4) continue;
    const normalX = -dy / length * halfWidth;
    const normalY = dx / length * halfWidth;
    const points = [
      x1 + normalX, y1 + normalY,
      x1 - normalX, y1 - normalY,
      x2 + normalX, y2 + normalY,
      x2 + normalX, y2 + normalY,
      x1 - normalX, y1 - normalY,
      x2 - normalX, y2 - normalY
    ];
    vertices.set(points, offset);
    offset += points.length;
  }
  return vertices.subarray(0, offset);
}

export function createWebGLParticleRenderer(canvas) {
  const attributes = { alpha: true, antialias: true, preserveDrawingBuffer: true };
  let gl = null, webgl2 = false;
  try {
    gl = canvas.getContext("webgl2", attributes);
    webgl2 = Boolean(gl);
    gl ||= canvas.getContext("webgl", attributes) || canvas.getContext("experimental-webgl", attributes);
  } catch { return null; }
  if (!gl || typeof gl.createShader !== "function" || typeof gl.bufferData !== "function") return null;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, webgl2 ? VERTEX_SHADER_2 : VERTEX_SHADER_1);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, webgl2 ? FRAGMENT_SHADER_2 : FRAGMENT_SHADER_1);
  if (!vertexShader || !fragmentShader) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const colorLocation = gl.getUniformLocation(program, "u_color");
  const maskLocation = gl.getUniformLocation(program, "u_water_mask");
  const useMaskLocation = gl.getUniformLocation(program, "u_use_water_mask");
  const applyMaskLocation = gl.getUniformLocation(program, "u_apply_water_mask");
  const buffer = gl.createBuffer();
  const maskTexture = gl.createTexture();
  if (positionLocation < 0 || !buffer || !maskTexture) {
    gl.deleteBuffer(buffer);
    gl.deleteTexture(maskTexture);
    gl.deleteProgram(program);
    return null;
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  gl.uniform1i(maskLocation, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);

  let maskEnabled = false, maskSource = null, maskWidth = 0, maskHeight = 0;

  function setVertices(vertices, width, height, color, useMask = false, applyMask = false) {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    gl.uniform2f(resolutionLocation, width, height);
    gl.uniform4f(colorLocation, color[0], color[1], color[2], color[3]);
    gl.uniform1f(useMaskLocation, useMask ? 1 : 0);
    gl.uniform1f(applyMaskLocation, applyMask ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 2);
  }

  function fullscreenVertices(width, height) {
    return new Float32Array([0, 0, width, 0, width, height, 0, 0, width, height, 0, height]);
  }

  function setWaterMask(alpha, width, height) {
    if (!alpha || !width || !height) {
      maskEnabled = false;
      maskSource = null;
      return;
    }
    if (maskSource === alpha && maskWidth === width && maskHeight === height) return;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const flippedY = height - 1 - y;
      for (let x = 0; x < width; x += 1) {
        const coverage = alpha[y * width + x];
        const offset = (flippedY * width + x) * 4;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = coverage;
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    maskSource = alpha;
    maskWidth = width;
    maskHeight = height;
    maskEnabled = true;
  }

  return {
    resize(width, height) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!width || !height) return;
    },
    setWaterMask,
    clear() {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    fade(alpha, width, height) {
      if (!alpha || !width || !height) return;
      gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      setVertices(fullscreenVertices(width, height), width, height, [0, 0, 0, alpha]);
    },
    applyWaterMask(width, height) {
      if (!maskEnabled || !width || !height) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, maskTexture);
      gl.blendFuncSeparate(gl.ZERO, gl.SRC_ALPHA, gl.ZERO, gl.SRC_ALPHA);
      setVertices(fullscreenVertices(width, height), width, height, [1, 1, 1, 1], false, true);
    },
    drawGroups(groups, width, height) {
      if (!groups.length || !width || !height) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, maskTexture);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      for (const group of groups) {
        const vertices = strokeGeometry(group.segments, group.width);
        if (!vertices.length) continue;
        const [red, green, blue] = parseRgb(group.color);
        setVertices(vertices, width, height, [red, green, blue, group.alpha], maskEnabled);
      }
    },
    dispose() {
      gl.deleteTexture(maskTexture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    }
  };
}
