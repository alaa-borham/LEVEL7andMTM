// LEVEL7 CAD interchange. Coordinates are millimetres, with screen Y down.
// This module never executes imported data and has no runtime dependencies.
import { seamOutline, validateProject as validateGeometryProject } from './geometry.js';
const LIMIT = 1e7;
let counter = 0;
const id = prefix => `${prefix}-${Date.now().toString(36)}-${(++counter).toString(36)}`;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const num = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > LIMIT) throw new Error(`${label} must be a finite number within ±${LIMIT}.`);
  return value;
};
const str = (value, fallback = '', max = 500) => typeof value === 'string' ? value.slice(0, max) : fallback;
const xml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const f = value => Number(value.toFixed(6)).toString();
const same = (a,b) => Math.hypot(a.x-b.x,a.y-b.y) < 1e-7;
const pt = (value, label) => {
  if (!isObject(value)) throw new Error(`${label} must be a point.`);
  return {x:num(value.x, `${label}.x`),y:num(value.y, `${label}.y`)};
};

/** Validate and copy the public project schema; unknown properties are discarded. */
function validateProject(raw) {
  if (!isObject(raw)) throw new Error('Project must be a JSON object.');
  if (raw.schemaVersion !== 1) throw new Error('Unsupported project version. Expected schemaVersion 1.');
  if (raw.units !== 'mm') throw new Error('Project units must be mm.');
  if (!Array.isArray(raw.pieces) || raw.pieces.length > 5000) throw new Error('Project must contain at most 5000 pieces.');
  const measurements = {};
  const known = ['waist','hip','bust','neck','backLength','shoulder','armholeDepth','skirtLength','trouserLength','inseam','ease'];
  for (const key of known) if (raw.measurements?.[key] !== undefined) {
    measurements[key] = num(raw.measurements[key], `Measurement ${key}`);
    if(key!=='ease'&&measurements[key]<0)throw new Error(`Measurement ${key} cannot be negative.`);
  }
  const ids = new Set();
  let total = 0;
  const pieces = raw.pieces.map((p,index) => {
    if (!isObject(p) || !Array.isArray(p.points) || p.points.length < 2 || p.points.length > 50000) throw new Error(`Piece ${index+1} needs between 2 and 50000 points.`);
    total += p.points.length;
    if (total > 200000) throw new Error('Project has too many points.');
    const pieceId = str(p.id,id('piece'));
    if (ids.has(pieceId)) throw new Error(`Duplicate piece ID: ${pieceId}`);
    ids.add(pieceId);
    const pointIds = new Set();
    const points = p.points.map((q,j) => {
      const result = {...pt(q,`Piece ${index+1} point ${j+1}`),id:str(q.id,id('point'))};
      if (pointIds.has(result.id)) throw new Error(`Duplicate point ID in piece ${index+1}.`);
      pointIds.add(result.id);
      if (q.in !== undefined) result.in = pt(q.in,'Incoming handle');
      if (q.out !== undefined) result.out = pt(q.out,'Outgoing handle');
      if (q.grade !== undefined) {
        if (!isObject(q.grade)) throw new Error('Grade must contain dx and dy.');
        result.grade = {dx:num(q.grade.dx,'Grade dx'),dy:num(q.grade.dy,'Grade dy')};
      }
      return result;
    });
    const seamAllowance = num(p.seamAllowance ?? 0,'Seam allowance');
    if (seamAllowance < 0) throw new Error('Seam allowance cannot be negative.');
    const quantity = p.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('Quantity must be an integer from 1 to 999.');
    const piece = {id:pieceId,name:str(p.name,`Piece ${index+1}`),points,closed:p.closed !== false,offset:pt(p.offset ?? {x:0,y:0},'Piece offset'),seamAllowance,quantity,onFold:!!p.onFold,notches:[]};
    if (p.grain !== undefined) {
      if(!isObject(p.grain))throw new Error('Grain must have start and end points.');
      piece.grain = {a:pt(p.grain.a,'Grain start'),b:pt(p.grain.b,'Grain end')};
    }
    if (p.generator !== undefined && isObject(p.generator)) piece.generator = {type:str(p.generator.type)};
    if (p.internalLines !== undefined) {
      if (!Array.isArray(p.internalLines) || p.internalLines.length > 10000) throw new Error('Invalid internal lines.');
      piece.internalLines = p.internalLines.map(line => {
        if (!isObject(line) || !Array.isArray(line.points) || line.points.length < 2 || line.points.length > 50000) throw new Error('Internal line needs 2 or more points.');
        total += line.points.length;
        if (total > 200000) throw new Error('Project has too many points.');
        return {points:line.points.map(q=>pt(q,'Internal line point'))};
      });
    }
    if (p.notches !== undefined) {
      if (!Array.isArray(p.notches) || p.notches.length > 10000) throw new Error('Invalid notches.');
      piece.notches = p.notches.map(n => {
        if(!isObject(n))throw new Error('Invalid notch.');
        const edge = n.edge;
        const t = num(n.t,'Notch position');
        const depth = num(n.depth ?? 5,'Notch depth');
        if (!Number.isInteger(edge) || edge < 0 || edge >= points.length-(piece.closed?0:1) || t < 0 || t > 1 || depth < 0) throw new Error('Invalid notch edge, position, or depth.');
        return {edge,t,depth};
      });
    }
    return piece;
  });
  const sizeStep = num(raw.sizeStep ?? 40,'Size step');
  if(sizeStep<0)throw new Error('Size step cannot be negative.');
  if (!Array.isArray(raw.sizes ?? [0]) || (raw.sizes ?? [0]).length > 100) throw new Error('Invalid size list.');
  const sizes = (raw.sizes ?? [0]).map(v=>num(v,'Size'));
  const result={schemaVersion:1,name:str(raw.name,'Untitled'),units:'mm',measurements,sizeStep,sizes,pieces};
  if(raw.dimensions!==undefined){
    if(!Array.isArray(raw.dimensions)||raw.dimensions.length>10000)throw new Error('Invalid dimensions.');
    result.dimensions=raw.dimensions.map(d=>({a:pt(d.a,'Dimension start'),b:pt(d.b,'Dimension end')}));
  }
  if(raw.operations!==undefined){
    if(!Array.isArray(raw.operations)||raw.operations.length>200)throw new Error('Invalid construction history.');
    result.operations=raw.operations.map(op=>{
      if(!isObject(op)||typeof op.label!=='string'||typeof op.at!=='string'||!Number.isFinite(Date.parse(op.at)))throw new Error('Invalid history entry.');
      return {label:str(op.label,'',200),at:new Date(op.at).toISOString()};
    });
  }
  return validateGeometryProject(result);
}

export function parseProject(text) {
  if (typeof text !== 'string' || text.length > 30_000_000) throw new Error('Project text is missing or exceeds 30 MB.');
  let raw;
  try {raw = JSON.parse(text);} catch {throw new Error('This file is not valid project JSON.');}
  return validateProject(raw);
}

export function serializeProject(project) {return JSON.stringify(validateProject(project),null,2);}

function segment(a,b,t) {
  const u=1-t,c=a.out??a,d=b.in??b;
  return {x:u*u*u*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t*t*t*b.y};
}
function outline(piece,steps=20) {
  const points = piece.points;
  if (!points.length) return [];
  const out=[{x:points[0].x,y:points[0].y}];
  const n=points.length-(piece.closed?0:1);
  for(let i=0;i<n;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    const count=a.out||b.in?steps:1;
    for(let j=1;j<=count;j++) out.push(segment(a,b,j/count));
  }
  if(piece.closed && same(out[0],out.at(-1))) out.pop();
  return out;
}
function area(points) {return points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0)/2;}
function seam(piece) {
  return seamOutline(piece);
}
function path(piece) {
  if(!piece.points.length) return '';
  const parts=[`M${f(piece.points[0].x)} ${f(piece.points[0].y)}`];
  const n=piece.points.length-(piece.closed?0:1);
  for(let i=0;i<n;i++) {
    const a=piece.points[i],b=piece.points[(i+1)%piece.points.length];
    if(a.out||b.in) {const c=a.out??a,d=b.in??b;parts.push(`C${f(c.x)} ${f(c.y)} ${f(d.x)} ${f(d.y)} ${f(b.x)} ${f(b.y)}`);}
    else parts.push(`L${f(b.x)} ${f(b.y)}`);
  }
  if(piece.closed)parts.push('Z');
  return parts.join(' ');
}
function notchPoints(piece,n) {
  const a=piece.points[n.edge],b=piece.points[(n.edge+1)%piece.points.length];
  const p=segment(a,b,n.t),before=segment(a,b,Math.max(0,n.t-0.001)),after=segment(a,b,Math.min(1,n.t+0.001));
  const dx=after.x-before.x,dy=after.y-before.y,len=Math.hypot(dx,dy)||1;
  const direction=area(outline(piece))>=0?1:-1,depth=n.depth??5;
  const q={x:p.x-direction*dy/len*depth,y:p.y+direction*dx/len*depth};
  return [{x:p.x-dx/len*2,y:p.y-dy/len*2},q,{x:p.x+dx/len*2,y:p.y+dy/len*2}];
}
const shifted=(points,piece)=>points.map(p=>({x:p.x+(piece.offset?.x??0),y:p.y+(piece.offset?.y??0)}));
function bounds(pieces) {
  const b={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for(const piece of pieces)for(const p of shifted([...outline(piece),...seam(piece),...(piece.internalLines??[]).flatMap(l=>l.points),...(piece.grain?[piece.grain.a,piece.grain.b]:[]),...(piece.notches??[]).flatMap(n=>notchPoints(piece,n))],piece)){
    b.minX=Math.min(b.minX,p.x);b.minY=Math.min(b.minY,p.y);b.maxX=Math.max(b.maxX,p.x);b.maxY=Math.max(b.maxY,p.y);
  }
  return Number.isFinite(b.minX)?b:{minX:0,minY:0,maxX:1,maxY:1};
}
const pointString=points=>points.map(p=>`${f(p.x)},${f(p.y)}`).join(' ');

export function exportSvg(project,pieces=project.pieces) {
  const b=bounds(pieces),margin=10,width=Math.max(1,b.maxX-b.minX+2*margin),height=Math.max(1,b.maxY-b.minY+2*margin);
  const body=pieces.map(p=>{
    const sampled=outline(p),label=sampled[0]??{x:0,y:0};
    const content=[`<path class="outline" d="${path(p)}"/>`];
    const allowance=seam(p);if(allowance.length)content.push(`<polygon class="seam" points="${pointString(allowance)}"/>`);
    for(const l of p.internalLines??[])content.push(`<polyline class="internal" points="${pointString(l.points)}"/>`);
    if(p.grain)content.push(`<line class="grain" x1="${f(p.grain.a.x)}" y1="${f(p.grain.a.y)}" x2="${f(p.grain.b.x)}" y2="${f(p.grain.b.y)}" marker-start="url(#arrow)" marker-end="url(#arrow)"/>`);
    for(const n of p.notches??[])content.push(`<polyline class="notch" points="${pointString(notchPoints(p,n))}"/>`);
    content.push(`<text x="${f(label.x+3)}" y="${f(label.y+7)}">${xml(p.name)} ×${xml(p.quantity??1)}${p.onFold?' · fold':''}</text>`);
    return `<g transform="translate(${f(p.offset?.x??0)} ${f(p.offset?.y??0)})">${content.join('\n')}</g>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(width)}mm" height="${f(height)}mm" viewBox="${f(b.minX-margin)} ${f(b.minY-margin)} ${f(width)} ${f(height)}">\n<title>${xml(project.name??'LEVEL7 CAD')}</title>\n<desc>LEVEL7 CAD pattern; coordinates in millimetres. Print at 100% scale.</desc>\n<defs><marker id="arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 Z" fill="#586c5a"/></marker></defs>\n<style>.outline,.seam,.internal,.grain,.notch{fill:none;stroke-width:.35;stroke-linejoin:round}.outline{stroke:#192d26}.seam{stroke:#7a877e;stroke-dasharray:3 2}.internal{stroke:#aa7952;stroke-dasharray:2 1}.grain{stroke:#586c5a}.notch{stroke:#bf593f}text{font:4px sans-serif;fill:#354c40}</style>\n${body}\n</svg>`;
}

function polyEntity(points,closed,layer) {
  if(points.length<2)return '';
  return `0\nLWPOLYLINE\n100\nAcDbEntity\n8\n${layer}\n100\nAcDbPolyline\n90\n${points.length}\n70\n${closed?1:0}\n${points.map(p=>`10\n${f(p.x)}\n20\n${f(-p.y)}\n`).join('')}`;
}
const ascii=s=>String(s).normalize('NFKD').replace(/[^\x20-\x7E]/g,'?').replace(/[\r\n]/g,' ').slice(0,200);
export function exportDxf(project,pieces=project.pieces) {
  const layers=['OUTLINE','SEAM','INTERNAL','GRAIN','NOTCH','TEXT'];
  let body='';
  for(const p of pieces) {
    body+=polyEntity(shifted(outline(p,24),p),p.closed,'OUTLINE');
    const allowance=seam(p);if(allowance.length)body+=polyEntity(shifted(allowance,p),true,'SEAM');
    for(const line of p.internalLines??[])body+=polyEntity(shifted(line.points,p),false,'INTERNAL');
    if(p.grain)body+=polyEntity(shifted([p.grain.a,p.grain.b],p),false,'GRAIN');
    for(const n of p.notches??[])body+=polyEntity(shifted(notchPoints(p,n),p),false,'NOTCH');
    if(p.points.length){const q=shifted([p.points[0]],p)[0];body+=`0\nTEXT\n8\nTEXT\n10\n${f(q.x+3)}\n20\n${f(-q.y-7)}\n40\n4\n1\n${ascii(`${p.name} x${p.quantity??1}${p.onFold?' FOLD':''}`)}\n`;}
  }
  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n9\n$MEASUREMENT\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layers.length}\n${layers.map((name,i)=>`0\nLAYER\n2\n${name}\n70\n0\n62\n${i+1}\n6\nCONTINUOUS\n`).join('')}0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
}

function dxfPairs(text) {
  if(typeof text!=='string'||text.length>30_000_000)throw new Error('DXF file is missing or exceeds 30 MB.');
  if(text.startsWith('AutoCAD Binary DXF'))throw new Error('Binary DXF is not supported. Export ASCII DXF.');
  const lines=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');
  while(lines.length&&lines.at(-1).trim()==='')lines.pop();
  if(lines.length%2)throw new Error('Malformed ASCII DXF: group codes and values must be paired.');
  const pairs=[];
  for(let i=0;i<lines.length;i+=2){const raw=lines[i].trim(),code=Number(raw);if(!/^\d+$/.test(raw)||!Number.isInteger(code)||code<0||code>1071)throw new Error(`Invalid DXF group code on line ${i+1}.`);pairs.push([code,lines[i+1].trim()]);}
  if(!pairs.some(([c,v])=>c===0&&['SECTION','LINE','LWPOLYLINE','POLYLINE','ARC','CIRCLE','SPLINE'].includes(v)))throw new Error('No supported ASCII DXF structure found.');
  return pairs;
}
function cadPoints(groups,xCode=10,yCode=20) {
  const points=[];let current;
  for(const [code,value]of groups) {
    if(code===xCode){current={x:Number(value),y:NaN,bulge:0};points.push(current);}
    else if(code===yCode&&current)current.y=Number(value);
    else if(code===42&&current)current.bulge=Number(value);
  }
  return points;
}
function bulgePoints(points,closed) {
  const out=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i];out.push({x:a.x,y:a.y});
    if(!Number.isFinite(a.bulge??0))throw new Error('Invalid polyline bulge value.');
    if(i===points.length-1&&!closed)break;
    const b=points[(i+1)%points.length],bulge=a.bulge??0;
    if(Math.abs(bulge)<1e-9)continue;
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<1e-9)continue;
    const cx=(a.x+b.x)/2-dy*(1-bulge*bulge)/(4*bulge),cy=(a.y+b.y)/2+dx*(1-bulge*bulge)/(4*bulge);
    const angle=4*Math.atan(bulge),start=Math.atan2(a.y-cy,a.x-cx),r=Math.hypot(a.x-cx,a.y-cy),steps=Math.max(2,Math.ceil(Math.abs(angle)/(Math.PI/36)));
    for(let k=1;k<steps;k++)out.push({x:cx+r*Math.cos(start+angle*k/steps),y:cy+r*Math.sin(start+angle*k/steps)});
  }
  return out;
}
function sampleSpline(groups,warn) {
  const controls=cadPoints(groups),fits=cadPoints(groups,11,21);
  const first=code=>groups.find(p=>p[0]===code)?.[1];
  const degree=Number(first(71)??3),knots=groups.filter(p=>p[0]===40).map(p=>Number(p[1])),weights=groups.filter(p=>p[0]===41).map(p=>Number(p[1]));
  if(controls.length>1&&Number.isInteger(degree)&&degree>=1&&degree<controls.length&&degree<=10&&knots.length===controls.length+degree+1&&knots.every(Number.isFinite)&&knots.every((v,i)=>!i||v>=knots[i-1])&&(!weights.length||weights.length===controls.length&&weights.every(w=>Number.isFinite(w)&&w>0))) {
    const low=knots[degree],high=knots[controls.length];
    if(high>low){
      const points=[],steps=Math.min(1000,Math.max(32,controls.length*12));
      for(let s=0;s<=steps;s++) {
        const t=low+(high-low)*s/steps;
        let span=controls.length-1;
        if(s<steps)for(let k=degree;k<controls.length;k++)if(t>=knots[k]&&t<knots[k+1]){span=k;break;}
        const d=[];
        for(let j=0;j<=degree;j++){const i=span-degree+j,w=weights[i]??1;d.push([controls[i].x*w,controls[i].y*w,w]);}
        for(let r=1;r<=degree;r++)for(let j=degree;j>=r;j--){const i=span-degree+j,den=knots[i+degree-r+1]-knots[i],alpha=den?(t-knots[i])/den:0;d[j]=d[j].map((v,k)=>(1-alpha)*d[j-1][k]+alpha*v);}
        points.push({x:d[degree][0]/d[degree][2],y:d[degree][1]/d[degree][2]});
      }
      return points;
    }
  }
  warn('A SPLINE lacked usable knots; its fit points or control polygon were imported as an approximation.');
  return fits.length>1?fits:controls;
}

/** Import 2D ASCII DXF geometry. Curves become polylines; no block execution. */
export function importDxf(text) {
  const pairs=dxfPairs(text),warnings=[],pieces=[],warn=s=>{if(!warnings.includes(s))warnings.push(s);};
  let factor=1,totalPoints=0;
  const unitIndex=pairs.findIndex(p=>p[0]===9&&p[1]==='$INSUNITS');
  if(unitIndex>=0){const unit=Number(pairs[unitIndex+1]?.[1]),factors={0:1,1:25.4,2:304.8,4:1,5:10,6:1000,7:1e6,8:0.0000254,9:0.0254,10:914.4,13:0.001,14:100,15:10000};if(factors[unit]===undefined)throw new Error(`DXF unit code ${unit} is not supported.`);factor=factors[unit];if(unit===0)warn('DXF has unspecified units; coordinates were interpreted as millimetres.');}
  else warn('DXF has no $INSUNITS header; coordinates were interpreted as millimetres.');
  let inEntities=!pairs.some(p=>p[0]===0&&p[1]==='SECTION'),section='';
  const entities=[];
  for(let i=0;i<pairs.length;i++) {
    const [code,value]=pairs[i];
    if(code===0&&value==='SECTION'){section=pairs[i+1]?.[1];inEntities=section==='ENTITIES';continue;}
    if(code===0&&value==='ENDSEC'){inEntities=false;continue;}
    if(inEntities&&code===0&&value!=='EOF'){let j=i+1;while(j<pairs.length&&pairs[j][0]!==0)j++;entities.push({type:value,groups:pairs.slice(i+1,j)});i=j-1;}
  }
  const add=(points,closed,layer,type)=>{
    if(points.length<2){warn(`Skipped ${type} with fewer than two usable points.`);return;}
    if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x*factor)>LIMIT||Math.abs(p.y*factor)>LIMIT))throw new Error(`Invalid or out-of-range coordinates in ${type}.`);
    totalPoints+=points.length;if(totalPoints>200000)throw new Error('DXF contains more than 200000 supported points.');
    const normalized=points.map(p=>({id:id('point'),x:p.x*factor,y:-p.y*factor}));
    if(closed&&normalized.length>2&&same(normalized[0],normalized.at(-1)))normalized.pop();
    pieces.push({id:id('piece'),name:`${layer||type} ${pieces.length+1}`,points:normalized,closed,offset:{x:0,y:0},seamAllowance:0,quantity:1,onFold:false,notches:[]});
    if(pieces.length>5000)throw new Error('DXF contains more than 5000 supported entities.');
  };
  const unsupported=new Set();
  for(let i=0;i<entities.length;i++) {
    const {type,groups}=entities[i],get=(code,def)=>groups.find(p=>p[0]===code)?.[1]??def,layer=get(8,type);
    if(groups.some(([c,v])=>(c===30||c===31||c===38)&&Number(v)!==0))warn('Nonzero Z coordinates were flattened to the XY plane.');
    if(groups.some(([c,v])=>(c===210||c===220)&&Number(v)!==0 || c===230&&Number(v)!==1))warn('Non-default extrusion directions are not transformed; check imported geometry.');
    if(type==='LWPOLYLINE'){const vertices=cadPoints(groups);if(Number(get(90,vertices.length))!==vertices.length)warn('A LWPOLYLINE vertex count did not match its data.');const closed=!!(Number(get(70,0))&1);add(bulgePoints(vertices,closed),closed,layer,type);}
    else if(type==='POLYLINE') {
      if(Number(get(70,0))&80){warn('Polyface meshes and polygon meshes are not supported.');while(entities[i+1]&&entities[i+1].type!=='SEQEND')i++;if(entities[i+1]?.type==='SEQEND')i++;continue;}
      const vertices=[];while(entities[i+1]?.type==='VERTEX'){i++;vertices.push(...cadPoints(entities[i].groups));}
      if(entities[i+1]?.type==='SEQEND')i++;else warn('A classic POLYLINE had no SEQEND terminator.');
      const closed=!!(Number(get(70,0))&1);add(bulgePoints(vertices,closed),closed,layer,type);
    }
    else if(type==='LINE')add([{x:Number(get(10,NaN)),y:Number(get(20,NaN))},{x:Number(get(11,NaN)),y:Number(get(21,NaN))}],false,layer,type);
    else if(type==='ARC'||type==='CIRCLE') {
      const cx=Number(get(10,NaN)),cy=Number(get(20,NaN)),radius=Number(get(40,NaN));
      if(!Number.isFinite(radius)||radius<=0)throw new Error(`Invalid ${type} radius.`);
      const start=type==='CIRCLE'?0:(Number(get(50,NaN))%360)*Math.PI/180;let end=type==='CIRCLE'?2*Math.PI:(Number(get(51,NaN))%360)*Math.PI/180;
      if(!Number.isFinite(start)||!Number.isFinite(end))throw new Error('Invalid ARC angles.');
      while(end<=start)end+=2*Math.PI;
      const sweep=Math.min(2*Math.PI,end-start),steps=Math.max(4,Math.ceil(sweep/(Math.PI/36))),points=[];
      for(let j=0;j<=(type==='CIRCLE'?steps-1:steps);j++){const a=start+sweep*j/steps;points.push({x:cx+radius*Math.cos(a),y:cy+radius*Math.sin(a)});}
      add(points,type==='CIRCLE',layer,type);
    }
    else if(type==='SPLINE'){warn('SPLINE curves were sampled into polylines.');add(sampleSpline(groups,warn),!!(Number(get(70,0))&1),layer,type);}
    else if(!['SEQEND','VERTEX'].includes(type))unsupported.add(type);
  }
  if(unsupported.size)warn(`Skipped unsupported DXF entities: ${[...unsupported].join(', ')}. Blocks, dimensions, text, and images are not imported.`);
  if(!pieces.length)throw new Error(`DXF contains no supported 2D geometry.${warnings.length?' '+warnings.join(' '):''}`);
  if(pieces.some(p=>['SEAM','INTERNAL','GRAIN','NOTCH'].some(l=>p.name.startsWith(l+' '))))warn('DXF layers were imported as separate pieces; piece relationships and grading are not stored in DXF.');
  return {pieces,warnings};
}

export function exportHpgl(project,pieces=project.pieces) {
  const b=bounds(pieces),commands=['IN;','SP1;'];
  const draw=(points,closed)=>{if(points.length<2)return;const all=closed?[...points,points[0]]:points;const conv=p=>`${Math.round((p.x-b.minX+10)*40)},${Math.round((b.maxY-p.y+10)*40)}`;commands.push(`PU${conv(all[0])};`,`PD${all.slice(1).map(conv).join(',')};`,'PU;');};
  for(const p of pieces){draw(shifted(outline(p,24),p),p.closed);const allowance=seam(p);if(allowance.length)draw(shifted(allowance,p),true);for(const line of p.internalLines??[])draw(shifted(line.points,p),false);if(p.grain)draw(shifted([p.grain.a,p.grain.b],p),false);for(const n of p.notches??[])draw(shifted(notchPoints(p,n),p),false);}
  commands.push('PU;','SP0;');return commands.join('\n');
}

const aliases={
  waist:['waist','waistcircumference','taillenumfang','taille','taillenweite','خصر','محيطالخصر'],
  hip:['hip','hips','hipcircumference','seat','hueftumfang','huftumfang','gesaessumfang','gesassumfang','ورك','محيطالورك','ارداف','أرداف'],
  bust:['bust','chest','bustcircumference','chestcircumference','brustumfang','صدر','محيطالصدر'],
  neck:['neck','neckcircumference','halsumfang','رقبة','محيطالرقبة'],
  backLength:['backlength','napetowaistcentreback','napetowaistcenterback','rueckenlaenge','ruckenlange','طولالظهر'],
  shoulder:['shoulder','shoulderlength','shoulderwidth','schulterlaenge','schulterlange','طولالكتف','كتف'],
  armholeDepth:['armholedepth','scyedepth','armscyedepth','armlochtiefe','عمقالابط','عمقالإبط'],
  skirtLength:['skirtlength','rocklaenge','rocklange','طولالتنورة'],
  trouserLength:['trouserlength','trouserslength','pantslength','hosenlaenge','hosenlange','طولالبنطلون'],
  inseam:['inseam','insideleg','insideleglength','schrittlaenge','schrittlange','طولالساقالداخلي'],
  ease:['ease','easeallowance','zugabe','راحة','الراحة']
};
const normalizedName=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(mm|cm|millimetres?|millimeters?|centimetres?|centimeters?)\b/g,'').replace(/[^a-z0-9\u0600-\u06ff]/g,'');
function measurementKey(label){const n=normalizedName(label);return Object.keys(aliases).find(key=>aliases[key].some(a=>normalizedName(a)===n));}
function unitMultiplier(label){return /(?:\bcm\b|centimet)/i.test(label)?10:1;}
function namedUnit(...labels){const label=labels.find(value=>/(?:\b(?:mm|cm)\b|centimet|millimet)/i.test(value??''));return unitMultiplier(label??'');}
function measurementNumber(value){const n=String(value).trim().replace(/\s/g,'').replace(',','.');return /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(n)&&Number.isFinite(Number(n))&&Math.abs(Number(n))<=LIMIT?Number(n):null;}
function csvLine(line,delimiter){const cells=[];let text='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){text+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){cells.push(text.trim());text='';}else text+=c;}if(quoted)throw new Error('Unclosed quote in measurement CSV.');cells.push(text.trim());return cells;}

/** Parse named measurements only. `mapped` contains first-size values in mm. */
export function parseMeasurementTable(text) {
  if(typeof text!=='string'||!text.trim()||text.length>8_000_000)throw new Error('Measurement table is empty or exceeds 8 MB.');
  const lines=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n'),rows=[],sizes=[],mapped={},warnings=[];
  const warn=s=>{if(!warnings.includes(s))warnings.push(s);};
  const add=(name,values,multiplier=1)=>{
    const converted=values.map(v=>v===null?null:v*multiplier);rows.push({name,values:converted});const key=measurementKey(name);const first=converted.find(v=>v!==null);if(key&&first!==undefined){if(mapped[key]!==undefined)warn(`More than one row maps to ${key}; the first value was kept.`);else mapped[key]=first;}
  };
  if(/^\s*55-Werte-Optimass/m.test(text)) {
    const size=lines[0].match(/Gr\s*=\s*(\S+)/i)?.[1];sizes.push(size??'Imported');
    for(const line of lines){
      const match=line.match(/^\s*(\d{1,3})\s+(.+?)\s*\*?\[\s*([-+]?\d+(?:[.,]\d+)?)\s*\]/);
      if(!match)continue;
      let name=match[2].trim();
      // Explicit readable labels are allowed. Numeric row positions never imply a measurement.
      const named=name.match(/\s-\s(.+)$/);if(named)name=named[1].trim();
      if(!name||/^\*+$/.test(name))continue;
      const value=measurementNumber(match[3]);if(value!==null)add(name,[value]);
    }
    warn('MAS values are read in millimetres. Numbered fields without recognized readable labels are not mapped automatically.');
  } else {
    const clean=lines.map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')&&!s.startsWith('//'));
    if(!clean.length)throw new Error('No measurement rows found.');
    const counts=[';', '\t', ','].map(delimiter=>({delimiter,count:csvLine(clean[0],delimiter).length})).sort((a,b)=>b.count-a.count),delimiter=counts[0].delimiter;
    const table=clean.map(line=>csvLine(line,delimiter));
    if(table[0].length<2)throw new Error('Use CSV with a name column and one or more numeric value columns.');
    const header=table[0],firstKey=normalizedName(header[0]),namedColumns=header.slice(1).filter(measurementKey).length;
    const sizeHeader=['size','sizes','groesse','grosse','مقاس','المقاس'].includes(firstKey);
    if(sizeHeader&&namedColumns) {
      for(const record of table.slice(1))sizes.push(record[0]||`Size ${sizes.length+1}`);
      for(let col=1;col<header.length;col++){
        const values=table.slice(1).map((record,i)=>{const n=measurementNumber(record[col]??'');if(n===null)warn(`Missing or nonnumeric value at row ${i+2}, column ${col+1}.`);return n;});
        add(header[col],values,namedUnit(header[col],header[0]));
      }
    } else {
      const hasHeader=['measurement','measurements','name','measure','قياس','القياس','اسم','المقاس'].includes(firstKey)||header.slice(1).some(cell=>/^(?:value|values|size|mm|cm|قيمة)$/i.test(cell));
      const data=hasHeader?table.slice(1):table;
      const unitColumn=hasHeader?header.findIndex(h=>/^(?:unit|units|وحدة)$/i.test(h)):-1;
      const columns=[];for(let i=1;i<header.length;i++)if(i!==unitColumn)columns.push(i);
      for(const col of columns)sizes.push(hasHeader?(header[col]||`Size ${col}`):`Value ${col}`);
      for(const record of data){
        if(!record[0]){warn('An unnamed measurement row was skipped.');continue;}
        const values=columns.map(col=>{const n=measurementNumber(record[col]??'');if(n===null)warn(`Missing or nonnumeric values were left blank for ${record[0]}.`);return n;});
        const unit=unitColumn>=0?record[unitColumn]:hasHeader?header[1]:'';
        add(record[0],values,namedUnit(record[0],unit,hasHeader?header[0]:''));
      }
    }
  }
  if(!rows.length||!rows.some(row=>row.values.some(v=>v!==null)))throw new Error('No readable numeric measurements found.');
  if(!Object.keys(mapped).length)warn('No recognized named measurements were mapped; raw values remain available for manual review.');
  return {rows,sizes,mapped,warnings};
}
