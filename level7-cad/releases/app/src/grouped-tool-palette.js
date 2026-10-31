/** Icon categories and contextual options; existing command elements retain
 * their IDs, listeners and capability guards. No design data is written here. */
import{nativeLineRoles,nativePointMarks}from'./native-line-attributes.mjs';
const $=s=>document.querySelector(s);
const part='<path class="ink" d="M14 6L20 10L26 8L29 20L37 26L36 54H10V24L14 20Z"/>';
const curve='<path class="blue" d="M8 12C44 10 14 48 48 50"/><path class="blue" d="M6 10h4v4H6zM26 28h4v4h-4zM46 48h4v4h-4z"/>';
const arrow='<path class="blue" d="M10 30H43M35 23L44 30L35 37"/>';
const glyphs={
 symbolType:'<path class="ink" d="M5 24H22V40H5M34 24L52 32L34 40"/><path class="blue" d="M9 13H47M39 7L48 13L39 19"/>',
 convertNotch:'<path class="ink" d="M9 45L36 18M5 45H13M9 41V49"/><path class="blue" d="M19 9Q49 5 48 34M42 28L48 35L54 28M37 43L48 54"/>',
 pointTurnMove:'<path class="ink" stroke-dasharray="3 3" d="M7 46H47M7 46L36 16"/><path class="blue" d="M9 39Q6 13 29 10M23 5L30 10L24 16M37 44V23M32 29L37 22L43 29"/><path class="ink" d="M4 46H10M7 43V49M33 16H39M36 13V19M44 46H50M47 43V49"/><circle class="green" cx="10" cy="55" r="3"/>',
 pointRotate:'<path class="ink" d="M7 48H50M7 48L40 12M4 48H10M7 45V51M37 12H43M40 9V15M47 48H53M50 45V51"/><path class="blue" d="M18 42Q15 18 35 12M29 8L36 12L31 18"/><circle class="green" cx="10" cy="55" r="3"/>',
 linkedReflection:'<path class="ink" stroke-dasharray="3 3" d="M31 6V56"/><path class="blue" d="M7 15L23 25L13 47M55 15L39 25L49 47M22 10H40M36 6L40 10L36 14"/><circle class="green" cx="31" cy="51" r="3"/>',
 computedCorner:'<path class="ink" stroke-dasharray="2 3" d="M8 44Q22 12 54 13M40 7V55"/><path class="blue" d="M8 44Q18 22 40 16V55"/><circle class="green" cx="40" cy="16" r="3"/>',
 circularCorner:'<path class="ink" stroke-dasharray="2 3" d="M7 20H43V54M43 7V20H55"/><path class="blue" d="M7 20H25A18 18 0 0 1 43 38V54"/><circle class="ink" stroke-dasharray="2 3" cx="25" cy="38" r="18"/><circle class="green" cx="9" cy="54" r="3"/>',
 chamfer:'<path class="ink" stroke-dasharray="2 3" d="M8 20H43V53M43 7V20H55"/><path class="blue" d="M7 20H29L43 34V53"/><circle class="green" cx="10" cy="54" r="3"/>',
 autostartOn:'<path class="ink" d="M26 42L45 23M34 23H46V35"/><circle class="green" cx="26" cy="12" r="4"/><rect x="3" y="36" width="19" height="19" fill="#29a4dc" stroke="none"/><path d="M7 45H18M12.5 39V51" stroke="#fff"/>',
 autostartOff:'<path class="ink" d="M26 42L45 23M34 23H46V35"/><circle class="green" cx="26" cy="12" r="4"/><rect x="3" y="36" width="19" height="19" fill="#777" stroke="none"/><path d="M7 45H18" stroke="#fff"/>',
 copyPlus:'<path class="ink" d="M19 7H51V39H19ZM11 15H43V47H11ZM4 24H34V55H4Z"/><path class="blue" d="M10 39H28M19 30V48"/>',
 copyMinus:'<path class="ink" d="M19 7H51V39H19ZM11 15H43V47H11ZM4 24H34V55H4Z"/><path class="ink" d="M10 39H28"/>',
 link:'<path class="ink" d="M8 48Q14 19 49 12"/><circle class="dot" cx="28" cy="21" r="2.5"/><circle class="dot" cx="49" cy="12" r="2.5"/><path class="blue" d="M8 48Q9 36 15 29M9 32L16 27L18 35"/>',
 linkChain:'<path class="blue" d="M8 48Q14 19 49 12M41 8L50 12L45 21M23 25L39 41M23 41L39 25M20 33H42M31 22V44"/><circle class="blue" style="fill:#29a4dc" cx="8" cy="48" r="2.5"/>',
 organisation:`<g transform="translate(-4 0)">${part}</g><path fill="#65696b" stroke="none" d="M29 7L35 4L40 8L45 7V54H28Z"/><path fill="#2aa9e6" stroke="none" d="M46 28L53 17V54H46Z"/>`,
 library:`<path class="folder" d="M6 20H24L29 25H52V51H6Z"/><path fill="#fff" stroke="#777" d="M16 31L23 20L30 6L37 9L39 17L32 32L25 42H14Z"/><path class="folder" d="M7 51L13 34H54L48 51Z"/>`,
 insert:`<g transform="translate(-4 -2) scale(.78)">${part}</g><g transform="translate(18 14) scale(.72)">${part}</g><path class="gold" d="M26 6C50 2 53 15 49 28M44 22L49 29L55 22"/>`,
 insertPoints:'<path class="blue" d="M7 20h8M11 16v8M17 35h8M21 31v8M7 49h8M11 45v8"/><path class="gold" d="M27 7C50 5 53 19 48 33M42 27L48 35L55 27"/>',
 insertPointsInteractive:'<path class="blue" d="M7 20h8M11 16v8M17 35h8M21 31v8M7 46h8M11 42v8"/><path class="gold" d="M27 7C50 5 53 19 48 33M42 27L48 35L55 27"/><circle class="green" cx="9" cy="55" r="3"/>',
 insertLinesInteractive:'<path class="blue" d="M10 45L23 16M15 47L28 18"/><path class="gold" d="M30 7C50 5 53 19 48 33M42 27L48 35L55 27"/><circle class="green" cx="9" cy="55" r="3"/>',
 insertPartInteractive:'<path class="blue" d="M10 24L18 20L21 9L30 13L33 34L17 40ZM22 33L33 30L37 19L46 23L50 46L31 53Z"/><path class="gold" d="M29 7C50 5 53 19 48 33M42 27L48 35L55 27"/><circle class="green" cx="9" cy="55" r="3"/>',
 insertLines:'<path class="ink" d="M9 49L17 10"/><path class="blue" stroke-dasharray="3 3" d="M17 49L25 10"/><path class="gold" d="M29 7C50 5 53 19 48 33M42 27L48 35L55 27"/>',
 insertPart:`<g transform="translate(-5 2) scale(.85)">${part}</g><path class="gold" d="M29 7C50 5 53 19 48 33M42 27L48 35L55 27"/>`,
 insertDeposit:'<path class="ink" d="M12 9Q36 9 41 31"/><path stroke="#62a528" fill="none" d="M8 35L20 48L43 22"/>',
 insertDepositTurn:'<path class="ink" d="M6 17Q24 17 29 5M28 44Q47 42 51 27"/><path stroke="#62a528" fill="none" d="M6 36L17 48L34 24"/><path class="blue" d="M31 17Q49 20 48 34M42 29L48 35L53 28M32 39L36 45L42 40M35 44Q40 46 46 40"/>',
 insertDepositMove:'<path class="ink" d="M7 20Q28 20 34 6M30 43Q48 41 51 26"/><path stroke="#62a528" fill="none" d="M6 36L17 48L34 24"/><path class="blue" d="M29 19L43 32M36 31L44 33L44 24"/>',
 assistant:'<path class="ink" d="M17 11Q10 8 7 19M8 12L7 20L15 18M43 47Q50 50 53 39M46 41L53 38L54 46"/><path class="blue" d="M47 16Q53 25 49 32M46 27L49 34L54 29M13 44Q6 36 10 29M6 33L10 26L15 32"/>',
 parallel:`<path class="ink" d="M9 8V52"/><path class="blue" d="M47 8V52"/>${arrow}`,
 corners:'<path class="ink" d="M9 9H49V49M9 20H25Q38 20 38 34V49M9 31H20L28 39V49"/>',
 length:'<path class="ink" d="M9 9Q28 15 43 41"/><circle class="dot" cx="9" cy="9" r="2.5"/><circle class="dot" cx="28" cy="22" r="2.5"/><path class="blue" d="M38 34L50 48M42 47L51 49L50 40"/>',
 split:'<path class="ink" d="M7 30H29"/><path class="blue" d="M29 30H51"/><path class="red" d="M22 40L37 19"/>',
 raster0:'<path class="ink" d="M16 5Q3 28 16 52"/><path class="blue" d="M6 28H28M22 22L28 28L22 34M39 6h10M44 1v10M32 24h10M37 19v10M34 42h10M39 37v10M42 55h10M47 50v10"/>',
 rasterToLine:'<path class="ink" d="M53 5Q40 28 53 52"/><path class="blue" d="M22 28H40M34 22L40 28L34 34M9 6h10M14 1v10M2 24h10M7 19v10M4 42h10M9 37v10M12 55h10M17 50v10"/>',
 raster:'<path class="ink" d="M31 7Q11 27 31 51"/><path class="blue" d="M25 8h10M30 3v10M16 23h10M21 18v10M17 39h10M22 34v10M25 51h10M30 46v10"/>',
 points:'<path class="blue" d="M38 51L48 7M9 18h9M13.5 13.5v9M21 30h9M25.5 25.5v9M8 43h9M12.5 38.5v9"/>',
 shapes:'<rect class="blue" x="7" y="8" width="27" height="27"/><circle class="blue" cx="37" cy="39" r="14"/>',
 perpendicular:'<path class="ink" d="M6 47Q39 48 45 7M31 32L50 49M45 44H55M50 39V49"/><path class="blue" d="M29 35L33 31L38 35"/>',
 pointCluster:'<path class="blue" d="M12 45H22M17 40V50M22 31H32M27 26V36M32 17H42M37 12V22"/>',
 pointFraction:'<path class="ink" d="M10 45Q15 20 47 10"/><path class="blue" d="M9 46L18 28L27 24M18 28L13 38L22 36"/><text x="9" y="24" font-size="17" fill="#777" stroke="none">%</text>',
 pointFractionEnd:'<path class="blue" d="M8 16H16M12 12V20M43 12H51M47 8V16M39 43H47M43 39V47"/><path class="ink" d="M23 42H31M27 38V46"/><text x="21" y="29" font-size="17" fill="#777" stroke="none">%</text>',
 curve10:curve+'<circle class="green" cx="9" cy="55" r="3"/>',
 curveReplace:curve+'<path class="ink" stroke-dasharray="3 3" d="M8 5C44 3 14 41 48 43"/><circle class="green" cx="9" cy="55" r="3"/>',
 curveAuto:'<rect class="blue" x="5" y="38" width="17" height="17"/><path class="blue" d="M13 41V52M8 47H19M24 38L46 18M36 17L48 15L47 27"/><circle class="green" cx="9" cy="9" r="3"/>',
 curveManipulate:'<path class="ink" d="M8 50Q39 45 39 10"/><path class="blue" d="M8 50Q50 45 50 10"/><rect class="dot" x="37" y="8" width="4" height="4"/><rect class="blue" x="48" y="8" width="4" height="4"/>',
 curves:curve,
 transformations:`<g transform="translate(-5 0) scale(.84)">${part}</g><g class="blue" transform="translate(25 -5) rotate(25 20 30) scale(.8)">${part.replace('ink','blue')}</g>`,
 spread:'<path class="ink" d="M10 11L42 7L52 48L10 52Z M21 10V51M31 9L40 50"/><path class="blue" d="M23 11V49"/>',
 darts:`${part}<path class="blue" d="M25 12L20 37L40 9"/><path class="ink" stroke-dasharray="3 3" d="M24 12L40 9"/>`,
 symbols:'<path class="ink" d="M28 6V53M28 14H13V7H28M28 29L15 35L28 41"/><path class="blue" d="M44 8V44M39 42L44 53L49 42"/>',
 attributes:'<path class="ink" d="M7 12L51 5M7 22L51 15"/><path class="ink" stroke-dasharray="6 4" d="M7 32L51 25M7 42L51 35"/><path class="blue" d="M12 50h10M17 45v10"/><circle class="dot" cx="32" cy="50" r="3"/><path class="ink" d="M45 44v12M39 50h12M41 46l8 8M49 46l-8 8"/>',
 manufacturing:'<path class="blue" d="M11 13H51V18H11Z M7 44Q12 24 18 44T29 44T40 44T51 44"/><circle class="dot" cx="10" cy="15.5" r="4"/>',
 delete:`<g transform="translate(0 -2) scale(.8)">${part}</g><circle class="ink" cx="39" cy="39" r="15"/><path class="red" d="M22 19L36 33M36 19L22 33"/>`,
 align:'<path class="ink" d="M9 8H42L51 14L42 20H9ZM9 38H42L51 44L42 50H9Z"/><path class="blue" stroke-dasharray="3 3" d="M14 14H43M14 44H43"/><path class="blue" d="M38 10L44 14L38 18M19 40L13 44L19 48"/>',
 texts:'<text x="5" y="36" font-size="25" fill="#464a4d" stroke="none" font-family="Arial">ABC</text><path class="blue" d="M32 50L44 7L49 9L37 51Z"/>',
 textCreate:'<path class="ink" d="M8 7H31L38 14V47H8ZM31 7V15H38M13 21H30M13 27H28M13 33H25"/><path class="blue" d="M28 51L42 9L49 12L34 53Z"/>',
 textEdit:'<text x="4" y="28" font-size="23" fill="#464a4d" stroke="none" font-family="Arial">ABC</text><path d="M8 37L21 49L43 25" stroke="#62a528" fill="none" stroke-width="5"/>',
 dimension:`${part}<path class="blue" d="M5 15V52M1 19L5 14L9 19M1 48L5 53L9 48M43 28V52M39 32L43 27L47 32M39 48L43 53L47 48M13 4L29 4M17 1L12 4L17 7M25 1L30 4L25 7"/>`,
 horizontal:`<path class="ink" d="M9 10V49M49 10V49"/>${arrow}`,
 vertical:'<path class="ink" d="M8 10H50M8 49H50"/><path class="blue" d="M29 12V47M23 20L29 11L35 20M23 40L29 49L35 40"/>',
 distance:'<circle class="dot" cx="10" cy="43" r="3"/><circle class="dot" cx="48" cy="12" r="3"/><path class="blue" d="M14 40L44 15M15 33L13 42L22 40M36 16L46 14L43 24"/>',
 normal:'<path class="ink" d="M7 45L51 45"/><circle class="dot" cx="30" cy="9" r="3"/><path class="blue" d="M30 13V43M25 20L30 12L35 20M25 36L30 44L35 36M30 37H38V45"/>',
 angle:'<path class="ink" d="M9 48V8M9 48L49 19"/><path class="blue" d="M10 29Q25 29 25 36M20 31L26 37L19 39"/>',
 threeAngle:'<path class="ink" d="M9 44L46 44M9 44L37 11"/><path class="blue" d="M26 44Q26 34 19 31"/><circle class="dot" cx="9" cy="44" r="2"/><circle class="dot" cx="46" cy="44" r="2"/><circle class="dot" cx="37" cy="11" r="2"/><text x="3" y="39" font-size="11" fill="#777" stroke="none">1</text><text x="44" y="56" font-size="11" fill="#777" stroke="none">2</text><text x="37" y="8" font-size="11" fill="#777" stroke="none">3</text>',
 vector:'<path class="ink" d="M8 26V52M2 39H17"/><path class="blue" d="M9 39L43 9M34 11L45 7L43 18"/><text x="26" y="50" font-size="14" fill="#777" stroke="none">xy</text>',
 origin:'<circle class="ink" cx="10" cy="39" r="4"/><path class="ink" d="M10 26V52M1 39H20"/><path class="blue" d="M13 36L43 9M34 11L45 7L43 18"/><text x="26" y="50" font-size="14" fill="#777" stroke="none">xy</text>',
 point:'<path class="blue" d="M16 29H42M29 16V42"/>',
 line:'<path class="blue" d="M8 46L48 10"/><circle class="dot" cx="8" cy="46" r="3"/><circle class="dot" cx="48" cy="10" r="3"/>',
 polyline:'<path class="blue" d="M7 47L20 13L36 43L50 8"/>',
 fraction:'<path class="ink" d="M7 32H51"/><circle class="green" cx="29" cy="32" r="4"/><text x="23" y="20" font-size="15" fill="#299dd3" stroke="none">%</text>',
 area:`${part}<path class="blue" d="M13 29L27 15M13 38L30 21M13 47L33 27M17 52L34 35M26 52L34 44"/>`,
 contour:`${part}<path class="blue" d="M14 51H33V29M29 34L33 28L38 32"/><path class="blue" d="M9 16L4 10M8 25H1M17 8V1"/>`,
 circle:'<circle class="blue" cx="29" cy="30" r="20"/><path class="ink" d="M25 30H33M29 26V34"/><path class="blue" d="M29 30L47 22"/>',
 rectangle:'<rect class="blue" x="8" y="10" width="42" height="36"/><path class="ink" d="M4 46H12M8 42V50M46 10H54M50 6V14"/>',
 bind:`${curve}<circle class="green" cx="28" cy="30" r="5"/>`,
 unbind:`${curve}<circle fill="#fff" stroke="#e09844" cx="28" cy="30" r="5"/>`,
 direction:`${curve}<path class="ink" d="M7 12L36 12M29 8L36 12L29 16"/>`,
 plus:'<rect class="ink" x="10" y="15" width="30" height="31"/><rect class="ink" x="20" y="7" width="30" height="31"/><path class="blue" d="M9 39H28M18 30V49"/>',
 back:'<path class="blue" d="M21 14L9 25L23 30L19 22C49 14 52 42 25 49"/>',
 folder:'<path class="folder" d="M7 18H25L30 24H51V49H7Z"/>',
 grain:'<path class="blue" d="M29 7V51M23 16L29 7L35 16M23 42L29 51L35 42"/>',
 table:'<path class="ink" d="M8 9H50V49H8ZM8 20H50M8 30H50M8 40H50M22 9V49"/>',
 check:'<path stroke="#62ab23" stroke-width="5" d="M10 29L24 44L48 12"/>'
};
Object.assign(glyphs,{
 linkedLine:'<path class="blue" d="M10 44L48 14"/><circle class="ink" cx="10" cy="44" r="5"/><circle class="ink" cx="48" cy="14" r="5"/><path class="ink" d="M6 44H14M10 40V48M44 14H52M48 10V18"/>',
 linkedChain:'<path class="blue" d="M8 44L21 15L36 42L50 10"/><circle class="ink" cx="8" cy="44" r="3"/><circle class="ink" cx="21" cy="15" r="3"/><circle class="ink" cx="36" cy="42" r="3"/><circle class="ink" cx="50" cy="10" r="3"/>',
 line10:'<path class="ink" stroke-dasharray="3 3" d="M8 45H51"/><path class="blue" d="M8 45L49 18M39 19L50 17L46 28"/><path class="ink" d="M5 45H12M8 41V49"/><circle class="green" cx="9" cy="55" r="3"/>',
 line20:'<path class="ink" stroke-dasharray="3 3" d="M8 40L50 25"/><path class="blue" d="M8 40L50 25M5 35L11 45M47 20L53 30"/><circle class="green" cx="9" cy="55" r="3"/>',
 circle10:'<path class="blue" d="M12 48A22 22 0 1 0 12 14"/><path class="ink" d="M26 30H34M30 26V34"/><text x="38" y="24" fill="#6a6b6d" stroke="none" font-size="13">r</text><circle class="green" cx="9" cy="54" r="3"/>',
 circle20:'<path class="blue" d="M12 48A22 22 0 1 0 12 14M45 9V17M41 13H49"/><path class="ink" d="M26 30H34M30 26V34"/><circle class="green" cx="9" cy="54" r="3"/>',
 rectangle10:'<path class="blue" d="M12 45V12H49V45H21M8 45H16M12 41V49"/><circle class="green" cx="9" cy="55" r="3"/>',
 rectangle20:'<path class="blue" d="M12 12H49V45H12V12M8 45H16M12 41V49M45 45H53M49 41V49"/><circle class="green" cx="9" cy="55" r="3"/>',
 offsetEnds:'<path class="ink" d="M9 49V10"/><path class="blue" d="M30 10L48 49M11 13H31M11 45H45M17 9L10 13L17 17M24 9L31 13L24 17M17 41L10 45L17 49M38 41L45 45L38 49"/>',
 lengthTo:'<path class="ink" d="M8 37H49"/><circle class="dot" cx="8" cy="37" r="3"/><circle class="dot" cx="29" cy="37" r="3"/><circle class="dot" cx="49" cy="37" r="3"/><path class="blue" d="M8 20H49M40 13L49 20L40 27"/>',
 lengthBy:'<path class="ink" d="M8 37H49"/><circle class="dot" cx="8" cy="37" r="3"/><circle class="dot" cx="29" cy="37" r="3"/><circle class="dot" cx="49" cy="37" r="3"/><path class="blue" d="M30 20H49M40 13L49 20L40 27"/>',
 lengthEdit:'<path class="ink" d="M8 37H49M8 45H49"/><path class="blue" d="M18 30L38 10L45 17L25 37L15 40Z"/>',
 cutStart:'<path class="ink" d="M8 14Q30 19 48 46"/><path class="blue" d="M8 14L17 17M6 23L8 13L18 11"/><path class="red" d="M11 9L4 21"/>',
 cutEnd:'<path class="ink" d="M8 14Q30 19 48 46"/><path class="blue" d="M40 36L48 46M38 45L49 47L50 36"/><path class="red" d="M45 40L52 50"/>',
 splitLine:'<path class="ink" d="M6 30H27"/><path class="blue" d="M31 30H54"/><path class="red" d="M24 42L35 18"/><circle class="dot" cx="6" cy="30" r="2"/><circle class="dot" cx="54" cy="30" r="2"/>',
 grainEdit:'<path class="ink" d="M20 7V49M15 15L20 6L25 15M15 41L20 50L25 41"/><path class="blue" d="M31 40L43 16L49 19L37 43L29 48Z"/>',
 pointEdit:'<path class="ink" d="M11 32H34M22 21V44"/><path class="blue" d="M31 30L43 10L49 14L37 34L29 39Z"/>',
 arrow:arrow,text:'<text x="6" y="37" fill="#666" stroke="none" font-size="24">ABC</text>',seam:`${part}<path class="blue" stroke-dasharray="3 3" d="M15 25V48H31V30"/>`,mirror:`${part}<path class="blue" stroke-dasharray="3 3" d="M41 7V54M44 10H53V52H44"/>`
});
function optionGlyph(glyph,attrs){const point=attrs['data-original-point'];if(point==='line')return'linkedLine';if(point==='chain')return'linkedChain';const shape=attrs['data-original-shape-create'];if(shape)return shape;const length=attrs['data-original-length'];if(length)return{to:'lengthTo',by:'lengthBy',edit:'lengthEdit'}[length];const cut=attrs['data-original-cut'];if(cut)return{1:'cutEnd',2:'cutStart',split:'splitLine'}[cut];if(attrs['data-original-parallel']==='ends')return'offsetEnds';if(attrs['data-original-point-edit'])return'pointEdit';if(attrs['data-original-grain-edit'])return'grainEdit';return glyph;}
/** 0.9.118: the design engine palette reuses these drawings. */
export function toolIcon(name){return Object.hasOwn(glyphs,name)?icon(name):'';}
function icon(name){if(!Object.hasOwn(glyphs,name))throw Error('Missing tool icon: '+name);return `<svg viewBox="0 0 60 60" data-tool-icon="${name}" data-icon-revision="73" aria-hidden="true" focusable="false">${glyphs[name]}</svg>`;}
const groups=[
 ['organisation','Part organisation','تنظيم البارتات','organisation'],['library','Call basic blocks','مكتبة القوالب','library'],['insert','Insert','إدراج','insert'],['assistant','Part assistant','مساعد البارت','assistant'],
 ['parallel','Parallel','التوازي والإزاحة','parallel'],['corners','Corners','الزوايا','corners'],['length','Lengthen / shorten','إطالة وتقصير','length'],['link','Link','ضم الخطوط','link'],['split','Separate','فصل وقص','split'],['raster','Raster','نقاط المسار','raster'],
 ['points','Points and lines','نقاط وخطوط','points'],['shapes','Circles and rectangles','دوائر ومستطيلات','shapes'],['curves','Curves','المنحنيات','curves'],['transformations','Transformations','التحويلات','transformations'],['spread','Spread','التوسيع','spread'],['darts','Darts','البنسات','darts'],['symbols','Symbols','العلامات','symbols'],['attributes','Attributes','الخصائص','attributes'],['manufacturing','Manufacturing symbols','رموز الإنتاج','manufacturing'],['delete','Delete','الحذف','delete'],['align','Align part','محاذاة البارت','align'],['texts','Texts','النصوص','texts'],['dimension','Dimension','القياس','dimension']
];
export function createGroupedToolPalette(host){
 const root=$('#tool-options'),section=root.closest('.tool-section'),nav=document.createElement('div'),view=document.createElement('section'),common=document.createElement('div'),panels=new Map(),proxies=[],drawingFamilies=new Map();let active=null,activeFamily=null;
 document.body.classList.add('grafis-grouped');nav.id='tool-category-grid';nav.className='grafis-category-grid';nav.setAttribute('aria-label','مجموعات أدوات الرسم');view.id='tool-category-view';view.className='grafis-category-view';view.hidden=true;view.dir='rtl';
 view.innerHTML='<header class="grafis-category-header"><button type="button" id="tool-category-back" title="رجوع إلى الأدوات" aria-label="رجوع إلى الأدوات">'+icon('back')+'</button><strong id="tool-category-title"></strong></header>';
 function toolAutostart(group,label){const b=button('Autostart · فتح محرر '+label+' بعد الإنشاء','autostartOff',{['data-native-'+group+'-autostart']:'','aria-pressed':'false'});panels.get(group).options.append(b);
 const set=enabled=>{b.setAttribute('aria-pressed',String(enabled));b.dataset.toolGlyph=enabled?'autostartOn':'autostartOff';b.innerHTML=icon(b.dataset.toolGlyph);b.title=(enabled?'Autostart + · فتح محرر ':'Autostart − · إنشاء دون فتح محرر ')+label;b.setAttribute('aria-label',b.title);};
 try{set(localStorage.getItem('level7.tool-autostart.'+group)==='true');}catch{set(false);}
 b.addEventListener('click',()=>{if(host.context().busy)return;const enabled=b.getAttribute('aria-pressed')!=='true';set(enabled);try{localStorage.setItem('level7.tool-autostart.'+group,String(enabled));}catch{}});return b;}
 section.insertBefore(nav,root);section.insertBefore(view,root);common.id='tool-category-settings';common.hidden=true;
 function button(title,glyph,attrs={}){glyph=optionGlyph(glyph,attrs);const b=document.createElement('button');b.type='button';b.className='grafis-icon-option';b.title=title;b.setAttribute('aria-label',title);b.dataset.toolGlyph=glyph;b.innerHTML=icon(glyph);const s=document.createElement('span');s.className='grafis-sr-only';s.textContent=title;b.append(s);for(const[k,v]of Object.entries(attrs))b.setAttribute(k,v);return b;}
 for(const[id,en,ar,glyph]of groups){const b=button(`${en} · ${ar}`,glyph,{'data-tool-category':id,'aria-expanded':'false','aria-controls':'tool-category-view'});nav.append(b);b.addEventListener('click',()=>show(id));const p=document.createElement('section');p.dataset.toolCategoryPanel=id;p.hidden=true;const options=document.createElement('div');options.className='grafis-option-grid';p.append(options);view.append(p);panels.set(id,{p,options});}
 function show(id,{preserve=false}={}){if(active===id)return;showFamily(null);active=id;if(!preserve)host.cancel();nav.hidden=!!id;view.hidden=!id;for(const[key,{p}]of panels)p.hidden=key!==id;$('#tool-category-title').textContent=id?groups.find(g=>g[0]===id).slice(1,3).join(' · '):'';for(const b of nav.children)b.setAttribute('aria-expanded',String(b.dataset.toolCategory===id));common.hidden=!['points','parallel','length','shapes'].includes(id);refresh();}
 function showFamily(id){activeFamily=id;panels.get('points').options.hidden=!!id;for(const[key,{panel,entry,title}]of drawingFamilies){panel.hidden=key!==id;entry.setAttribute('aria-expanded',String(key===id));if(key===id)$('#tool-category-title').textContent=title;}if(!id&&active==='points')$('#tool-category-title').textContent=groups.find(g=>g[0]==='points').slice(1,3).join(' · ');}
 function pending(group,title,glyph){const b=button(title+' · غير متاح بعد',glyph);b.disabled=true;b.dataset.toolPending='';panels.get(group).options.append(b);return b;}
 function move(group,selector,title,glyph){const b=$(selector);if(!b)throw Error('Missing existing tool '+selector);b.classList.add('grafis-icon-option');b.dataset.toolGlyph=glyph;b.innerHTML=icon(glyph)+`<span class="grafis-sr-only">${title}</span>`;b.setAttribute('aria-label',title);b.title=title;panels.get(group).options.append(b);return b;}
 function action(group,title,glyph,name){const b=button(title,glyph,{'data-action':name});panels.get(group).options.append(b);return b;}
 function proxy(group,title,glyph,target,run){const b=button(title,glyph);panels.get(group).options.append(b);proxies.push({button:b,target});b.addEventListener('click',()=>{const t=target();if(t&&!t.disabled)run?run(t):t.click();refresh();});return b;}
 for(const[actionName,title,glyph]of[['draw-point','نقطة','point'],['draw-line','خط بنقطتين','line'],['draw-polyline','خطوط متصلة','polyline'],['draw-horizontal','خط أفقي','horizontal'],['draw-vertical','خط رأسي','vertical'],['draw-polar','طول وزاوية','angle']])move('points',`[data-action="${actionName}"]`,title,glyph);
 // These are distinct interactive Grafis constructions, never aliases of draw-line/polar.
 {const b=button('Line 10 · إنشاء خط بنقطة واتجاه','line10',{'data-native-tool':'line10','data-native-line10-create':'true'});b.disabled=true;panels.get('points').options.append(b);}
 {const b=button('Line 20 · إنشاء خط تفاعلي بنقطتين','line20',{'data-native-tool':'line20','data-native-line20-create':'true'});b.disabled=true;panels.get('points').options.append(b);}
 for(const[m,t,g]of[['line','خط بين نقطتين أصليتين مرتبطتين','line'],['chain','خطوط متصلة بين نقاط أصلية مع خيار غلق المحيط','polyline'],['fraction','نقطة مرتبطة بالأصل بنسبة','fraction'],['distance','نقطة مرتبطة بالأصل بمسافة','length'],['mid-arc','منتصف القوس بين موضعين على المسار الأصلي نفسه','distance']]){const b=button(t,g,{'data-original-point':m});b.disabled=true;panels.get('points').options.append(b);}
 {const b=button('تعديل نقطة مرتبطة بالدابل كليك أو بالاختيار','point',{'data-original-point-edit':'true'});b.disabled=true;panels.get('points').options.append(b);}

 // Grafis point/line menu order, matching the supplied reference. Existing
 // legacy variants remain in the hidden command root for reading older designs.
 {const menu=panels.get('points').options;menu.dataset.pointsMenu='';
 const place=(selector,key,col,row,glyph)=>{const command=$(selector);if(!command)throw Error('Missing point-menu command '+selector);command.dataset.pointsMenuOption=key;command.style.gridColumn=String(col);command.style.gridRow=String(row);if(glyph){command.dataset.toolGlyph=glyph;command.querySelector('svg').outerHTML=icon(glyph);}menu.append(command);return command;};
 for(const selector of ['[data-original-point="line"]','[data-original-point="chain"]','[data-original-point="mid-arc"]','[data-original-point-edit]','[data-action="draw-polar"]'])root.append($(selector));
 place('[data-action="draw-point"]','point',1,1,'pointCluster');
 place('[data-original-point="distance"]','distance',1,2,'link');
 const field=(id,value,label,row)=>{const box=document.createElement('label');box.className='grafis-points-menu-value';box.style.gridColumn='1 / 4';box.style.gridRow=String(row);const caption=document.createElement('span');caption.textContent=label;const input=document.createElement('input');input.type='number';input.step='any';input.id=id;input.value=String(value);input.setAttribute('aria-label',label);box.append(caption,input);menu.append(box);input.addEventListener('input',()=>{const panel=$('#original-point-settings');if(panel&&!panel.hidden&&panel.dataset.pointMode===(id.endsWith('distance')?'distance':'fraction')){const target=$('#original-point-value');target.value=input.value;target.dispatchEvent(new Event('input',{bubbles:true}));}});};
 field('points-menu-distance',20,'↳ mm',3);
 const fraction=place('[data-original-point="fraction"]','fraction-start',1,4,'pointFraction');
 const fromEnd=proxy('points','نقطة بنسبة من نهاية المسار','pointFractionEnd',()=>fraction,t=>{t.click();const input=$('#original-point-from-end');input.checked=true;input.dispatchEvent(new Event('input',{bubbles:true}));});fromEnd.dataset.pointsMenuOption='fraction-end';fromEnd.style.gridColumn='3';fromEnd.style.gridRow='4';
 field('points-menu-fraction',50,'%',5);
 place('[data-action="draw-line"]','line',1,6,'line');place('[data-action="draw-horizontal"]','horizontal',2,6,'horizontal');place('[data-action="draw-vertical"]','vertical',3,6,'vertical');
 place('[data-action="draw-polyline"]','free-path',1,7,'polyline');
 const perpendicular=button('Perpendicular onto a line · عمود إلى خط أصلي','perpendicular');perpendicular.dataset.nativePerpendicularCreate='';menu.append(perpendicular);perpendicular.dataset.pointsMenuOption='perpendicular';perpendicular.style.gridColumn='3';perpendicular.style.gridRow='7';
 const reset=proxy('points','Reset · تراجع عن آخر رسم','back',()=>$('#cad-toolbox [data-action="undo"]'));reset.dataset.pointsMenuOption='reset';reset.style.gridColumn='2';reset.style.gridRow='8';
 place('[data-native-line10-create]','line10',1,9);place('[data-native-line20-create]','line20',2,9);
 const automatic=toolAutostart('points','Line 10 / Line 20');automatic.dataset.pointsMenuOption='auto-end';automatic.style.gridColumn='1';automatic.style.gridRow='10';
 }
 for(const[k,t,g]of[['uniform','إزاحة المسار الأصلي بمسافة واحدة','parallel'],['ends','إزاحة طرفَي المسار الأصلي بمسافتين','split']]){const b=button(t,g,{'data-original-parallel':k});b.disabled=true;panels.get('parallel').options.append(b);}
 // Original linked length tools below replace duplicate new-line convenience commands.
 {const menu=panels.get('length').options;menu.dataset.lengthMenu='';
 for(const [mode,title,glyph,row,value]of[['to','الطول النهائي لخط أو منحنى أصلي','lengthTo',1,100],['by','زيادة أو نقصان طول خط أو منحنى أصلي','lengthBy',3,10]]){
 const b=button(title,glyph,{'data-original-length':mode});b.disabled=true;b.style.gridColumn='1';b.style.gridRow=String(row);menu.append(b);
 const box=document.createElement('label');box.className='grafis-points-menu-value';box.style.gridColumn='1 / 4';box.style.gridRow=String(row+1);
 const caption=document.createElement('span');caption.textContent=mode==='to'?'⟶':'➜';const input=document.createElement('input');input.type='number';input.step='any';input.id='length-menu-'+mode;input.value=String(value);input.setAttribute('aria-label',title+' (مم)');box.append(caption,input);menu.append(box);
 input.addEventListener('input',()=>{const panel=$('#original-length-settings');if(panel&&!panel.hidden&&panel.dataset.lengthMode===mode){const target=$('#original-length-value');target.value=input.value;target.dispatchEvent(new Event('input',{bubbles:true}));}});
 }
 // Saved construction definitions are opened by double-click, not a third native command.
 const edit=button('تحرير تعريف طول محفوظ','lengthEdit',{'data-original-length':'edit'});edit.disabled=true;root.append(edit);
 }
 {const b=button('دائرة أصلية بالمركز ونصف القطر','circle',{'data-original-shape-create':'circle10'});b.disabled=true;panels.get('shapes').options.append(b);}for(const[kind,title,glyph]of[['circle20','دائرة أصلية بالمركز ونقطة المحيط','circle'],['rectangle10','مستطيل أصلي بنقطة واتجاه','rectangle'],['rectangle20','مستطيل أصلي بنقطتي القاعدة','rectangle']]){const b=button(title,glyph,{'data-original-shape-create':kind});b.disabled=true;panels.get('shapes').options.append(b);}
 action('organisation','خصائص وقائمة البارتات','organisation','part-properties');action('organisation','إظهار جميع البارتات','plus','show-all-parts');action('organisation','عرض البارت النشط','organisation','active-part-only');
 pending('library','استدعاء قالب أساسي أو وحدة','library');pending('library','القوالب المعكوسة','transformations');

 {const menu=panels.get('insert').options,place=(b,col,row)=>{b.style.gridColumn=String(col);b.style.gridRow=String(row);menu.append(b);return b;};
 for(const[mode,title,glyph,col]of[['points','Select points · اختيار نقاط من بارت سابق','insertPoints',1],['lines','Select lines · اختيار خطوط ومنحنيات من بارت سابق','insertLines',2],['part','Select part · اختيار بارت كامل','insertPart',3]])place(button(title,glyph,{'data-original-insert-mode':mode}),col,1);
 for(const[action,title,glyph,col,row]of[['reset-single','Reset single · إلغاء آخر اختيار','back',1,2],['reset-all','Reset all · إلغاء جميع الاختيارات','back',3,2],['deposit','Without transformation · إيداع دون تحويل','insertDeposit',1,3]])place(button(title,glyph,{'data-original-insert-action':action}),col,row);
 place(button('Deposit: move · إيداع خط مستقيم مع نقل','insertDepositMove',{'data-original-insert-action':'move'}),2,3);place(button('Deposit: turn and move · إيداع خط مستقيم مع نقل ودوران','insertDepositTurn',{'data-original-insert-action':'turn'}),3,3);
 place(proxy('insert','Reset · تراجع عن آخر إيداع','back',()=>$('#cad-toolbox [data-action="undo"]')),2,4);
 place(button('Insert points · أداة إدراج نقاط تفاعلية','insertPointsInteractive',{'data-original-insert-mode':'interactive-points'}),1,5);place(button('Insert lines · أداة إدراج خطوط تفاعلية','insertLinesInteractive',{'data-original-insert-mode':'interactive-lines'}),2,5);place(button('Insert part · أداة إدراج بارت تفاعلية','insertPartInteractive',{'data-original-insert-mode':'interactive-part'}),3,5);
 }

 for(const[k,t,g]of[['search','Search contour · البحث عن المحيط','contour'],['close','Close contour · غلق المحيط','check'],['seam','Seam allowances · سماحيات لمستطيل أصلي','parallel']]){const b=button(t,g,{'data-original-assistant':k});b.disabled=true;panels.get('assistant').options.append(b);}for(const[t,g]of[['سماحيات للمحيطات العامة','parallel'],['تجهيز بارت الإنتاج','assistant']])pending('assistant',t,g);
 for(const[k,t,g]of[['direction','تحرير اتجاهَي مماس زاوية أصلية','direction'],['adjustment','تحرير نقطة التحكم لزاوية أصلية','curves']]){const b=button(t,g,{'data-original-corner-edit':k});b.disabled=true;panels.get('corners').options.append(b);}
 {const b=button('Normal corner · زاوية مباشرة لخطين مستقيمين','corners',{'data-original-direct-corner':'true'});b.disabled=true;panels.get('corners').options.append(b);}{const b=button('Corner 40 · شطف خطين مستقيمين','chamfer',{'data-original-chamfer':'true'});b.disabled=true;panels.get('corners').options.append(b);}{const b=button('Corner 40 · زاوية دائرية لخطين مستقيمين','circularCorner',{'data-original-circular-corner':'true'});b.disabled=true;panels.get('corners').options.append(b);}{const b=button('Normal corner · زاوية مباشرة لمنحنيات أصلية','computedCorner',{'data-original-computed-corner':'true'});b.disabled=true;panels.get('corners').options.append(b);}for(const[t,g]of[['زاوية دائرية للمنحنيات والاتجاهات المعكوسة','circle'],['شطف المنحنيات والاتجاهات المعكوسة','angle'],['زوايا سماحيات الخياطة','parallel']])pending('corners',t,g);
 for(const[t,g]of[['فصل بارت','spread'],['فصل زاوية','corners']])pending('split',t,g);
 {
 const place=(button,key,column,row)=>{button.dataset.linkMenuOption=key;button.style.gridColumn=String(column);button.style.gridRow=String(row);return button;},add=(attrs,title,glyph,key,column,row)=>{const b=button(title,glyph,attrs);b.disabled=true;panels.get('link').options.append(b);return place(b,key,column,row);};
 add({'data-original-join':'single'},'Link single · ضم مسارين متصلين','link','single',1,1);
 add({'data-original-join':'chain'},'Link chain · ضم سلسلة مماسية','linkChain','chain',2,1);
 add({'data-original-join-reset':'true'},'Reset link step · إلغاء آخر اختيار','back','reset-step',3,1);
 add({'data-original-join-deposit':'true'},'Deposit · إيداع الضم','check','deposit',2,2);
 place(proxy('link','Reset · تراجع','back',()=>$('#cad-toolbox [data-action="undo"]')),'reset',2,3);
 place(pending('link','Link 20 · وصلة منحنى تفاعلية','curves'),'link20',1,4);
 place(pending('link','Link 30 · وصلتان متزامنتان','link'),'link30',3,4);
 place(pending('link','بدء الأداة التفاعلية تلقائيًا','plus'),'auto-start',1,5);
 }
 for(const[k,t]of[[2,'قص أو تمديد بداية المسار إلى مرجع'],[1,'قص أو تمديد نهاية المسار إلى مرجع'],['split','فصل خط مستقيم إلى جزأين عند مرجع']]){const b=button(t,'split',{'data-original-cut':String(k)});b.disabled=true;panels.get('split').options.append(b);}
 {
 const place=(button,key,column,row)=>{button.dataset.rasterMenuOption=key;button.style.gridColumn=String(column);button.style.gridRow=String(row);return button;};
 const raster0=button('Raster 0 · تحويل خط أو منحنى أصلي إلى نقاط ارتكاز','raster0');raster0.dataset.nativeRaster0Create='';panels.get('raster').options.append(raster0);place(raster0,'fulcrums',1,1);
 const sequenceLine=button('Convert to line · تحويل تسلسل النقاط إلى مسار','rasterToLine');sequenceLine.dataset.nativeSequenceLineCreate='';panels.get('raster').options.append(sequenceLine);place(sequenceLine,'to-line',3,1);
 const copyToggle=button('+/− Copy · إبقاء الأصل عند التحويل','copyPlus');copyToggle.dataset.nativeRasterCopy='';copyToggle.setAttribute('aria-pressed','true');panels.get('raster').options.append(copyToggle);place(copyToggle,'copy-toggle',1,2);
 copyToggle.addEventListener('click',()=>{if(copyToggle.disabled)return;const keep=copyToggle.getAttribute('aria-pressed')!=='true';copyToggle.setAttribute('aria-pressed',String(keep));copyToggle.title=keep?'Copy + · إبقاء الأصل':'Copy − · تحويل الأصل بنفس رقمه';copyToggle.setAttribute('aria-label',copyToggle.title);copyToggle.dataset.toolGlyph=keep?'copyPlus':'copyMinus';copyToggle.innerHTML=icon(keep?'copyPlus':'copyMinus');});
 place(proxy('raster','Reset · تراجع','back',()=>$('#cad-toolbox [data-action="undo"]')),'reset',3,2);
 const raster20=button('Raster 20 · توزيع نقاط مرتبط بخط مستقيم','raster');raster20.dataset.nativeRaster20Create='';panels.get('raster').options.append(raster20);place(raster20,'raster20',1,3);
 place(toolAutostart('raster','Raster 20'),'auto-start',1,4);
 }
 for(const group of['length','split','symbols','attributes']){const reset=proxy(group,'Reset · تراجع','back',()=>$('#cad-toolbox [data-action="undo"]'));if(group==='length'){reset.style.gridColumn='2';reset.style.gridRow='5';}}
 for(const[o,t,g]of[['translate','نقل أو نسخ خط بإزاحة X/Y','horizontal'],['rotate','دوران خط بزاوية','angle'],['mirror','انعكاس خط أو نسخة حول محور X/Y','align'],['scale','تحجيم خط بمعاملي X/Y','spread']]){const b=button(t,g,{'data-line-transform':o});b.disabled=true;panels.get('transformations').options.append(b);}

 {const b=button('نقل ودوران بين نقاط أصلية مرتبطة','pointTurnMove',{'data-original-point-turnmove':'true'});b.disabled=true;panels.get('transformations').options.append(b);}
 {const b=button('دوران بين نقاط أصلية مرتبطة','pointRotate',{'data-original-point-rotate':'true'});b.disabled=true;panels.get('transformations').options.append(b);}
 {const b=button('انعكاس حول نقطتين أصليتين مرتبطتين','linkedReflection',{'data-original-point-mirror':'true'});b.disabled=true;panels.get('transformations').options.append(b);}
 {const b=button('نقل بين نقطتين أصليتين مرتبطتين','distance',{'data-original-point-move':'true'});b.disabled=true;panels.get('transformations').options.append(b);}
 {const b=button('انعكاس خط أصلي حول محور مستقيم مرتبط','linkedReflection',{'data-original-reflection':'true'});b.disabled=true;panels.get('transformations').options.append(b);}
 for(const[t,g]of[['توسيع بخط مرجعي','spread'],['توسيع بنقطتين','distance']])pending('spread',t,g);
 {const relocation=pending('darts','نقل البنس بنسبة','darts');relocation.style.gridColumn='2';relocation.style.gridRow='1';const shorten=button('تقصير أو إطالة البنسة الأصلية','darts',{'data-original-dart-shorten':''});shorten.disabled=true;shorten.querySelector('svg').innerHTML='<path class="ink" d="M12 10L30 49L48 10"/><path class="blue" stroke-dasharray="3 3" d="M12 10L30 35L48 10"/><path class="blue" d="M30 38V19M25 25L30 18L35 25"/>';shorten.style.gridColumn='1';shorten.style.gridRow='2';const menu=panels.get('darts').options;menu.append(shorten);const row=document.createElement('label');row.className='points-menu-number';row.style.gridColumn='1 / -1';row.style.gridRow='3';row.innerHTML='<span aria-hidden="true" style="color:#17a4df">↑</span><input id="dart-shortening-amount" type="number" step="any" value="20" min="-500" max="500" aria-label="مقدار تقصير البنسة بالملليمتر">';menu.append(row);const reset=proxy('darts','Reset · تراجع','back',()=>$('#cad-toolbox [data-action="undo"]'));reset.style.gridColumn='3';reset.style.gridRow='4';for(const[t,g,col,r]of[['Dart hood10','darts',1,6],['Pinch10','darts',1,7],['Pinch20','darts',2,7]]){const b=pending('darts',t,g);b.style.gridColumn=String(col);b.style.gridRow=String(r);}}
 for(const group of['symbols','manufacturing'])for(const[k,title]of[['create','إضافة اتجاه نسيج أصلي 100 مم'],['edit','تحرير اتجاه نسيج أصلي']]){const b=button(title,'grain',{['data-original-grain-'+k]:'true','data-original-grain-group':group});b.disabled=true;panels.get(group).options.append(b);}
 for(const[m,t,g]of[['absolute','علامة قص عند نهاية مسار بزاوية','symbols'],['reverse-tangent','علامة قص عند النهاية بعكس المماس','direction']]){const b=button(t,g,{'data-original-notch-create':m,'data-original-notch-group':'symbols'});b.disabled=true;panels.get('symbols').options.append(b);}
 {const b=button('Convert into notch · تحويل الخط إلى شق إنتاج','convertNotch',{'data-original-notch-convert':''});b.disabled=true;panels.get('symbols').options.append(b);}
 {const b=button('Change symbol · تغيير نوع العلامة','symbolType',{'data-original-symbol-type':''});b.disabled=true;panels.get('symbols').options.append(b);}
 for(const[t,g]of[['نقل علامة إلى السماحية','parallel']])pending('symbols',t,g);
 for(const[k,title,glyph]of[['intersection','علامة قص عند تقاطع مسارين','symbols'],['copy','نسخ علامة تقاطع إلى مسار السماحية','plus']]){const b=button(title,glyph,{['data-original-notch-'+k]:'true','data-original-notch-group':'symbols'});b.disabled=true;panels.get('symbols').options.append(b);}
 for(const[id,title,dash]of[[1,'متصل',''],[2,'منقط متقارب','1 2'],[3,'منقط متباعد','1 5'],[4,'متقطع','12 6'],[5,'شرطة ونقطة عريض','12 4 2 4'],[6,'شرطة ونقطة دقيق','6 3 1 3']]){const b=button('نوع الخط الأصلي: '+title,'line',{'data-original-line-style':String(id)});b.querySelector('svg').innerHTML='<path class="ink" d="M8 30H52" stroke-dasharray="'+dash+'"/>';b.disabled=true;panels.get('attributes').options.append(b);}for(const r of nativeLineRoles){const b=button(r.name,r.glyph,{'data-original-line-role':String(r.id)});const drawings={grain:'<path class="ink" d="M30 8V49M25 40L30 51L35 40"/>',split:part+'<path class="blue" d="M7 31L3 23L3 43Z"/>',annotation:'<text x="7" y="33" fill="#555" stroke="none" font-size="20">ABC</text><path class="ink" d="M7 40H52"/>',seam:part+'<path class="blue" stroke-dasharray="3 3" d="M16 14L20 17L26 14L27 24L33 29V49H15V27L18 23Z"/>','internal-cut':part+'<path class="blue" d="M16 42L42 15L46 19L20 46L14 48Z"/>',symmetry:part+'<path class="blue" stroke-dasharray="3 3" d="M40 10H49V54H40M40 7V54"/>'};b.querySelector('svg').innerHTML=drawings[r.key];b.disabled=true;panels.get('attributes').options.append(b);}for(const mark of nativePointMarks){const b=button('علامة النقطة: '+mark.name,'point',{'data-original-point-mark':String(mark.id)});b.querySelector('svg').innerHTML=mark.id===12||mark.id===13?'<circle cx="30" cy="30" r="'+(mark.id===12?7:3)+'" fill="#777" stroke="none"/>':mark.id===11?'<path class="ink" d="M19 30H41M30 19V41"/>':mark.id===14?'<path class="ink" d="M18 30H42M30 18V42M21 21L39 39M39 21L21 39"/>':'<path class="ink" d="M42 42L20 20M20 34V20H34"/>';b.disabled=true;panels.get('attributes').options.append(b);}{const b=button('تطبيق الخاصية على سلسلة متصلة','polyline',{'data-original-style-chain':'true','aria-pressed':'false'});b.disabled=true;panels.get('attributes').options.append(b);}
 {const b=button('علامة قص مستقيمة مرتبطة بنهاية مسار','split',{'data-original-notch-create':'absolute','data-original-notch-group':'manufacturing'});b.disabled=true;panels.get('manufacturing').options.append(b);}
 {const b=button('Seam 10 · خط خياطة أصلي','line',{'data-original-seam10-create':'true'});b.querySelector('svg').innerHTML='<path class="blue" d="M7 22H53" stroke-dasharray="5 4"/><path d="M7 38H53"/>';b.disabled=true;panels.get('manufacturing').options.append(b);}
 for(const family of[20,30]){const b=button('Seam '+family+' · '+(family===20?'خياطة مزدوجة':'غرزة متعرجة'),'line',{'data-original-seam10-create':String(family)});b.querySelector('svg').innerHTML=family===20?'<path class="blue" d="M7 19H53M7 39H53" stroke-dasharray="5 4"/>':'<path class="blue" d="M6 36L14 18L23 36L32 18L41 36L52 18"/>';b.disabled=true;panels.get('manufacturing').options.append(b);}
 {const b=button('Seam 40 · غرزة زخرفية','line',{'data-original-seam10-create':'40'});b.querySelector('svg').innerHTML='<path class="blue" d="M8 40H53M12 40V18M22 40V18M32 40V18M42 40V18M52 40V18"/>';b.disabled=true;panels.get('manufacturing').options.append(b);}
 {const b=button('Buttonhole 10 · عروة مرتبطة','manufacturing',{'data-original-buttonhole10-create':'true'});b.querySelector('svg').innerHTML='<path class="blue" d="M19 22H49V30H19A10 10 0 1 1 19 22Z"/>';b.disabled=true;panels.get('manufacturing').options.append(b);}
 {const b=button('Buttonhole 20 · عروة متعرجة','manufacturing',{'data-original-buttonhole20-create':'true'});b.querySelector('svg').innerHTML='<path class="blue" d="M10 20V32L15 22L20 30L25 22L30 30L35 22L40 30L45 22L50 30L54 20V32"/>';b.disabled=true;panels.get('manufacturing').options.append(b);}
 {const b=button('Buttonhole 40 · عروة مستقيمة','manufacturing',{'data-original-buttonhole40-create':'true'});b.querySelector('svg').innerHTML='<path class="blue" d="M12 15V38L15 24H48L51 15V38L48 28H15L12 38"/>';b.disabled=true;panels.get('manufacturing').options.append(b);}
 {const b=button('Seam 50 · غرزة متموجة','line',{'data-original-seam10-create':'50'});b.querySelector('svg').innerHTML='<path class="blue" d="M5 30Q10 10 18 30T32 30T46 30T58 30"/><path d="M5 43H58"/>';b.disabled=true;panels.get('manufacturing').options.append(b);}
 {const b=button('Bartack 10 · غرزة تثبيت','manufacturing',{'data-original-bartack10-create':'true'});b.querySelector('svg').innerHTML='<path class="blue" d="M10 26L14 20L18 32L22 20L26 32L30 20L34 32L38 20L42 32L46 20L50 32L54 26"/>';b.disabled=true;panels.get('manufacturing').options.append(b);}
 {const b=button('Perforation 10 · ثقوب دائرية','points',{'data-original-perforation10-create':'true'});b.querySelector('svg').innerHTML='<circle class="blue" cx="30" cy="30" r="17"/><circle class="dot" cx="30" cy="30" r="2"/>';b.disabled=true;panels.get('manufacturing').options.append(b);}
 for(const[t,g]of[['باقي أشكال العراوي والتثبيت','manufacturing'],['شقوق المحيط','split'],['ثقوب وعلامات إنتاج','points']])pending('manufacturing',t,g);
 {const b=button('حذف خطوط ومنحنيات أصلية','delete',{'data-original-path-delete':'true'});b.disabled=true;panels.get('delete').options.append(b);}{const b=button('حذف خطوط ومنحنيات داخل مستطيل بالكامل','rectangle',{'data-original-delete-rectangle':'lines'});b.disabled=true;panels.get('delete').options.append(b);}{const b=button('حذف نقاط أصلية','point',{'data-original-point-delete':'true'});b.disabled=true;panels.get('delete').options.append(b);}for(const[k,t,g]of[['points','حذف نقاط داخل مستطيل','points'],['all','حذف نقاط وخطوط داخل مستطيل','rectangle']]){const b=button(t,g,{'data-original-delete-rectangle':k});b.disabled=true;panels.get('delete').options.append(b);}for(const[attrs,title,glyph]of[[{'data-original-cutmark-delete':'true'},'حذف علامات القص الأصلية','symbols'],[{'data-original-delete-rectangle':'notches'},'حذف علامات القص داخل مستطيل','rectangle']]){const b=button(title,glyph,attrs);b.disabled=true;panels.get('delete').options.append(b);}{const b=button('حذف خطوط الخياطة داخل مستطيل','parallel',{'data-original-delete-rectangle':'seam'});b.disabled=true;panels.get('delete').options.append(b);}
 for(const[o,t,g]of[['align-vertical','محاذاة بارت N38 مستقل رأسيًا','vertical'],['align-horizontal','محاذاة بارت N38 مستقل أفقيًا','horizontal']]){const b=button(t,g,{'data-line-transform':o});b.disabled=true;panels.get('align').options.append(b);}panels.get('texts').options.append(button('إضافة نص أصلي · New text','textCreate',{'data-original-text-create':''}));panels.get('texts').options.append(button('تعديل نص أصلي · Edit text','textEdit',{'data-original-text-edit':''}));panels.get('texts').options.append(button('نص مرتبط بالبارت · Part text','organisation',{'data-original-text-linked':''}));
 const creator=button('New curve · إنشاء منحنى تفاعلي','curve10',{'data-native-curve10-create':'true'});creator.disabled=true;panels.get('curves').options.append(creator);{const b=button('Replace curve · استبدال منحنى','curveReplace',{'data-native-curve-replace':'true'});b.disabled=true;panels.get('curves').options.append(b);}toolAutostart('curves','Curve 10');{const b=button('Manipulate curve · تحوير طرف منحنى أصلي','curveManipulate',{'data-original-curve-morph':'true'});b.disabled=true;panels.get('curves').options.append(b);}
 const curvePalette=$('#curve-construction-palette');curvePalette.classList.add('docked-tool-settings');panels.get('curves').p.append(curvePalette);const hint=document.createElement('p');hint.className='grafis-tool-hint';hint.textContent='دابل كليك على المنحنى لإظهار نقاطه وخيارات تحريره.';panels.get('curves').p.prepend(hint);
 for(const[m,t,g]of[['adjustment','Adjustment · تعديل النقاط','curves'],['insert','Insert points · إضافة نقاط','plus'],['bind','Bind point · ربط نقطة','bind'],['unbind','Unbind point · فك الربط','unbind'],['delete','Delete point · حذف نقطة','delete'],['direction','Set direction · اتجاه المماس','direction'],['chord-direction','Direction start/final · اتجاه البداية والنهاية','line'],['delete-direction','Delete direction · حذف اتجاه','split']]){const b=proxy('curves',t,g,()=>curvePalette.hidden?null:curvePalette.querySelector(`[data-curve-mode="${m}"]`));b.dataset.curveOption=m;}
 const measurePalette=$('#dimension-inspection-palette');measurePalette.classList.add('docked-tool-settings');panels.get('dimension').p.append(measurePalette);
 const modeGlyph={distance:'distance',horizontal:'horizontal',vertical:'vertical',normal:'normal',length:'length',partial:'split',sum:'plus',angle:'angle',threeAngle:'threeAngle',rotation:'angle',direction:'direction',vector:'vector',origin:'origin',area:'area',contour:'contour'};
 for(const option of $('#dimension-inspection-mode').options){const b=button(option.textContent,modeGlyph[option.value],{'data-dimension-option':option.value});panels.get('dimension').options.append(b);proxies.push({button:b,target:()=>$('#dimension-inspection-command')});b.addEventListener('click',()=>{host.measure(option.value);refresh();});}
 move('dimension','#recorded-dimensions-command','الأبعاد المسجّلة وجدولها','table');$('#dimension-inspection-command').hidden=true;
 // Numeric options stay the original live fields, below the selected category.
 for(const selector of['#drawing-measure','#construction-options','.drawing-grid-option','.drawing-tip','#n38-drawing-bindings']){const e=$(selector);if(e)common.append(e);}view.append(common);
 for(const e of root.querySelectorAll('.draw-commands,.construction-point-tools'))if(!e.querySelector('button'))e.hidden=true;
 // Retain legacy command IDs in the hidden root for existing listeners; direct editing uses double-click.
 const extra=$('.original-advanced-tools');if(extra)extra.hidden=true;root.hidden=true;section.append(view);
 $('#tool-category-back').addEventListener('click',()=>activeFamily?showFamily(null):show(null));
 function refresh(){const c=host.context();for(const b of document.querySelectorAll('[data-native-raster-autostart],[data-native-curves-autostart],[data-native-points-autostart]'))b.disabled=!!c.busy;for(const{entry}of drawingFamilies.values())entry.disabled=!!c.busy;for(const b of nav.children)b.disabled=!!c.busy;$('#tool-category-back').disabled=!!c.busy;for(const p of proxies){const t=p.target(),disabled=!t||t.disabled||c.busy;if(p.button.disabled!==disabled)p.button.disabled=disabled;if(t){const pressed=t.getAttribute('aria-pressed');if(pressed!==null&&p.button.getAttribute('aria-pressed')!==pressed)p.button.setAttribute('aria-pressed',pressed);}}panels.get('curves').options.dataset.curveEditor=String(!curvePalette.hidden);for(const b of document.querySelectorAll('[data-curve-option]'))b.hidden=curvePalette.hidden;for(const b of panels.get('curves').options.querySelectorAll('[data-native-curve10-create],[data-native-curve-replace],[data-native-curves-autostart],[data-original-curve-morph],[data-tool-pending]'))b.hidden=!curvePalette.hidden;for(const b of document.querySelectorAll('[data-dimension-option]'))b.setAttribute('aria-pressed',String(!measurePalette.hidden&&b.dataset.dimensionOption===$('#dimension-inspection-mode').value));}
 new MutationObserver(()=>{if(!curvePalette.hidden&&active!=='curves')show('curves',{preserve:true});refresh();}).observe(curvePalette,{attributes:true,subtree:true,attributeFilter:['hidden','disabled','aria-pressed']});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&active&&!host.context().busy&&!e.target.matches('input,select,textarea'))activeFamily?showFamily(null):show(null);});
 refresh();return{refresh,show,active:()=>active};
}



