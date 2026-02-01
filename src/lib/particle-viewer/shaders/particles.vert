uniform float uTime;
uniform float uProgress; // 0.0 (start) to 1.0 (end)
uniform float uSize;
uniform float uMode;     // 0.0 = Open, 1.0 = Close
uniform float uQuality;  // 0.0 = low, 1.0 = high
uniform float uDispersion; // 0.0 = none, 1.0 = max dispersion (morphing)

attribute vec3 aStartPosition; // Initial position (from <img>)
attribute vec3 aCurveOffset;   // Offset for bezier curves
attribute float aDelay;        // Per-particle delay (edges=0, center=0.25)

varying vec2 vUv;
varying float vProgress;
varying float vRotation; // Rotation for fragment shader
varying float vShapeMix; // Shape blend (0=square, 1=rotated)
varying vec2 vVelocity;  // Screen velocity for trail effect
varying float vRandom;   // Random value for shape selection

// Quadratic bezier interpolation: P0 -> P1 -> P2
vec3 bezierQuadratic(vec3 p0, vec3 p1, vec3 p2, float t) {
    float oneMinusT = 1.0 - t;
    return oneMinusT * oneMinusT * p0 + 2.0 * oneMinusT * t * p1 + t * t * p2;
}

// Calculate particle position for given progress 'p'
vec3 getParticlePosition(float p, vec3 finalPos) {
    // === PHASE 1: DISINTEGRATION (0.0 - 0.4) ===
    float disintegratePhase = smoothstep(0.0, 0.4, p);
    vec3 disperseDir = normalize(aStartPosition + aCurveOffset * 0.5 + vec3(0.001));
    float disperseStrength = (1.0 - disintegratePhase);
    disperseStrength = disperseStrength * disperseStrength;
    disperseStrength *= mix(1.0, smoothstep(0.0, 0.3, p), uMode);
    vec3 disperseOffset = disperseDir * disperseStrength * 200.0;
    float zSeparation = disperseStrength * aCurveOffset.z * 300.0;

    // === PHASE 2: FREE TRAVEL (0.3 - 0.75) ===
    float travelPhase = smoothstep(0.3, 0.75, p);
    vec3 midPoint = mix(aStartPosition, finalPos, 0.5);

    // Wide curve when opening (250.0), direct when closing (50.0)
    float curveFactor = mix(250.0, 50.0, uMode);
    midPoint += aCurveOffset * curveFactor;

    vec3 bezierPos = bezierQuadratic(aStartPosition, midPoint, finalPos, travelPhase);

    float uniquePhase = aCurveOffset.x * 6.28318 + aCurveOffset.y * 3.14159;
    float floatTime = uTime * 1.5 + uniquePhase;
    float floatStrength = sin(p * 3.14159) * 0.7;
    floatStrength *= mix(1.0, 0.2, uMode);

    vec3 floatOffset = vec3(
        sin(floatTime) * aCurveOffset.x,
        cos(floatTime * 0.7) * aCurveOffset.y,
        sin(floatTime * 0.5) * aCurveOffset.z * 0.5
    ) * floatStrength * 80.0;

    // === PHASE 3: SETTLING (0.7 - 1.0) ===
    float settlePhase = smoothstep(0.7, 1.0, p);
    float settleEase = settlePhase * settlePhase * (3.0 - 2.0 * settlePhase);
    float activeEffects = 1.0 - settleEase;

    // === COMBINE ALL PHASES ===
    vec3 pos = bezierPos;
    pos += disperseOffset * activeEffects;
    pos.z += zSeparation * activeEffects;
    pos += floatOffset * activeEffects;

    // === IMAGE TRANSITION (MORPHING) ===
    vec3 morphDir = vec3(
        sin(aCurveOffset.x * 20.0 + uTime * 5.0),
        cos(aCurveOffset.y * 20.0 + uTime * 3.0),
        sin(aCurveOffset.z * 20.0)
    );
    pos += morphDir * uDispersion * 400.0;
    pos.z += uDispersion * 80.0; // Limited to avoid crossing camera at z=100

    return pos;
}

void main() {
    vUv = uv;
    vRandom = aCurveOffset.x; // Use X offset (-0.5 to 0.5) as random seed

    float localProgress = clamp((uProgress - aDelay) / (1.0 - aDelay), 0.0, 1.0);
    vProgress = localProgress;

    // === ROTATION AND SHAPE ===
    float flyState = smoothstep(0.0, 0.2, localProgress) * (1.0 - smoothstep(0.8, 1.0, localProgress));
    vShapeMix = flyState;
    vRotation = (uTime * 3.0 + aCurveOffset.x * 10.0) * flyState;
    vShapeMix = max(flyState, uDispersion);
    vRotation = (uTime * 3.0 + aCurveOffset.x * 10.0) * flyState + uDispersion * (aCurveOffset.y * 60.0);

    // === POSITION AND VELOCITY CALCULATION ===
    vec3 currentPos = getParticlePosition(localProgress, position);
    // Calculate position an instant later to get velocity
    vec3 nextPos = getParticlePosition(min(localProgress + 0.005, 1.0), position);

    vec4 currentClip = projectionMatrix * viewMatrix * modelMatrix * vec4(currentPos, 1.0);
    vec4 nextClip = projectionMatrix * viewMatrix * modelMatrix * vec4(nextPos, 1.0);

    // Convert from clip space to Normalized Device Coordinates (NDC)
    vec2 currentScreen = currentClip.xy / currentClip.w;
    vec2 nextScreen = nextClip.xy / nextClip.w;

    vVelocity = nextScreen - currentScreen;
    gl_Position = currentClip;

    float sizeProgress = smoothstep(0.0, 0.25, localProgress);
    gl_PointSize = uSize * sizeProgress;
}
