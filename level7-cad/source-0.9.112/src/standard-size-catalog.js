// Standard chart identities observed in the installed 50-Werte-OPTIMASS catalog.
// No individual-chart names, filename-digit guesses or dependency on Grafis at runtime.
import {readNativeMetadata} from './native-measurements.js';
const groups=[{"id":0,"sizes":[["___N38_0",38]]},{"id":1400,"sizes":[["__NB34_0",34],["__NB38_0",38],["__NB40_0",40],["__NB42_0",42],["__NB44_0",44],["__NB46_0",46],["__NB48_0",48],["__NB50_0",50],["__NB52_0",52],["__NB54_0",54],["__NB56_0",56],["__NB58_0",58],["__NB60_0",60]]},{"id":1800,"sizes":[["__HN40_0",40],["__HN42_0",42],["__HN44_0",44],["__HN46_0",46],["__HN48_0",48],["__HN50_0",50],["__HN52_0",52],["__HN54_0",54],["__HN56_0",56],["__HN58_0",58],["__HN60_0",60],["__HN62_0",62],["__HN64_0",64],["__HN66_0",66],["__HN68_0",68],["__HN70_0",70],["__HN72_0",72],["__HN74_0",74],["__HN76_0",76],["__HN78_0",78]]},{"id":2400,"sizes":[["_KO176_0",176]]}];
const lookup=new Map(groups.flatMap(g=>g.sizes.map(([key,position])=>[key,Object.freeze({key,position,group:g.id})])));
export function standardSizeContext(document){
 const m=readNativeMetadata(document),s=m.measurementSystem;
 if(s?.code?.toLowerCase()!=='basis_d'||s?.title!=='50-Werte-OPTIMASS'||s?.declaredMeasurementCount!==50)return null;
 const redirected=new Set(m.sizes.filter(s=>s.rawReferenceField.some(b=>b!==32)).map(s=>s.name));
 return {classify:key=>redirected.has(key)?null:lookup.get(key)??null,keysFor:key=>{const target=lookup.get(key);return target?groups.find(g=>g.id===target.group).sizes.map(([k])=>k):[];},sizes:m.sizes.map(s=>s.name)};
}
