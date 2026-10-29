// How fast flow particles move on screen.
export const MAX_PARTICLE_PIXELS_PER_FRAME = 2.6;

// A calm, readable drift: 0.1 m/s travels 30 CSS px/second at every zoom.
// Cap storm currents so their paths remain legible on a small screen.
export function currentPixelsPerFrame(speed) {
  return speed >= 0.0015 ? Math.min(MAX_PARTICLE_PIXELS_PER_FRAME, 0.5 * (speed / 0.1) ** 0.7) : 0;
}

// The field speed that currentPixelsPerFrame turns into ``pixels`` per frame.
export function fieldSpeedForPixels(pixels) {
  return pixels > 0 ? 0.1 * (pixels / 0.5) ** (1 / 0.7) : 0;
}

// Waves and wind: on-screen speed grows with the square of strength, so light
// conditions barely creep, nothing moves at zero, and the top speed shows only at
// the layer's "full" strength (8 ft waves, 25 kn wind) and above. Any non-zero
// value keeps a slow creep (about 2 px/s) so light water still shows its direction.
export const DRAMATIC_SPEED_EXPONENT = 2;
const MIN_CREEP_PIXELS_PER_FRAME = 0.035;
export function dramaticParticleSpeed(value, full) {
  const share = Math.max(0, Math.min(1, Number(value) / full));
  if (!Number.isFinite(share) || share <= 0) return 0;
  return fieldSpeedForPixels(Math.max(MIN_CREEP_PIXELS_PER_FRAME, MAX_PARTICLE_PIXELS_PER_FRAME * share ** DRAMATIC_SPEED_EXPONENT));
}
