// App entry: holds the params, builds the body + lid meshes, and wires the UI to the geometry. The
// preview and the exported STLs come from the same buildBody()/buildLid() so they can never drift.
// Scene/render plumbing lives in scene.ts; the readout and sliders in their own modules.

import {
  BoxGeometry,
  type BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { initCSG } from "../csg.ts";
import { buildBody, buildLid } from "../deckbox.ts";
import {
  type BodyStyle,
  DECK_PRESETS,
  defaults,
  dims,
  type LidStyle,
  type Params,
  SLEEVE_PRESETS,
} from "../params.ts";
import { buildControls } from "./controls.ts";
import { createReadout } from "./readout.ts";
import { createViewer } from "./scene.ts";
import { clearParams, loadParams, saveParams } from "./storage.ts";

const params: Params = loadParams(defaults); // restore the last session's settings, if any

await initCSG(wasmUrl); // load the Manifold (manifold-3d) WASM kernel before any geometry is built

const app = document.getElementById("app")!;
const viewer = createViewer(app);

// manifold-3d returns a properly welded mesh (shared vertices), so a plain computeVertexNormals()
// averages normals across the sharp 90° CAD edges and the model looks soft/melted. Split the normals
// at any edge sharper than ~30° instead: flat faces stay crisp, while the rounded corners and the
// notch arc still shade smoothly. Positions/triangles are untouched, so the exported STL is
// identical. Disposes the source geometry once creased.
const CREASE_ANGLE = Math.PI / 6; // 30°
function creased(src: BufferGeometry): BufferGeometry {
  const g = toCreasedNormals(src, CREASE_ANGLE);
  src.dispose();
  g.computeBoundingBox();
  return g;
}

// --- meshes -----------------------------------------------------------------
// Matte, near-non-metallic so it reads like a printed part, not glossy plastic. The lid gets a
// contrasting colour to make clear it's a second printed part.
const bodyMat = new MeshStandardMaterial({ color: 0x3f8fbf, roughness: 0.72, metalness: 0 });
const lidMat = new MeshStandardMaterial({ color: 0xe0883a, roughness: 0.72, metalness: 0 });

const bodyMesh = new Mesh(creased(buildBody(params)), bodyMat);
const lidMesh = new Mesh(creased(buildLid(params)), lidMat);
for (const m of [bodyMesh, lidMesh]) {
  m.castShadow = true;
  m.receiveShadow = true;
  viewer.scene.add(m);
}

// Translucent card-stack placeholder: shows how the sleeved stack sits in the cavity (clearances,
// headroom, and how much of the top the notch exposes).
const cardsMat = new MeshStandardMaterial({
  color: 0xf7f4e8,
  roughness: 0.95,
  metalness: 0,
  transparent: true,
  opacity: 0.5,
  side: DoubleSide,
});
const cards = new Mesh(new BoxGeometry(1, 1, 1), cardsMat);
cards.renderOrder = 1;
viewer.scene.add(cards);

// --- UI elements ------------------------------------------------------------
const deckPresetSel = document.getElementById("deckPreset") as HTMLSelectElement;
const sleevePresetSel = document.getElementById("sleevePreset") as HTMLSelectElement;
const materialSel = document.getElementById("material") as HTMLSelectElement;
const lidStyleSel = document.getElementById("lidStyle") as HTMLSelectElement;
const bodyStyleSel = document.getElementById("bodyStyle") as HTMLSelectElement;
const cardsToggle = document.getElementById("showCards") as HTMLInputElement;
const assembledToggle = document.getElementById("showAssembled") as HTMLInputElement;

// Populate the preset dropdowns from the single source of truth (params.ts). "Custom…" (value "")
// stays selected whenever the current values don't match a preset.
for (const preset of DECK_PRESETS) {
  const opt = document.createElement("option");
  opt.value = preset.name;
  opt.textContent = preset.name;
  deckPresetSel.append(opt);
}
for (const preset of SLEEVE_PRESETS) {
  const opt = document.createElement("option");
  opt.value = preset.name;
  opt.textContent = preset.name;
  sleevePresetSel.append(opt);
}
// The closure select drives which extra slider groups are relevant; hide the rest, and explain the
// selected mechanism in the hint line.
const CLOSURE_HINTS: Record<LidStyle, string> = {
  friction:
    "The lid slides over a thinner neck and seats flush with the body. Lid fit clearance is the " +
    "print-fit knob: ~0.15 snug … 0.3 easy.",
  snap:
    "A rounded ridge on the neck clicks into a groove inside the lid. Snap engagement sets how " +
    "hard it clicks on and off.",
  magnet:
    "Four glue-in disc magnets, carried in slim pillars on the wide faces so they never touch the " +
    "neck or the cards. Pockets open at the seam — glue after printing, each pair attracting. " +
    "Ø3×2, Ø4×2 and Ø6×3 are the easy-to-buy disc sizes.",
};
function syncLidStyle(): void {
  lidStyleSel.value = params.lidStyle;
  for (const style of ["snap", "magnet"] as const) {
    document.querySelector<HTMLElement>(`[data-group="${style}"]`)!.hidden =
      params.lidStyle !== style;
  }
  document.getElementById("closureHint")!.textContent = CLOSURE_HINTS[params.lidStyle];
}

// Same pattern for the body style: the opening-size slider only matters when something is cut.
const BODY_HINTS: Record<BodyStyle, string> = {
  solid: "Plain walls — the classic closed deck box.",
  window:
    "A teardrop-arched window through both wide faces shows the cards — put your commander at the " +
    "front of the stack and it doubles as a showcase. The 45° arch prints without supports.",
  slots: "Vertical slots through both wide faces — lighter, faster, still stiff.",
  hex: "A honeycomb of point-up hexes through both wide faces — every edge prints support-free.",
};
function syncBodyStyle(): void {
  bodyStyleSel.value = params.bodyStyle;
  document.querySelector<HTMLElement>(`[data-group="opening"]`)!.hidden =
    params.bodyStyle === "solid";
  document.getElementById("bodyHint")!.textContent = BODY_HINTS[params.bodyStyle];
}

function syncPresets(): void {
  const deck = DECK_PRESETS.find((d) => d.count === params.cardCount);
  deckPresetSel.value = deck ? deck.name : "";
  const sleeve = SLEEVE_PRESETS.find(
    (s) =>
      s.width === params.cardWidth &&
      s.height === params.cardHeight &&
      s.thickness === params.cardThickness,
  );
  sleevePresetSel.value = sleeve ? sleeve.name : "";
}

const readout = createReadout({
  dimsEl: document.getElementById("dims")!,
  warnEl: document.getElementById("warnings")!,
  materialSel,
  getGeometries: () => [bodyMesh.geometry, lidMesh.geometry],
});

function updateCards(): void {
  const d = dims(params);
  cards.geometry.dispose();
  cards.geometry = new BoxGeometry(params.cardWidth, d.stackD, params.cardHeight);
  cards.position.set(0, 0, params.floor + params.cardHeight / 2);
  cards.visible = cardsToggle.checked;
}

// The lid is modelled in print orientation (top face down, socket opening up). Beside the body it
// previews exactly as printed; "assembled" flips it over and caps the body — the skirt seats on the
// shoulder, so the flipped top lands at assembledH.
function placeLid(): void {
  const d = dims(params);
  if (assembledToggle.checked) {
    lidMesh.rotation.set(Math.PI, 0, 0);
    lidMesh.position.set(0, 0, d.assembledH);
  } else {
    lidMesh.rotation.set(0, 0, 0);
    lidMesh.position.set(d.outerW + 15, 0, 0);
  }
}

const visibleObjects = (): Object3D[] => [bodyMesh, lidMesh];

function rebuild(persist = true): void {
  if (persist) saveParams(params); // persist on every change; reset passes false so it can forget
  const oldBody = bodyMesh.geometry;
  const oldLid = lidMesh.geometry;
  bodyMesh.geometry = creased(buildBody(params));
  lidMesh.geometry = creased(buildLid(params));
  oldBody.dispose();
  oldLid.dispose();
  updateCards();
  placeLid();
  syncPresets(); // drop to "Custom…" when a slider moves off a preset
  readout(params);
  viewer.invalidate();
}

// Coalesce rapid slider input to one rebuild per frame, so a fast drag can't queue up a backlog of
// rebuilds — the model just tracks the latest value.
let rafPending = 0;
function scheduleRebuild(): void {
  if (rafPending) return;
  rafPending = requestAnimationFrame(() => {
    rafPending = 0;
    rebuild();
  });
}

const sliders = buildControls(params, scheduleRebuild);

// --- event wiring -----------------------------------------------------------
deckPresetSel.addEventListener("change", () => {
  const preset = DECK_PRESETS.find((d) => d.name === deckPresetSel.value);
  if (!preset) return; // "Custom…" — leave the current count alone
  params.cardCount = preset.count;
  sliders.sync();
  rebuild();
});
sleevePresetSel.addEventListener("change", () => {
  const preset = SLEEVE_PRESETS.find((s) => s.name === sleevePresetSel.value);
  if (!preset) return;
  params.cardWidth = preset.width;
  params.cardHeight = preset.height;
  params.cardThickness = preset.thickness;
  sliders.sync();
  rebuild();
});
materialSel.addEventListener("change", () => readout(params)); // estimate only — no rebuild/redraw
lidStyleSel.addEventListener("change", () => {
  params.lidStyle = lidStyleSel.value as LidStyle; // values come from our own markup
  syncLidStyle();
  rebuild();
});
bodyStyleSel.addEventListener("change", () => {
  params.bodyStyle = bodyStyleSel.value as BodyStyle; // values come from our own markup
  syncBodyStyle();
  rebuild();
});
cardsToggle.addEventListener("change", () => {
  updateCards();
  viewer.invalidate();
});
assembledToggle.addEventListener("change", () => {
  placeLid();
  viewer.frameCamera(visibleObjects());
});

function downloadSTL(geometry: BufferGeometry, filename: string): void {
  const exporter = new STLExporter();
  const data = exporter.parse(new Mesh(geometry), { binary: true });
  const blob = new Blob([data], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Both parts export in print orientation (body base-down, lid top-face-down), mm, Z-up — they drop
// onto the plate ready to print with no supports. Non-default styles tag the filename: the closure
// on both parts (a snap body only mates with a snap lid), the body style on the body alone.
const stlName = (part: "body" | "lid"): string => {
  const closure = params.lidStyle === "friction" ? "" : `-${params.lidStyle}`;
  const style = part === "body" && params.bodyStyle !== "solid" ? `-${params.bodyStyle}` : "";
  return `deck-box-${part}-${params.cardCount}-cards${style}${closure}.stl`;
};
document.getElementById("downloadBody")!.addEventListener("click", () => {
  downloadSTL(bodyMesh.geometry, stlName("body"));
});
document.getElementById("downloadLid")!.addEventListener("click", () => {
  downloadSTL(lidMesh.geometry, stlName("lid"));
});

// The whole panel collapses to its title bar so the preview is workable on phones — where it also
// starts collapsed, since a 300px overlay covers most of a small viewport. (Same behavior as
// parametric-kit's installPanelCollapse; this app predates the kit and stays dependency-free.)
{
  const panel = document.getElementById("panel")!;
  const header = panel.querySelector("h1")!;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "panel-collapse";
  header.append(btn);
  const set = (collapsed: boolean): void => {
    panel.classList.toggle("collapsed", collapsed);
    btn.textContent = collapsed ? "▸" : "▾";
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.setAttribute("aria-label", collapsed ? "Show controls" : "Hide controls");
  };
  btn.addEventListener("click", () => set(!panel.classList.contains("collapsed")));
  set(window.matchMedia("(max-width: 640px)").matches);
}

// Reset to defaults and forget the persisted settings, so a later reload tracks the current defaults
// rather than a saved snapshot. rebuild(false) rebuilds without re-persisting.
document.getElementById("reset")!.addEventListener("click", () => {
  Object.assign(params, defaults);
  clearParams();
  sliders.sync();
  syncLidStyle();
  syncBodyStyle();
  rebuild(false);
  viewer.frameCamera(visibleObjects());
});

// Dev-only escape hatch for scripted testing (browser automation can't always rely on rAF firing —
// occluded windows pause it): lets a test set params, rebuild, and force a synchronous render.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__app = {
    params,
    rebuild,
    syncAll: (): void => {
      sliders.sync();
      syncPresets();
      syncLidStyle();
      syncBodyStyle();
    },
    render: (): void => {
      viewer.renderer.render(viewer.scene, viewer.camera);
    },
    frame: (): void => viewer.frameCamera(visibleObjects()),
  };
}

// --- go ---------------------------------------------------------------------
updateCards();
placeLid();
syncPresets();
syncLidStyle();
syncBodyStyle();
readout(params);
viewer.frameCamera(visibleObjects());
viewer.start();
