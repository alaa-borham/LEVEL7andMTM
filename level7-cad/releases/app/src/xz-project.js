import {previewMeasuredZConstruction} from './parametric-construction-preview.mjs';
export const XZ_PROJECT_KIND='level7-partial-xz-project';
export const XZ_SOURCE_SHA='468db71ba5aa19d73b56c6c3b15ce814eed96a33f47eb2103ff11d81248ea54c';
export function serializeXZProject(result){
 if(result.sourceSha256!==XZ_SOURCE_SHA||result.canSaveMdl!==false||result.objects.length!==49)throw Error('Invalid partial X/Z result');
 return JSON.stringify({kind:XZ_PROJECT_KIND,version:1,sourceSha256:result.sourceSha256,partId:2,sizeKey:'__HN40_0',scope:'49 points/straight objects only; not a native MDL document',xOverrides:result.xOverrides,zOverrides:result.zOverrides},null,2)+'\n';
}
export async function restoreXZProject(document,text){
 if(typeof text!=='string'||text.length>16384)throw Error('ملف التجربة غير صالح أو كبير جدًا.');
 const p=JSON.parse(text);
 if(!p||p.kind!==XZ_PROJECT_KIND||p.version!==1||p.sourceSha256!==XZ_SOURCE_SHA||p.partId!==2||p.sizeKey!=='__HN40_0')throw Error('هذا ليس ملف تجربة X/Z متوافقًا مع تصميم ALAA الأصلي.');
 for(const key of ['xOverrides','zOverrides'])if(!p[key]||typeof p[key]!=='object'||Array.isArray(p[key]))throw Error('Invalid parameter map');
 const result=await previewMeasuredZConstruction(document,{xOverrides:p.xOverrides,zOverrides:p.zOverrides});
 return result; // Geometry is recomputed; project-supplied coordinates are never trusted.
}
