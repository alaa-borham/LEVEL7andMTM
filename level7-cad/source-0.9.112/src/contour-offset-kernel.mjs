/** Bounded four-object closed contour offset, preserving each source direction. */
import {constructionPoints,applyParallelPath} from './parallel-path-kernel.mjs';
import {connectComputedEnds} from './straight-transform-kernel.mjs';
import {intersectConstructionPaths} from './construction-intersections.mjs';
const ensure=(ok,m)=>{if(!ok)throw Error(m);},dist=(a,b)=>Math.hypot(...a.map((x,k)=>x-b[k]));
export function replayContourOffset({records,record,objects}){
 ensure(records?.length===2&&records.every(b=>b instanceof Uint8Array&&b.length===32),'Missing contour offset group');const[a,b]=records.map(b=>new DataView(b.buffer,b.byteOffset,32));
 ensure(a.getUint16(0,true)===104&&a.getUint16(2,true)===203&&a.getUint16(4,true)===4&&a.getUint16(6,true)===65535&&a.getUint16(8,true)===65535&&a.getUint16(10,true)===0&&records[0].subarray(16).every(x=>x===0),'Unsupported contour offset header');
 ensure(b.getUint16(0,true)===204&&b.getUint16(2,true)===303&&b.getUint32(20,true)===0&&b.getUint32(24,true)===65535&&b.getUint32(28,true)===0,'Unsupported contour offset continuation');
 const ids=[0,1,2,3].map(i=>b.getUint16(4+i*2,true)),targets=[0,1,2,3].map(i=>b.getUint16(12+i*2,true)),distance=a.getFloat32(12,true);
 ensure(new Set(ids).size===4&&new Set(targets).size===4&&targets.every(id=>id>0&&!objects.some(o=>o.id===id))&&Number.isFinite(distance)&&distance>0&&distance<=10000,'Invalid contour offset identity/distance');
 const sources=ids.map(id=>objects.find(o=>o.id===id));ensure(sources.every(Boolean),'Missing contour source');const paths=sources.map(constructionPoints),connections=[];
 for(let i=0;i<4;i++){const p=paths[i],q=paths[(i+1)%4],hits=[];for(const x of[0,1])for(const y of[0,1])if(dist(p[x?p.length-1:0],q[y?q.length-1:0])<.0002)hits.push([x,y]);ensure(hits.length===1,'Contour must have one shared neighboring endpoint');connections.push(hits[0]);}
 const oriented=paths.map((p,i)=>{const end=connections[i][0],start=connections[(i+3)%4][1];ensure(start!==end,'Contour traversal reverses at a vertex');return end===1?p:[...p].reverse();}),polygon=oriented.flatMap(p=>p.slice(0,-1));
 ensure(polygon.length<=1600,'Contour segment bound');
 for(let i=0;i<polygon.length;i++)for(let j=i+1;j<polygon.length;j++){if(j===i+1||i===0&&j===polygon.length-1)continue;ensure(!intersectConstructionPaths([polygon[i],polygon[(i+1)%polygon.length]],[polygon[j],polygon[(j+1)%polygon.length]]).length,'Self-intersecting contour');}
 const area=polygon.reduce((s,p,i)=>{const q=polygon[(i+1)%polygon.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;ensure(Number.isFinite(area)&&Math.abs(area)>1e-4,'Degenerate contour');
 const results=sources.map((source,i)=>applyParallelPath({source,id:targets[i],record:record+1,start:distance,end:distance,retainConstructionPrecision:true,side:Math.sign(area)*(connections[i][0]===1?1:-1)}));
 for(let i=0;i<4;i++){const j=(i+1)%4,[p,q]=connectComputedEnds({a:results[i],b:results[j],ends:connections[i],record:record+1,allowReversedTerminal:true});results[i]=p;results[j]=q;}
 return results.map(o=>({...o,operation:'contour-offset',dependencies:[...ids]}));
}
