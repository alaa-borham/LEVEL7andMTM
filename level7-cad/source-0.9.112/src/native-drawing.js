/**
 * Atomic direct-drawing operations over the existing, proven native core.
 * This module encodes no MDL records. It creates only absolute points and
 * referenced straight lines already accepted by native-mdl.js. Snapping,
 * screen-to-native coordinates and interactive previews belong to the UI.
 */
import {serializeMdl,getNativeSummary,decodeSupportedHistory,appendAbsolutePoint,appendReferenceLine} from './native-mdl.js';

const MAX_COORDINATE=1_000_000;
function fail(message,code='INVALID_DRAWING'){const error=new Error(message);error.name='NativeDrawingError';error.code=code;throw error;}
function ensure(value,message,code){if(!value)fail(message,code);}

function drawingContext(doc,partId){
  // Authentication uses the retained private bytes; public doc.bytes is a copy.
  serializeMdl(doc);
  ensure(Number.isInteger(partId)&&partId===1,'Direct drawing is currently supported only in native part 1.','DRAWING_READ_ONLY');
  const summary=getNativeSummary(doc),part=summary.parts.find(part=>part.partId===partId);
  ensure(summary.variant==='VA'&&summary.partCount===1&&part?.appendEligible,part?.appendReason||'This native document is outside the verified direct-drawing family.','DRAWING_READ_ONLY');
  const model=decodeSupportedHistory(doc,partId);
  ensure(model.historyComplete||part.bootstrapEligible,'Unknown native history cannot be extended by direct drawing.','DRAWING_READ_ONLY');
  return{model,partId};
}

function newCoordinate(value,label){
  ensure(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=MAX_COORDINATE,`${label} must be finite millimetres within -1000000 to 1000000.`);
  const quantized=Math.fround(value);
  ensure(Number.isFinite(quantized)&&Math.abs(quantized)<=MAX_COORDINATE,`${label} cannot be stored as a supported native coordinate.`);
  return quantized;
}

function endpoint(value,label,model){
  ensure(value&&typeof value==='object',`${label} endpoint is required.`);
  if(value.pointId!==undefined){
    ensure(Number.isInteger(value.pointId)&&value.pointId>0&&value.pointId<=0x7fffffff,`${label} requires a valid existing point ID.`);
    const point=model.points.find(point=>point.objectId===value.pointId);
    ensure(point,`${label} does not identify an existing absolute point.`);
    // An explicit ID is authoritative. Screen snap coordinates, when supplied,
    // never overwrite or substitute the authenticated point's native position.
    return{pointId:point.objectId,x:point.x,y:point.y};
  }
  return{x:newCoordinate(value.x,`${label} X`),y:newCoordinate(value.y,`${label} Y`)};
}

function appendedPoint(doc,partId,point,knownPointIds){
  const document=appendAbsolutePoint(doc,{partId,x:point.x,y:point.y}),model=decodeSupportedHistory(document,partId);
  const added=model.points.filter(point=>!knownPointIds.has(point.objectId));
  ensure(added.length===1,'The native core did not return exactly one new point.','INTERNAL_DRAWING_ERROR');
  return{document,pointId:added[0].objectId,model};
}

export function appendDrawingPoint(doc,{partId=1,x,y}={}){
  const {model}=drawingContext(doc,partId),point={x:newCoordinate(x,'X'),y:newCoordinate(y,'Y')};
  const result=appendedPoint(doc,partId,point,new Set(model.points.map(point=>point.objectId)));
  return Object.freeze({document:result.document,pointId:result.pointId});
}

export function appendDrawingSegment(doc,{partId=1,start,end}={}){
  const {model}=drawingContext(doc,partId),a=endpoint(start,'Start',model),b=endpoint(end,'End',model);
  // Both endpoints are resolved and quantized before any temporary append.
  ensure(a.x!==b.x||a.y!==b.y,'A straight line requires two different native coordinates.','ZERO_LENGTH_SEGMENT');
  let document=doc,currentModel=model;
  const pointIds=[];
  for(const point of[a,b]){
    if(point.pointId!==undefined){pointIds.push(point.pointId);continue;}
    const result=appendedPoint(document,partId,point,new Set(currentModel.points.map(point=>point.objectId)));
    document=result.document;currentModel=result.model;pointIds.push(result.pointId);
  }
  // Any core rejection leaves only private immutable intermediate documents;
  // the caller receives nothing until all point and line appends succeed.
  const lineIds=new Set(currentModel.lines.map(line=>line.objectId));
  document=appendReferenceLine(document,{partId,startPointId:pointIds[0],endPointId:pointIds[1]});
  const added=decodeSupportedHistory(document,partId).lines.filter(line=>!lineIds.has(line.objectId));
  ensure(added.length===1,'The native core did not return exactly one new line.','INTERNAL_DRAWING_ERROR');
  return Object.freeze({document,pointIds:Object.freeze(pointIds),lineId:added[0].objectId});
}
