uniform sampler2D uTexture;
uniform sampler2D uTextureNext;
uniform float uTime;
uniform float uTextureMix;
uniform float uOpacity;
uniform float uDispersion;
varying vec2 vUv;
varying float vProgress;
varying float vRotation;
varying float vShapeMix;
varying vec2 vVelocity;
varying float vRandom;

void main() {
    vec2 noisyUv = vUv;

    // Glitch effect during dispersion
    if (uDispersion > 0.01) {
        float noise = sin(vUv.y * 50.0 + uTime * 30.0) * cos(vUv.x * 20.0);
        noisyUv.x += noise * 0.05 * uDispersion;
    }

    // Chromatic Aberration (RGB Split)
    float rgbShift = uDispersion * 0.02;

    vec4 color1 = vec4(texture2D(uTexture, noisyUv + vec2(rgbShift, 0.0)).r, texture2D(uTexture, noisyUv).g, texture2D(uTexture, noisyUv - vec2(rgbShift, 0.0)).b, texture2D(uTexture, noisyUv).a);
    vec4 color2 = vec4(texture2D(uTextureNext, noisyUv + vec2(rgbShift, 0.0)).r, texture2D(uTextureNext, noisyUv).g, texture2D(uTextureNext, noisyUv - vec2(rgbShift, 0.0)).b, texture2D(uTextureNext, noisyUv).a);

    vec4 textureColor = mix(color1, color2, uTextureMix);
    if (textureColor.a < 0.1) discard;

    vec2 coord = gl_PointCoord - vec2(0.5);
    vec2 finalCoord = coord;

    // Motion blur / trail effect
    float speed = length(vVelocity);
    if (speed > 0.0001 && vShapeMix > 0.0) {
        float stretchFactor = 1.0 + speed * 3000.0;
        stretchFactor = mix(1.0, stretchFactor, vShapeMix);

        vec2 dir = vVelocity / speed;
        float proj = dot(coord, dir);
        // Squash coordinate in movement direction to create stretch
        finalCoord = coord - dir * proj * (1.0 - 1.0 / stretchFactor);
    }

    // Rotation and shape morphing
    float s = sin(vRotation);
    float c = cos(vRotation);
    vec2 rotatedCoord = mat2(c, -s, s, c) * finalCoord;

    float distSquare = max(abs(finalCoord.x), abs(finalCoord.y));
    float distRotated = max(abs(rotatedCoord.x), abs(rotatedCoord.y));

    float distCircle = length(finalCoord);

    // Triangle (equilateral)
    vec2 p = rotatedCoord;
    p.y += 0.15;
    float distTriangle = max(abs(p.x) * 0.866025 + p.y * 0.5, -p.y);

    // Random shape: ~40% squares, ~30% circles, ~30% triangles
    float targetShapeDist = distRotated;
    if (vRandom < -0.2) {
        targetShapeDist = distCircle;
    } else if (vRandom > 0.2) {
        targetShapeDist = distTriangle;
    }

    float dist = mix(distSquare, targetShapeDist, vShapeMix);

    // Velocity-based glow (only during dispersion to avoid wash-out)
    vec3 hotColor = vec3(1.0, 1.0, 1.0);
    float speedFactor = smoothstep(0.0, 0.05, speed);
    float intensity = smoothstep(0.0, 0.2, uDispersion);
    vec3 finalColor = mix(textureColor.rgb, hotColor, speedFactor * 0.3 * intensity);

    // Soft edge glow
    float bloomFactor = 1.0 + speedFactor * 1.0 * intensity;
    float alpha = smoothstep(0.5, 0.2, dist / bloomFactor);

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(finalColor, textureColor.a);
    gl_FragColor.a *= alpha * vProgress * uOpacity;
}
