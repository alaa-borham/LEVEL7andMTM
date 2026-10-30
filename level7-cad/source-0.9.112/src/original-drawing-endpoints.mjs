import{appendOriginalCoordinatePoint}from'./original-coordinate-point-create.mjs';
/** Materialize parameter-bound picks as native points, never frozen XY values. */
export function materializeDrawingEndpoints(document,options){
 const endpoints={};for(const key of['origin','final']){const pick=options[key];if(!pick||!pick.xOperand&&!pick.yOperand){if(pick)endpoints[key]=pick;continue;}
 if(Object.keys(pick).some(k=>!['x','y','xOperand','yOperand'].includes(k)))throw Error('مرجع طرف مختلط غير مدعوم.');
 const result=appendOriginalCoordinatePoint(document,{partId:options.partId,sizeKey:options.sizeKey,x:pick.xOperand??pick.x,y:pick.yOperand??pick.y});document=result.document;endpoints[key]={pointId:result.pointId};
 }return{document,endpoints};
}
