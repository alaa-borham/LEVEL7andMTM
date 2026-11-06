/** 0.9.147 LEVEL7 design icons — "linen + CAD" (chosen from the style sheets: ك fabric tile with
 * the drawing language of ج). One drawing per tool on a 24 grid. Classes (colours in
 * ui-design-0118.css): k = existing / construction line (ink), g = guide (dashed),
 * b = the result (blue thread), p = point (red pin), f = fabric (blue cloth), st = stitch (red),
 * o = measure (orange), of = orange fill, x = delete (red cross), w = white fill. */
const P = (x, y, r = 2.1) => `<circle class="p" cx="${x}" cy="${y}" r="${r}"/>`;
const X = '<path class="x" d="M15 15l6 6M21 15l-6 6"/>';
const FRAME = '<path class="g" d="M3 3h13v12H3z"/>';
const PIECE = 'M7 3l4 2.5 4-1 1.6 6 3.4 3-1 8.5H6.5V9z';
const STITCH = 'M8.7 6.3l2.4 1.5 3-.7 1.2 4.6 2.7 2.4-.7 5.7H8.3V10z';
const I = {
  // points
  point: `<path class="g" d="M12 3v18M3 12h18"/>${P(12, 12, 3)}`,
  pointOn: `<path class="k" d="M3 20L21 4"/><path class="b" d="M3 20l9-8"/>${P(12, 12, 2.6)}`,
  intersect: `<path class="k" d="M3 6l18 12M3 18L21 6"/>${P(12, 12, 2.6)}`,
  pointMove: `${P(5, 19)}<path class="g" d="M3 8h18"/><path class="b" d="M7 17L16.5 7.5M11.5 7.5h5v5"/>${P(19, 5)}`,
  // lines
  line: `<path class="b" d="M5 19L19 5"/>${P(5, 19)}${P(19, 5)}`,
  lineAngle: `<path class="g" d="M4 19h17"/><path class="b" d="M4 19L18 5"/><path class="o" d="M11 19a7 7 0 0 0-2-4.9"/>${P(4, 19)}`,
  parallel: `<path class="k" d="M3 15L15 3"/><path class="b" d="M9 21L21 9"/><path class="g" d="M9 9l6 6"/>`,
  parallelMany: '<path class="k" d="M3 19c5-11 12-13 18-13"/><path class="b" d="M3 22c5-9 12-11 18-11M7 23c4-6 9-7 14-7"/>',
  setLength: `<path class="k" d="M4 20L14 10"/><path class="b" d="M14 10l6-6M15.5 4H20v4.5"/>${P(4, 20)}`,
  trim: `<path class="k" d="M17 3v18"/><path class="b" d="M3 17l14-7"/><path class="g" d="M17 10l5-2.5"/>${P(17, 10)}`,
  curve: `<path class="g" d="M4 19L8 8M20 5l-4 11"/><path class="b" d="M4 19C8 8 16 16 20 5"/>${P(4, 19)}${P(20, 5)}`,
  // corners
  cornerSharp: `<path class="g" d="M3 7h13M18 21V9"/><path class="b" d="M3 7h15v14"/>${P(18, 7)}`,
  cornerRound: '<path class="g" d="M11 5h8v8"/><path class="k" d="M3 5h8M19 13v8"/><path class="b" d="M11 5a8 8 0 0 1 8 8"/>',
  cornerChamfer: '<path class="g" d="M12 5h7v7"/><path class="k" d="M3 5h9M19 12v9"/><path class="b" d="M12 5l7 7"/>',
  // transformations
  mirrorCopy: '<path class="g" d="M12 2v20"/><path class="f" d="M4 6l5 3v10l-5-3z"/><path class="b" d="M20 6l-5 3v10l5-3z"/>',
  mirrorMove: '<path class="g" d="M12 2v20M4 6l5 3v10l-5-3z"/><path class="f" d="M20 6l-5 3v10l5-3z"/><path class="o" d="M6 3.5c3-2 9-2 12 0M15.5 2l2.5 1.5-2 2"/>',
  mirrorPts: `<path class="g" d="M5 21L19 3"/>${P(5, 21)}${P(19, 3)}<path class="f" d="M3 9l6-2 1.5 5z"/><path class="b" d="M15 21l1.5-5 5 1.5z"/>`,
  mirrorDir: `<path class="g" d="M5 19L19 5"/><path class="o" d="M19 5l-5 .8M19 5l-.8 5"/>${P(5, 19)}<path class="f" d="M3 10l5-3 1.5 5z"/><path class="b" d="M15 21l3-5 3 3z"/>`,
  scalePts: `<path class="g" d="M3 3h18v18H3z"/><path class="f" d="M3 13h8v8H3z"/><path class="o" d="M11 13l6-6M13 7h4v4"/>${P(3, 21)}`,
  scaleDir: '<path class="g" d="M3 7h18v10H3z"/><path class="f" d="M8 7h8v10H8z"/><path class="o" d="M2 12h5M4.5 9.5L2 12l2.5 2.5M17 12h5M19.5 9.5L22 12l-2.5 2.5"/>',
  // stitches
  stitchLock: '<path class="k" d="M3 6h18"/><path class="st" d="M3 12h18"/>',
  stitchDouble: '<path class="k" d="M3 5h18"/><path class="st" d="M3 11h18M3 16h18"/>',
  stitchZigzag: '<path class="k" d="M3 5h18"/><path class="stz" d="M3 16l2.25-4 2.25 4 2.25-4 2.25 4 2.25-4 2.25 4 2.25-4 2.25 4"/>',
  stitchDeco: '<path class="k" d="M3 5h18"/><path class="stz" d="M3 12h18M5 12v5M9.5 12v5M14 12v5M18.5 12v5"/>',
  stitchGather: '<path class="k" d="M3 5h18"/><path class="stz" d="M3 14c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0 3 3 4.5 0"/>',
  // markings
  grainLine: '<path class="b" d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  symButton: `<circle class="f" cx="12" cy="12" r="8"/>${P(9.5, 9.5, 1.4)}${P(14.5, 9.5, 1.4)}${P(9.5, 14.5, 1.4)}${P(14.5, 14.5, 1.4)}`,
  symDrill: '<circle class="b" cx="12" cy="12" r="4.5"/><path class="k" d="M12 3v18M3 12h18"/>',
  symCross: '<path class="b" d="M12 5v14M5 12h14"/>',
  convertNotch: '<path class="k" d="M3 6h18"/><path class="b" d="M7 6v6M15 6l2.5 5.5L20 6"/><path class="o" d="M5 19h14M16 16l3 3-3 3"/>',
  textCreate: '<path class="k" d="M6 5h12M12 5v13"/><path class="b" d="M5 21h14"/>',
  // pieces
  piece: `<path class="f" d="${PIECE}"/><path class="st" d="${STITCH}"/>`,
  // 0.9.160 seam allowance: sewing line (ink) and the cutting line around it (dashed green)
  seamAllowance: `<path class="f" d="M7 7h10v12H7z"/><path class="k" d="M7 7h10v12H7z"/><path class="g" d="M3.5 3.5h17v19h-17z"/>`,
  notch: '<path class="f" d="M3 9h18v12H3z"/><path class="x" d="M12 9v6"/><path class="o" d="M9.5 3.5L12 6l2.5-2.5"/>',
  // dimensions and measuring
  dimAligned: '<path class="k" d="M4 19L18 5"/><path class="g" d="M4 19l-2.5-2.5M18 5l-2.5-2.5"/><path class="o" d="M2.5 15.5l13-13M2.5 15.5l.6-3M2.5 15.5l3-.6M15.5 2.5l-.6 3M15.5 2.5l-3 .6"/>',
  dimH: '<path class="g" d="M4 5v15M20 5v15"/><path class="o" d="M4 12h16M4 12l3-2.5M4 12l3 2.5M20 12l-3-2.5M20 12l-3 2.5"/>',
  dimV: '<path class="g" d="M5 4h15M5 20h15"/><path class="o" d="M12 4v16M12 4l-2.5 3M12 4l2.5 3M12 20l-2.5-3M12 20l2.5-3"/>',
  dimLength: '<path class="k" d="M3 20C8 9 16 8 21 9"/><path class="o" d="M3 14C7 5 15 3 21 4"/>',
  dimSum: '<path class="o" d="M18 5H7l6.5 7L7 19h11"/>',
  dimAngle: '<path class="k" d="M4 20h17M4 20L17 5"/><path class="o" d="M13 20a9 9 0 0 0-2.6-6.4"/>',
  measureDist: '<path class="of" d="M2.5 15.5l13-13 6 6-13 13z"/><path class="o" d="M2.5 15.5l13-13 6 6-13 13zM6.5 11.5l2 2M9.5 8.5l1.5 1.5M12.5 5.5l2 2"/>',
  measureLength: '<path class="b" d="M3 20C8 8 16 6 21 8"/><path class="o" d="M12 12l4 4M15.5 9.5l1.5 1.5M9 15l1.5 1.5"/>',
  // inheritance and library
  inheritObjects: '<path class="k" d="M3 10l6-7M6 12l6-7"/><path class="f" d="M11 13h10v8H11z"/><path class="o" d="M8 13v3h5M11.5 14l1.5 2-1.5 2"/>',
  inheritBlock: '<path class="k" d="M3 4h5v17H3zM8 4h5v17H8z"/><path class="f" d="M14 6l4-1.2 3.5 15.5-4 1.2z"/>',
  saveBlock: '<path class="k" d="M3 4h5v17H3zM8 4h5v17H8z"/><path class="b" d="M18 3v11M15 11l3 3 3-3M15 20h6"/>',
  inheritPart: `<g transform="translate(-2 -1) scale(.7)"><path class="f" d="${PIECE}"/></g><g transform="translate(8 7) scale(.7)"><path class="f" d="${PIECE}"/></g><path class="o" d="M14 3c4 0 6 2 6 5M18 6.5l2 2 2-2"/>`,
  // delete
  delPoints: `${P(5, 16)}${P(9, 9)}${P(15, 5)}${X}`,
  delLines: `<path class="k" d="M3 14L13 3M6 17L16 6"/>${X}`,
  delText: `<path class="k" d="M4 4h10M9 4v11"/>${X}`,
  delTextFrame: `${FRAME}<path class="k" d="M6.5 6.5h6M9.5 6.5v6"/>${X}`,
  delSymbolsFrame: `${FRAME}<circle class="f" cx="9.5" cy="9" r="3.5"/>${X}`,
  delStitchesFrame: `${FRAME}<path class="st" d="M5 7.5h9M5 11.5h9"/>${X}`,
  delNotchesFrame: `${FRAME}<path class="k" d="M5 6h9"/><path class="x" d="M9.5 6v5"/>${X}`,
  delPointsFrame: `${FRAME}${P(6.5, 11, 1.6)}${P(9.5, 7, 1.6)}${P(13, 10.5, 1.6)}${X}`,
  delLinesFrame: `${FRAME}<path class="k" d="M5 12.5L14 5.5"/>${X}`,
  delAllFrame: `${FRAME}<path class="k" d="M5 12.5L13 6"/>${P(6.5, 6.5, 1.5)}<path class="st" d="M9 11.5h5"/>${X}`,
  // save and export
  save: '<path class="k" d="M4 4h13l3 3v13H4z"/><path class="f" d="M8 4h8v6H8z"/><path class="k" d="M8 20v-6h8v6"/>',
  aama: `<path class="k" d="M5 2.5h10l4.5 4.5v14.5H5z"/><g transform="translate(2.5 4.5) scale(.62)"><path class="f" d="${PIECE}"/></g>`,
  dxf: `<path class="k" d="M5 2.5h10l4.5 4.5v14.5H5z"/><path class="b" d="M8.5 18l7-7"/>${P(8.5, 18, 1.6)}${P(15.5, 11, 1.6)}`,
  plt: '<path class="k" d="M3 9h18v8H3z"/><path class="b" d="M9 17v4h6v-4M10.5 9V3.5h3V9"/><path class="o" d="M6 13h2.5"/>'
};
/** The LEVEL7 icon of a design tool or command, or '' when the set has none. */
export function l7Icon(key) {
  return Object.hasOwn(I, key) ? `<svg viewBox="0 0 24 24" class="l7i" data-l7-icon="${key}" aria-hidden="true" focusable="false">${I[key]}</svg>` : '';
}
export const L7_ICON_KEYS = Object.freeze(Object.keys(I));
