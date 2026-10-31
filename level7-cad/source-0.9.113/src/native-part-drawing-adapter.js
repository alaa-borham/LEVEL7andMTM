import {inspectOwnedParts} from './native-owned-parts.js';
import {inspectPartDrawing,appendPartPoint,appendPartSegment,updatePartPoint,appendPartLinkedPoint,resizePartLine} from './native-part-drawing.js';
export async function inspectAlaa2Append(doc,options){if((await inspectOwnedParts(doc)).eligible)return{eligible:false,reason:'Owned N38 uses its parametric drawing engine.'};return inspectPartDrawing(doc,options);}
export const appendAlaa2Point=appendPartPoint,appendAlaa2Segment=appendPartSegment,updateAlaa2Point=updatePartPoint;

export const appendAlaa2LinkedPoint=appendPartLinkedPoint;
export const resizeAlaa2Line=resizePartLine;
