/** Verified native 117/103 line states; production roles use signed cache bytes. */
export const nativeLineRoles=[
 {id:253,name:'اتجاه النسيج',key:'grain',color:'#38c847',glyph:'arrow'},
 {id:252,name:'خط الفصل',key:'split',color:'#b5b5b5',glyph:'split'},
 {id:254,name:'خط التعليقات',key:'annotation',color:'#35bfc6',glyph:'text'},
 {id:249,name:'خط الخياطة',key:'seam',color:'#eeeeee',glyph:'seam'},
 {id:251,name:'خط القص الداخلي',key:'internal-cut',color:'#ec50be',glyph:'line'},
 {id:248,name:'محور التماثل',key:'symmetry',color:'#647cf4',glyph:'mirror'}
];
export const nativeLineStates=[1,2,3,4,5,6,248,249,250,251,252,253,254];
export const nativeLineStateFlags=state=>(((state>=128?(state|0xff00):state)*65536)+514)>>>0;
export function decodeNativeLineState(flags){if((flags&65535)!==514)return null;const high=flags>>>16,state=high>=0xff80?high&255:high;return nativeLineStates.includes(state)&&nativeLineStateFlags(state)===flags?state:null;}
export const nativePointMarks=[{id:11,name:'تقاطع',key:'cross'},{id:12,name:'نقطة كبيرة',key:'large-dot'},{id:13,name:'نقطة صغيرة',key:'small-dot'},{id:14,name:'نجمة',key:'asterisk'},{id:15,name:'سهم',key:'arrow'}];
export const nativePointMarkFlags=state=>((state-10)*65536+513)>>>0;
export function decodeNativePointMark(flags){const state=(flags>>>16)+10;return(flags&65535)===513&&nativePointMarks.some(s=>s.id===state)?state:null;}
export function pointMarkPath(mark,x,y,r){if(mark===11)return`M${x-r},${y}H${x+r}M${x},${y-r}V${y+r}`;if(mark===14)return`M${x-r},${y}H${x+r}M${x},${y-r}V${y+r}M${x-r*.7},${y-r*.7}L${x+r*.7},${y+r*.7}M${x+r*.7},${y-r*.7}L${x-r*.7},${y+r*.7}`;if(mark===15)return`M${x+r},${y+r}L${x},${y}M${x},${y+r*.8}V${y}H${x+r*.8}`;return'';}
