// Builds the numeric slider rows from a declarative table and drops each into its panel group
// (matched by data-group). Every change writes straight into the shared params object and calls
// onChange; sync() pushes params back into the inputs (used by presets and "Reset to defaults").

import type { Params } from "../params.ts";

type NumKey = { [K in keyof Params]: Params[K] extends number ? K : never }[keyof Params];
// `maxKey` makes the upper bound track another param's live value (e.g. notch depth ≤ lip height)
// instead of a fixed number.
type Ctrl = {
  key: NumKey;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
  maxKey?: NumKey;
};

const CONTROLS: Ctrl[] = [
  // Cards — what the box holds
  { key: "cardCount", label: "Card count", min: 10, max: 250, step: 1, group: "cards" },
  { key: "extraCards", label: "Token headroom (cards)", min: 0, max: 40, step: 1, group: "cards" },
  { key: "cardWidth", label: "Card width (sleeved)", min: 60, max: 72, step: 0.1, group: "cards" },
  {
    key: "cardHeight",
    label: "Card height (sleeved)",
    min: 85,
    max: 97,
    step: 0.1,
    group: "cards",
  },
  {
    key: "cardThickness",
    label: "Thickness per card",
    min: 0.25,
    max: 1.2,
    step: 0.005,
    group: "cards",
  },
  // Fit — how loosely the stack sits
  { key: "sideClearance", label: "Side clearance", min: 0, max: 3, step: 0.1, group: "fit" },
  { key: "stackClearance", label: "Stack clearance", min: 0, max: 10, step: 0.5, group: "fit" },
  { key: "headroom", label: "Headroom", min: 0, max: 5, step: 0.5, group: "fit" },
  // Shell
  { key: "wall", label: "Wall thickness", min: 2, max: 4.4, step: 0.2, group: "shell" },
  { key: "floor", label: "Floor thickness", min: 1.2, max: 4, step: 0.2, group: "shell" },
  { key: "cornerRadius", label: "Corner radius", min: 0, max: 8, step: 0.5, group: "shell" },
  // Lid
  { key: "lipHeight", label: "Lip height", min: 6, max: 25, step: 0.5, group: "lid" },
  { key: "lipWall", label: "Lip wall", min: 0.8, max: 2.4, step: 0.1, group: "lid" },
  { key: "lidFit", label: "Lid fit clearance", min: 0.05, max: 0.5, step: 0.05, group: "lid" },
  { key: "lidTop", label: "Lid top thickness", min: 1.2, max: 4, step: 0.2, group: "lid" },
  // Closure extras — the snap/magnet groups are shown only when that closure style is selected
  { key: "snapBump", label: "Snap engagement", min: 0.1, max: 0.6, step: 0.05, group: "snap" },
  {
    key: "magnetDiameter",
    label: "Magnet diameter",
    min: 2,
    max: 6,
    step: 0.5,
    group: "magnet",
  },
  { key: "magnetHeight", label: "Magnet height", min: 1, max: 4, step: 0.5, group: "magnet" },
  // Body style — shown only when the body has an opening cut into it
  { key: "openingScale", label: "Opening size", min: 0.35, max: 0.9, step: 0.05, group: "opening" },
  // Retrieval — thumb notch (capped at the lip height so the closed lid always hides it), side
  // finger recesses, and the push-up hole in the floor
  { key: "notchWidth", label: "Notch width (0 = off)", min: 0, max: 40, step: 1, group: "notch" },
  {
    key: "notchDepth",
    label: "Notch depth",
    min: 4,
    max: 25,
    step: 0.5,
    group: "notch",
    maxKey: "lipHeight",
  },
  {
    key: "recessWidth",
    label: "Side recesses (0 = off)",
    min: 0,
    max: 30,
    step: 1,
    group: "notch",
  },
  {
    key: "pushHoleD",
    label: "Push-up hole Ø (0 = off)",
    min: 0,
    max: 30,
    step: 1,
    group: "notch",
  },
];

// Round away float noise (0.6000000000000001) but keep real precision like 0.305.
const tidy = (n: number): string => String(Math.round(n * 1000) / 1000);

export function buildControls(params: Params, onChange: () => void): { sync: () => void } {
  const syncers: Array<() => void> = [];
  const bounders: Array<() => void> = []; // re-evaluate dynamic (maxKey) ceilings

  const hiOf = (c: Ctrl): number => (c.maxKey ? params[c.maxKey] : c.max);

  for (const c of CONTROLS) {
    const row = document.createElement("div");
    row.className = "row";

    const label = document.createElement("label");
    label.textContent = c.label;

    const range = document.createElement("input");
    range.type = "range";
    range.min = String(c.min);
    range.max = String(hiOf(c));
    range.step = String(c.step);
    range.value = String(params[c.key]);

    const num = document.createElement("input");
    num.type = "text";
    num.value = tidy(params[c.key]);

    const apply = (raw: number): void => {
      const v = Math.min(Math.max(raw, c.min), hiOf(c));
      params[c.key] = v;
      range.value = String(v);
      num.value = tidy(v);
      refreshBounds(); // changing one control (e.g. lip height) can lower another's ceiling
      onChange();
    };
    range.addEventListener("input", () => apply(Number(range.value)));
    num.addEventListener("change", () => {
      const v = Number(num.value);
      if (!Number.isNaN(v)) apply(v);
    });

    // Keep a dynamic-max slider's ceiling in step with what it depends on, clamping its value down if
    // that ceiling dropped below the current value.
    if (c.maxKey) {
      bounders.push(() => {
        const hi = hiOf(c);
        range.max = String(hi);
        if (params[c.key] > hi) {
          params[c.key] = hi;
          range.value = String(hi);
          num.value = tidy(hi);
        }
      });
    }

    syncers.push(() => {
      range.max = String(hiOf(c));
      range.value = String(params[c.key]);
      num.value = tidy(params[c.key]);
    });

    row.append(label, range, num);
    document.querySelector(`[data-group="${c.group}"]`)?.append(row);
  }

  function refreshBounds(): void {
    for (const b of bounders) b();
  }
  refreshBounds(); // apply initial dynamic ceilings

  return { sync: () => syncers.forEach((s) => s()) };
}
