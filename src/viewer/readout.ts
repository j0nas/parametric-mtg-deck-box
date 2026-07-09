// The text readout under the panel: closed-box size, card capacity, filament estimate, and any
// printability warnings. Fed the live mesh geometries so the weight tracks the real cut solids.

import type { BufferGeometry } from "three";
import {
  capacity,
  dims,
  MAGNET_DEPTH_PAD,
  magnetBoss,
  MIN_OPENING_H,
  MIN_OPENING_HALF_W,
  openingRegion,
  type Params,
  snapSkirtLeft,
} from "../params.ts";

const DENSITY: Record<string, number> = { PLA: 1.24, PETG: 1.27, ABS: 1.04, TPU: 1.21 }; // g/cm^3
const FILAMENT_AREA_MM2 = Math.PI * (1.75 / 2) ** 2; // cross-section of 1.75mm filament

// Solid volume of the mesh (cm^3) via the signed-tetrahedron sum (divergence theorem) — the
// standard, robust way for a closed mesh, and our source of truth for the filament estimate.
function meshVolumeCm3(g: BufferGeometry): number {
  const pos = g.getAttribute("position");
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  let v = 0;
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx.getX(i) : i;
    const b = idx ? idx.getX(i + 1) : i + 1;
    const c = idx ? idx.getX(i + 2) : i + 2;
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
  return Math.abs(v) / 1000;
}

// The lid skirt has to survive as a printed wall. Below ~1.0 mm (2 perimeters at a 0.4 mm nozzle)
// it gets fragile and slicers may thin-wall it away.
const MIN_SKIRT = 1.0;

export type ReadoutEls = {
  dimsEl: HTMLElement;
  warnEl: HTMLElement;
  materialSel: HTMLSelectElement;
  getGeometries: () => BufferGeometry[];
};

export function createReadout(els: ReadoutEls): (params: Params) => void {
  return function update(params: Params): void {
    const d = dims(params);
    const mat = els.materialSel.value;
    const volCm3 = els.getGeometries().reduce((sum, g) => sum + meshVolumeCm3(g), 0);
    const grams = Math.round(volCm3 * (DENSITY[mat] ?? 1.24));
    const metres = volCm3 / FILAMENT_AREA_MM2; // cm^3 -> mm^3 (x1000) -> length (/area, /1000) cancel

    els.dimsEl.textContent =
      `Closed box ${d.outerW.toFixed(1)} × ${d.outerD.toFixed(1)} × ${d.assembledH.toFixed(1)} mm · ` +
      `fits ${capacity(params)} × ${params.cardWidth.toFixed(1)}×${params.cardHeight.toFixed(1)} mm cards ` +
      `(stack ${d.stackD.toFixed(0)} mm) · ≈ ${grams} g · ${metres.toFixed(1)} m ${mat} (both parts, solid)`;

    const warnings: string[] = [];
    if (d.skirt < MIN_SKIRT) {
      warnings.push(
        `Lid skirt is only ${d.skirt.toFixed(2)} mm thick — increase wall, or reduce lip wall / lid fit.`,
      );
    }
    if (d.shoulderZ < params.floor + 5) {
      warnings.push(`Lip height nearly reaches the floor — reduce lip height.`);
    }
    if (params.lidStyle === "snap" && snapSkirtLeft(params) < 0.8) {
      warnings.push(
        `Snap groove leaves only ${snapSkirtLeft(params).toFixed(2)} mm of lid skirt — ` +
          `reduce snap engagement or increase wall.`,
      );
    }
    if (params.lidStyle === "magnet") {
      if (params.magnetHeight + MAGNET_DEPTH_PAD > params.lipHeight - 1) {
        warnings.push(`Magnet pockets nearly pierce the lid — shorter magnets or a taller lip.`);
      }
      const { proud } = magnetBoss(params);
      if (proud > 3.5) {
        warnings.push(
          `Magnet pillars stand ${proud.toFixed(1)} mm proud of the walls — ` +
            `smaller magnets or a thicker wall slims them.`,
        );
      }
    }
    if (params.bodyStyle !== "solid") {
      const region = openingRegion(params);
      if (region.halfW < MIN_OPENING_HALF_W || region.z1 - region.z0 < MIN_OPENING_H) {
        warnings.push(`No room for a ${params.bodyStyle} opening — the walls stay solid.`);
      }
    }
    els.warnEl.replaceChildren(
      ...warnings.map((w) => {
        const line = document.createElement("div");
        line.className = "warn-line";
        line.textContent = `⚠ ${w}`;
        return line;
      }),
    );
    els.warnEl.style.display = warnings.length > 0 ? "block" : "none";
  };
}
