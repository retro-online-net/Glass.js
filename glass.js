/* glass-overlay.js by retroonline.net GPLv3 License 2/22/2026
 * https://github.com/retro-online-net/Glass.js
 * Lightweight WebGL glass-shape overlay.
 * Usage:
 *   const fx = new GlassOverlayFX({ count: 120 });
 *   const fxOnEl = new GlassOverlayFX({ targetElement: document.querySelector(".card") });
 *   fx.setConfig({ refraction: 1.0 });
 *   fx.destroy();
 */
(function (global) {
  "use strict";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickShape(weights) {
    var c = Math.max(0, weights.circle || 0);
    var s = Math.max(0, weights.square || 0);
    var t = Math.max(0, weights.triangle || 0);
    var sum = c + s + t || 1;
    var r = Math.random() * sum;
    if (r < c) return 0;
    if (r < c + s) return 1;
    return 2;
  }

  function speedLimit(vx, vy, maxSpeed) {
    var s2 = vx * vx + vy * vy;
    var max2 = maxSpeed * maxSpeed;
    if (s2 <= max2) return { vx: vx, vy: vy };
    var s = Math.sqrt(s2) || 1;
    var k = maxSpeed / s;
    return { vx: vx * k, vy: vy * k };
  }

  function dot2(ax, ay, bx, by) {
    return ax * bx + ay * by;
  }

  function normalize2(x, y) {
    var len = Math.sqrt(x * x + y * y);
    if (len < 1e-8) return { x: 1, y: 0 };
    return { x: x / len, y: y / len };
  }

  function closestPointOnSegment(px, py, ax, ay, bx, by) {
    var abx = bx - ax;
    var aby = by - ay;
    var abLen2 = abx * abx + aby * aby;
    if (abLen2 < 1e-8) {
      return { x: ax, y: ay };
    }
    var t = ((px - ax) * abx + (py - ay) * aby) / abLen2;
    t = clamp(t, 0, 1);
    return {
      x: ax + abx * t,
      y: ay + aby * t
    };
  }

  function closestPointOnPolygon(px, py, points) {
    var p0 = points[0];
    var p1 = points[1 % points.length];
    var best = closestPointOnSegment(px, py, p0.x, p0.y, p1.x, p1.y);
    var bestDx = px - best.x;
    var bestDy = py - best.y;
    var bestSq = bestDx * bestDx + bestDy * bestDy;

    for (var i = 1; i < points.length; i++) {
      var a = points[i];
      var b = points[(i + 1) % points.length];
      var c = closestPointOnSegment(px, py, a.x, a.y, b.x, b.y);
      var dx = px - c.x;
      var dy = py - c.y;
      var dsq = dx * dx + dy * dy;
      if (dsq < bestSq) {
        bestSq = dsq;
        best = c;
      }
    }
    return best;
  }

  function closestPolyPair(pointsA, pointsB) {
    var a0 = pointsA[0];
    var b0 = closestPointOnPolygon(a0.x, a0.y, pointsB);
    var bestA = { x: a0.x, y: a0.y };
    var bestB = { x: b0.x, y: b0.y };
    var dx0 = bestA.x - bestB.x;
    var dy0 = bestA.y - bestB.y;
    var bestSq = dx0 * dx0 + dy0 * dy0;

    for (var i = 0; i < pointsA.length; i++) {
      var av = pointsA[i];
      var bp = closestPointOnPolygon(av.x, av.y, pointsB);
      var dxa = av.x - bp.x;
      var dya = av.y - bp.y;
      var dsa = dxa * dxa + dya * dya;
      if (dsa < bestSq) {
        bestSq = dsa;
        bestA = { x: av.x, y: av.y };
        bestB = { x: bp.x, y: bp.y };
      }
    }

    for (var j = 0; j < pointsB.length; j++) {
      var bv = pointsB[j];
      var ap = closestPointOnPolygon(bv.x, bv.y, pointsA);
      var dxb = ap.x - bv.x;
      var dyb = ap.y - bv.y;
      var dsb = dxb * dxb + dyb * dyb;
      if (dsb < bestSq) {
        bestSq = dsb;
        bestA = { x: ap.x, y: ap.y };
        bestB = { x: bv.x, y: bv.y };
      }
    }

    return { a: bestA, b: bestB };
  }

  function shapeKind(shapeValue) {
    if (shapeValue < 0.5) return 0; // circle
    if (shapeValue < 1.5) return 1; // square
    return 2; // triangle
  }

  function projectPoly(points, ax, ay) {
    var min = dot2(points[0].x, points[0].y, ax, ay);
    var max = min;
    for (var i = 1; i < points.length; i++) {
      var p = dot2(points[i].x, points[i].y, ax, ay);
      if (p < min) min = p;
      if (p > max) max = p;
    }
    return { min: min, max: max };
  }

  function projectCircle(c, ax, ay) {
    var p = dot2(c.cx, c.cy, ax, ay);
    return { min: p - c.r, max: p + c.r };
  }

  function intervalOverlap(a, b) {
    return Math.min(a.max, b.max) - Math.max(a.min, b.min);
  }

  function colliderExtremePoint(collider, dx, dy) {
    if (collider.type === 0) {
      var n = normalize2(dx, dy);
      return { x: collider.cx + n.x * collider.r, y: collider.cy + n.y * collider.r };
    }
    var best = collider.points[0];
    var bestDot = dot2(best.x, best.y, dx, dy);
    for (var i = 1; i < collider.points.length; i++) {
      var p = collider.points[i];
      var d = dot2(p.x, p.y, dx, dy);
      if (d > bestDot) {
        bestDot = d;
        best = p;
      }
    }
    return { x: best.x, y: best.y };
  }

  var SHAPE_CIRCLE_R = 0.44;
  var SHAPE_SQUARE_HALF = 0.38;
  var TRI_SHADER_SCALE = 1 / 1.06;
  var SHAPE_TRI_HALF_BASE = 0.5 * TRI_SHADER_SCALE;
  var SHAPE_TRI_TOP = TRI_SHADER_SCALE / Math.sqrt(3);
  var SHAPE_TRI_BASE_Y = -SHAPE_TRI_TOP * 0.5;
  var SHAPE_TRI_SIDE = TRI_SHADER_SCALE;
  var SHAPE_TRI_CIRCUM = SHAPE_TRI_TOP;
  var DEFAULT_HTML2CANVAS_URL = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";

  function translateCollider(collider, tx, ty) {
    collider.cx += tx;
    collider.cy += ty;
    if (collider.type === 1) {
      for (var i = 0; i < collider.points.length; i++) {
        collider.points[i].x += tx;
        collider.points[i].y += ty;
      }
    }
  }

  function detectCircleCircle(a, b) {
    var dx = b.cx - a.cx;
    var dy = b.cy - a.cy;
    var distSq = dx * dx + dy * dy;
    var minDist = a.r + b.r;
    if (distSq >= minDist * minDist) return null;
    var dist = Math.sqrt(distSq);
    var n = dist > 1e-8 ? { x: dx / dist, y: dy / dist } : { x: 1, y: 0 };
    var pa = { x: a.cx + n.x * a.r, y: a.cy + n.y * a.r };
    var pb = { x: b.cx - n.x * b.r, y: b.cy - n.y * b.r };
    return {
      nx: n.x,
      ny: n.y,
      penetration: minDist - dist,
      contactX: (pa.x + pb.x) * 0.5,
      contactY: (pa.y + pb.y) * 0.5
    };
  }

  function detectPolyPoly(a, b) {
    var minOverlap = Infinity;
    var nx = 1;
    var ny = 0;

    function testAxes(pa, pb) {
      for (var i = 0; i < pa.points.length; i++) {
        var p0 = pa.points[i];
        var p1 = pa.points[(i + 1) % pa.points.length];
        var ex = p1.x - p0.x;
        var ey = p1.y - p0.y;
        var n = normalize2(-ey, ex);
        var projA = projectPoly(pa.points, n.x, n.y);
        var projB = projectPoly(pb.points, n.x, n.y);
        var ov = intervalOverlap(projA, projB);
        if (ov <= 0) return false;
        if (ov < minOverlap) {
          minOverlap = ov;
          nx = n.x;
          ny = n.y;
        }
      }
      return true;
    }

    if (!testAxes(a, b)) return null;
    if (!testAxes(b, a)) return null;

    var dcx = b.cx - a.cx;
    var dcy = b.cy - a.cy;
    if (dot2(dcx, dcy, nx, ny) < 0) {
      nx = -nx;
      ny = -ny;
    }

    var pair = closestPolyPair(a.points, b.points);
    return {
      nx: nx,
      ny: ny,
      penetration: minOverlap,
      contactX: (pair.a.x + pair.b.x) * 0.5,
      contactY: (pair.a.y + pair.b.y) * 0.5
    };
  }

  function detectCirclePoly(circle, poly) {
    var minOverlap = Infinity;
    var nx = 1;
    var ny = 0;

    for (var i = 0; i < poly.points.length; i++) {
      var p0 = poly.points[i];
      var p1 = poly.points[(i + 1) % poly.points.length];
      var ex = p1.x - p0.x;
      var ey = p1.y - p0.y;
      var edgeN = normalize2(-ey, ex);
      var projPoly = projectPoly(poly.points, edgeN.x, edgeN.y);
      var projCircle = projectCircle(circle, edgeN.x, edgeN.y);
      var ov = intervalOverlap(projPoly, projCircle);
      if (ov <= 0) return null;
      if (ov < minOverlap) {
        minOverlap = ov;
        nx = edgeN.x;
        ny = edgeN.y;
      }
    }

    var closest = poly.points[0];
    var bestSq = (circle.cx - closest.x) * (circle.cx - closest.x) + (circle.cy - closest.y) * (circle.cy - closest.y);
    for (var j = 1; j < poly.points.length; j++) {
      var v = poly.points[j];
      var dsq = (circle.cx - v.x) * (circle.cx - v.x) + (circle.cy - v.y) * (circle.cy - v.y);
      if (dsq < bestSq) {
        bestSq = dsq;
        closest = v;
      }
    }

    var vertexAxis = normalize2(circle.cx - closest.x, circle.cy - closest.y);
    var projPolyV = projectPoly(poly.points, vertexAxis.x, vertexAxis.y);
    var projCircleV = projectCircle(circle, vertexAxis.x, vertexAxis.y);
    var ovV = intervalOverlap(projPolyV, projCircleV);
    if (ovV <= 0) return null;
    if (ovV < minOverlap) {
      minOverlap = ovV;
      nx = vertexAxis.x;
      ny = vertexAxis.y;
    }

    var dcx = poly.cx - circle.cx;
    var dcy = poly.cy - circle.cy;
    if (dot2(dcx, dcy, nx, ny) < 0) {
      nx = -nx;
      ny = -ny;
    }
    var circleEdge = {
      x: circle.cx + nx * circle.r,
      y: circle.cy + ny * circle.r
    };
    var polyEdge = closestPointOnPolygon(circleEdge.x, circleEdge.y, poly.points);
    return {
      nx: nx,
      ny: ny,
      penetration: minOverlap,
      contactX: (circleEdge.x + polyEdge.x) * 0.5,
      contactY: (circleEdge.y + polyEdge.y) * 0.5
    };
  }

  function detectColliders(a, b) {
    if (a.type === 0 && b.type === 0) return detectCircleCircle(a, b);
    if (a.type === 1 && b.type === 1) return detectPolyPoly(a, b);
    if (a.type === 0 && b.type === 1) return detectCirclePoly(a, b);
    var info = detectCirclePoly(b, a);
    if (!info) return null;
    info.nx = -info.nx;
    info.ny = -info.ny;
    return info;
  }

  function deepMerge(base, patch) {
    var out = Object.assign({}, base);
    if (!patch) return out;
    Object.keys(patch).forEach(function (key) {
      var bv = out[key];
      var pv = patch[key];
      if (bv && typeof bv === "object" && !Array.isArray(bv) && pv && typeof pv === "object" && !Array.isArray(pv)) {
        out[key] = deepMerge(bv, pv);
      } else {
        out[key] = pv;
      }
    });
    return out;
  }

  function collectElementsWithRoot(root, selector) {
    var list = [];
    if (!root || root.nodeType !== 1) return list;
    if (root.matches && root.matches(selector)) list.push(root);
    if (root.querySelectorAll) {
      var found = root.querySelectorAll(selector);
      for (var i = 0; i < found.length; i++) list.push(found[i]);
    }
    return list;
  }

  function normalizeUrlToken(urlToken) {
    var raw = String(urlToken == null ? "" : urlToken).trim();
    if (!raw) return "";
    if (
      (raw[0] === "\"" && raw[raw.length - 1] === "\"") ||
      (raw[0] === "'" && raw[raw.length - 1] === "'")
    ) {
      raw = raw.slice(1, -1).trim();
    }
    return raw;
  }

  function extractCssUrlTokens(value) {
    var out = [];
    if (!value || !/url\(/i.test(value)) return out;
    var re = /url\(([^)]+)\)/gi;
    var m;
    while ((m = re.exec(value))) {
      out.push(normalizeUrlToken(m[1]));
    }
    return out;
  }

  function toAbsoluteCaptureUrl(urlValue) {
    var u = normalizeUrlToken(urlValue);
    if (!u) return "";
    try {
      return new URL(u, document.baseURI || window.location.href).href;
    } catch (_err) {
      return u;
    }
  }

  function isElementVisibleForTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isConnected === false) return false;
    try {
      var cs = global.getComputedStyle(el);
      if (!cs) return false;
      if (cs.display === "none" || cs.visibility === "hidden") return false;
    } catch (_err) {
      // Ignore style read errors.
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0.5 && rect.height > 0.5;
  }

  function escapeCssIdentToken(token) {
    var raw = String(token == null ? "" : token);
    if (!raw) return "";
    if (global.CSS && typeof global.CSS.escape === "function") {
      return global.CSS.escape(raw);
    }
    return raw.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function isCaptureSafeUrl(urlValue, enforceSameOrigin) {
    var u = normalizeUrlToken(urlValue);
    if (!u) return true;
    if (u[0] === "#") return true;
    var lower = u.toLowerCase();
    if (lower.indexOf("data:") === 0) return true;
    if (lower.indexOf("blob:") === 0) return true;
    if (lower.indexOf("about:") === 0) return true;
    if (lower.indexOf("javascript:") === 0) return false;
    var parsed;
    try {
      parsed = new URL(u, document.baseURI || window.location.href);
    } catch (_err) {
      return true;
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return enforceSameOrigin ? (parsed.origin === window.location.origin) : true;
    }
    if (parsed.protocol === "file:") return true;
    return false;
  }

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var msg = gl.getShaderInfoLog(shader) || "Unknown shader compile error";
      gl.deleteShader(shader);
      throw new Error(msg);
    }
    return shader;
  }

  function linkProgram(gl, vsSource, fsSource) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      var msg = gl.getProgramInfoLog(program) || "Unknown program link error";
      gl.deleteProgram(program);
      throw new Error(msg);
    }
    return program;
  }

  var DEFAULTS = {
    container: null,
    targetElement: null,
    followTarget: true,
    count: 130,
    minSize: 16,
    maxSize: 62,
    speed: 22,
    wobble: 0.8,
    spin: 0.5,
    density: 1.0,
    roundness: 0.2,
    refraction: 0.9,
    chromaticAberration: 0.7,
    ior: 1.52,
    thickness: 0.9,
    edgeWidth: 0.08,
    edgeSoftness: 0.16,
    edgeIntensity: 1.0,
    surfaceDistance: 0.12,
    flipRefractionY: 1,
    lightRadius: 420,
    gloss: 1.0,
    opacity: 1.0,
    zIndex: 2147483647,
    spawnPadding: 80,
    trackPointer: true,
    physics: {
      enabled: false,
      boundaryCollision: true,
      boundaryRestitution: 0.92,
      boundaryFriction: 0.35,
      restitution: 0.9,
      spinTransfer: 0.55,
      collisionFriction: null,
      linearDamping: 0.998,
      angularDamping: 0.985,
      maxSpeed: 420,
      positionCorrection: 1.0,
      solverIterations: 3,
      penetrationSlop: 0.0,
      collisionPaddingPx: 0,
      initialSpeedMin: 0.55,
      initialSpeedMax: 1.45,
      respawnSpeedMin: 0.65,
      respawnSpeedMax: 1.5,
      minAliveSpeed: 5,
      wakeStrength: 18
    },
    capture: {
      enabled: true,
      fps: 0,
      minIntervalMs: 120,
      scale: 1,
      hideUntilFirstCapture: true,
      firstCaptureFadeMs: 420,
      revealOnlyOncePerPage: true,
      freezeMotionUntilFirstReveal: true,
      initialSpawnInside: true,
      syncFormState: true,
      mirrorRangeControls: false,
      syncComputedVisibility: true,
      elementCaptureStrategy: "documentCrop",
      elementLockToElementSpace: true,
      elementTransparentFill: true,
      elementTransparentFillColor: null,
      elementAutoCapture: false,
      elementFreezeTextureOnPageScroll: true,
      elementScrollFreezeMs: 240,
      targetRetargetSelector: null,
      preferVisibleTargetMatch: true,
      observeGlobalCssInElementMode: true,
      snapTargetBoundsToPixel: true,
      premultiplyAlpha: false,
      showTexturePreview: false,
      previewOpacity: 1.0,
      previewZIndexOffset: 1,
      targetMode: "viewportCrop",
      observeCssChanges: true,
      cssAutoRefreshMs: 1200,
      cssImmediateCapture: true,
      cssImmediateCaptureDebounceMs: 90,
      observeTargetContentChanges: true,
      targetImmediateCapture: true,
      targetImmediateCaptureDebounceMs: 40,
      targetAutoRefreshMs: 1200,
      watchBackgroundImageUrlChanges: true,
      backgroundImageRefreshDebounceMs: 90,
      backgroundImageLoadTimeoutMs: 4000,
      backgroundImageScanLimit: 120,
      strictSameOriginCaptureUrls: false,
      forceVisualFlushBeforeCapture: false,
      clearHtml2canvasCacheBeforeCapture: false,
      autoLoadHtml2Canvas: true,
      html2canvasUrl: DEFAULT_HTML2CANVAS_URL,
      html2canvasOptions: {
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: null
      }
    },
    shapeWeights: {
      circle: 0.34,
      square: 0.33,
      triangle: 0.33
    }
  };

  var VERTEX_SHADER = [
    "precision mediump float;",
    "const float POINT_PAD = 1.20;",
    "attribute vec2 a_position;",
    "attribute float a_size;",
    "attribute float a_shape;",
    "attribute float a_rotation;",
    "attribute float a_roundness;",
    "attribute float a_refract;",
    "attribute float a_gloss;",
    "uniform mediump vec2 u_resolution;",
    "uniform float u_dpr;",
    "varying float v_shape;",
    "varying float v_rotation;",
    "varying float v_roundness;",
    "varying float v_refract;",
    "varying float v_gloss;",
    "varying vec2 v_center;",
    "varying float v_size;",
    "void main() {",
    "  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;",
    "  clip.y = -clip.y;",
    "  gl_Position = vec4(clip, 0.0, 1.0);",
    "  gl_PointSize = a_size * u_dpr * POINT_PAD;",
    "  v_shape = a_shape;",
    "  v_rotation = a_rotation;",
    "  v_roundness = a_roundness;",
    "  v_refract = a_refract;",
    "  v_gloss = a_gloss;",
    "  v_center = a_position / u_resolution;",
    "  v_size = a_size;",
    "}"
  ].join("\n");

  var FRAGMENT_SHADER = [
    "precision mediump float;",
    "const float POINT_PAD = 1.20;",
    "uniform mediump vec2 u_resolution;",
    "uniform float u_dpr;",
    "uniform float u_time;",
    "uniform float u_refraction;",
    "uniform float u_chromatic;",
    "uniform float u_ior;",
    "uniform float u_thickness;",
    "uniform float u_edgeWidth;",
    "uniform float u_edgeSoftness;",
    "uniform float u_edgeIntensity;",
    "uniform float u_surfaceDistance;",
    "uniform float u_flipRefractionY;",
    "uniform float u_lightRadius;",
    "uniform float u_gloss;",
    "uniform float u_opacity;",
    "uniform vec2 u_lightPx;",
    "uniform sampler2D u_scene;",
    "uniform float u_hasScene;",
    "varying float v_shape;",
    "varying float v_rotation;",
    "varying float v_roundness;",
    "varying float v_refract;",
    "varying float v_gloss;",
    "varying vec2 v_center;",
    "varying float v_size;",
    "float sdBox(vec2 p, vec2 b) {",
    "  vec2 d = abs(p) - b;",
    "  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);",
    "}",
    "float sdRoundedBox(vec2 p, vec2 b, float r) {",
    "  vec2 q = abs(p) - b + vec2(r);",
    "  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;",
    "}",
    "float sdEquilateralTriangle(vec2 p) {",
    "  const float k = 1.7320508;",
    "  p.x = abs(p.x) - 1.0;",
    "  p.y = p.y + 1.0 / k;",
    "  if (p.x + k * p.y > 0.0) {",
    "    p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;",
    "  }",
    "  p.x -= clamp(p.x, -2.0, 0.0);",
    "  return -length(p) * sign(p.y);",
    "}",
    "float shapeSdf(vec2 p, float shape, float roundness) {",
    "  float dCircle = length(p) - 0.88;",
    "  float dBox = sdBox(p, vec2(0.76));",
    "  float dTri = sdEquilateralTriangle(p * 1.06);",
    "  if (shape < 0.5) return dCircle;",
    "  if (shape < 1.5) return dBox;",
    "  return dTri;",
    "}",
    "vec3 sampleScene(vec2 uv) {",
    "  vec2 suv = clamp(uv, vec2(0.001), vec2(0.999));",
    "  return texture2D(u_scene, suv).rgb;",
    "}",
    "vec3 envColor(vec2 uv) {",
    "  float t = u_time * 0.17;",
    "  vec2 q = uv;",
    "  q += vec2(sin((uv.y + t) * 8.0), cos((uv.x - t * 0.7) * 7.0)) * 0.015;",
    "  float bandA = 0.5 + 0.5 * sin((q.x * 8.5 + q.y * 5.3 + t) * 5.2);",
    "  float bandB = 0.5 + 0.5 * cos((q.x * 6.2 - q.y * 4.7 - t * 1.3) * 4.6);",
    "  vec3 top = vec3(0.90, 0.96, 1.0);",
    "  vec3 mid = vec3(0.53, 0.74, 0.95);",
    "  vec3 bot = vec3(0.09, 0.17, 0.29);",
    "  float gy = clamp(1.0 - uv.y, 0.0, 1.0);",
    "  vec3 grad = mix(bot, mix(mid, top, gy), gy);",
    "  grad += vec3(0.07, 0.08, 0.09) * bandA;",
    "  grad += vec3(0.03, 0.04, 0.06) * bandB;",
    "  return grad;",
    "}",
    "mat2 rot(float a) {",
    "  float s = sin(a);",
    "  float c = cos(a);",
    "  return mat2(c, -s, s, c);",
    "}",
    "void main() {",
    "  vec2 pLocal = vec2(gl_PointCoord.x * 2.0 - 1.0, (1.0 - gl_PointCoord.y) * 2.0 - 1.0) * POINT_PAD;",
    "  mat2 R = rot(v_rotation);",
    "  vec2 p = R * pLocal;",
    "  float d = shapeSdf(p, v_shape, v_roundness);",
    "  float aa = max(0.0025, 1.15 / max(v_size, 1.0));",
    "  float mask = 1.0 - smoothstep(0.0, aa, d);",
    "  if (mask < 0.001) discard;",
    "",
    "  vec2 e = vec2(0.006, 0.0);",
    "  float gxs = shapeSdf(p + e.xy, v_shape, v_roundness) - shapeSdf(p - e.xy, v_shape, v_roundness);",
    "  float gys = shapeSdf(p + e.yx, v_shape, v_roundness) - shapeSdf(p - e.yx, v_shape, v_roundness);",
    "  vec2 gradShape = vec2(gxs, gys);",
    "  vec2 gradScreen = rot(-v_rotation) * gradShape;",
    "  float gradLen = max(length(gradScreen), 1e-5);",
    "  float gradShapeLen = max(length(gradShape), 1e-5);",
    "  float edgeInner = max(0.002, u_edgeWidth);",
    "  float edgeOuter = edgeInner + max(0.002, u_edgeSoftness);",
    "  float edgeBand = 1.0 - smoothstep(edgeInner, edgeOuter, abs(d));",
    "  edgeBand = clamp(edgeBand * max(0.0, u_edgeIntensity), 0.0, 1.0);",
    "  float edgeStrength = edgeBand * (0.12 + u_thickness * 0.36);",
    "  vec2 normalXY = (gradScreen / gradLen) * edgeStrength;",
    "  vec3 normal = normalize(vec3(normalXY, 1.0));",
    "  vec2 normalXYShape = (gradShape / gradShapeLen) * edgeStrength;",
    "  vec3 normalLight = normalize(vec3(normalXYShape, 1.0));",
    "",
    "  vec3 I = vec3(0.0, 0.0, -1.0);",
    "  vec3 V = vec3(0.0, 0.0, 1.0);",
    "  float ior = max(1.01, u_ior * v_refract);",
    "  float eta = 1.0 / ior;",
    "  vec3 refrVec = refract(I, normal, eta);",
    "  vec3 reflVec = reflect(I, normal);",
    "",
    "  vec2 fragPx = vec2(gl_FragCoord.x / u_dpr, u_resolution.y - (gl_FragCoord.y / u_dpr));",
    "  vec2 fragUv = fragPx / u_resolution;",
    "  float body = 1.0 - smoothstep(-0.65, 0.65, d);",
    "  float bendBase = (0.0012 + 0.0028 * u_refraction) * (0.55 + edgeBand * 0.45);",
    "  float distanceScale = 0.02 + clamp(u_surfaceDistance, 0.0, 2.0) * 0.98;",
    "  float bend = bendBase * (0.45 + u_thickness * 0.55) * distanceScale;",
    "  vec2 contactShift = pLocal * (0.00035 * u_refraction * (0.35 + u_thickness) * distanceScale);",
    "  vec2 refrOffset = vec2(refrVec.x, refrVec.y * u_flipRefractionY) * bend;",
    "  vec2 reflOffset = vec2(reflVec.x, reflVec.y * u_flipRefractionY) * (bend * 0.22);",
    "  vec2 refractUv = fragUv + contactShift + refrOffset;",
    "  vec2 reflectUv = fragUv + reflOffset;",
    "  float ca = u_chromatic * (0.00025 + edgeBand * 0.0008);",
    "",
    "  vec3 transCol;",
    "  vec3 reflCol;",
    "  if (u_hasScene > 0.5) {",
    "    transCol.r = sampleScene(refractUv + vec2(ca, 0.0)).r;",
    "    transCol.g = sampleScene(refractUv).g;",
    "    transCol.b = sampleScene(refractUv - vec2(ca, 0.0)).b;",
    "    reflCol = sampleScene(reflectUv);",
    "  } else {",
    "    transCol.r = envColor(refractUv + vec2(ca, 0.0)).r;",
    "    transCol.g = envColor(refractUv).g;",
    "    transCol.b = envColor(refractUv - vec2(ca, 0.0)).b;",
    "    reflCol = envColor(reflectUv);",
    "  }",
    "",
    "  vec2 lightDeltaPx = (u_lightPx - fragPx);",
    "  vec2 lightVecScreen = lightDeltaPx / max(u_lightRadius, 1.0);",
    "  vec2 lightVecLocal = vec2(lightVecScreen.x, -lightVecScreen.y);",
    "  vec2 lightVecShape = R * lightVecLocal;",
    "  float lightDist2 = dot(lightVecScreen, lightVecScreen);",
    "  float lightAtten = 1.0 / (1.0 + lightDist2);",
    "  vec3 L = normalize(vec3(lightVecShape * 3.0, 0.35));",
    "  vec3 H = normalize(L + V);",
    "  float specPow = mix(34.0, 88.0, clamp(v_gloss, 0.0, 1.0));",
    "  float spec = pow(max(dot(normalLight, H), 0.0), specPow) * edgeBand * lightAtten;",
    "",
    "  float f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);",
    "  float fresnel = f0 + (1.0 - f0) * pow(1.0 - max(dot(normal, V), 0.0), 5.0);",
    "",
    "  vec3 col = mix(transCol, reflCol, fresnel * (0.10 + edgeBand * 0.18));",
    "  float ndl = max(dot(normalLight, L), 0.0) * lightAtten;",
    "  col *= (0.94 + ndl * 0.14);",
    "  col += vec3(1.0) * spec * (0.10 + u_gloss * 0.30);",
    "",
    "  float alpha = mask * u_opacity;",
    "  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));",
    "}"
  ].join("\n");

  function GlassOverlayFX(options) {
    var ctorOptions = options || {};
    this.config = deepMerge(DEFAULTS, ctorOptions);
    if (typeof ctorOptions.html2canvasUrl === "string") {
      var customHtml2CanvasUrl = ctorOptions.html2canvasUrl.trim();
      if (customHtml2CanvasUrl) {
        this.config.capture.html2canvasUrl = customHtml2CanvasUrl;
      }
    }
    this.canvas = null;
    this.gl = null;
    this.program = null;
    this.attribs = null;
    this.uniforms = null;
    this.buffer = null;
    this.maxPointSize = 64;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.originX = 0;
    this.originY = 0;
    this.targetElement = null;
    this._observedTargetElement = null;
    this.particles = [];
    this.data = null;
    this.running = false;
    this.raf = 0;
    this.startTime = 0;
    this.lastTime = 0;
    this.sceneTexture = null;
    this.sceneReady = false;
    this.sceneDirty = true;
    this.sceneVersion = 0;
    this.capturePreviewCanvas = null;
    this.capturePreviewCtx = null;
    this.captureBusy = false;
    this.captureForcePending = false;
    this.captureError = null;
    this.lastCaptureAt = 0;
    this.lastCaptureInfo = { engine: null, fallbackFrom: null, time: 0 };
    this._hasFirstSceneCapture = false;
    this._firstSceneCaptureAt = 0;
    this.pointer = { x: 0, y: 0, active: false };
    this.light = { x: 0.5, y: 0.3 };
    this._targetScrollEl = null;
    this._targetContentEventEl = null;
    this._targetMutationObserver = null;
    this._targetResizeObserver = null;
    this._cssMutationObserver = null;
    this._cssAutoRefreshUntil = 0;
    this._cssCaptureTimer = 0;
    this._bgRefreshTimer = 0;
    this._bgRefreshToken = 0;
    this._bgPendingUrls = Object.create(null);
    this._lastWindowScrollAt = -1;
    this._boundResize = this._resize.bind(this);
    this._boundPointerMove = this._handlePointerMove.bind(this);
    this._boundPointerDown = this._handlePointerMove.bind(this);
    this._boundPointerRawUpdate = this._handlePointerMove.bind(this);
    this._boundMouseMove = this._handleMouseMove.bind(this);
    this._boundTouchMove = this._handleTouchMove.bind(this);
    this._boundTouchStart = this._handleTouchMove.bind(this);
    this._boundTargetScroll = this._handleTargetScroll.bind(this);
    this._boundTargetContentActivity = this._handleTargetContentActivity.bind(this);
    this._boundCssMutation = this._handleCssMutation.bind(this);
    this._boundCssEvent = this._handleCssActivity.bind(this);
    this._boundCssResourceLoad = this._handleCssResourceLoad.bind(this);
    this._boundScroll = this._handleScroll.bind(this);
    this._boundInputDirty = this._markSceneDirty.bind(this);
    this._boundFrame = this._frame.bind(this);
    this._init();
  }

  GlassOverlayFX.prototype._selectTargetBySelector = function (selector) {
    if (!selector) return null;
    try {
      var all = document.querySelectorAll(selector);
      if (!all || all.length === 0) return null;
      var cap = this.config && this.config.capture ? this.config.capture : {};
      var preferVisible = cap.preferVisibleTargetMatch !== false;
      if (preferVisible) {
        for (var i = 0; i < all.length; i++) {
          if (isElementVisibleForTarget(all[i])) return all[i];
        }
      }
      return all[0] || null;
    } catch (_err) {
      return null;
    }
  };

  GlassOverlayFX.prototype._resolveTargetElement = function () {
    var cap = this.config && this.config.capture ? this.config.capture : {};

    var retargetSelector =
      cap && typeof cap.targetRetargetSelector === "string"
        ? cap.targetRetargetSelector.trim()
        : "";
    if (retargetSelector) {
      var rehit = this._selectTargetBySelector(retargetSelector);
      if (rehit) return rehit;
    }

    var ref = this.config && this.config.targetElement;
    if (!ref) return null;

    if (typeof ref === "function") {
      try {
        ref = ref();
      } catch (_errFn) {
        return null;
      }
    }

    if (ref && ref.current && ref.current.nodeType === 1) {
      ref = ref.current;
    }

    if (ref && ref.nodeType === 1) {
      var candidate = ref;
      if (ref.id) {
        var byId = document.getElementById(ref.id);
        if (byId) candidate = byId;
      }
      if (candidate.isConnected === false) return null;

      if (cap.preferVisibleTargetMatch !== false && !isElementVisibleForTarget(candidate)) {
        var classSel = "";
        if (candidate.classList && candidate.classList.length) {
          var classParts = [];
          for (var ci = 0; ci < candidate.classList.length; ci++) {
            var cls = escapeCssIdentToken(candidate.classList[ci]);
            if (cls) classParts.push("." + cls);
          }
          classSel = classParts.join("");
        }
        if (classSel) {
          var byTagClass = this._selectTargetBySelector(candidate.tagName.toLowerCase() + classSel);
          if (byTagClass) return byTagClass;
          var byClass = this._selectTargetBySelector(classSel);
          if (byClass) return byClass;
        }

        var parent = candidate.parentElement;
        if (parent && parent.children && parent.children.length) {
          for (var pi = 0; pi < parent.children.length; pi++) {
            var sib = parent.children[pi];
            if (!sib || sib === candidate) continue;
            if (sib.tagName !== candidate.tagName) continue;
            if (isElementVisibleForTarget(sib)) return sib;
          }
        }
      }

      return candidate;
    }

    if (typeof ref === "string") {
      return this._selectTargetBySelector(ref);
    }

    return null;
  };

  GlassOverlayFX.prototype._isElementTargetCaptureMode = function () {
    var cap = this.config && this.config.capture ? this.config.capture : {};
    var mode = String(cap.targetMode || "viewportCrop").toLowerCase();
    return !!this.config.targetElement && mode === "element";
  };

  function isTransparentCssColor(value) {
    if (value == null) return true;
    var v = String(value).trim().toLowerCase();
    if (!v || v === "transparent") return true;
    if (v.indexOf("rgba(") === 0 || v.indexOf("hsla(") === 0) {
      var m = v.match(/,\s*([0-9]*\.?[0-9]+)\s*\)$/);
      if (m) {
        var a = Number(m[1]);
        return isFinite(a) && a <= 0.001;
      }
    }
    if (v[0] === "#" && (v.length === 5 || v.length === 9)) {
      var aHex = v.length === 5 ? v[4] + v[4] : v.slice(7, 9);
      return parseInt(aHex, 16) <= 0;
    }
    return false;
  }

  GlassOverlayFX.prototype._resolveElementBackdropColor = function (target) {
    var cap = this.config && this.config.capture ? this.config.capture : {};
    if (cap.elementTransparentFillColor) {
      return String(cap.elementTransparentFillColor);
    }

    var node = target && target.nodeType === 1 ? target : null;
    while (node) {
      try {
        var cs = global.getComputedStyle(node);
        if (cs && cs.backgroundColor && !isTransparentCssColor(cs.backgroundColor)) {
          return cs.backgroundColor;
        }
      } catch (_err) {
        // Ignore style access issues.
      }
      node = node.parentElement;
    }

    var candidates = [document.body, document.documentElement];
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!el) continue;
      try {
        var cs2 = global.getComputedStyle(el);
        if (cs2 && cs2.backgroundColor && !isTransparentCssColor(cs2.backgroundColor)) {
          return cs2.backgroundColor;
        }
      } catch (_err2) {
        // Ignore style access issues.
      }
    }

    return "#ffffff";
  };

  GlassOverlayFX.prototype._applyElementTransparentFill = function (sourceCanvas, target) {
    var cap = this.config && this.config.capture ? this.config.capture : {};
    if (cap.elementTransparentFill === false) return sourceCanvas;
    if (!sourceCanvas || typeof sourceCanvas.getContext !== "function") return sourceCanvas;

    var w = Math.max(1, Math.floor(sourceCanvas.width || 1));
    var h = Math.max(1, Math.floor(sourceCanvas.height || 1));
    if (w < 1 || h < 1) return sourceCanvas;

    var out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    var ctx = out.getContext("2d", { alpha: true });
    if (!ctx) return sourceCanvas;

    var fill = this._resolveElementBackdropColor(target);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    return out;
  };

  GlassOverlayFX.prototype._isInElementPageScrollWindow = function (nowTs) {
    var cap = this.config && this.config.capture ? this.config.capture : {};
    if (!this._isElementTargetCaptureMode()) return false;
    if (cap.elementFreezeTextureOnPageScroll === false) return false;
    var settleMs = Math.max(0, Number(cap.elementScrollFreezeMs == null ? 240 : cap.elementScrollFreezeMs));
    if (settleMs <= 0) return false;
    var now = nowTs == null ? performance.now() : nowTs;
    return this._lastWindowScrollAt > 0 && (now - this._lastWindowScrollAt) <= settleMs;
  };

  GlassOverlayFX.prototype._updateCanvasBounds = function (force) {
    var prevTarget = this.targetElement;
    var target = this._resolveTargetElement();
    if (target !== this._observedTargetElement) {
      this._startTargetObservers(target);
      target = this._observedTargetElement;
    }
    this.targetElement = target;
    var cap = this.config.capture || {};

    var x = 0;
    var y = 0;
    var w = Math.max(1, window.innerWidth);
    var h = Math.max(1, window.innerHeight);
    var visible = true;

    if (target) {
      var rect = target.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      x = rect.left;
      y = rect.top;
      if (cap.snapTargetBoundsToPixel !== false) {
        x = Math.round(x);
        y = Math.round(y);
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
      }
      visible = rect.width > 0.5 && rect.height > 0.5;
    }

    var dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    var posChanged =
      Math.abs(this.originX - x) > 0.25 ||
      Math.abs(this.originY - y) > 0.25;
    var sizeChanged =
      Math.abs(this.width - w) > 0.25 ||
      Math.abs(this.height - h) > 0.25;
    var dprChanged = Math.abs(this.dpr - dpr) > 1e-6;
    var targetChanged = prevTarget !== target;
    var changed = !!force || posChanged || sizeChanged || dprChanged || targetChanged;

    if (!changed) return false;

    this.originX = x;
    this.originY = y;
    this.width = w;
    this.height = h;
    this.dpr = dpr;

    this.canvas.style.position = "fixed";
    this.canvas.style.left = x + "px";
    this.canvas.style.top = y + "px";
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvas.style.display = visible ? "block" : "none";
    this._syncCapturePreviewLayer();

    if (sizeChanged || dprChanged || force) {
      this.canvas.width = Math.max(1, Math.floor(w * dpr));
      this.canvas.height = Math.max(1, Math.floor(h * dpr));
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    var mode = String(cap.targetMode || "viewportCrop").toLowerCase();
    var targetElementMode = !!target && mode === "element";
    var movedOnly = posChanged && !sizeChanged && !dprChanged && !targetChanged;
    var shouldRecapture = !targetElementMode || !movedOnly || !!force;
    if (shouldRecapture) {
      this._markSceneDirty(true);
      this.lastCaptureAt = 0;
    }
    return true;
  };

  GlassOverlayFX.prototype._stopTargetObservers = function () {
    if (this._targetMutationObserver) {
      this._targetMutationObserver.disconnect();
      this._targetMutationObserver = null;
    }
    if (this._targetResizeObserver) {
      this._targetResizeObserver.disconnect();
      this._targetResizeObserver = null;
    }
    if (this._targetScrollEl) {
      this._targetScrollEl.removeEventListener("scroll", this._boundTargetScroll);
      this._targetScrollEl = null;
    }
    if (this._targetContentEventEl) {
      this._targetContentEventEl.removeEventListener("input", this._boundTargetContentActivity, true);
      this._targetContentEventEl.removeEventListener("change", this._boundTargetContentActivity, true);
      this._targetContentEventEl.removeEventListener("load", this._boundTargetContentActivity, true);
      this._targetContentEventEl.removeEventListener("error", this._boundTargetContentActivity, true);
      this._targetContentEventEl.removeEventListener("loadeddata", this._boundTargetContentActivity, true);
      this._targetContentEventEl.removeEventListener("loadedmetadata", this._boundTargetContentActivity, true);
      this._targetContentEventEl = null;
    }
    this._observedTargetElement = null;
  };

  GlassOverlayFX.prototype._handleTargetContentActivity = function () {
    var cap = this.config.capture || {};
    if (!cap.enabled) return;
    if (cap.observeTargetContentChanges === false) return;
    this._markSceneDirty(true);
    this._touchCssAutoRefresh(cap.targetAutoRefreshMs == null ? 1200 : cap.targetAutoRefreshMs);
    if (cap.targetImmediateCapture !== false) {
      this._scheduleImmediateCapture(cap.targetImmediateCaptureDebounceMs == null ? 40 : cap.targetImmediateCaptureDebounceMs);
    }
  };

  GlassOverlayFX.prototype._startTargetObservers = function (targetOverride) {
    this._stopTargetObservers();
    var target = arguments.length > 0 ? targetOverride : this._resolveTargetElement();
    this.targetElement = target;
    this._observedTargetElement = target;
    if (!target) return;
    var self = this;

    if (typeof MutationObserver !== "undefined") {
      this._targetMutationObserver = new MutationObserver(function (mutations) {
        var cap = self.config.capture || {};
        if (!cap.enabled) return;
        if (cap.observeTargetContentChanges === false) return;
        if (self._queueBackgroundRefreshFromMutations(mutations)) return;

        var dirty = false;
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === "attributes" || m.type === "characterData") {
            if (self._isIgnoredCssNode(m.target)) continue;
            dirty = true;
            break;
          }
          if (m.type === "childList") {
            if (!self._isIgnoredCssNode(m.target)) {
              dirty = true;
              break;
            }
            var anyRelevant = false;
            for (var a = 0; a < m.addedNodes.length; a++) {
              if (!self._isIgnoredCssNode(m.addedNodes[a])) {
                anyRelevant = true;
                break;
              }
            }
            if (!anyRelevant) {
              for (var r = 0; r < m.removedNodes.length; r++) {
                if (!self._isIgnoredCssNode(m.removedNodes[r])) {
                  anyRelevant = true;
                  break;
                }
              }
            }
            if (!anyRelevant) continue;
            dirty = true;
            break;
          }
        }
        if (!dirty) return;

        self._handleTargetContentActivity();
      });
      this._targetMutationObserver.observe(target, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["style", "class", "src", "srcset", "href"]
      });
    }

    if (typeof ResizeObserver !== "undefined") {
      this._targetResizeObserver = new ResizeObserver(function () {
        self._resize();
        self._handleTargetContentActivity();
      });
      this._targetResizeObserver.observe(target);
    }

    target.addEventListener("scroll", this._boundTargetScroll, { passive: true });
    target.addEventListener("input", this._boundTargetContentActivity, { passive: true, capture: true });
    target.addEventListener("change", this._boundTargetContentActivity, { passive: true, capture: true });
    target.addEventListener("load", this._boundTargetContentActivity, { passive: true, capture: true });
    target.addEventListener("error", this._boundTargetContentActivity, { passive: true, capture: true });
    target.addEventListener("loadeddata", this._boundTargetContentActivity, { passive: true, capture: true });
    target.addEventListener("loadedmetadata", this._boundTargetContentActivity, { passive: true, capture: true });
    this._targetScrollEl = target;
    this._targetContentEventEl = target;
  };

  GlassOverlayFX.prototype._stopCssObservers = function () {
    if (this._cssMutationObserver) {
      this._cssMutationObserver.disconnect();
      this._cssMutationObserver = null;
    }
    if (this._bgRefreshTimer) {
      clearTimeout(this._bgRefreshTimer);
      this._bgRefreshTimer = 0;
    }
    this._bgPendingUrls = Object.create(null);
    this._bgRefreshToken += 1;
    this._cssAutoRefreshUntil = 0;
    window.removeEventListener("transitionrun", this._boundCssEvent, true);
    window.removeEventListener("transitionstart", this._boundCssEvent, true);
    window.removeEventListener("transitionend", this._boundCssEvent, true);
    window.removeEventListener("transitioncancel", this._boundCssEvent, true);
    window.removeEventListener("animationstart", this._boundCssEvent, true);
    window.removeEventListener("animationiteration", this._boundCssEvent, true);
    window.removeEventListener("animationend", this._boundCssEvent, true);
    window.removeEventListener("animationcancel", this._boundCssEvent, true);
    window.removeEventListener("load", this._boundCssResourceLoad, true);
  };

  GlassOverlayFX.prototype._isIgnoredCssNode = function (node) {
    if (!node) return true;
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return true;
    if (this.canvas && (el === this.canvas || this.canvas.contains(el))) return true;
    if (el.classList && el.classList.contains("html2canvas-container")) return true;
    if (el.closest && el.closest(".html2canvas-container")) return true;
    return false;
  };

  GlassOverlayFX.prototype._touchCssAutoRefresh = function (extraMs) {
    var cap = this.config.capture || {};
    if (cap.observeCssChanges === false) return;
    if (this._isElementTargetCaptureMode() && cap.observeGlobalCssInElementMode === false) return;
    if (this._isInElementPageScrollWindow()) return;
    var ms = Math.max(0, Number(extraMs == null ? cap.cssAutoRefreshMs || 1200 : extraMs));
    if (ms <= 0) return;
    var until = performance.now() + ms;
    if (until > this._cssAutoRefreshUntil) this._cssAutoRefreshUntil = until;
  };

  GlassOverlayFX.prototype._collectBackgroundUrlsFromNode = function (node, outMap, maxNodes) {
    if (!node) return;
    var limit = Math.max(8, Number(maxNodes == null ? 120 : maxNodes));
    var stack = [];
    if (node.nodeType === 1) stack.push(node);
    else if (node.nodeType === 3 && node.parentElement) stack.push(node.parentElement);
    var scanned = 0;
    while (stack.length && scanned < limit) {
      var el = stack.pop();
      if (!el || el.nodeType !== 1) continue;
      if (this._isIgnoredCssNode(el)) continue;
      scanned += 1;

      try {
        var cs = global.getComputedStyle(el);
        if (cs && cs.backgroundImage) {
          var tokens = extractCssUrlTokens(cs.backgroundImage);
          for (var t = 0; t < tokens.length; t++) {
            var abs = toAbsoluteCaptureUrl(tokens[t]);
            if (abs) outMap[abs] = true;
          }
        }
      } catch (_errStyle) {
        // Ignore style read errors.
      }

      var children = el.children;
      if (!children || !children.length) continue;
      for (var c = children.length - 1; c >= 0; c--) {
        stack.push(children[c]);
      }
    }
  };

  GlassOverlayFX.prototype._waitBackgroundImageUrl = function (url, timeoutMs) {
    var src = toAbsoluteCaptureUrl(url);
    if (!src) return Promise.resolve();
    var timeout = Math.max(100, Number(timeoutMs == null ? 4000 : timeoutMs));
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      var timer = setTimeout(finish, timeout);
      var img = new Image();
      try {
        img.decoding = "async";
        img.loading = "eager";
      } catch (_errProp) {
        // Ignore unsupported image properties.
      }
      if (/^https?:/i.test(src)) {
        try {
          img.crossOrigin = "anonymous";
        } catch (_errCors) {
          // Ignore crossOrigin assignment errors.
        }
      }
      img.onload = finish;
      img.onerror = finish;
      try {
        img.src = src;
      } catch (_errSrc) {
        finish();
        return;
      }
      if (typeof img.decode === "function") {
        img.decode().then(finish).catch(function () {
          // decode may reject despite successful load in some browsers.
        });
      }
      if (img.complete) finish();
    });
  };

  GlassOverlayFX.prototype._waitBackgroundImageUrls = function (urls, timeoutMs) {
    if (!urls || !urls.length) return Promise.resolve();
    var unique = Object.create(null);
    var jobs = [];
    for (var i = 0; i < urls.length; i++) {
      var abs = toAbsoluteCaptureUrl(urls[i]);
      if (!abs || unique[abs]) continue;
      unique[abs] = true;
      jobs.push(this._waitBackgroundImageUrl(abs, timeoutMs));
    }
    if (!jobs.length) return Promise.resolve();
    return Promise.all(jobs).then(function () { });
  };

  GlassOverlayFX.prototype._flushBackgroundImageRefreshQueue = function (token) {
    if (token !== this._bgRefreshToken) return;
    var cap = this.config.capture || {};
    var urls = Object.keys(this._bgPendingUrls || {});
    this._bgPendingUrls = Object.create(null);
    var self = this;
    var applyRefresh = function () {
      if (token !== self._bgRefreshToken) return;
      self._markSceneDirty(true);
      self.lastCaptureAt = 0;
      self._captureScene(true);
    };
    var timeout = Math.max(200, Number(cap.backgroundImageLoadTimeoutMs == null ? 4000 : cap.backgroundImageLoadTimeoutMs));
    if (!urls.length) {
      applyRefresh();
      return;
    }
    this._waitBackgroundImageUrls(urls, timeout).then(applyRefresh, applyRefresh);
  };

  GlassOverlayFX.prototype._queueBackgroundImageFullRefresh = function (urls, debounceMs) {
    var cap = this.config.capture || {};
    if (!cap.enabled) return;
    var delay = Math.max(0, Number(debounceMs == null ? cap.backgroundImageRefreshDebounceMs == null ? 90 : cap.backgroundImageRefreshDebounceMs : debounceMs));
    if (urls && urls.length) {
      for (var i = 0; i < urls.length; i++) {
        var abs = toAbsoluteCaptureUrl(urls[i]);
        if (abs) this._bgPendingUrls[abs] = true;
      }
    }
    if (this._bgRefreshTimer) {
      clearTimeout(this._bgRefreshTimer);
      this._bgRefreshTimer = 0;
    }
    var self = this;
    var token = ++this._bgRefreshToken;
    this._bgRefreshTimer = setTimeout(function () {
      self._bgRefreshTimer = 0;
      self._flushBackgroundImageRefreshQueue(token);
    }, delay);
  };

  GlassOverlayFX.prototype._queueBackgroundRefreshFromMutations = function (mutations) {
    var cap = this.config.capture || {};
    if (!cap.enabled || cap.watchBackgroundImageUrlChanges === false) return false;
    if (!mutations || !mutations.length) return false;
    if (this._bgRefreshTimer) {
      this._queueBackgroundImageFullRefresh([], cap.backgroundImageRefreshDebounceMs);
      return true;
    }

    var shouldRefresh = false;
    var scanLimit = Math.max(8, Number(cap.backgroundImageScanLimit == null ? 120 : cap.backgroundImageScanLimit));
    var urlMap = Object.create(null);

    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === "attributes") {
        var attr = String(m.attributeName || "").toLowerCase();
        if (attr && attr !== "style" && attr !== "class") continue;
        shouldRefresh = true;
        this._collectBackgroundUrlsFromNode(m.target, urlMap, scanLimit);
        continue;
      }
      if (m.type === "childList") {
        if (m.addedNodes && m.addedNodes.length) {
          shouldRefresh = true;
          for (var a = 0; a < m.addedNodes.length; a++) {
            this._collectBackgroundUrlsFromNode(m.addedNodes[a], urlMap, scanLimit);
          }
        }
        if (m.removedNodes && m.removedNodes.length) {
          shouldRefresh = true;
        }
        this._collectBackgroundUrlsFromNode(m.target, urlMap, scanLimit);
      }
    }

    if (!shouldRefresh) return false;
    this._queueBackgroundImageFullRefresh(Object.keys(urlMap), cap.backgroundImageRefreshDebounceMs);
    return true;
  };

  GlassOverlayFX.prototype._scheduleImmediateCapture = function (debounceMs) {
    if (!this.config.capture || !this.config.capture.enabled) return;
    var delay = Math.max(0, Number(debounceMs == null ? 0 : debounceMs));
    if (this._cssCaptureTimer) {
      clearTimeout(this._cssCaptureTimer);
      this._cssCaptureTimer = 0;
    }
    var self = this;
    this._cssCaptureTimer = setTimeout(function () {
      self._cssCaptureTimer = 0;
      self._captureScene(true);
    }, delay);
  };

  GlassOverlayFX.prototype._scheduleCssImmediateCapture = function () {
    var cap = this.config.capture || {};
    if (!cap.enabled || cap.observeCssChanges === false) return;
    if (cap.cssImmediateCapture === false) return;
    if (this._isElementTargetCaptureMode() && cap.observeGlobalCssInElementMode === false) return;
    if (this._isInElementPageScrollWindow()) return;

    this._scheduleImmediateCapture(cap.cssImmediateCaptureDebounceMs == null ? 60 : cap.cssImmediateCaptureDebounceMs);
  };

  GlassOverlayFX.prototype._handleCssActivity = function () {
    var cap = this.config.capture || {};
    if (!cap.enabled || cap.observeCssChanges === false) return;
    if (this._isElementTargetCaptureMode() && cap.observeGlobalCssInElementMode === false) return;
    if (this._isInElementPageScrollWindow()) return;
    this._markSceneDirty(true);
    this._touchCssAutoRefresh();
    this._scheduleCssImmediateCapture();
  };

  GlassOverlayFX.prototype._handleCssResourceLoad = function (event) {
    var cap = this.config.capture || {};
    if (!cap.enabled || cap.observeCssChanges === false) return;
    if (this._isElementTargetCaptureMode() && cap.observeGlobalCssInElementMode === false) return;
    if (this._isInElementPageScrollWindow()) return;
    if (!event || !event.target || !event.target.tagName) return;
    if (this._isIgnoredCssNode(event.target)) return;
    var tag = event.target.tagName.toUpperCase();
    if (tag === "STYLE") {
      this._markSceneDirty(true);
      this._touchCssAutoRefresh();
      this._scheduleCssImmediateCapture();
      return;
    }
    if (tag === "LINK") {
      var rel = String(event.target.rel || "").toLowerCase();
      if (rel.indexOf("stylesheet") !== -1 || rel.indexOf("preload") !== -1) {
        this._markSceneDirty(true);
        this._touchCssAutoRefresh();
        this._scheduleCssImmediateCapture();
      }
      return;
    }
    if (
      tag === "IMG" ||
      tag === "IMAGE" ||
      tag === "SVG" ||
      tag === "VIDEO" ||
      tag === "CANVAS"
    ) {
      this._markSceneDirty(true);
      this._touchCssAutoRefresh(480);
      this._scheduleCssImmediateCapture();
    }
  };

  GlassOverlayFX.prototype._handleCssMutation = function (mutations) {
    var cap = this.config.capture || {};
    if (!cap.enabled || cap.observeCssChanges === false) return;
    if (this._isElementTargetCaptureMode() && cap.observeGlobalCssInElementMode === false) return;
    if (this._isInElementPageScrollWindow()) return;
    if (this._queueBackgroundRefreshFromMutations(mutations)) return;

    var dirty = false;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === "attributes") {
        if (this._isIgnoredCssNode(m.target)) continue;
        dirty = true;
        break;
      }
      if (m.type === "characterData") {
        if (this._isIgnoredCssNode(m.target)) continue;
        dirty = true;
        break;
      }
      if (m.type === "childList") {
        var anyRelevant = false;
        for (var a = 0; a < m.addedNodes.length; a++) {
          if (!this._isIgnoredCssNode(m.addedNodes[a])) {
            anyRelevant = true;
            break;
          }
        }
        if (!anyRelevant) {
          for (var r = 0; r < m.removedNodes.length; r++) {
            if (!this._isIgnoredCssNode(m.removedNodes[r])) {
              anyRelevant = true;
              break;
            }
          }
        }
        if (anyRelevant) {
          dirty = true;
          break;
        }
      }
    }

    if (dirty) {
      this._markSceneDirty(true);
      this._touchCssAutoRefresh();
      this._scheduleCssImmediateCapture();
    }
  };

  GlassOverlayFX.prototype._startCssObservers = function () {
    this._stopCssObservers();
    var cap = this.config.capture || {};
    if (!cap.enabled || cap.observeCssChanges === false) return;

    if (typeof MutationObserver !== "undefined") {
      this._cssMutationObserver = new MutationObserver(this._boundCssMutation);
      this._cssMutationObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["style", "class", "src", "srcset", "href"]
      });
    }

    window.addEventListener("transitionrun", this._boundCssEvent, true);
    window.addEventListener("transitionstart", this._boundCssEvent, true);
    window.addEventListener("transitionend", this._boundCssEvent, true);
    window.addEventListener("transitioncancel", this._boundCssEvent, true);
    window.addEventListener("animationstart", this._boundCssEvent, true);
    window.addEventListener("animationiteration", this._boundCssEvent, true);
    window.addEventListener("animationend", this._boundCssEvent, true);
    window.addEventListener("animationcancel", this._boundCssEvent, true);
    window.addEventListener("load", this._boundCssResourceLoad, true);
  };

  GlassOverlayFX.prototype._ensureCapturePreviewLayer = function (container) {
    if (this.capturePreviewCanvas) return;
    var layer = document.createElement("canvas");
    layer.setAttribute("aria-hidden", "true");
    layer.setAttribute("data-glass-overlay-canvas", "true");
    layer.setAttribute("data-glass-overlay-preview", "true");
    layer.style.position = "fixed";
    layer.style.left = "0";
    layer.style.top = "0";
    layer.style.width = "100%";
    layer.style.height = "100%";
    layer.style.pointerEvents = "none";
    layer.style.userSelect = "none";
    layer.style.display = "none";
    container.appendChild(layer);
    this.capturePreviewCanvas = layer;
    this.capturePreviewCtx = layer.getContext("2d", { alpha: true });
    this._syncCapturePreviewLayer();
  };

  GlassOverlayFX.prototype._syncCapturePreviewLayer = function () {
    var layer = this.capturePreviewCanvas;
    if (!layer) return;
    var cap = this.config.capture || {};
    var enabled = !!cap.showTexturePreview && !!cap.enabled;
    var opacity = clamp(cap.previewOpacity == null ? 1 : Number(cap.previewOpacity), 0, 1);
    var zOffset = Number(cap.previewZIndexOffset == null ? 1 : cap.previewZIndexOffset);
    if (!isFinite(zOffset)) zOffset = 1;
    var visible = this.canvas && this.canvas.style.display !== "none";

    layer.style.left = this.originX + "px";
    layer.style.top = this.originY + "px";
    layer.style.width = this.width + "px";
    layer.style.height = this.height + "px";
    layer.style.opacity = String(opacity);
    layer.style.zIndex = String(Math.round(this.config.zIndex + zOffset));
    layer.style.display = enabled && visible ? "block" : "none";
  };

  GlassOverlayFX.prototype._updateCapturePreviewTexture = function (sourceCanvas) {
    var layer = this.capturePreviewCanvas;
    var ctx = this.capturePreviewCtx;
    var cap = this.config.capture || {};
    if (!layer || !ctx || !cap.showTexturePreview) return;
    if (!sourceCanvas) return;

    var srcW = Math.max(1, Math.floor(sourceCanvas.width || 1));
    var srcH = Math.max(1, Math.floor(sourceCanvas.height || 1));
    if (layer.width !== srcW || layer.height !== srcH) {
      layer.width = srcW;
      layer.height = srcH;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, srcW, srcH);
    ctx.drawImage(sourceCanvas, 0, 0, srcW, srcH);
    this._syncCapturePreviewLayer();
  };

  GlassOverlayFX.prototype._init = function () {
    var container = this.config.container && this.config.container.nodeType === 1 ? this.config.container : document.body;

    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.setAttribute("data-glass-overlay-canvas", "true");
    canvas.style.position = "fixed";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.userSelect = "none";
    canvas.style.zIndex = String(this.config.zIndex);
    canvas.style.display = "block";

    container.appendChild(canvas);
    this.canvas = canvas;

    var gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false
    });

    if (!gl) {
      canvas.remove();
      throw new Error("WebGL is not available in this browser.");
    }

    this.gl = gl;
    this.program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.buffer = gl.createBuffer();
    this.maxPointSize = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;
    this._ensureCapturePreviewLayer(container);

    this.attribs = {
      position: gl.getAttribLocation(this.program, "a_position"),
      size: gl.getAttribLocation(this.program, "a_size"),
      shape: gl.getAttribLocation(this.program, "a_shape"),
      rotation: gl.getAttribLocation(this.program, "a_rotation"),
      roundness: gl.getAttribLocation(this.program, "a_roundness"),
      refract: gl.getAttribLocation(this.program, "a_refract"),
      gloss: gl.getAttribLocation(this.program, "a_gloss")
    };

    this.uniforms = {
      resolution: gl.getUniformLocation(this.program, "u_resolution"),
      dpr: gl.getUniformLocation(this.program, "u_dpr"),
      time: gl.getUniformLocation(this.program, "u_time"),
      refraction: gl.getUniformLocation(this.program, "u_refraction"),
      chromatic: gl.getUniformLocation(this.program, "u_chromatic"),
      ior: gl.getUniformLocation(this.program, "u_ior"),
      thickness: gl.getUniformLocation(this.program, "u_thickness"),
      edgeWidth: gl.getUniformLocation(this.program, "u_edgeWidth"),
      edgeSoftness: gl.getUniformLocation(this.program, "u_edgeSoftness"),
      edgeIntensity: gl.getUniformLocation(this.program, "u_edgeIntensity"),
      surfaceDistance: gl.getUniformLocation(this.program, "u_surfaceDistance"),
      flipRefractionY: gl.getUniformLocation(this.program, "u_flipRefractionY"),
      lightRadius: gl.getUniformLocation(this.program, "u_lightRadius"),
      gloss: gl.getUniformLocation(this.program, "u_gloss"),
      opacity: gl.getUniformLocation(this.program, "u_opacity"),
      lightPx: gl.getUniformLocation(this.program, "u_lightPx"),
      scene: gl.getUniformLocation(this.program, "u_scene"),
      hasScene: gl.getUniformLocation(this.program, "u_hasScene")
    };

    this.sceneTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.bindTexture(gl.TEXTURE_2D, null);

    this._resize();
    this._startTargetObservers();
    this._startCssObservers();
    this.pointer.x = this.width * 0.5;
    this.pointer.y = this.height * 0.35;
    this.pointer.active = true;
    this._syncLight();
    this._rebuildParticles();

    window.addEventListener("resize", this._boundResize, { passive: true });
    if (this.config.trackPointer) {
      window.addEventListener("pointermove", this._boundPointerMove, { passive: true, capture: true });
      window.addEventListener("pointerdown", this._boundPointerDown, { passive: true, capture: true });
      window.addEventListener("pointerrawupdate", this._boundPointerRawUpdate, { passive: true, capture: true });
      window.addEventListener("mousemove", this._boundMouseMove, { passive: true, capture: true });
      window.addEventListener("touchstart", this._boundTouchStart, { passive: true, capture: true });
      window.addEventListener("touchmove", this._boundTouchMove, { passive: true, capture: true });
    }
    window.addEventListener("scroll", this._boundScroll, { passive: true, capture: true });
    window.addEventListener("input", this._boundInputDirty, { passive: true, capture: true });
    window.addEventListener("change", this._boundInputDirty, { passive: true, capture: true });
    window.addEventListener("click", this._boundInputDirty, { passive: true, capture: true });

    this.running = true;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.refreshScene();
    this.raf = requestAnimationFrame(this._boundFrame);
  };

  GlassOverlayFX.prototype._markSceneDirty = function (forceImmediate) {
    this.sceneDirty = true;
    this.sceneVersion += 1;
    if (forceImmediate === true) {
      this.lastCaptureAt = 0;
    }
  };

  GlassOverlayFX.prototype._handleScroll = function () {
    var cap = this.config.capture || {};
    var mode = String(cap.targetMode || "viewportCrop").toLowerCase();
    var hasTarget = !!this.config.targetElement;

    if (hasTarget) {
      this._updateCanvasBounds(false);
    }

    // In target-element capture mode, page scroll should only move overlay bounds.
    // Re-capturing on every scroll causes the texture to appear to "swim".
    if (hasTarget && mode === "element") {
      this._lastWindowScrollAt = performance.now();
      return;
    }

    this._touchCssAutoRefresh(420);
    this._markSceneDirty(true);
  };

  GlassOverlayFX.prototype._handleTargetScroll = function () {
    this._lastWindowScrollAt = -1;
    if (this.config.targetElement) {
      this._updateCanvasBounds(false);
    }
    this._touchCssAutoRefresh(420);
    this._markSceneDirty(true);
  };

  GlassOverlayFX.prototype._ensureHtml2Canvas = function () {
    if (typeof global.html2canvas === "function") {
      return Promise.resolve(global.html2canvas);
    }

    if (this.config.capture && this.config.capture.autoLoadHtml2Canvas === false) {
      return Promise.reject(new Error("html2canvas is required when capture.enabled is true."));
    }

    if (global.__glassOverlayHtml2CanvasPromise) {
      return global.__glassOverlayHtml2CanvasPromise;
    }

    var src = (this.config.capture && this.config.capture.html2canvasUrl) ||
      DEFAULT_HTML2CANVAS_URL;

    global.__glassOverlayHtml2CanvasPromise = new Promise(function (resolve, reject) {
      var tag = document.createElement("script");
      tag.src = src;
      tag.async = true;
      tag.onload = function () {
        if (typeof global.html2canvas === "function") resolve(global.html2canvas);
        else reject(new Error("html2canvas loaded but unavailable."));
      };
      tag.onerror = function () {
        reject(new Error("Failed to load html2canvas from " + src));
      };
      document.head.appendChild(tag);
    });

    return global.__glassOverlayHtml2CanvasPromise;
  };

  GlassOverlayFX.prototype._buildUnsafeElementSet = function (root) {
    var unsafeSet = typeof Set !== "undefined" ? new Set() : null;
    var cap = this.config && this.config.capture ? this.config.capture : {};
    var strictSameOrigin = cap.strictSameOriginCaptureUrls === true;
    var els = collectElementsWithRoot(root, "*");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el || !el.tagName) continue;
      var tag = el.tagName.toUpperCase();
      var unsafe = false;

      if (
        tag === "CANVAS" ||
        tag === "IFRAME" ||
        tag === "FRAME" ||
        tag === "EMBED" ||
        tag === "OBJECT" ||
        tag === "PORTAL" ||
        tag === "FENCEDFRAME" ||
        tag === "VIDEO" ||
        tag === "AUDIO"
      ) {
        unsafe = true;
      } else if (tag === "IMG") {
        var src = el.currentSrc || el.getAttribute("src") || "";
        unsafe = !isCaptureSafeUrl(src, strictSameOrigin);
      } else if (tag === "SOURCE") {
        var src2 = el.getAttribute("src") || "";
        var srcset = el.getAttribute("srcset") || "";
        unsafe = !isCaptureSafeUrl(src2, strictSameOrigin) || !isCaptureSafeUrl(srcset, strictSameOrigin);
      } else if (tag === "IMAGE" || tag === "USE") {
        var href = el.getAttribute("href") || el.getAttribute("xlink:href") || "";
        unsafe = !isCaptureSafeUrl(href, strictSameOrigin);
      }

      if (!unsafe) {
        try {
          var cs = global.getComputedStyle(el);
          if (cs) {
            var checkVals = [
              cs.backgroundImage,
              cs.maskImage || cs.getPropertyValue("-webkit-mask-image"),
              cs.borderImageSource,
              cs.listStyleImage,
              cs.filter
            ];
            for (var c = 0; c < checkVals.length; c++) {
              var tokens = extractCssUrlTokens(checkVals[c]);
              for (var t = 0; t < tokens.length; t++) {
                if (!isCaptureSafeUrl(tokens[t], strictSameOrigin)) {
                  unsafe = true;
                  break;
                }
              }
              if (unsafe) break;
            }
          }
        } catch (_err) {
          // Ignore style inspection errors.
        }
      }

      if (unsafe && unsafeSet) unsafeSet.add(el);
    }
    return unsafeSet;
  };

  GlassOverlayFX.prototype._getNodePathFromRoot = function (root, node) {
    if (!root || !node) return null;
    if (root === node) return [];
    var path = [];
    var cur = node;
    while (cur && cur !== root) {
      var parent = cur.parentNode;
      if (!parent) return null;
      var idx = 0;
      var found = false;
      for (var ch = parent.firstChild; ch; ch = ch.nextSibling) {
        if (ch === cur) {
          found = true;
          break;
        }
        idx += 1;
      }
      if (!found) return null;
      path.push(idx);
      cur = parent;
    }
    if (cur !== root) return null;
    path.reverse();
    return path;
  };

  GlassOverlayFX.prototype._resolveNodeByPath = function (root, path) {
    if (!root) return null;
    if (!path || !path.length) return root;
    var cur = root;
    for (var i = 0; i < path.length; i++) {
      if (!cur || !cur.childNodes) return null;
      cur = cur.childNodes[path[i]];
    }
    return cur || null;
  };

  GlassOverlayFX.prototype._syncHiddenComputedVisibilityToCloneSubtree = function (srcRoot, dstRoot) {
    if (!srcRoot || !dstRoot) return;
    var stack = [{ node: srcRoot, path: [] }];
    while (stack.length) {
      var item = stack.pop();
      var src = item.node;
      var relPath = item.path;

      if (src && src.nodeType === 1) {
        try {
          var cs = global.getComputedStyle(src);
          if (cs) {
            var hideDisplay = cs.display === "none";
            var hideVisibility = cs.visibility === "hidden";
            var hideOpacity = Number(cs.opacity) <= 0.001;
            if (hideDisplay || hideVisibility || hideOpacity) {
              var dst = this._resolveNodeByPath(dstRoot, relPath);
              if (dst && dst.nodeType === 1) {
                if (hideDisplay) dst.style.display = "none";
                if (hideVisibility) dst.style.visibility = "hidden";
                if (hideOpacity) dst.style.opacity = "0";
              }
            }
          }
        } catch (_err) {
          // Ignore style sync issues.
        }
      }

      if (src && src.childNodes && src.childNodes.length) {
        for (var i = src.childNodes.length - 1; i >= 0; i--) {
          var child = src.childNodes[i];
          if (!child || child.nodeType !== 1) continue;
          var childPath = relPath.slice();
          childPath.push(i);
          stack.push({ node: child, path: childPath });
        }
      }
    }
  };

  GlassOverlayFX.prototype._syncFormStateToCloneDocument = function (clonedDoc) {
    if (!clonedDoc || !clonedDoc.querySelectorAll) return;
    var srcEls = document.querySelectorAll("input, textarea, select");
    var dstEls = clonedDoc.querySelectorAll("input, textarea, select");
    var len = Math.min(srcEls.length, dstEls.length);
    for (var i = 0; i < len; i++) {
      var src = srcEls[i];
      var dst = dstEls[i];
      if (!src || !dst || src.tagName !== dst.tagName) continue;
      var tag = src.tagName;
      if (tag === "INPUT") {
        var type = String(src.type || "").toLowerCase();
        dst.value = src.value;
        dst.setAttribute("value", src.value);
        if (type === "checkbox" || type === "radio") {
          dst.checked = !!src.checked;
          if (src.checked) dst.setAttribute("checked", "checked");
          else dst.removeAttribute("checked");
        }
      } else if (tag === "TEXTAREA") {
        dst.value = src.value;
        dst.textContent = src.value;
      } else if (tag === "SELECT") {
        dst.selectedIndex = src.selectedIndex;
      }
    }
  };

  GlassOverlayFX.prototype._mirrorRangesToStaticDom = function (clonedDoc) {
    if (!clonedDoc || !clonedDoc.querySelectorAll || !clonedDoc.createElement) return;
    var srcRanges = document.querySelectorAll("input[type='range']");
    var dstRanges = clonedDoc.querySelectorAll("input[type='range']");
    var len = Math.min(srcRanges.length, dstRanges.length);
    for (var i = 0; i < len; i++) {
      var src = srcRanges[i];
      var dst = dstRanges[i];
      if (!src || !dst || !dst.parentNode) continue;

      var minV = Number(src.min);
      var maxV = Number(src.max);
      var valV = Number(src.value);
      if (!isFinite(minV)) minV = 0;
      if (!isFinite(maxV) || maxV <= minV) maxV = minV + 1;
      if (!isFinite(valV)) valV = minV;
      var t = clamp((valV - minV) / (maxV - minV), 0, 1);
      var pct = (t * 100).toFixed(3) + "%";

      var cs = global.getComputedStyle(src);
      var srcRect = src.getBoundingClientRect();
      var widthPx = Math.max(16, srcRect.width || parseFloat(cs.width) || 140);
      var heightPx = Math.max(6, srcRect.height || parseFloat(cs.height) || 12);
      var radiusPx = Math.max(4, heightPx * 0.5);
      var fillColor = (cs && cs.accentColor && cs.accentColor !== "auto") ? cs.accentColor : "#7ed9ff";
      var trackColor = "rgba(255, 255, 255, 0.28)";
      var borderColor = "rgba(255, 255, 255, 0.35)";
      var thumbSize = Math.max(heightPx + 4, 12);

      var bar = clonedDoc.createElement("div");
      bar.style.position = "relative";
      bar.style.boxSizing = "border-box";
      bar.style.display = "inline-block";
      bar.style.verticalAlign = "middle";
      bar.style.width = widthPx + "px";
      bar.style.height = heightPx + "px";
      bar.style.border = "1px solid " + borderColor;
      bar.style.borderRadius = radiusPx + "px";
      bar.style.background =
        "linear-gradient(90deg, " + fillColor + " 0%, " + fillColor + " " + pct + ", " +
        trackColor + " " + pct + ", " + trackColor + " 100%)";

      var thumb = clonedDoc.createElement("div");
      thumb.style.position = "absolute";
      thumb.style.top = "50%";
      thumb.style.left = pct;
      thumb.style.width = thumbSize + "px";
      thumb.style.height = thumbSize + "px";
      thumb.style.borderRadius = "50%";
      thumb.style.transform = "translate(-50%, -50%)";
      thumb.style.background = "#ffffff";
      thumb.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
      bar.appendChild(thumb);

      dst.parentNode.replaceChild(bar, dst);
    }
  };

  GlassOverlayFX.prototype._captureWithHtml2Canvas = function (target, captureScale, captureMode) {
    var self = this;
    return this._ensureHtml2Canvas().then(function (html2canvas) {
      var captureCfg = self.config.capture || {};
      if (captureCfg.clearHtml2canvasCacheBeforeCapture !== false) {
        try {
          if (
            html2canvas &&
            html2canvas.CacheStorage &&
            typeof html2canvas.CacheStorage.clear === "function"
          ) {
            html2canvas.CacheStorage.clear();
          }
        } catch (_errCache) {
          // Ignore html2canvas cache clear errors.
        }
      }

      var unsafeSet = self._buildUnsafeElementSet(document.documentElement);
      var userIgnore =
        self.config.capture &&
        self.config.capture.html2canvasOptions &&
        typeof self.config.capture.html2canvasOptions.ignoreElements === "function"
          ? self.config.capture.html2canvasOptions.ignoreElements
          : null;
      var combinedIgnore = function (el) {
        if (el === self.canvas) return true;
        if (el && el.closest && el.closest("[data-glass-overlay-canvas='true']")) return true;
        if (unsafeSet && unsafeSet.has(el)) return true;
        if (userIgnore) {
          try {
            if (userIgnore(el)) return true;
          } catch (_err) {
            // Ignore user ignore callback errors.
          }
        }
        return false;
      };

      captureCfg = self.config.capture || {};
      var scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
      var scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      var viewportW = Math.max(1, Math.round(window.innerWidth || document.documentElement.clientWidth || self.width));
      var viewportH = Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || self.height));
      var strategy = String(captureCfg.elementCaptureStrategy || "documentCrop").toLowerCase();
      var forceElementSpace = !!(target && captureMode === "element" && captureCfg.elementLockToElementSpace !== false);
      var useElementNodeCapture = forceElementSpace || strategy === "element" || strategy === "elementnode" || strategy === "node";
      var targetDocPath = null;
      if (target && target.nodeType === 1 && document.documentElement) {
        targetDocPath = self._getNodePathFromRoot(document.documentElement, target);
      }

      var userOnClone =
        self.config.capture &&
        self.config.capture.html2canvasOptions &&
        typeof self.config.capture.html2canvasOptions.onclone === "function"
          ? self.config.capture.html2canvasOptions.onclone
          : null;
      var combinedOnClone = function (clonedDoc) {
        if (!clonedDoc) return;
        var capCfg = self.config.capture || {};
        if (capCfg.syncFormState !== false) {
          self._syncFormStateToCloneDocument(clonedDoc);
        }
        if (capCfg.mirrorRangeControls === true) {
          self._mirrorRangesToStaticDom(clonedDoc);
        }
        if (capCfg.syncComputedVisibility !== false && target && captureMode === "element" && useElementNodeCapture) {
          try {
            var clonedTarget = null;
            if (targetDocPath && clonedDoc.documentElement) {
              clonedTarget = self._resolveNodeByPath(clonedDoc.documentElement, targetDocPath);
            }
            if (!clonedTarget && target.id && clonedDoc.getElementById) {
              clonedTarget = clonedDoc.getElementById(target.id);
            }
            if (clonedTarget) {
              self._syncHiddenComputedVisibilityToCloneSubtree(target, clonedTarget);
            }
          } catch (_errSyncVis) {
            // Ignore visibility sync errors.
          }
        }
        if (userOnClone) {
          try {
            userOnClone(clonedDoc);
          } catch (_errOnClone) {
            // Ignore user onclone callback errors.
          }
        }
      };

      var opts;
      var captureNode;
      var capX = scrollX;
      var capY = scrollY;
      var capW = Math.max(1, self.width);
      var capH = Math.max(1, self.height);
      if (target) {
        var tRect = target.getBoundingClientRect();
        capX = tRect.left + scrollX;
        capY = tRect.top + scrollY;
        capW = Math.max(1, tRect.width);
        capH = Math.max(1, tRect.height);
        if (captureCfg.snapTargetBoundsToPixel !== false) {
          capX = Math.round(capX);
          capY = Math.round(capY);
          capW = Math.max(1, Math.round(capW));
          capH = Math.max(1, Math.round(capH));
        }
      }

      if (target && captureMode === "element") {
        if (useElementNodeCapture) {
          opts = deepMerge(self.config.capture.html2canvasOptions || {}, {
            scale: captureScale,
            // Element-local capture: decoupled from page scroll/screen space.
            x: 0,
            y: 0,
            width: capW,
            height: capH,
            windowWidth: capW,
            windowHeight: capH,
            scrollX: 0,
            scrollY: 0,
            onclone: combinedOnClone,
            ignoreElements: combinedIgnore
          });
          captureNode = target;
        } else {
          opts = deepMerge(self.config.capture.html2canvasOptions || {}, {
            scale: captureScale,
            x: capX,
            y: capY,
            width: capW,
            height: capH,
            windowWidth: viewportW,
            windowHeight: viewportH,
            scrollX: scrollX,
            scrollY: scrollY,
            onclone: combinedOnClone,
            ignoreElements: combinedIgnore
          });
          captureNode = document.documentElement;
        }
      } else {
        opts = deepMerge(self.config.capture.html2canvasOptions || {}, {
          scale: captureScale,
          x: capX,
          y: capY,
          width: capW,
          height: capH,
          windowWidth: viewportW,
          windowHeight: viewportH,
          scrollX: scrollX,
          scrollY: scrollY,
          onclone: combinedOnClone,
          ignoreElements: combinedIgnore
        });
        captureNode = document.documentElement;
      }

      return html2canvas(captureNode, opts).then(function (snapshot) {
        if (target && captureMode === "element" && useElementNodeCapture) {
          return self._applyElementTransparentFill(snapshot, target);
        }
        return snapshot;
      });
    });
  };

  GlassOverlayFX.prototype._waitVisualFlush = function () {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        try {
          if (document && document.documentElement) {
            // Force style/layout commit before snapshotting.
            void document.documentElement.offsetHeight;
          }
        } catch (_err) {
          // Ignore reflow forcing errors.
        }
        requestAnimationFrame(resolve);
      });
    });
  };

  GlassOverlayFX.prototype._uploadSceneTexture = function (sourceCanvas) {
    if (!sourceCanvas) return;
    var gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    var capCfg = this.config.capture || {};
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!capCfg.premultiplyAlpha);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    } catch (err) {
      var original = err || new Error("Unknown texImage2D failure.");
      var msg = String(original.message || "Unknown texImage2D failure.");
      var wrapped = new Error(msg);
      wrapped.name = original.name || "Error";
      wrapped.cause = original;
      wrapped.captureCode = (/tainted canvases/i.test(msg) || /security/i.test(msg))
        ? "TAINTED_CANVAS"
        : "TEX_UPLOAD_FAILED";
      throw wrapped;
    }
    this.sceneReady = true;
    this._updateCapturePreviewTexture(sourceCanvas);
  };

  GlassOverlayFX.prototype._isCanvasSourceTainted = function (source) {
    if (!source) return false;
    if (typeof source.getContext !== "function") return false;
    var w = Number(source.width || 0);
    var h = Number(source.height || 0);
    if (w < 1 || h < 1) return false;
    var ctx;
    try {
      ctx = source.getContext("2d");
    } catch (_errCtx) {
      return false;
    }
    if (!ctx || typeof ctx.getImageData !== "function") return false;
    try {
      ctx.getImageData(0, 0, 1, 1);
      return false;
    } catch (err) {
      var msg = String((err && err.message) || "");
      var name = String((err && err.name) || "");
      return /tainted|cross-origin|security/i.test(msg) || /security/i.test(name);
    }
  };

  GlassOverlayFX.prototype._captureScene = function (forceCapture) {
    var self = this;
    if (!this.config.capture || !this.config.capture.enabled) return Promise.resolve(false);
    if (this.captureBusy) {
      if (forceCapture) {
        this.captureForcePending = true;
        this.sceneDirty = true;
        this.lastCaptureAt = 0;
      }
      return Promise.resolve(false);
    }
    if (this.config.targetElement) {
      this._updateCanvasBounds(false);
    }

    this.captureBusy = true;
    this.captureError = null;
    var hadScene = this.sceneReady;
    var requestedVersion = this.sceneVersion;

    var capCfg = this.config.capture || {};
    var needVisualFlush = forceCapture || capCfg.forceVisualFlushBeforeCapture !== false;
    var preCapture = needVisualFlush ? this._waitVisualFlush() : Promise.resolve();

    return preCapture.then(function () {
      var target = self._resolveTargetElement();
      self.targetElement = target;
      var captureScale = clamp(self.config.capture.scale || 1, 0.5, 2);
      var captureMode = String(self.config.capture.targetMode || "viewportCrop").toLowerCase();
      if (captureMode !== "element" && captureMode !== "viewportcrop") {
        captureMode = "viewportcrop";
      }
      var capturePromise = self._captureWithHtml2Canvas(target, captureScale, captureMode);

      var finalizeCapture = function (uploadSource) {
        if (!uploadSource) {
          throw new Error("Failed to produce capture source.");
        }
        if (self._isCanvasSourceTainted(uploadSource)) {
          var taintedErr = new Error("Capture source is tainted before texture upload.");
          taintedErr.captureCode = "TAINTED_CANVAS";
          taintedErr.captureEngine = "html2canvas";
          taintedErr.captureFallbackFrom = null;
          throw taintedErr;
        }
        try {
          self._uploadSceneTexture(uploadSource);
        } catch (uploadErr) {
          var msg = String((uploadErr && uploadErr.message) || "Texture upload failed.");
          var wrappedUploadErr = new Error(msg);
          wrappedUploadErr.name = (uploadErr && uploadErr.name) || "Error";
          wrappedUploadErr.cause = uploadErr;
          wrappedUploadErr.captureCode = (uploadErr && uploadErr.captureCode) || "TEX_UPLOAD_FAILED";
          wrappedUploadErr.captureEngine = "html2canvas";
          wrappedUploadErr.captureFallbackFrom = null;
          throw wrappedUploadErr;
        }
        self.lastCaptureInfo = {
          engine: "html2canvas",
          fallbackFrom: null,
          time: performance.now()
        };
        if (!self._hasFirstSceneCapture) {
          self._hasFirstSceneCapture = true;
          self._firstSceneCaptureAt = performance.now();
        }
        self.lastCaptureAt = performance.now();
        self.sceneDirty = self.sceneVersion !== requestedVersion;
        if (self.sceneDirty) {
          self.lastCaptureAt = 0;
        }
        return true;
      };

      return capturePromise.then(function (snapshot) {
        return finalizeCapture(snapshot);
      });
    }).catch(function (err) {
      self.captureError = err;
      self.sceneReady = hadScene;
      self.lastCaptureInfo = {
        engine: (err && err.captureEngine) || "html2canvas",
        fallbackFrom: (err && err.captureFallbackFrom) || null,
        time: performance.now()
      };
      self.lastCaptureAt = performance.now();
      if (self.sceneVersion !== requestedVersion) {
        self.sceneDirty = true;
        self.lastCaptureAt = 0;
      }
      if (typeof self.config.onError === "function") {
        self.config.onError(err);
      } else if (global.console && console.warn) {
        console.warn("[GlassOverlayFX] Scene capture failed:", err);
      }
      return false;
    }).then(function (ok) {
      self.captureBusy = false;
      if (self.captureForcePending) {
        self.captureForcePending = false;
        self.lastCaptureAt = 0;
        self._captureScene(true);
      }
      return ok;
    });
  };

  GlassOverlayFX.prototype.refreshScene = function () {
    this._lastWindowScrollAt = -1;
    this._touchCssAutoRefresh(320);
    this._markSceneDirty(true);
    return this._captureScene(true);
  };

  GlassOverlayFX.prototype._resize = function () {
    this._updateCanvasBounds(true);
  };

  GlassOverlayFX.prototype._randomVelocity = function (minMul, maxMul) {
    var minV = minMul == null ? 0.55 : minMul;
    var maxV = maxMul == null ? 1.45 : maxMul;
    if (maxV < minV) {
      var tmp = maxV;
      maxV = minV;
      minV = tmp;
    }
    var speed = this.config.speed * rand(minV, maxV);
    var angle = rand(0, Math.PI * 2);
    var jitter = 0.45 + Math.random() * 0.9;
    return {
      vx: Math.cos(angle) * speed * jitter,
      vy: Math.sin(angle) * speed * jitter
    };
  };

  GlassOverlayFX.prototype._wakeParticleIfNeeded = function (p, phase, i, dt) {
    var wobble = Math.abs(Number(this.config.wobble || 0));
    if (wobble <= 1e-4) return;

    var phys = this.config.physics || {};
    var minAlive = Math.max(0, phys.minAliveSpeed == null ? 5 : phys.minAliveSpeed);
    if (minAlive <= 0) return;
    var speedSq = p.vx * p.vx + p.vy * p.vy;
    if (speedSq >= minAlive * minAlive) return;
    var wakeStrength = Math.max(0, phys.wakeStrength == null ? 18 : phys.wakeStrength);
    if (wakeStrength <= 0) return;
    wakeStrength *= Math.min(1, wobble);

    var a = phase * 1.91 + i * 0.77;
    p.vx += Math.cos(a) * wakeStrength * dt;
    p.vy += Math.sin(a) * wakeStrength * dt;
  };

  GlassOverlayFX.prototype._applyCollisionMetrics = function (p) {
    var phys = this.config.physics || {};
    var paddingPx = Math.max(0, Number(phys.collisionPaddingPx || 0));
    var collisionPad = paddingPx;

    var circleRadius = SHAPE_CIRCLE_R * p.size + collisionPad;
    var squareHalf = SHAPE_SQUARE_HALF * p.size + collisionPad;
    var triBaseRadius = SHAPE_TRI_CIRCUM * p.size;
    var triScale = triBaseRadius > 1e-6 ? (triBaseRadius + collisionPad) / triBaseRadius : 1;
    var triHalfBase = SHAPE_TRI_HALF_BASE * p.size * triScale;
    var triTop = SHAPE_TRI_TOP * p.size * triScale;
    var triBaseY = SHAPE_TRI_BASE_Y * p.size * triScale;
    var triSide = SHAPE_TRI_SIDE * p.size * triScale;
    var area;
    var inertia;
    var boundRadius;

    if (p.shapeKind === 0) {
      area = Math.PI * circleRadius * circleRadius;
      inertia = 0.5 * area * circleRadius * circleRadius;
      boundRadius = circleRadius;
    } else if (p.shapeKind === 1) {
      var squareSide = squareHalf * 2;
      area = squareSide * squareSide;
      inertia = area * squareSide * squareSide / 6;
      boundRadius = squareHalf * 1.41421356;
    } else {
      area = 0.4330127 * triSide * triSide;
      inertia = area * triSide * triSide / 12;
      boundRadius = SHAPE_TRI_CIRCUM * p.size * triScale;
    }

    p.collisionRadius = circleRadius;
    p.squareHalf = squareHalf;
    p.triHalfBase = triHalfBase;
    p.triTop = triTop;
    p.triBaseY = triBaseY;
    p.boundRadius = boundRadius;
    p.mass = Math.max(1, area);
    p.invMass = 1 / p.mass;
    p.inertia = Math.max(1, inertia);
    p.invInertia = 1 / p.inertia;
  };

  GlassOverlayFX.prototype._makeParticle = function (spawnInside) {
    var size = rand(this.config.minSize, this.config.maxSize);
    var phys = this.config.physics || {};
    var initialVel = this._randomVelocity(phys.initialSpeedMin, phys.initialSpeedMax);
    var roundness = clamp(this.config.roundness + rand(-0.07, 0.07), 0.02, 0.45);
    var finalSize = clamp(size, 8, this.maxPointSize);
    var shape = pickShape(this.config.shapeWeights);
    var kind = shapeKind(shape);
    var pad = this.config.spawnPadding;
    var x = spawnInside ? rand(0, this.width) : rand(-pad, this.width + pad);
    var y = spawnInside ? rand(0, this.height) : rand(-pad, this.height + pad);
    var p = {
      x: x,
      y: y,
      vx: initialVel.vx,
      vy: initialVel.vy,
      size: finalSize,
      shapeKind: kind,
      collisionRadius: 0,
      boundRadius: 0,
      mass: 1,
      invMass: 1,
      inertia: 1,
      invInertia: 1,
      squareHalf: 0,
      triHalfBase: 0,
      triTop: 0,
      triBaseY: 0,
      shape: shape,
      roundness: roundness,
      rot: rand(0, Math.PI * 2),
      baseSpin: rand(-1, 1) * this.config.spin,
      omega: 0,
      refract: clamp(rand(0.92, 1.08), 0.9, 1.1),
      gloss: clamp(rand(0.65, 1.15), 0.3, 1.5),
      wobblePhase: rand(0, Math.PI * 2)
    };

    this._applyCollisionMetrics(p);
    return p;
  };

  GlassOverlayFX.prototype._rebuildParticles = function () {
    var count = Math.max(1, Math.floor(this.config.count * this.config.density));
    var cap = this.config.capture || {};
    var spawnInside =
      cap.hideUntilFirstCapture !== false &&
      cap.initialSpawnInside !== false &&
      !this._hasFirstSceneCapture;
    this.particles = new Array(count);
    for (var i = 0; i < count; i++) {
      this.particles[i] = this._makeParticle(spawnInside);
    }
    this.data = new Float32Array(count * 8);
  };

  GlassOverlayFX.prototype._respawn = function (p) {
    var pad = this.config.spawnPadding;
    var phys = this.config.physics || {};
    var vel = this._randomVelocity(phys.respawnSpeedMin, phys.respawnSpeedMax);
    p.vx = vel.vx;
    p.vy = vel.vy;
    if (p.vx >= 0) p.x = -pad; else p.x = this.width + pad;
    p.y = rand(-pad, this.height + pad);
    p.rot = rand(0, Math.PI * 2);
    p.baseSpin = rand(-1, 1) * this.config.spin;
    p.omega = 0;
    p.wobblePhase = rand(0, Math.PI * 2);
  };

  GlassOverlayFX.prototype._getCaptureRevealAlpha = function (nowTs) {
    var cap = this.config.capture || {};
    if (!cap.enabled || cap.hideUntilFirstCapture === false) return 1;
    if (!this._hasFirstSceneCapture) return 0;
    var oncePerPage = cap.revealOnlyOncePerPage !== false;
    if (oncePerPage && global.__glassOverlayRevealDoneOnce === true) return 1;
    var fadeMs = Math.max(0, Number(cap.firstCaptureFadeMs == null ? 420 : cap.firstCaptureFadeMs));
    if (fadeMs <= 0) {
      if (oncePerPage) global.__glassOverlayRevealDoneOnce = true;
      return 1;
    }
    var now = nowTs == null ? performance.now() : nowTs;
    var alpha = clamp((now - this._firstSceneCaptureAt) / fadeMs, 0, 1);
    if (oncePerPage && alpha >= 0.9999) {
      global.__glassOverlayRevealDoneOnce = true;
    }
    return alpha;
  };

  GlassOverlayFX.prototype._buildColliderWorld = function (p) {
    if (p.shapeKind === 0) {
      return {
        type: 0,
        cx: p.x,
        cy: p.y,
        r: p.collisionRadius
      };
    }

    var cos = Math.cos(p.rot);
    var sin = Math.sin(p.rot);
    var points;

    if (p.shapeKind === 1) {
      var h = p.squareHalf || (SHAPE_SQUARE_HALF * p.size);
      points = [
        { x: -h, y: h },
        { x: h, y: h },
        { x: h, y: -h },
        { x: -h, y: -h }
      ];
    } else {
      var triHalfBase = p.triHalfBase || (SHAPE_TRI_HALF_BASE * p.size);
      var triTop = p.triTop || (SHAPE_TRI_TOP * p.size);
      var triBaseY = p.triBaseY || (SHAPE_TRI_BASE_Y * p.size);
      points = [
        { x: 0, y: triTop },
        { x: triHalfBase, y: triBaseY },
        { x: -triHalfBase, y: triBaseY }
      ];
    }

    for (var i = 0; i < points.length; i++) {
      var lx = points[i].x;
      var ly = points[i].y;
      var rx = lx * cos - ly * sin;
      var ry = lx * sin + ly * cos;
      points[i].x = p.x + rx;
      points[i].y = p.y - ry;
    }

    return {
      type: 1,
      cx: p.x,
      cy: p.y,
      points: points
    };
  };

  GlassOverlayFX.prototype._resolveBoundaryCollisions = function (ps, colliders, wallRestitution, wallFriction, posCorr, slop) {
    var w = this.width;
    var h = this.height;

    function solveWall(p, c, nx, ny, penetration) {
      var pen = Math.max(0, penetration - slop);
      if (pen <= 0) return;

      var shiftX = nx * pen * posCorr;
      var shiftY = ny * pen * posCorr;
      p.x += shiftX;
      p.y += shiftY;
      translateCollider(c, shiftX, shiftY);

      var contact = colliderExtremePoint(c, -nx, -ny);
      var rX = contact.x - p.x;
      var rY = contact.y - p.y;

      var vX = p.vx + (p.omega * rY);
      var vY = p.vy - (p.omega * rX);
      var velAlongNormal = vX * nx + vY * ny;
      if (velAlongNormal >= 0) return;

      var rCrossN = rX * ny - rY * nx;
      var denomN = p.invMass + rCrossN * rCrossN * p.invInertia;
      if (denomN <= 1e-8) return;

      var jn = -(1 + wallRestitution) * velAlongNormal / denomN;
      var impNX = jn * nx;
      var impNY = jn * ny;

      p.vx += impNX * p.invMass;
      p.vy += impNY * p.invMass;
      p.omega -= rCrossN * jn * p.invInertia;

      vX = p.vx + (p.omega * rY);
      vY = p.vy - (p.omega * rX);
      var tX = vX - nx * (vX * nx + vY * ny);
      var tY = vY - ny * (vX * nx + vY * ny);
      var tLen = Math.sqrt(tX * tX + tY * tY);
      if (tLen <= 1e-8) return;
      tX /= tLen;
      tY /= tLen;

      var rCrossT = rX * tY - rY * tX;
      var denomT = p.invMass + rCrossT * rCrossT * p.invInertia;
      if (denomT <= 1e-8) return;

      var jt = -((vX * tX) + (vY * tY)) / denomT;
      var jtMax = Math.abs(jn) * wallFriction;
      jt = clamp(jt, -jtMax, jtMax);

      var impTX = jt * tX;
      var impTY = jt * tY;
      p.vx += impTX * p.invMass;
      p.vy += impTY * p.invMass;
      p.omega -= (rX * impTY - rY * impTX) * p.invInertia;
    }

    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      var c = colliders[i];
      var minX, maxX, minY, maxY;

      if (c.type === 0) {
        minX = c.cx - c.r;
        maxX = c.cx + c.r;
        minY = c.cy - c.r;
        maxY = c.cy + c.r;
      } else {
        minX = c.points[0].x;
        maxX = c.points[0].x;
        minY = c.points[0].y;
        maxY = c.points[0].y;
        for (var k = 1; k < c.points.length; k++) {
          var pt = c.points[k];
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
      }

      if (minX < 0) solveWall(p, c, 1, 0, -minX);
      if (maxX > w) solveWall(p, c, -1, 0, maxX - w);
      if (minY < 0) solveWall(p, c, 0, 1, -minY);
      if (maxY > h) solveWall(p, c, 0, -1, maxY - h);
    }
  };

  GlassOverlayFX.prototype._resolveCollisions = function () {
    var ps = this.particles;
    var n = ps.length;
    var phys = this.config.physics || {};
    var restitution = clamp(phys.restitution == null ? 0.9 : phys.restitution, 0, 1);
    var spinTransfer = clamp(phys.spinTransfer == null ? 0.55 : phys.spinTransfer, 0, 2);
    var posCorr = clamp(phys.positionCorrection == null ? 1.0 : phys.positionCorrection, 0, 1);
    var iterations = Math.max(1, Math.floor(phys.solverIterations == null ? 3 : phys.solverIterations));
    var slop = Math.max(0, phys.penetrationSlop == null ? 0 : phys.penetrationSlop);
    var boundaryOn = phys.boundaryCollision !== false;
    var wallRestitution = clamp(phys.boundaryRestitution == null ? restitution * 0.95 : phys.boundaryRestitution, 0, 1);
    var friction;
    if (phys.collisionFriction == null) {
      friction = 0.15 + spinTransfer * 0.85;
    } else {
      var collisionFriction = Number(phys.collisionFriction);
      friction = Math.max(0, isFinite(collisionFriction) ? collisionFriction : 0);
    }
    var wallFriction = Math.max(0, phys.boundaryFriction == null ? 0.35 : phys.boundaryFriction);
    var colliders = new Array(n);
    for (var c = 0; c < n; c++) {
      colliders[c] = this._buildColliderWorld(ps[c]);
    }

    for (var iter = 0; iter < iterations; iter++) {
      for (var i = 0; i < n; i++) {
        var a = ps[i];
        var ca = colliders[i];
        for (var j = i + 1; j < n; j++) {
          var b = ps[j];
          var cb = colliders[j];
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var minDist = a.boundRadius + b.boundRadius;
          var distSq = dx * dx + dy * dy;
          if (distSq >= minDist * minDist) continue;

          var hit = detectColliders(ca, cb);
          if (!hit) continue;
          var nx = hit.nx;
          var ny = hit.ny;
          var invMassSum = a.invMass + b.invMass;
          if (invMassSum <= 0) continue;

          var penetration = Math.max(0, hit.penetration - slop);
          if (penetration > 0) {
            var corr = (penetration * posCorr) / invMassSum;
            var ax = -nx * corr * a.invMass;
            var ay = -ny * corr * a.invMass;
            var bx = nx * corr * b.invMass;
            var by = ny * corr * b.invMass;
            a.x += ax;
            a.y += ay;
            b.x += bx;
            b.y += by;
            translateCollider(ca, ax, ay);
            translateCollider(cb, bx, by);
          }

          var cpx = hit.contactX;
          var cpy = hit.contactY;
          var raX = cpx - a.x;
          var raY = cpy - a.y;
          var rbX = cpx - b.x;
          var rbY = cpy - b.y;

          var vaX = a.vx + (a.omega * raY);
          var vaY = a.vy - (a.omega * raX);
          var vbX = b.vx + (b.omega * rbY);
          var vbY = b.vy - (b.omega * rbX);

          var rvx = vbX - vaX;
          var rvy = vbY - vaY;
          var velAlongNormal = rvx * nx + rvy * ny;
          if (velAlongNormal < 0) {
            var raCn = raX * ny - raY * nx;
            var rbCn = rbX * ny - rbY * nx;
            var denomN = invMassSum + raCn * raCn * a.invInertia + rbCn * rbCn * b.invInertia;
            if (denomN <= 1e-8) continue;

            var jn = -(1 + restitution) * velAlongNormal / denomN;
            var impX = jn * nx;
            var impY = jn * ny;

            a.vx -= impX * a.invMass;
            a.vy -= impY * a.invMass;
            b.vx += impX * b.invMass;
            b.vy += impY * b.invMass;
            a.omega += raCn * jn * a.invInertia;
            b.omega -= rbCn * jn * b.invInertia;

            vaX = a.vx + (a.omega * raY);
            vaY = a.vy - (a.omega * raX);
            vbX = b.vx + (b.omega * rbY);
            vbY = b.vy - (b.omega * rbX);
            rvx = vbX - vaX;
            rvy = vbY - vaY;

            var tx = rvx - nx * (rvx * nx + rvy * ny);
            var ty = rvy - ny * (rvx * nx + rvy * ny);
            var tLen = Math.sqrt(tx * tx + ty * ty);
            if (tLen > 1e-8) {
              tx /= tLen;
              ty /= tLen;

              var raCt = raX * ty - raY * tx;
              var rbCt = rbX * ty - rbY * tx;
              var denomT = invMassSum + raCt * raCt * a.invInertia + rbCt * rbCt * b.invInertia;
              if (denomT > 1e-8) {
                var jt = -((rvx * tx) + (rvy * ty)) / denomT;
                var jtMax = Math.abs(jn) * friction;
                jt = clamp(jt, -jtMax, jtMax);

                var tImpX = jt * tx;
                var tImpY = jt * ty;

                a.vx -= tImpX * a.invMass;
                a.vy -= tImpY * a.invMass;
                b.vx += tImpX * b.invMass;
                b.vy += tImpY * b.invMass;

                a.omega += raCt * jt * a.invInertia;
                b.omega -= rbCt * jt * b.invInertia;
              }
            }
          }
        }
      }

      if (boundaryOn) {
        this._resolveBoundaryCollisions(ps, colliders, wallRestitution, wallFriction, posCorr, slop);
      }
    }
  };

  GlassOverlayFX.prototype._updateParticles = function (dt, elapsed) {
    var cap = this.config.capture || {};
    var revealAlpha = this._getCaptureRevealAlpha(performance.now());
    if (cap.freezeMotionUntilFirstReveal !== false && revealAlpha < 1) {
      return;
    }

    var count = this.particles.length;
    var pad = this.config.spawnPadding;
    var wobbleAmp = this.config.wobble * 9.0;
    var phys = this.config.physics || {};
    var physOn = !!phys.enabled;
    var boundaryOn = phys.boundaryCollision !== false;
    var linDamp = clamp(phys.linearDamping == null ? 0.998 : phys.linearDamping, 0.9, 1.0);
    var angDamp = clamp(phys.angularDamping == null ? 0.985 : phys.angularDamping, 0.8, 1.0);
    var maxSpeed = Math.max(20, phys.maxSpeed == null ? 420 : phys.maxSpeed);
    var linDampPow = Math.pow(linDamp, dt * 60);
    var angDampPow = Math.pow(angDamp, dt * 60);

    for (var i = 0; i < count; i++) {
      var p = this.particles[i];
      var phase = elapsed * 0.0014 + p.wobblePhase;
      var wobbleX = Math.sin(phase * 2.1 + i * 0.47) * wobbleAmp;
      var wobbleY = Math.cos(phase * 1.7 + i * 0.31) * wobbleAmp;

      if (physOn) {
        p.vx += wobbleX * dt * 0.35;
        p.vy += wobbleY * dt * 0.35;
        this._wakeParticleIfNeeded(p, phase, i, dt);
        var capped = speedLimit(p.vx, p.vy, maxSpeed);
        p.vx = capped.vx * linDampPow;
        p.vy = capped.vy * linDampPow;
        p.omega *= angDampPow;

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.omega * dt;
      } else {
        p.x += (p.vx + wobbleX) * dt;
        p.y += (p.vy + wobbleY) * dt;
        p.rot += p.baseSpin * dt;
      }
    }

    if (physOn) {
      this._resolveCollisions();
    }

    if (!physOn || !boundaryOn) {
      for (var j = 0; j < count; j++) {
        var pj = this.particles[j];
        if (pj.x < -pad - pj.size || pj.x > this.width + pad + pj.size || pj.y < -pad - pj.size || pj.y > this.height + pad + pj.size) {
          this._respawn(pj);
        }
      }
    }
  };

  GlassOverlayFX.prototype._writeParticleBuffer = function () {
    var arr = this.data;
    var n = this.particles.length;
    for (var i = 0; i < n; i++) {
      var p = this.particles[i];
      var off = i * 8;
      arr[off + 0] = p.x;
      arr[off + 1] = p.y;
      arr[off + 2] = p.size;
      arr[off + 3] = p.shape;
      arr[off + 4] = p.rot;
      arr[off + 5] = p.shape === 0 ? 0.03 : p.roundness;
      arr[off + 6] = p.refract;
      arr[off + 7] = p.gloss;
    }
  };

  GlassOverlayFX.prototype._bindAttributes = function () {
    var gl = this.gl;
    var stride = 8 * 4;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(this.attribs.position);
    gl.vertexAttribPointer(this.attribs.position, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(this.attribs.size);
    gl.vertexAttribPointer(this.attribs.size, 1, gl.FLOAT, false, stride, 2 * 4);

    gl.enableVertexAttribArray(this.attribs.shape);
    gl.vertexAttribPointer(this.attribs.shape, 1, gl.FLOAT, false, stride, 3 * 4);

    gl.enableVertexAttribArray(this.attribs.rotation);
    gl.vertexAttribPointer(this.attribs.rotation, 1, gl.FLOAT, false, stride, 4 * 4);

    gl.enableVertexAttribArray(this.attribs.roundness);
    gl.vertexAttribPointer(this.attribs.roundness, 1, gl.FLOAT, false, stride, 5 * 4);

    gl.enableVertexAttribArray(this.attribs.refract);
    gl.vertexAttribPointer(this.attribs.refract, 1, gl.FLOAT, false, stride, 6 * 4);

    gl.enableVertexAttribArray(this.attribs.gloss);
    gl.vertexAttribPointer(this.attribs.gloss, 1, gl.FLOAT, false, stride, 7 * 4);
  };

  GlassOverlayFX.prototype._handlePointerMove = function (event) {
    this.pointer.x = event.clientX - this.originX;
    this.pointer.y = event.clientY - this.originY;
    this.pointer.active = true;
    this.light.x = clamp(this.pointer.x / this.width, 0, 1);
    this.light.y = clamp(this.pointer.y / this.height, 0, 1);
  };

  GlassOverlayFX.prototype._handleMouseMove = function (event) {
    this._handlePointerMove(event);
  };

  GlassOverlayFX.prototype._handleTouchMove = function (event) {
    if (!event || !event.touches || !event.touches.length) return;
    this.pointer.x = event.touches[0].clientX - this.originX;
    this.pointer.y = event.touches[0].clientY - this.originY;
    this.pointer.active = true;
    this.light.x = clamp(this.pointer.x / this.width, 0, 1);
    this.light.y = clamp(this.pointer.y / this.height, 0, 1);
  };

  GlassOverlayFX.prototype._syncLight = function () {
    if (!this.config.trackPointer || !this.pointer.active) return;
    this.light.x = clamp(this.pointer.x / this.width, 0, 1);
    this.light.y = clamp(this.pointer.y / this.height, 0, 1);
  };

  GlassOverlayFX.prototype._draw = function (elapsedSec) {
    var gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    this._bindAttributes();

    gl.uniform2f(this.uniforms.resolution, this.width, this.height);
    gl.uniform1f(this.uniforms.dpr, this.dpr);
    gl.uniform1f(this.uniforms.time, elapsedSec);
    gl.uniform1f(this.uniforms.refraction, clamp(this.config.refraction, 0, 2));
    gl.uniform1f(this.uniforms.chromatic, clamp(this.config.chromaticAberration, 0, 2));
    gl.uniform1f(this.uniforms.ior, clamp(this.config.ior || 1.52, 1.01, 2.5));
    gl.uniform1f(this.uniforms.thickness, clamp(this.config.thickness || 0.9, 0, 2));
    gl.uniform1f(this.uniforms.edgeWidth, clamp(this.config.edgeWidth == null ? 0.08 : this.config.edgeWidth, 0.001, 0.7));
    gl.uniform1f(this.uniforms.edgeSoftness, clamp(this.config.edgeSoftness == null ? 0.16 : this.config.edgeSoftness, 0.001, 0.7));
    gl.uniform1f(this.uniforms.edgeIntensity, Math.max(0, this.config.edgeIntensity == null ? 1.0 : this.config.edgeIntensity));
    gl.uniform1f(this.uniforms.surfaceDistance, clamp(this.config.surfaceDistance == null ? 0.12 : this.config.surfaceDistance, 0, 2));
    gl.uniform1f(this.uniforms.flipRefractionY, this.config.flipRefractionY === -1 ? -1 : 1);
    gl.uniform1f(this.uniforms.lightRadius, Math.max(1, this.config.lightRadius == null ? 420 : this.config.lightRadius));
    gl.uniform1f(this.uniforms.gloss, clamp(this.config.gloss, 0, 2));
    var revealAlpha = this._getCaptureRevealAlpha(performance.now());
    if (revealAlpha <= 0.0001) return;
    gl.uniform1f(this.uniforms.opacity, clamp(this.config.opacity, 0, 1) * revealAlpha);
    gl.uniform2f(this.uniforms.lightPx, this.light.x * this.width, this.light.y * this.height);
    gl.uniform1f(this.uniforms.hasScene, this.sceneReady ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.uniform1i(this.uniforms.scene, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, this.particles.length);
  };

  GlassOverlayFX.prototype._frame = function (now) {
    if (!this.running) return;

    if (this.config.targetElement) {
      this._updateCanvasBounds(false);
    }

    var dt = clamp((now - this.lastTime) * 0.001, 0, 0.05);
    var elapsed = now - this.startTime;
    this.lastTime = now;

    if (this.config.capture && this.config.capture.enabled) {
      var capCfg = this.config.capture || {};
      var fps = Number(this.config.capture.fps || 0);
      var hasTarget = !!this.targetElement;
      var captureMode = String(capCfg.targetMode || "viewportCrop").toLowerCase();
      var elementMode = hasTarget && captureMode === "element";
      var allowElementAuto = capCfg.elementAutoCapture === true;
      var effectiveFps = elementMode && !allowElementAuto ? 0 : fps;
      var targetNeedsAutoCapture = hasTarget && captureMode !== "element";
      var inScrollFreeze = this._isInElementPageScrollWindow(now);
      var cssAutoRefreshActive = now < this._cssAutoRefreshUntil;
      if (inScrollFreeze) {
        cssAutoRefreshActive = false;
      }
      var minInterval = Math.max(16, Number(this.config.capture.minIntervalMs || 120));
      var interval = minInterval;
      if (effectiveFps > 0) {
        interval = Math.max(16, Math.min(minInterval, 1000 / effectiveFps));
      } else if (targetNeedsAutoCapture) {
        interval = Math.min(minInterval, 66);
      }
      if (cssAutoRefreshActive) {
        interval = Math.min(interval, 66);
      }

      var due = (now - this.lastCaptureAt) >= interval;
      var autoCapture = effectiveFps > 0 || targetNeedsAutoCapture || cssAutoRefreshActive;
      if (!inScrollFreeze && (this.sceneDirty || !this.sceneReady || autoCapture) && due) {
        this._captureScene();
      }
    }

    this._syncLight();
    this._updateParticles(dt, elapsed);
    this._writeParticleBuffer();
    this._draw(elapsed * 0.001);

    this.raf = requestAnimationFrame(this._boundFrame);
  };

  GlassOverlayFX.prototype.pause = function () {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
  };

  GlassOverlayFX.prototype.resume = function () {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this._boundFrame);
  };

  GlassOverlayFX.prototype.setLight = function (x, y) {
    this.pointer.active = false;
    this.light.x = clamp(x, 0, 1);
    this.light.y = clamp(y, 0, 1);
  };

  GlassOverlayFX.prototype.emitRandom = function (x, y, options) {
    var opts = options || {};
    var mode = String(opts.mode || "replace").toLowerCase();
    var append = opts.append === true || mode === "new" || mode === "append" || mode === "add";
    var count = this.particles ? this.particles.length : 0;
    if (count <= 0 && !append) append = true;

    var p = this._makeParticle(true);
    if (typeof x === "number" && isFinite(x)) p.x = x;
    if (typeof y === "number" && isFinite(y)) p.y = y;
    if (this.config.physics && this.config.physics.enabled) {
      p.omega = p.baseSpin;
    }

    if (append) {
      this.particles.push(p);
      this.data = new Float32Array(this.particles.length * 8);
      return p;
    }

    var idx = Math.floor(Math.random() * count);
    this.particles[idx] = p;
    return p;
  };

  GlassOverlayFX.prototype.setConfig = function (patch) {
    var prevCount = this.config.count;
    var prevDensity = this.config.density;
    var prevTrack = this.config.trackPointer;
    var prevCaptureEnabled = !!(this.config.capture && this.config.capture.enabled);
    var capturePatched = !!(patch && patch.capture);
    var prevTargetRef = this.config.targetElement;
    var prevFollowTarget = this.config.followTarget;
    var prevEdgeWidth = this.config.edgeWidth;
    var prevCollisionPadding = this.config.physics && this.config.physics.collisionPaddingPx;
    this.config = deepMerge(this.config, patch || {});

    this.canvas.style.zIndex = String(this.config.zIndex);
    this._syncCapturePreviewLayer();

    var targetChanged = prevTargetRef !== this.config.targetElement || prevFollowTarget !== this.config.followTarget;
    if (targetChanged) {
      this._resize();
      this._startTargetObservers();
    }

    var countChanged = prevCount !== this.config.count || prevDensity !== this.config.density;
    if (countChanged) {
      this._rebuildParticles();
    } else if (targetChanged) {
      this._rebuildParticles();
    } else {
      var nextCollisionPadding = this.config.physics && this.config.physics.collisionPaddingPx;
      var collisionGeomChanged = prevEdgeWidth !== this.config.edgeWidth || prevCollisionPadding !== nextCollisionPadding;
      if (collisionGeomChanged) {
        for (var i = 0; i < this.particles.length; i++) {
          this._applyCollisionMetrics(this.particles[i]);
        }
      }
    }

    if (prevTrack !== this.config.trackPointer) {
      if (this.config.trackPointer) {
        window.addEventListener("pointermove", this._boundPointerMove, { passive: true, capture: true });
        window.addEventListener("pointerdown", this._boundPointerDown, { passive: true, capture: true });
        window.addEventListener("pointerrawupdate", this._boundPointerRawUpdate, { passive: true, capture: true });
        window.addEventListener("mousemove", this._boundMouseMove, { passive: true, capture: true });
        window.addEventListener("touchstart", this._boundTouchStart, { passive: true, capture: true });
        window.addEventListener("touchmove", this._boundTouchMove, { passive: true, capture: true });
      } else {
        window.removeEventListener("pointermove", this._boundPointerMove, true);
        window.removeEventListener("pointerdown", this._boundPointerDown, true);
        window.removeEventListener("pointerrawupdate", this._boundPointerRawUpdate, true);
        window.removeEventListener("mousemove", this._boundMouseMove, true);
        window.removeEventListener("touchstart", this._boundTouchStart, true);
        window.removeEventListener("touchmove", this._boundTouchMove, true);
      }
    }

    var nextCaptureEnabled = !!(this.config.capture && this.config.capture.enabled);

    if (!prevCaptureEnabled && nextCaptureEnabled) {
      this._startCssObservers();
      this.refreshScene();
    } else if (prevCaptureEnabled && !nextCaptureEnabled) {
      this._stopCssObservers();
    } else if (nextCaptureEnabled) {
      if (capturePatched) {
        this._startCssObservers();
      }
      this._markSceneDirty(false);
    }
  };

  GlassOverlayFX.prototype.destroy = function () {
    this.pause();
    this._stopTargetObservers();
    this._stopCssObservers();
    if (this._cssCaptureTimer) {
      clearTimeout(this._cssCaptureTimer);
      this._cssCaptureTimer = 0;
    }
    window.removeEventListener("resize", this._boundResize);
    window.removeEventListener("pointermove", this._boundPointerMove, true);
    window.removeEventListener("pointerdown", this._boundPointerDown, true);
    window.removeEventListener("pointerrawupdate", this._boundPointerRawUpdate, true);
    window.removeEventListener("mousemove", this._boundMouseMove, true);
    window.removeEventListener("touchstart", this._boundTouchStart, true);
    window.removeEventListener("touchmove", this._boundTouchMove, true);
    window.removeEventListener("scroll", this._boundScroll, true);
    window.removeEventListener("input", this._boundInputDirty, true);
    window.removeEventListener("change", this._boundInputDirty, true);
    window.removeEventListener("click", this._boundInputDirty, true);

    if (this.gl) {
      var gl = this.gl;
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.sceneTexture) gl.deleteTexture(this.sceneTexture);
      if (this.program) gl.deleteProgram(this.program);
      this.buffer = null;
      this.sceneTexture = null;
      this.program = null;
      this.gl = null;
    }

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    if (this.capturePreviewCanvas && this.capturePreviewCanvas.parentNode) {
      this.capturePreviewCanvas.parentNode.removeChild(this.capturePreviewCanvas);
    }
    this.capturePreviewCanvas = null;
    this.capturePreviewCtx = null;
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = GlassOverlayFX;
  }
  global.GlassOverlayFX = GlassOverlayFX;
})(typeof window !== "undefined" ? window : globalThis);
