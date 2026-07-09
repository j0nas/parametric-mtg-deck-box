// Tests for the pure parameter/derived-dimension math — the numbers every printed part hangs off.
// Pure Node: no DOM, no WASM kernel.

import { describe, expect, test } from "vite-plus/test";
import {
  capacity,
  DECK_PRESETS,
  defaults,
  dims,
  fingerRecess,
  LID_CEILING,
  MAGNET_BOSS_WALL,
  MAGNET_FIT,
  magnetBoss,
  MIN_POCKET_WALL,
  openingRegion,
  SLEEVE_PRESETS,
  SNAP_GROOVE_SLACK,
  snapSkirtLeft,
} from "./params.ts";
import { sanitizeParams } from "./viewer/storage.ts";

describe("dims", () => {
  test("cavity wraps the card stack plus token headroom plus clearances", () => {
    const d = dims(defaults);
    expect(d.stackD).toBeCloseTo(defaults.cardCount * defaults.cardThickness);
    expect(d.innerW).toBeCloseTo(defaults.cardWidth + 2 * defaults.sideClearance);
    expect(d.innerD).toBeCloseTo(
      d.stackD + defaults.extraCards * defaults.cardThickness + defaults.stackClearance,
    );
    expect(d.innerH).toBeCloseTo(defaults.cardHeight + defaults.headroom);
  });

  test("outer shell adds one wall on every side and a floor below", () => {
    const d = dims(defaults);
    expect(d.outerW).toBeCloseTo(d.innerW + 2 * defaults.wall);
    expect(d.outerD).toBeCloseTo(d.innerD + 2 * defaults.wall);
    expect(d.bodyH).toBeCloseTo(defaults.floor + d.innerH);
  });

  test("lip is flush with the cavity and thinner than the wall", () => {
    const d = dims(defaults);
    expect(d.lipW).toBeCloseTo(d.innerW + 2 * defaults.lipWall);
    expect(d.lipD).toBeCloseTo(d.innerD + 2 * defaults.lipWall);
    expect(d.shoulderZ).toBeCloseTo(d.bodyH - defaults.lipHeight);
    expect(defaults.lipWall).toBeLessThan(defaults.wall);
  });

  test("lid skirt = wall − lipWall − lidFit, and defaults keep it printable", () => {
    const d = dims(defaults);
    expect(d.skirt).toBeCloseTo(defaults.wall - defaults.lipWall - defaults.lidFit);
    expect(d.skirt).toBeGreaterThanOrEqual(1.0); // ≥ 2 perimeters at a 0.4 mm nozzle
  });

  test("closed-box height = body + lid top + ceiling slack", () => {
    const d = dims(defaults);
    expect(d.lidH).toBeCloseTo(defaults.lidTop + defaults.lipHeight + LID_CEILING);
    expect(d.assembledH).toBeCloseTo(d.bodyH + defaults.lidTop + LID_CEILING);
    // sanity: assembled = shoulder + skirt (lipHeight + slack) + lid top
    expect(d.assembledH).toBeCloseTo(d.shoulderZ + d.lidH);
  });

  test("cavity corners stay tighter than square-cornered sleeves need", () => {
    // Big outer radius must clamp: sleeves are square-cornered, so innerR is capped at 2 mm.
    const round = dims({ ...defaults, cornerRadius: 8, wall: 3 });
    expect(round.innerR).toBe(2);
    // Radius smaller than the wall leaves square cavity corners.
    const square = dims({ ...defaults, cornerRadius: 2, wall: 3 });
    expect(square.innerR).toBe(0);
    // The lip outer radius tracks the cavity radius, offset by its own wall.
    expect(round.lipR).toBeCloseTo(round.innerR + defaults.lipWall);
  });
});

describe("closure fit", () => {
  test("default snap engagement still leaves a printable skirt behind the groove", () => {
    const p = { ...defaults, lidStyle: "snap" as const };
    const d = dims(p);
    expect(snapSkirtLeft(p)).toBeCloseTo(d.skirt - p.snapBump - SNAP_GROOVE_SLACK);
    expect(snapSkirtLeft(p)).toBeGreaterThanOrEqual(0.8);
  });

  test("magnet pillars keep the pockets clear of the lid socket, the cavity, and the notch", () => {
    const p = { ...defaults, lidStyle: "magnet" as const };
    const d = dims(p);
    const pocketR = (p.magnetDiameter + MAGNET_FIT) / 2;
    const { r, off, x } = magnetBoss(p);
    // The pillar always leaves its full ring wall outside the pocket.
    expect(r).toBeCloseTo(pocketR + MAGNET_BOSS_WALL);
    // Lid: how far the pocket reaches inward of the outer face never exceeds skirt − wall margin,
    // so the socket face (skirt deep) is untouched — this is the constraint that sizes `off`.
    expect(pocketR - off).toBeCloseTo(d.skirt - MIN_POCKET_WALL);
    // Body: the cavity is a full wall deep, so the same pocket sits even further clear there.
    expect(pocketR - off).toBeLessThan(p.wall - MIN_POCKET_WALL);
    // The pillars stay on the flat part of the face, clear of the widest thumb notch (±20 mm).
    expect(x - r).toBeGreaterThan(20);
    expect(x + r).toBeLessThan(d.outerW / 2 - d.outerR);
  });

  test("magnet pillars sink toward flush as the wall grows", () => {
    const p = { ...defaults, lidStyle: "magnet" as const };
    const thin = magnetBoss({ ...p, wall: 2 });
    const mid = magnetBoss(p);
    const thick = magnetBoss({ ...p, wall: 4.4 });
    expect(thin.proud).toBeGreaterThan(mid.proud);
    expect(mid.proud).toBeGreaterThan(thick.proud);
    // At the default wall the pillars are a modest rib, not a bolt-on box.
    expect(mid.proud).toBeLessThan(3.5);
  });
});

describe("openingRegion", () => {
  test("stays inside the frame margins and leaves room at defaults", () => {
    const region = openingRegion({ ...defaults, bodyStyle: "window" as const });
    const d = dims(defaults);
    expect(region.halfW).toBeLessThan(d.innerW / 2);
    expect(region.z0).toBeGreaterThan(defaults.floor);
    expect(region.z1).toBeLessThan(d.shoulderZ);
    expect(region.z1 - region.z0).toBeGreaterThan(12);
    expect(region.halfW).toBeGreaterThan(8);
  });

  test("backs away from the magnet pillars so no opening can cut into them", () => {
    const p = { ...defaults, bodyStyle: "window" as const };
    const plain = openingRegion(p);
    const withMagnets = openingRegion({ ...p, lidStyle: "magnet" as const });
    const boss = magnetBoss({ ...p, lidStyle: "magnet" as const });
    expect(withMagnets.halfW).toBeLessThan(plain.halfW);
    expect(withMagnets.halfW).toBeLessThan(boss.x - boss.r);
  });
});

describe("capacity", () => {
  test("round-trips deck + token headroom for every deck and sleeve preset", () => {
    for (const deck of DECK_PRESETS) {
      for (const sleeve of SLEEVE_PRESETS) {
        const p = {
          ...defaults,
          cardCount: deck.count,
          cardWidth: sleeve.width,
          cardHeight: sleeve.height,
          cardThickness: sleeve.thickness,
        };
        expect(capacity(p)).toBe(deck.count + defaults.extraCards);
        expect(capacity({ ...p, extraCards: 0 })).toBe(deck.count);
      }
    }
  });
});

describe("fingerRecess", () => {
  test("defaults leave room, dip below the cavity floor, and stay under the shoulder ring", () => {
    const p = { ...defaults, recessWidth: 18 };
    const recess = fingerRecess(p)!;
    const d = dims(p);
    expect(recess).not.toBeNull();
    expect(recess.w).toBe(18);
    expect(recess.z0).toBeLessThan(p.floor); // reaches under the bottom card
    expect(recess.z0).toBeGreaterThan(0); // but never through the bed shell
    expect(recess.z0 + recess.h).toBeLessThan(d.shoulderZ); // solid ring under the lip stays
  });

  test("off, or a box with no room, yields null", () => {
    expect(fingerRecess(defaults)).toBeNull(); // recessWidth 0 = off
    // A 10-card unsleeved box is too shallow front-to-back for any finger-sized recess.
    const tiny = { ...defaults, recessWidth: 18, cardCount: 10, extraCards: 0, cardThickness: 0.3 };
    expect(fingerRecess(tiny)).toBeNull();
  });
});

describe("sanitizeParams", () => {
  test("accepts a valid stored blob", () => {
    const stored = { ...defaults, cardCount: 60, wall: 2.4 };
    const out = sanitizeParams(defaults, stored);
    expect(out.cardCount).toBe(60);
    expect(out.wall).toBe(2.4);
  });

  test("rejects wrong types, unknown keys, and non-finite values", () => {
    const out = sanitizeParams(defaults, {
      cardCount: "lots", // wrong type -> default
      cardThickness: null, // JSON'd NaN/Infinity -> default
      injected: 999, // unknown key -> dropped
    });
    expect(out.cardCount).toBe(defaults.cardCount);
    expect(out.cardThickness).toBe(defaults.cardThickness);
    expect("injected" in out).toBe(false);
  });

  test("pins lidStyle and bodyStyle to the known styles", () => {
    expect(sanitizeParams(defaults, { lidStyle: "snap" }).lidStyle).toBe("snap");
    expect(sanitizeParams(defaults, { lidStyle: "banana" }).lidStyle).toBe(defaults.lidStyle);
    expect(sanitizeParams(defaults, { lidStyle: 3 }).lidStyle).toBe(defaults.lidStyle);
    expect(sanitizeParams(defaults, { bodyStyle: "hex" }).bodyStyle).toBe("hex");
    expect(sanitizeParams(defaults, { bodyStyle: "lace" }).bodyStyle).toBe(defaults.bodyStyle);
  });

  test("survives junk roots", () => {
    expect(sanitizeParams(defaults, null)).toEqual(defaults);
    expect(sanitizeParams(defaults, "junk")).toEqual(defaults);
    expect(sanitizeParams(defaults, 42)).toEqual(defaults);
  });
});
