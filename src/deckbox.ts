// The deck box assembly: buildBody() and buildLid(), each a pure Params -> BufferGeometry pipeline.
// Both parts are modelled in millimetres, Z-up, base on z = 0, in their PRINT orientation — the body
// base-down, the lid top-face-down (socket opening up) — so the exported STLs drop onto the plate
// ready to print, support-free: every face is a vertical extrusion or an upward-facing ledge.
//
// Body: full-thickness shell up to the shoulder, a thinner "lip" neck above it (flush with the cavity
// on the inside), the card cavity, and an optional thumb notch in the lip's front face. The lid
// telescopes over the lip and seats on the shoulder, so its outside ends up flush with the body and
// the notch disappears when the box is closed.

import type { BufferGeometry } from "three";
import { type Mat, type Scope, type Solid, scope } from "./csg.ts";
import {
  dims,
  type Dims,
  fingerRecess,
  HEX_R,
  HEX_WALL,
  LID_CEILING,
  MAGNET_DEPTH_PAD,
  MAGNET_FIT,
  magnetBoss,
  MIN_OPENING_H,
  MIN_OPENING_HALF_W,
  openingRegion,
  type Params,
  SLOT_GAP,
  SLOT_WIDTH,
  SNAP_BELOW_TOP,
  SNAP_GROOVE_SLACK,
  SNAP_RIDGE_LEN,
  SNAP_RIDGE_R,
} from "./params.ts";
import { circle, hexagon, notchSlot, roundedRect, teardropWindow } from "./shapes.ts";

// Stand the notch profile up against the front wall: local X stays world X (across the face), local Y
// becomes world Z (height), and the local +Z extrusion becomes world −Y (into the box from the
// front). Column-major; a 90° axis swap Manifold transforms exactly (no rounding).
const NOTCH_UPRIGHT: Mat = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];

// Lay an extruded cylinder on its side: the local +Z extrusion becomes world +X (a 90° rotation
// about Y), so the snap ridge/groove runs across the box's wide faces.
const ALONG_X: Mat = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];

// Stand a face profile against a NARROW face: local X goes across that face (world Y), local Y
// becomes height (world Z), and the extrusion runs world +X — push from the −X side through both
// narrow walls. Right-handed like NOTCH_UPRIGHT, so Manifold transforms it exactly.
const SIDE_UPRIGHT: Mat = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1];

// The snap ridge stands proud of the lip face by lidFit + snapBump: lidFit is eaten by the socket
// clearance, so snapBump is the true interference the skirt must climb — and the depth of the click.
const snapProud = (p: Params): number => p.lidFit + p.snapBump;

// A snap ridge/groove cylinder lying along X, centred on x = 0, on the ±Y face (side = ±1).
function snapCylinder(
  s: Scope,
  r: number,
  len: number,
  side: number,
  faceY: number,
  z: number,
): Solid {
  const cyl = s.transform(s.extrude(circle(r), len, 16), ALONG_X);
  return s.move(cyl, -len / 2, side * faceY, z);
}

// The four magnet pillars share one XY layout — paired on both wide faces, centres pushed just far
// enough outboard that the pockets clear the lid's socket (see magnetBoss) — so the body pillars and
// the lid pillars always align into continuous ribs on the closed box.
function magnetCenters(p: Params, d: Dims): Array<[number, number]> {
  const { off, x } = magnetBoss(p);
  const yc = d.outerD / 2 + off;
  return [
    [x, yc],
    [-x, yc],
    [x, -yc],
    [-x, -yc],
  ];
}

// The pillar bosses that carry the magnet pockets: vertical cylinders fused to the outside of the
// wide faces, running the part's full print height so they rise straight off the bed. Union them
// before any cutting, so the cavity/socket/opening cuts pass them by.
function addMagnetBosses(s: Scope, solid: Solid, p: Params, d: Dims, height: number): Solid {
  const { r } = magnetBoss(p);
  const bosses = magnetCenters(p, d).map(([x, y]) =>
    s.move(s.extrude(circle(r), height, 32), x, y, 0),
  );
  return s.add(solid, s.union(bosses));
}

// Cut the magnet pockets down into the pillars: vertical Ø(magnet + fit) holes from `topZ` (the seam
// face) down, overshooting 1 mm up into open air so the mouth is a clean cut.
function cutMagnetPockets(s: Scope, solid: Solid, p: Params, d: Dims, topZ: number): Solid {
  const r = (p.magnetDiameter + MAGNET_FIT) / 2;
  const depth = p.magnetHeight + MAGNET_DEPTH_PAD;
  const pockets = magnetCenters(p, d).map(([x, y]) =>
    s.move(s.extrude(circle(r), depth + 1, 24), x, y, topZ - depth),
  );
  return s.sub(solid, s.union(pockets));
}

// Body-style openings: one cutter set pushed straight through the whole box, so both wide faces get
// the identical pattern (the pass through the already-empty cavity costs nothing). Shapes are drawn
// in the face plane (x across, y up) and stood upright like the notch; every profile is
// self-supporting, so the walls still print without supports.
function cutOpenings(s: Scope, body: Solid, p: Params, d: Dims): Solid {
  const { halfW, z0, z1 } = openingRegion(p);
  const regionH = z1 - z0;
  if (halfW < MIN_OPENING_HALF_W || regionH < MIN_OPENING_H) return body; // no room — stay solid
  const zc = (z0 + z1) / 2;
  const through = d.outerD + 2;
  // Stand a face-plane cutter up against the +Y face and push it through to past the −Y face.
  const stand = (cutter: Solid, x: number, z: number): Solid =>
    s.move(s.transform(cutter, NOTCH_UPRIGHT), x, d.outerD / 2 + 1, z);

  const cutters: Solid[] = [];
  if (p.bodyStyle === "window") {
    // One teardrop-arched window per face. Width is capped so the arch (rise = w/√2) plus the
    // rounded bottom always fits the height — a squat region gets a narrower window, never a
    // broken shape.
    const h = regionH * p.openingScale;
    const w = Math.min(2 * halfW * p.openingScale, (h - 5) * Math.SQRT2);
    cutters.push(stand(s.extrude(teardropWindow(w, h, 4), through, 24), 0, zc - h / 2));
  } else if (p.bodyStyle === "slots") {
    // A row of stadium slots (semicircular ends). Count comes from how many fit the scaled width.
    const w = 2 * halfW * p.openingScale;
    const h = regionH * p.openingScale;
    const n = Math.max(2, Math.floor((w + SLOT_GAP) / (SLOT_WIDTH + SLOT_GAP)));
    const totalW = n * SLOT_WIDTH + (n - 1) * SLOT_GAP;
    for (let i = 0; i < n; i++) {
      const x = -totalW / 2 + SLOT_WIDTH / 2 + i * (SLOT_WIDTH + SLOT_GAP);
      cutters.push(
        stand(s.extrude(roundedRect(SLOT_WIDTH, h, SLOT_WIDTH / 2), through, 16), x, zc),
      );
    }
  } else if (p.bodyStyle === "hex") {
    // A honeycomb of point-up hexes, staggered rows, keeping only cells fully inside the scaled
    // region so the border web stays solid.
    const w = 2 * halfW * p.openingScale;
    const h = regionH * p.openingScale;
    const pitchX = Math.sqrt(3) * HEX_R + HEX_WALL;
    const pitchY = (pitchX * Math.sqrt(3)) / 2;
    const hexHalfW = (Math.sqrt(3) / 2) * HEX_R;
    const jMax = Math.ceil(h / 2 / pitchY);
    const iMax = Math.ceil(w / 2 / pitchX) + 1;
    for (let j = -jMax; j <= jMax; j++) {
      const y = j * pitchY;
      if (Math.abs(y) + HEX_R > h / 2) continue;
      for (let i = -iMax; i <= iMax; i++) {
        const x = j % 2 === 0 ? i * pitchX : (i + 0.5) * pitchX;
        if (Math.abs(x) + hexHalfW > w / 2) continue;
        cutters.push(stand(s.extrude(hexagon(HEX_R), through, 6), x, zc + y));
      }
    }
  }
  return cutters.length > 0 ? s.sub(body, s.union(cutters)) : body;
}

// Finger recesses: one teardrop cutout through each narrow wall so you grip the deck's long edges.
// Each cutter is only wall-deep (not a through-pass — below the cavity floor a through cutter would
// tunnel the floor slab): it dips RECESS_DIP below the floor and bites ~1 mm past the inner face, so
// the slab keeps a small ledge there and a fingertip reaches under the bottom card. Same profile as
// the window, so it's just as self-supporting on these vertical faces.
function cutFingerRecesses(s: Scope, body: Solid, p: Params, d: Dims): Solid {
  const recess = fingerRecess(p);
  if (!recess) return body; // no room — stay solid (the readout says so)
  const { w, z0, h } = recess;
  const depth = p.wall + 2;
  const r = Math.min(3, w / 2 - 0.5);
  const cutters = [1, -1].map((side) => {
    const cutter = s.transform(s.extrude(teardropWindow(w, h, r), depth, 24), SIDE_UPRIGHT);
    return s.move(cutter, side === 1 ? d.outerW / 2 - p.wall - 1 : -d.outerW / 2 - 1, 0, z0);
  });
  return s.sub(body, s.union(cutters));
}

// Push-up hole: a plain hole through the middle of the floor, so a snug deck pops out by pushing a
// finger up from underneath — zero hardware, and the floor stays a flat printable ring. The
// diameter is capped so the cards can never sag through.
function cutPushHole(s: Scope, body: Solid, p: Params, d: Dims): Solid {
  const dia = Math.min(p.pushHoleD, Math.min(d.innerW, d.innerD) - 4);
  if (dia < 4) return body;
  const hole = s.move(s.extrude(circle(dia / 2), p.floor + 2, 32), 0, 0, -1);
  return s.sub(body, hole);
}

export function buildBody(p: Params): BufferGeometry {
  const d = dims(p);
  const s = scope();

  // Full-thickness shell up to the shoulder, then the thinner lip neck the lid slides over.
  let body = s.extrude(roundedRect(d.outerW, d.outerD, d.outerR), d.shoulderZ);
  const lip = s.move(
    s.extrude(roundedRect(d.lipW, d.lipD, d.lipR), p.lipHeight),
    0,
    0,
    d.shoulderZ,
  );
  body = s.add(body, lip);

  // Magnet closure: the pillar bosses rise from the bed to the shoulder plane, where their pockets
  // will open. Added before any cut, so the cavity/notch/openings simply pass them by.
  if (p.lidStyle === "magnet") body = addMagnetBosses(s, body, p, d, d.shoulderZ);

  // Snap closure: a round detent ridge across each wide lip face, near the top so it clicks right as
  // the lid seats. Added before the cavity cut, which trims whatever pokes through the thin lip wall.
  // (The thumb notch may later slice the front ridge into two stubs — they still click fine.)
  if (p.lidStyle === "snap") {
    const faceY = d.lipD / 2 - (SNAP_RIDGE_R - snapProud(p));
    for (const side of [1, -1]) {
      const ridge = snapCylinder(
        s,
        SNAP_RIDGE_R,
        SNAP_RIDGE_LEN,
        side,
        faceY,
        d.bodyH - SNAP_BELOW_TOP,
      );
      body = s.add(body, ridge);
    }
  }

  // Card cavity, open at the top (the extrusion overshoots the lip top; the overshoot is harmless).
  const cavity = s.move(
    s.extrude(roundedRect(d.innerW, d.innerD, d.innerR), d.bodyH),
    0,
    0,
    p.floor,
  );
  body = s.sub(body, cavity);

  // Thumb notch: a rounded slot cut down into the lip's front face so you can pinch the card stack.
  // The cutter spans 1 mm beyond the outer face to 1 mm into the cavity, so it clears the whole lip
  // wall. Depth is clamped so the slot is at least its own semicircular bottom.
  if (p.notchWidth > 0) {
    const depth = Math.max(p.notchDepth, p.notchWidth / 2 + 0.5);
    const through = p.wall + 2;
    let cutter = s.extrude(notchSlot(p.notchWidth, depth, 2), through);
    cutter = s.transform(cutter, NOTCH_UPRIGHT);
    cutter = s.move(cutter, 0, -d.innerD / 2 + 1, d.bodyH);
    body = s.sub(body, cutter);
  }

  // Body style: cut the window / slots / honeycomb through both wide faces.
  if (p.bodyStyle !== "solid") body = cutOpenings(s, body, p, d);

  // Retrieval extras: finger recesses through the narrow faces, push-up hole through the floor.
  if (p.recessWidth > 0) body = cutFingerRecesses(s, body, p, d);
  if (p.pushHoleD > 0) body = cutPushHole(s, body, p, d);

  // Magnet closure: pockets sunk into the pillar tops at the shoulder plane, open upward —
  // print-friendly, glue-in after printing, and capped by the seated lid pillar when closed.
  if (p.lidStyle === "magnet") body = cutMagnetPockets(s, body, p, d, d.shoulderZ);

  return s.finish(body);
}

export function buildLid(p: Params): BufferGeometry {
  const d = dims(p);
  const s = scope();

  // Print orientation: top face on the bed (z = 0 .. lidTop), skirt rising above it, socket open up.
  let lid = s.extrude(roundedRect(d.outerW, d.outerD, d.outerR), d.lidH);

  // Magnet closure: the lid's pillar bosses run its full print height, so on the closed box they
  // line up with the body's into continuous ribs. Their pockets open at the rim (up, as printed).
  if (p.lidStyle === "magnet") lid = addMagnetBosses(s, lid, p, d, d.lidH);

  const socket = s.move(
    s.extrude(
      roundedRect(d.lipW + 2 * p.lidFit, d.lipD + 2 * p.lidFit, d.lipR + p.lidFit),
      d.lidH, // overshoots the opening; harmless
    ),
    0,
    0,
    p.lidTop,
  );
  lid = s.sub(lid, socket);

  // Snap closure: grooves inside the skirt, placed to be coaxial with the body's ridges when the lid
  // is seated on the shoulder. Groove radius = ridge + slack so the seated ridge isn't pinched; the
  // extra length gives the same slack at the ends.
  if (p.lidStyle === "snap") {
    const faceY = d.lipD / 2 - (SNAP_RIDGE_R - snapProud(p));
    const z = p.lidTop + LID_CEILING + SNAP_BELOW_TOP;
    for (const side of [1, -1]) {
      const groove = snapCylinder(
        s,
        SNAP_RIDGE_R + SNAP_GROOVE_SLACK,
        SNAP_RIDGE_LEN + 2 * SNAP_GROOVE_SLACK,
        side,
        faceY,
        z,
      );
      lid = s.sub(lid, groove);
    }
  }

  // Magnet closure: pockets sunk into the pillar rims (which face up in print orientation), meeting
  // the body's pillar pockets face-to-face at the closed seam.
  if (p.lidStyle === "magnet") lid = cutMagnetPockets(s, lid, p, d, d.lidH);

  return s.finish(lid);
}
