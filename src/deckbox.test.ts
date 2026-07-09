// Geometry-level checks: build the real solids through the Manifold kernel (Node build, no DOM) and
// probe the meshes — bounding boxes, volumes, and the exact planes/extremes the closure and body
// styles promise. These catch what the pure-math tests in params.test.ts can't: a cut in the wrong
// place, a boss that got clipped, an opening that broke through a margin.

import type { BufferGeometry } from "three";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { initCSG } from "./csg.ts";
import { buildBody, buildLid } from "./deckbox.ts";
import {
  defaults,
  dims,
  fingerRecess,
  MAGNET_DEPTH_PAD,
  magnetBoss,
  type Params,
} from "./params.ts";

beforeAll(async () => {
  await initCSG(); // Node: the Emscripten loader finds the wasm next to its own module
});

type Box = { min: [number, number, number]; max: [number, number, number] };

function bbox(g: BufferGeometry): Box {
  const pos = g.getAttribute("position");
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.count; i++) {
    const v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], v[a]);
      max[a] = Math.max(max[a], v[a]);
    }
  }
  return { min, max };
}

// Solid volume via the signed-tetrahedron sum — valid because Manifold guarantees a closed mesh.
function volume(g: BufferGeometry): number {
  const pos = g.getAttribute("position");
  const idx = g.index!;
  let v = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    const ax = pos.getX(a),
      ay = pos.getY(a),
      az = pos.getZ(a);
    const bx = pos.getX(b),
      by = pos.getY(b),
      bz = pos.getZ(b);
    const cx = pos.getX(c),
      cy = pos.getY(c),
      cz = pos.getZ(c);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(v);
}

// Count mesh vertices inside a horizontal disc — used to prove a pocket floor exists exactly where
// the magnet should bottom out.
function verticesOnDisc(g: BufferGeometry, cx: number, cy: number, z: number, r: number): number {
  const pos = g.getAttribute("position");
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getZ(i) - z) > 1e-4) continue;
    const dx = pos.getX(i) - cx;
    const dy = pos.getY(i) - cy;
    if (dx * dx + dy * dy <= r * r) n++;
  }
  return n;
}

describe("friction (baseline)", () => {
  test("body and lid fill exactly their advertised footprints", () => {
    const d = dims(defaults);
    const body = bbox(buildBody(defaults));
    expect(body.max[0] - body.min[0]).toBeCloseTo(d.outerW, 4);
    expect(body.max[1] - body.min[1]).toBeCloseTo(d.outerD, 4);
    expect(body.min[2]).toBeCloseTo(0, 4);
    expect(body.max[2]).toBeCloseTo(d.bodyH, 4);
    const lid = bbox(buildLid(defaults));
    expect(lid.max[0] - lid.min[0]).toBeCloseTo(d.outerW, 4);
    expect(lid.max[2]).toBeCloseTo(d.lidH, 4);
  });
});

describe("snap closure", () => {
  test("the ridge stands exactly lidFit + snapBump proud of the lip face", () => {
    const p: Params = { ...defaults, lidStyle: "snap" };
    const d = dims(p);
    // Only the lip region counts — below the shoulder the full-width shell is wider than the ridge.
    const g = buildBody(p);
    const pos = g.getAttribute("position");
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > d.shoulderZ + 0.01) maxY = Math.max(maxY, pos.getY(i));
    }
    expect(maxY).toBeCloseTo(d.lipD / 2 + p.lidFit + p.snapBump, 4);
  });
});

describe("magnet closure", () => {
  const p: Params = { ...defaults, lidStyle: "magnet" };
  const d = dims(p);
  const boss = magnetBoss(p);
  const yc = d.outerD / 2 + boss.off;
  const depth = p.magnetHeight + MAGNET_DEPTH_PAD;

  test("pillars stand exactly `proud` beyond the wall, on both parts", () => {
    expect(bbox(buildBody(p)).max[1]).toBeCloseTo(d.outerD / 2 + boss.proud, 4);
    expect(bbox(buildLid(p)).max[1]).toBeCloseTo(d.outerD / 2 + boss.proud, 4);
  });

  test("pocket floors sit exactly one magnet (+pad) below each seam face", () => {
    const body = buildBody(p);
    const lid = buildLid(p);
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        expect(
          verticesOnDisc(body, sx * boss.x, sy * yc, d.shoulderZ - depth, boss.r),
        ).toBeGreaterThan(0);
        expect(verticesOnDisc(lid, sx * boss.x, sy * yc, d.lidH - depth, boss.r)).toBeGreaterThan(
          0,
        );
      }
    }
  });

  test("magnets work at the thinnest wall the slider allows", () => {
    // The old shoulder-pocket design needed a ~6 mm wall for Ø3 magnets; the pillars must not.
    const thin: Params = { ...p, wall: 2 };
    const td = dims(thin);
    const tb = magnetBoss(thin);
    const body = buildBody(thin);
    expect(
      verticesOnDisc(body, tb.x, td.outerD / 2 + tb.off, td.shoulderZ - depth, tb.r),
    ).toBeGreaterThan(0);
  });
});

describe("body styles", () => {
  const solidVol = () => volume(buildBody(defaults));

  test("window, slots and hex each remove material without changing the footprint", () => {
    const solid = solidVol();
    for (const bodyStyle of ["window", "slots", "hex"] as const) {
      const p: Params = { ...defaults, bodyStyle };
      const g = buildBody(p);
      expect(volume(g)).toBeLessThan(solid);
      const b = bbox(g);
      expect(b.max[0] - b.min[0]).toBeCloseTo(dims(p).outerW, 4);
      expect(b.max[1] - b.min[1]).toBeCloseTo(dims(p).outerD, 4);
    }
  });

  test("a bigger opening removes more material", () => {
    const small = volume(buildBody({ ...defaults, bodyStyle: "window", openingScale: 0.4 }));
    const large = volume(buildBody({ ...defaults, bodyStyle: "window", openingScale: 0.9 }));
    expect(large).toBeLessThan(small);
  });

  test("openings never clip the magnet pillars", () => {
    const p: Params = { ...defaults, lidStyle: "magnet", bodyStyle: "window", openingScale: 0.9 };
    const boss = magnetBoss(p);
    const d = dims(p);
    // The pillars still reach their full outboard extent — an opening that nicked one would have
    // shaved this maximum back to the plain wall.
    expect(bbox(buildBody(p)).max[1]).toBeCloseTo(d.outerD / 2 + boss.proud, 4);
  });

  test("finger recesses remove material from the narrow walls without changing the footprint", () => {
    const p: Params = { ...defaults, recessWidth: 18 };
    const g = buildBody(p);
    expect(volume(g)).toBeLessThan(solidVol());
    const b = bbox(g);
    expect(b.max[0] - b.min[0]).toBeCloseTo(dims(p).outerW, 4);
    expect(b.min[2]).toBeCloseTo(0, 4); // the shell under the recess dip survives to the bed
  });

  test("finger recesses never breach the floor slab under the cavity", () => {
    // The recess dips below the cavity floor, so a through-cutter would have tunnelled a channel
    // clean across the slab. Prove the slab's core is intact: the mesh still has its floor face
    // at the cavity centre (a tunnel would have replaced z=floor with tunnel walls there).
    const p: Params = { ...defaults, recessWidth: 18 };
    const body = buildBody(p);
    const recess = fingerRecess(p)!;
    expect(recess.z0).toBeLessThan(p.floor);
    // Slice through the slab at the recess's low z, across the box's mid-plane: every surviving
    // vertex at that height must sit near the walls, never in the central card region.
    const pos = body.getAttribute("position");
    const d = dims(p);
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z < recess.z0 - 1e-4 || z > p.floor - 1e-4) continue;
      expect(Math.abs(pos.getX(i))).toBeGreaterThan(d.innerW / 2 - 1.5);
    }
  });

  test("the push-up hole removes exactly one floor-deep cylinder", () => {
    const p: Params = { ...defaults, pushHoleD: 20 };
    const removed = solidVol() - volume(buildBody(p));
    // The cutter is a 32-gon, so its area is a hair under the true circle's.
    const circleVol = Math.PI * 10 * 10 * p.floor;
    expect(removed).toBeGreaterThan(0.98 * circleVol);
    expect(removed).toBeLessThan(1.0 * circleVol);
  });

  test("a box with no room for an opening quietly stays solid", () => {
    // An implausibly narrow face (below any slider range) collapses the opening region.
    const tiny: Params = { ...defaults, cardWidth: 20, notchWidth: 0, bodyStyle: "window" };
    expect(volume(buildBody(tiny))).toBeCloseTo(
      volume(buildBody({ ...tiny, bodyStyle: "solid" })),
      4,
    );
  });
});
