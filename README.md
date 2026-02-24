# Glass.js

Interactive glass overlay effects for a target element.

## How to use

```js
const fx = new GlassOverlayFX({
  targetElement: element,
  followTarget: true,
  count: 20,
  minSize: 16,
  maxSize: 96,
  speed: 124,
  wobble: 0,
  roundness: 0.03,
  refraction: 2,
  ior: 2,
  thickness: 2,
  edgeWidth: 0.025,
  edgeSoftness: 0.1,
  edgeIntensity: 1.0,
  surfaceDistance: 2,
  flipRefractionY: 1,
  lightRadius: 500,
  chromaticAberration: 1,
  gloss: 1,
  opacity: 1.0,
  zIndex: 2147483647,
  html2canvasUrl: "/vendor/html2canvas.min.js", // optional
  physics: {
    enabled: true,
    restitution: 1,
    boundaryRestitution: 1,
    boundaryFriction: 0,
    collisionFriction: 0,
    boundaryCollision: true,
    spinTransfer: 1,
    linearDamping: 1,
    angularDamping: 1,
    maxSpeed: 420,
    positionCorrection: 1.0,
    solverIterations: 3,
    penetrationSlop: 0.0,
    collisionPaddingPx: 0,
    initialSpeedMin: 0.01,
    initialSpeedMax: 0.1,
    respawnSpeedMin: 0.2,
    respawnSpeedMax: 0.5,
    minAliveSpeed: 5,
    wakeStrength: 18,
  },
  capture: {
    enabled: true,
    initialSpawnInside: true,
    hideUntilFirstCapture: true,
    firstCaptureFadeMs: 5000,
    fps: 0,
    scale: Math.min(2, window.devicePixelRatio || 1),
    syncFormState: true,
    mirrorRangeControls: false,
    premultiplyAlpha: false,
    targetMode: "element",
    elementLockToElementSpace: true,
    observeCssChanges: false,
    cssAutoRefreshMs: 1200,
  },
  onError: function (err) {
    var code = err && err.captureCode ? " [" + err.captureCode + "]" : "";
    var via = captureEngineLabel();
    if (err && err.captureEngine) {
      via =
        err.captureEngine +
        (err.captureFallbackFrom ? " (fallback from " + err.captureFallbackFrom + ")" : "");
    }
    console.log("Capture failed" + code + " via " + via + ": " + err.message);
  },
  shapeWeights: {
    circle: 0.34,
    square: 0.33,
    triangle: 0.33,
  },
});

fx.refreshScene().then(function (ok) {
  if (ok) {
    console.log(
      "Page texture captured via " +
        captureEngineLabel() +
        ". Particles: " +
        fx.particles.length
    );
  }
});
```
