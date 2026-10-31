/** 0.9.144 LEVEL7 design icons: one consistent set on a 32 grid for the design tool strip,
 * its flyouts and the step card. Classes (colours in ui-design-0118.css, both themes):
 * s = main line, a = construction (blue), m = guide (dashed, muted), n = point (green dot),
 * o = piece / marking (amber), r = delete (red), fa = soft blue fill, fo = soft amber fill. */
const N = (x, y) => `<circle class="n" cx="${x}" cy="${y}" r="2.6"/>`;
const X = '<g class="r"><circle cx="25" cy="25" r="5.5"/><path d="M22.6 22.6l4.8 4.8M27.4 22.6l-4.8 4.8"/></g>';
const FRAME = '<path class="m" d="M4 5h19v17H4z"/>';
const PIECE = '<path class="fo" d="M9 4l5 3 5-1 2 8 4 4-1 10H8V12z"/><path class="o" d="M9 4l5 3 5-1 2 8 4 4-1 10H8V12z"/>';
const I = {
  // points
  point: `<path class="m" d="M16 4v6M16 22v6M4 16h6M22 16h6"/>${N(16, 16)}`,
  pointOn: `<path class="s" d="M4 26L28 6"/><path class="a" d="M7 21l3 3"/>${N(17, 16.8)}<path class="m" d="M5.5 24.5L17 16.8"/>`,
  intersect: `<path class="s" d="M4 8l24 18M4 26L28 8"/>${N(16, 17)}`,
  pointMove: `${N(7, 24)}<path class="m" d="M4 10h24"/><path class="a" d="M9.5 21.5l11-11M14 10.5h7v7"/>${N(24, 8)}`,
  // lines
  line: `<path class="a" d="M7 25L25 7"/>${N(7, 25)}${N(25, 7)}`,
  lineAngle: `<path class="m" d="M6 25h22"/><path class="a" d="M6 25L24 7"/><path class="s" d="M15 25a9 9 0 0 0-2.6-6.4"/>${N(6, 25)}`,
  parallel: `<path class="s" d="M4 22L20 6"/><path class="a" d="M12 28L28 12"/><path class="m" d="M13 13l6 6"/>`,
  parallelMany: `<path class="s" d="M4 24c6-14 16-16 24-16"/><path class="a" d="M4 28c7-12 16-13 24-13M8 30c6-8 13-9 20-9"/>`,
  setLength: `<path class="s" d="M4 24L18 10"/><path class="a" d="M18 10l8-8M20 2h6v6"/>${N(4, 24)}`,
  trim: `<path class="o" d="M22 4v24"/><path class="a" d="M4 22L22 13"/><path class="m" d="M22 13l6-3"/>${N(22, 13)}`,
  curve: `<path class="a" d="M5 24C8 6 22 26 27 8"/>${N(5, 24)}${N(16, 16)}${N(27, 8)}`,
  // corners
  cornerSharp: `<path class="m" d="M4 9h17M23 28V11"/><path class="a" d="M4 9h19v19"/>${N(23, 9)}`,
  cornerRound: `<path class="m" d="M14 9h9v9"/><path class="a" d="M4 9h10a9 9 0 0 1 9 9v10"/>${N(23, 9)}`,
  cornerChamfer: `<path class="m" d="M15 9h8v8"/><path class="a" d="M4 9h11l8 8v11"/>`,
  // transformations
  mirrorCopy: `<path class="m" d="M16 3v26"/><path class="fo" d="M5 8l7 4v12l-7-4z"/><path class="o" d="M5 8l7 4v12l-7-4z"/><path class="a" d="M27 8l-7 4v12l7-4z"/>`,
  mirrorMove: `<path class="m" d="M16 3v26M5 8l7 4v12l-7-4z"/><path class="fo" d="M27 8l-7 4v12l7-4z"/><path class="o" d="M27 8l-7 4v12l7-4z"/><path class="a" d="M9 4c3-2 11-2 14 0M20 2l3 2-3 3"/>`,
  mirrorPts: `<path class="m" d="M6 27L26 5"/>${N(6, 27)}${N(26, 5)}<path class="o" d="M5 10l7-2 2 6z"/><path class="a" d="M22 27l2-7 6 2z"/>`,
  mirrorDir: `<path class="m" d="M7 25L25 7"/><path class="a" d="M25 7l-6.5 1M25 7l-1 6.5"/>${N(7, 25)}<path class="o" d="M4 12l6-4 2 7z"/><path class="o" d="M20 28l4-6 3 4z"/>`,
  scalePts: `<path class="m" d="M4 4h24v24H4z"/><path class="fo" d="M4 18h10v10H4z"/><path class="o" d="M4 18h10v10H4z"/><path class="a" d="M14 18l9-9M17 9h6v6"/>${N(4, 28)}`,
  scaleDir: `<path class="m" d="M4 9h24v14H4z"/><path class="o" d="M10 9h12v14H10z"/><path class="a" d="M3 16h6M6 13l-3 3 3 3M23 16h6M26 13l3 3-3 3"/>`,
  // stitches
  stitchLock: '<path class="s" d="M4 9h24"/><path class="a" stroke-dasharray="3 3" d="M4 17h24"/>',
  stitchDouble: '<path class="s" d="M4 8h24"/><path class="a" stroke-dasharray="3 3" d="M4 15h24M4 21h24"/>',
  stitchZigzag: '<path class="s" d="M4 8h24"/><path class="a" d="M4 20l3-5 3 5 3-5 3 5 3-5 3 5 3-5 3 5"/>',
  stitchDeco: '<path class="s" d="M4 8h24"/><path class="a" d="M4 17h24M7 17v6M13 17v6M19 17v6M25 17v6"/>',
  stitchGather: '<path class="s" d="M4 8h24"/><path class="a" d="M4 19c2-4 4-4 6 0s4 4 6 0 4-4 6 0 4 4 6 0"/>',
  // markings
  grainLine: '<path class="o" d="M16 4v24M11 9l5-5 5 5M11 23l5 5 5-5"/>',
  symButton: '<circle class="o" cx="16" cy="16" r="10"/><circle class="n" cx="12.5" cy="12.5" r="1.8"/><circle class="n" cx="19.5" cy="12.5" r="1.8"/><circle class="n" cx="12.5" cy="19.5" r="1.8"/><circle class="n" cx="19.5" cy="19.5" r="1.8"/>',
  symDrill: '<circle class="o" cx="16" cy="16" r="6"/><path class="a" d="M16 4v24M4 16h24"/>',
  symCross: '<path class="o" d="M16 6v20M6 16h20"/>',
  convertNotch: '<path class="s" d="M3 8h26"/><path class="o" d="M8 8v8M18 8l3 7 3-7"/><path class="a" d="M6 26h20M22 22l4 4-4 4"/>',
  textCreate: '<path class="s" d="M8 7h16M16 7v17"/><path class="a" d="M6 28h20"/>',
  // pieces
  piece: PIECE,
  notch: '<path class="o" d="M4 10h24"/><path class="fo" d="M4 10h24v18H4z"/><path class="a" d="M16 10v7"/>',
  // dimensions and measuring
  dimAligned: '<path class="m" d="M6 22l4 4M22 6l4 4"/><path class="a" d="M8 24L24 8M8 24l1.5-5M8 24l5-1.5M24 8l-1.5 5M24 8l-5 1.5"/>',
  dimH: '<path class="m" d="M5 8v18M27 8v18"/><path class="a" d="M5 17h22M5 17l4-3M5 17l4 3M27 17l-4-3M27 17l-4 3"/>',
  dimV: '<path class="m" d="M8 5h18M8 27h18"/><path class="a" d="M17 5v22M17 5l-3 4M17 5l3 4M17 27l-3-4M17 27l3-4"/>',
  dimLength: '<path class="s" d="M4 26C10 12 20 10 28 12"/><path class="a" d="M4 18C9 7 19 4 28 5"/>',
  dimSum: '<path class="a" d="M23 7H9l8 9-8 9h14"/>',
  dimAngle: '<path class="s" d="M5 26h22M5 26L22 7"/><path class="a" d="M17 26a12 12 0 0 0-3.4-8.4M17 26l-2-3.5M17 26l2.8-3"/>',
  measureDist: `<path class="o" d="M3 20L20 3l9 9-17 17z"/><path class="o" d="M8 15l3 3M12 11l2 2M16 7l3 3"/>`,
  measureLength: '<path class="a" d="M4 26C9 10 20 7 28 9"/><path class="o" d="M17 17l5 5M21 13l2 2M13 21l2 2"/>',
  // inheritance and library
  inheritObjects: '<path class="s" d="M4 14L12 4M8 16l8-10"/><path class="fa" d="M14 18h14v10H14z"/><path class="a" d="M14 18h14v10H14zM10 18v4h7M14 19l3 3-3 3"/>',
  inheritBlock: '<path class="s" d="M5 5h7v22H5zM12 5h6v22h-6z"/><path class="o" d="M19 7l5-1.5 4 20.5-5 1.5z"/>',
  saveBlock: '<path class="s" d="M5 5h7v22H5zM12 5h6v22h-6z"/><path class="a" d="M24 4v14M20 14l4 4 4-4M20 27h8"/>',
  inheritPart: `<g transform="translate(-3 -2) scale(.72)">${PIECE}</g><g transform="translate(10 8) scale(.72)">${PIECE}</g><path class="a" d="M19 3c5 0 8 3 8 7M24 8l3 3 3-3"/>`,
  // delete
  delPoints: `${N(6, 22)}${N(12, 12)}${N(20, 6)}${X}`,
  delLines: `<path class="s" d="M4 20L18 4M8 24L22 8"/>${X}`,
  delText: `<path class="s" d="M5 6h14M12 6v15"/>${X}`,
  delTextFrame: `${FRAME}<path class="s" d="M9 10h9M13.5 10v8"/>${X}`,
  delSymbolsFrame: `${FRAME}<circle class="o" cx="13.5" cy="13.5" r="4.5"/>${X}`,
  delStitchesFrame: `${FRAME}<path class="a" stroke-dasharray="2.5 2.5" d="M7 11h13M7 16h13"/>${X}`,
  delNotchesFrame: `${FRAME}<path class="o" d="M7 9h13M13.5 9v7"/>${X}`,
  delPointsFrame: `${FRAME}${N(9, 16)}${N(14, 10)}${N(18, 15)}${X}`,
  delLinesFrame: `${FRAME}<path class="s" d="M7 18L19 8"/>${X}`,
  delAllFrame: `${FRAME}<path class="s" d="M7 18L19 8"/>${N(9, 10)}<path class="o" d="M14 17h5"/>${X}`,
  // save and export
  save: '<path class="s" d="M5 5h18l4 4v18H5z"/><path class="fa" d="M10 5h11v8H10z"/><path class="a" d="M10 5h11v8H10zM10 27v-8h12v8"/>',
  aama: '<path class="s" d="M7 3h13l6 6v20H7z"/><path class="fo" d="M11 12l4 2 4-1 2 6-1 6h-9z"/><path class="o" d="M11 12l4 2 4-1 2 6-1 6h-9z"/>',
  dxf: '<path class="s" d="M7 3h13l6 6v20H7z"/><path class="a" d="M11 24l10-10"/><circle class="n" cx="11" cy="24" r="2"/><circle class="n" cx="21" cy="14" r="2"/>',
  plt: '<path class="s" d="M4 12h24v10H4z"/><path class="a" d="M12 22v6h8v-6M14 12V5h4v7"/><path class="o" d="M8 17h3"/>'
};
// Shared gradients (one hidden SVG in the page): glossy points, filled pieces, delete badge.
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<radialGradient id="l7g-node" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#b9f7c9"/><stop offset=".45" stop-color="#2fbf5b"/><stop offset="1" stop-color="#11793a"/></radialGradient>
<radialGradient id="l7g-red" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#ff9a9a"/><stop offset=".5" stop-color="#e5383b"/><stop offset="1" stop-color="#a4161a"/></radialGradient>
<linearGradient id="l7g-amber" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a" stop-opacity=".75"/><stop offset="1" stop-color="#e08a00" stop-opacity=".35"/></linearGradient>
<linearGradient id="l7g-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8cc8ff" stop-opacity=".6"/><stop offset="1" stop-color="#1f7fd1" stop-opacity=".22"/></linearGradient>
<linearGradient id="l7g-stroke-a" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="32" y2="32"><stop offset="0" stop-color="#7cc2ff"/><stop offset="1" stop-color="#1c74c9"/></linearGradient>
<linearGradient id="l7g-stroke-o" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="32" y2="32"><stop offset="0" stop-color="#ffc35a"/><stop offset="1" stop-color="#d07200"/></linearGradient>
</defs></svg>`;
function ensureDefs() {
  if (typeof document === 'undefined' || document.getElementById('l7g-node')) return;
  document.body.insertAdjacentHTML('beforeend', DEFS);
}
// every drawn line gets a soft dark line under it (depth), dashed guides do not
const depth = body => body.replace(/<path class="(s|a|o)"([^>]*)\/>/g, (m, _c, rest) => `<path class="u"${rest.replace(/ stroke-dasharray="[^"]*"/, '')}/>${m}`);
const BUILT = Object.fromEntries(Object.entries(I).map(([k, v]) => [k, depth(v)]));
/** The LEVEL7 icon of a design tool or command, or '' when the set has none. */
export function l7Icon(key) {
  if (!Object.hasOwn(BUILT, key)) return '';
  ensureDefs();
  return `<svg viewBox="0 0 32 32" class="l7i" data-l7-icon="${key}" aria-hidden="true" focusable="false">${BUILT[key]}</svg>`;
}
export const L7_ICON_KEYS = Object.freeze(Object.keys(I));
