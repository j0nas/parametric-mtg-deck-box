// Reusable 2D profiles (THREE.Shape) that the geometry builder extrudes through manifold-3d.
// Pure and framework-light — only depends on three's Shape/Path containers, no solid-modelling here.

import { Shape } from "three";

// A rounded rectangle centred on the origin in the XY plane. r is clamped so opposite arcs never
// overlap; r = 0 degenerates to straight corners (Clipper2 cleans up the zero-length arcs).
export function roundedRect(w: number, l: number, radius: number): Shape {
  const s = new Shape();
  const hw = w / 2;
  const hl = l / 2;
  const r = Math.max(Math.min(radius, hw - 0.01, hl - 0.01), 0);
  s.moveTo(-hw + r, -hl);
  s.lineTo(hw - r, -hl);
  if (r > 0) s.absarc(hw - r, -hl + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hl - r);
  if (r > 0) s.absarc(hw - r, hl - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hl);
  if (r > 0) s.absarc(-hw + r, hl - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hl + r);
  if (r > 0) s.absarc(-hw + r, -hl + r, r, Math.PI, Math.PI * 1.5, false);
  s.closePath();
  return s;
}

// A circle centred on the origin — extruded it becomes the snap-ridge / snap-groove cylinder and the
// magnet pockets. The extruder polygonises it (inscribed, so a hair under r); pass more curveSegments
// where the fit matters.
export function circle(r: number): Shape {
  const s = new Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

// The window cutter profile: a teardrop arch — vertical sides, rounded bottom corners, and a top
// made of two circular arcs that hand off to straight 45° lines meeting at a point. The 45° apex is
// what makes the window printable on a vertical wall with no supports: nothing overhangs past 45°.
// Drawn with the bottom edge on y = 0, apex at y = h, centred on x = 0. Caller guarantees
// h ≥ (w / 2) · √2 + r so the arch has room (see the clamp in the geometry builder).
export function teardropWindow(w: number, h: number, r: number): Shape {
  const s = new Shape();
  const R = w / 2; // arch radius = half width, so the arcs spring tangent off the vertical sides
  const cy = h - R * Math.SQRT2; // arch centre; apex sits R·√2 above it, tangent to both 45° lines
  const k = R / Math.SQRT2; // arc → line hand-off happens at 45° around the arch
  s.moveTo(-R + r, 0);
  s.lineTo(R - r, 0);
  s.absarc(R - r, r, r, -Math.PI / 2, 0, false);
  s.lineTo(R, cy);
  s.absarc(0, cy, R, 0, Math.PI / 4, false); // right arc, up to the 45° tangent point
  s.lineTo(0, h); // straight 45° line to the apex
  s.lineTo(-k, cy + k); // and back down to the left tangent point
  s.absarc(0, cy, R, (Math.PI * 3) / 4, Math.PI, false);
  s.lineTo(-R, r);
  s.absarc(-R + r, r, r, Math.PI, Math.PI * 1.5, false);
  s.closePath();
  return s;
}

// A point-up regular hexagon centred on the origin — the honeycomb cell. Point-up means every edge
// runs at 60° from horizontal or steeper, so a wall full of them prints without supports.
export function hexagon(r: number): Shape {
  const s = new Shape();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 3;
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

// The thumb-notch cutter profile: a vertical slot with a semicircular bottom, open at the top.
// Drawn in a local frame where x runs across the face and y is height, with y = 0 at the body's top
// edge — the slot spans y ∈ [-depth, overshoot], so the caller lifts it to the top of the box and
// the overshoot guarantees a clean cut through the rim. The builder stands it up against the front
// wall with a 90° axis swap and extrudes it through the wall thickness.
export function notchSlot(width: number, depth: number, overshoot: number): Shape {
  const s = new Shape();
  const r = width / 2;
  const cy = -depth + r; // centre of the semicircular bottom
  s.moveTo(-r, overshoot);
  s.lineTo(-r, cy);
  s.absarc(0, cy, r, Math.PI, Math.PI * 2, false); // bottom half-circle, left → right via the bottom
  s.lineTo(r, overshoot);
  s.closePath();
  return s;
}
