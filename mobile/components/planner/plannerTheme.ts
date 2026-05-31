/**
 * Planner editorial palette — a warm, printed-agenda aesthetic that deliberately
 * departs from the app's default "sleek SaaS" tokens (cold off-white, white
 * cards, blue/purple, soft shadows). This is the flagship redesign surface, so
 * the palette is scoped HERE — to the planner components — and can be judged on
 * a real screen before any app-wide rollout.
 *
 * The mental model is a high-end paper planner: ivory stock, warm ink, hairline
 * rules ruled across the page, and a single clay / terracotta accent used like a
 * red editor's pen — sparingly. No gradients, no glossy shadows, near-square
 * corners. Type does the work; colour stays quiet.
 */

// --------------------------------------------------------------------------- //
//  Surfaces, ink, rules, the one accent                                       //
// --------------------------------------------------------------------------- //
export const paper = {
  // Warm ivory stock. `page` is the sheet; `panel` is a barely-lifted block;
  // `inset` / `insetDeep` are recessed fills (slider rails, inputs, chips).
  page: '#F4EFE4',
  panel: '#FBF7EF',
  inset: '#ECE4D5',
  insetDeep: '#E2D8C5',

  // Ink — warm near-blacks and taupes. Never a cold neutral gray.
  ink: '#221C14',
  inkSoft: '#574E41',
  inkFaint: '#8E8270',
  inkGhost: '#B7AC96',

  // Hairline rules.
  rule: '#DCD1BC',
  ruleStrong: '#C7BA9F',

  // The single accent — clay / terracotta. Used like a stamp, not a theme.
  accent: '#A8472E',
  accentDeep: '#8C3A24',
  accentWash: 'rgba(168,71,46,0.10)',
  onAccent: '#F7F3EB',

  // Night / sleep — warm sepia dusk (replaces the old indigo). The asleep wash
  // dims the page like late light; dawn is a warm gold buffer.
  dusk: '#6E5E49',
  asleep: 'rgba(110,94,73,0.14)',
  duskWash: 'rgba(110,94,73,0.12)',
  dawnWash: 'rgba(194,135,46,0.12)',

  // A faint warm tint for the canvas lanes (vs. the cold black tint before).
  lane: 'rgba(34,28,20,0.030)',
  laneStrong: 'rgba(34,28,20,0.052)',
};

// --------------------------------------------------------------------------- //
//  Category inks — muted, earthy, harmonised with the clay accent.            //
//  Used by both obligationColor() and the week canvas / legend, so a "Work"   //
//  block, its legend swatch, and the obligations list all read the same.      //
// --------------------------------------------------------------------------- //
export const eventInk = {
  work: '#3F4A40', // deep eucalyptus
  school: '#6E5747', // umber
  commute: '#9A7D3D', // ochre
  other: '#5C5247', // warm graphite
  workout: '#566B3D', // moss
  ready: '#3D6B66', // grooming teal-stone
};

// Editor slider accents — kept in 1:1 sympathy with the canvas so editing a
// thing and seeing it on the week read as the same colour. Earthy, no blue.
export const accents = {
  wake: '#C2872E', // morning gold
  sleep: paper.dusk, // dusk sepia
  ready: eventInk.ready,
  workout: eventInk.workout,
};

// --------------------------------------------------------------------------- //
//  Radii — near-square. A planner is printed, not a glossy app card.          //
// --------------------------------------------------------------------------- //
export const radius = {
  xs: 2,
  sm: 3,
  md: 5,
  lg: 8,
  sheet: 16, // bottom sheets keep a slightly friendlier top edge
  dot: 9999, // genuinely circular things (status dots) only
};
