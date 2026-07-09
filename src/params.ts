// Parameters for the 3D-printed, two-part MTG deck box: a body holding a vertical stack of sleeved
// cards (width along X, stack along Y, height up Z) and a telescoping cap lid that slides over a
// thinner-walled neck ("lip") at the top of the body. All millimetres. Pure / framework-free so the
// geometry builder, the viewer and the tests share one source of truth.

// How the lid stays closed. All three share the same telescoping cap over the lip; they differ in
// what retains it: bare friction, a click-in detent ridge, or glue-in disc magnets at the seam.
export const LID_STYLES = ["friction", "snap", "magnet"] as const;
export type LidStyle = (typeof LID_STYLES)[number];

// What the body walls look like. "solid" is the plain shell; the others cut a card-showing opening
// through both wide faces: one arched window, a row of vertical slots, or a honeycomb of hexes.
// Every opening shape is self-supporting (teardrop arch, semicircle slot tops, point-up hexes), so
// all styles still print without supports.
export const BODY_STYLES = ["solid", "window", "slots", "hex"] as const;
export type BodyStyle = (typeof BODY_STYLES)[number];

export type Params = {
  cardCount: number; // how many cards the box holds
  cardWidth: number; // sleeved card width (X)
  cardHeight: number; // sleeved card height (Z)
  cardThickness: number; // per-card thickness including its sleeve(s) — sets the stack depth
  sideClearance: number; // fit gap on each side of the cards (width and height directions)
  stackClearance: number; // extra room along the stack so the last card slides in and out easily
  headroom: number; // gap above the card tops, under the closed lid's ceiling
  wall: number; // body wall thickness (also the lid's outer wall budget — see skirt in Dims)
  floor: number; // base thickness
  cornerRadius: number; // rounded vertical outer corners
  lipHeight: number; // height of the reduced-thickness neck the lid telescopes over
  lipWall: number; // wall thickness of the neck (flush with the cavity inside)
  lidFit: number; // clearance per side between lip and lid socket — the print-fit tuning knob
  lidTop: number; // lid top-face thickness
  notchWidth: number; // thumb notch in the lip's front face for pinching cards out (0 = none)
  notchDepth: number; // how far the notch dips below the body's top edge (capped at lipHeight)
  lidStyle: LidStyle; // what keeps the lid on: friction / snap detent / magnets
  snapBump: number; // snap only: detent interference per side — how hard the lid clicks
  magnetDiameter: number; // magnet only: disc magnet diameter (pockets add MAGNET_FIT)
  magnetHeight: number; // magnet only: disc magnet height (pockets add MAGNET_DEPTH_PAD)
  bodyStyle: BodyStyle; // wall look: solid / window / slots / honeycomb
  openingScale: number; // window/slots/hex only: opening size as a fraction of the available face
};

// Vertical slack between the lip top and the lid's interior ceiling, so the lid always seats on the
// body shoulder (a clean, tight seam) instead of bottoming out on the lip a hair too early.
export const LID_CEILING = 0.3;

// Snap closure: a horizontal round ridge on each wide lip face clicks into a matching groove inside
// the lid skirt. The round profile is its own cam, so the lid snaps on and off without a lead-in.
export const SNAP_RIDGE_R = 1.2; // ridge cylinder radius (mostly buried in the lip wall)
export const SNAP_RIDGE_LEN = 35; // ridge length across the face (always fits: lipW ≥ ~61)
export const SNAP_BELOW_TOP = 2.5; // ridge centre below the lip top, so it clicks at the end of travel
export const SNAP_GROOVE_SLACK = 0.1; // groove radius beyond the ridge, so the seated ridge isn't pinched

// Magnet closure: four vertical pillar bosses — two per wide face — carry Ø(magnet + fit) pockets
// that open right at the seam (the body pillar's top is the shoulder plane, the lid pillar's top is
// its rim), so glued-in disc magnets meet face-to-face when the box closes. Housing the pockets in
// their own pillars keeps the magnets clear of the lip, the lid socket and the card cavity at ANY
// wall thickness; at thin walls the pillars stand proud as four rounded ribs running the height of
// the closed box, and they sink toward flush as the wall grows.
export const MAGNET_FIT = 0.4; // diametral pocket clearance around the magnet
export const MAGNET_DEPTH_PAD = 0.3; // pocket depth beyond the magnet, so it can sit fully below flush
export const MIN_POCKET_WALL = 0.5; // clearance kept between the pocket and the lid's socket face
export const MAGNET_BOSS_WALL = 0.8; // pillar material outside the pocket

export type MagnetBoss = {
  r: number; // pillar radius
  off: number; // pillar centre beyond the outer face (negative = sunk into the wall)
  x: number; // pillar centres at ±x on each wide face
  proud: number; // how far the pillar stands beyond the outer face (0 when fully sunk)
};

// Body-style openings: margins keep a solid frame around whatever is cut into the wide faces — a
// side pillar next to each corner, a band above the floor, and a stiff ring under the shoulder.
export const OPENING_SIDE_MARGIN = 5; // from the cavity edge to the opening region
export const OPENING_BOTTOM_MARGIN = 5; // above the floor
export const OPENING_TOP_MARGIN = 6; // below the shoulder, so the lip loads into solid wall
export const SLOT_WIDTH = 7; // slots style: slot width (semicircular ends print themselves)
export const SLOT_GAP = 4.5; // slat left between slots
export const HEX_R = 5; // hex style: cell circumradius (point-up, so every edge is ≥ 60° from flat)
export const HEX_WALL = 3; // web left between cells
// Below this the region can't hold a sensible opening; the builder falls back to a solid wall.
export const MIN_OPENING_HALF_W = 8;
export const MIN_OPENING_H = 12;

// Sleeved-card sizes (mm). Per-card thickness is the number that actually sizes the box, and it
// varies by brand — these are middle-of-the-road values; fine-tune with the sliders for your sleeves.
export type SleevePreset = { name: string; width: number; height: number; thickness: number };

export const SLEEVE_PRESETS: SleevePreset[] = [
  { name: "Unsleeved", width: 63.5, height: 88.9, thickness: 0.305 },
  { name: "Penny sleeves", width: 66, height: 91, thickness: 0.36 },
  { name: "Standard sleeves", width: 66.5, height: 92, thickness: 0.6 },
  { name: "Double sleeved", width: 68, height: 93.5, thickness: 0.78 },
];

// One-click deck sizes. Picking one sets only the card count.
export type DeckPreset = { name: string; count: number };

export const DECK_PRESETS: DeckPreset[] = [
  { name: "Draft / limited (40)", count: 40 },
  { name: "Standard (60)", count: 60 },
  { name: "Standard + sideboard (75)", count: 75 },
  { name: "Commander (100)", count: 100 },
];

export const defaults: Params = {
  cardCount: 100, // Commander deck by default
  cardWidth: 66.5, // standard sleeves by default
  cardHeight: 92,
  cardThickness: 0.6,
  sideClearance: 0.8,
  stackClearance: 3,
  headroom: 1,
  wall: 3, // leaves a ~1.35 mm lid skirt at the default lipWall/lidFit — 3+ perimeters at 0.4 mm
  floor: 2.4,
  cornerRadius: 3,
  lipHeight: 13,
  lipWall: 1.4,
  lidFit: 0.25, // ~right for a well-tuned printer in PLA/PETG; raise if the lid binds
  lidTop: 2.4,
  notchWidth: 20,
  notchDepth: 11, // just inside the default lip, so the closed lid hides it
  lidStyle: "friction",
  snapBump: 0.3, // a firm click in PLA; back off toward 0.2 if the lid is a fight to open
  magnetDiameter: 3, // Ø3×2 discs keep the pillars slim; bigger magnets grow them
  magnetHeight: 2,
  bodyStyle: "solid",
  openingScale: 0.65,
};

// Sleeves have square corners, so the cavity corners must stay tighter than the card corner radius
// (~3 mm on the card, but the sleeve overhangs it square) or the corners pinch the stack.
const MAX_INNER_RADIUS = 2;

export type Dims = {
  stackD: number; // depth of the card stack itself
  innerW: number; // cavity width / depth / height
  innerD: number;
  innerH: number;
  innerR: number; // cavity corner radius (clamped small — sleeves are square-cornered)
  outerW: number; // body footprint (the lid shares it, so the closed box is flush)
  outerD: number;
  outerR: number;
  bodyH: number; // body height, floor to lip top
  shoulderZ: number; // where the full wall steps down to the lip
  lipW: number; // lip outer footprint and corner radius (socket = these + lidFit)
  lipD: number;
  lipR: number;
  skirt: number; // lid skirt wall thickness = wall − lipWall − lidFit; warn when it gets thin
  lidH: number; // lid overall height in print orientation
  assembledH: number; // closed-box height
};

export function dims(p: Params): Dims {
  const stackD = p.cardCount * p.cardThickness;
  const innerW = p.cardWidth + 2 * p.sideClearance;
  const innerD = stackD + p.stackClearance;
  const innerH = p.cardHeight + p.headroom;
  const outerW = innerW + 2 * p.wall;
  const outerD = innerD + 2 * p.wall;
  const outerR = Math.max(Math.min(p.cornerRadius, outerW / 2 - 0.01, outerD / 2 - 0.01), 0);
  const innerR = Math.max(Math.min(outerR - p.wall, MAX_INNER_RADIUS), 0);
  const lipR = innerR + p.lipWall;
  const bodyH = p.floor + innerH;
  const shoulderZ = bodyH - p.lipHeight;
  const lipW = innerW + 2 * p.lipWall;
  const lipD = innerD + 2 * p.lipWall;
  const skirt = p.wall - p.lipWall - p.lidFit;
  const lidH = p.lidTop + p.lipHeight + LID_CEILING;
  const assembledH = bodyH + p.lidTop + LID_CEILING;
  return {
    stackD,
    innerW,
    innerD,
    innerH,
    innerR,
    outerW,
    outerD,
    outerR,
    bodyH,
    shoulderZ,
    lipW,
    lipD,
    lipR,
    skirt,
    lidH,
    assembledH,
  };
}

// How many cards of the current thickness actually fit the cavity — the readout's source of truth
// (equals cardCount by construction, but stays honest if the derivation ever changes).
export function capacity(p: Params): number {
  return Math.floor((dims(p).innerD - p.stackClearance) / p.cardThickness + 1e-9);
}

// Closure fit checks (pure, shared by the readout warnings and the tests).

// Snap: the groove bites (snapBump + slack) into the lid skirt; this is the wall left outside it.
export function snapSkirtLeft(p: Params): number {
  return dims(p).skirt - (p.snapBump + SNAP_GROOVE_SLACK);
}

// Magnet: where the pillar bosses sit. The centre is pushed out just far enough that the pocket
// clears the lid's socket face by MIN_POCKET_WALL — the binding constraint, since the skirt is the
// thinnest wall the pocket lives behind. With a thick wall the offset goes negative and the pillar
// sinks into the shell (the pocket becomes fully internal); the pillar ring always leaves
// MAGNET_BOSS_WALL outside the pocket either way. The same centres are used on the body, where the
// pocket then sits even further clear of the cavity (by lipWall + lidFit more).
export function magnetBoss(p: Params): MagnetBoss {
  const d = dims(p);
  const pocketR = (p.magnetDiameter + MAGNET_FIT) / 2;
  const r = pocketR + MAGNET_BOSS_WALL;
  const off = pocketR + MIN_POCKET_WALL - d.skirt;
  const x = d.innerW / 2 - r - 2; // near the face ends, clear of the notch and any opening
  return { r, off, x, proud: Math.max(0, off + r) };
}

// Body-style openings: the face rectangle available for cutting, in body coordinates (x across the
// face, z up). openingScale then sizes the actual opening inside it. With magnets, the region also
// backs away from the pillars so no style can ever cut into them.
export function openingRegion(p: Params): { halfW: number; z0: number; z1: number } {
  const d = dims(p);
  let halfW = d.innerW / 2 - OPENING_SIDE_MARGIN;
  if (p.lidStyle === "magnet") {
    const boss = magnetBoss(p);
    halfW = Math.min(halfW, boss.x - boss.r - 2.5);
  }
  return { halfW, z0: p.floor + OPENING_BOTTOM_MARGIN, z1: d.shoulderZ - OPENING_TOP_MARGIN };
}
