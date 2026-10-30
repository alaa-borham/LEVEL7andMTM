// Research foundation. General spline mathematics is not a Grafis record decoder.
const ensure=(ok,message)=>{if(!ok)throw Error(message);};
export function spline(input){
 ensure(Array.isArray(input)&&input.length>=2&&input.length<=256,'Invalid support count');
 ensure(input.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)),'Invalid support coordinates');
 const points=input.map(p=>[...p]),n=points.length,h=[];let total=0;
 for(let i=1;i<n;i++){
  const next=Math.fround(total+Math.hypot(...points[i].map((x,k)=>x-points[i-1][k])));
  h.push(Math.fround(next-total));total=next;
 }
 ensure(h.every(n=>Number.isFinite(n)&&n>0),'Degenerate support interval');
 const second=Array.from({length:n},()=>[0,0]);
 for(let k=0;k<2;k++){
  const diag=[],rhs=[],upper=[];
  for(let i=1;i<n-1;i++){
   const lower=h[i-1],d=2*(h[i-1]+h[i]),r=6*((points[i+1][k]-points[i][k])/h[i]-(points[i][k]-points[i-1][k])/h[i-1]),j=i-1;
   diag[j]=d-(j?lower/diag[j-1]*upper[j-1]:0);rhs[j]=r-(j?lower/diag[j-1]*rhs[j-1]:0);upper[j]=h[i];
   ensure(Number.isFinite(diag[j])&&diag[j]>0&&Number.isFinite(rhs[j]),'Invalid spline system');
  }
  for(let j=n-3;j>=0;j--)second[j+1][k]=(rhs[j]-upper[j]*second[j+2][k])/diag[j];
 }
 const check=(i,t)=>ensure(Number.isInteger(i)&&i>=0&&i<n-1&&Number.isFinite(t)&&t>=0&&t<=1,'Invalid spline position');
 const at=(i,t)=>{check(i,t);return points[i].map((x,k)=>(1-t)*x+t*points[i+1][k]+(((1-t)**3-(1-t))*second[i][k]+(t**3-t)*second[i+1][k])*h[i]**2/6);};
 const tangent=(i,t)=>{check(i,t);return points[i].map((x,k)=>(points[i+1][k]-x)/h[i]+((1-3*(1-t)**2)*second[i][k]+(3*t*t-1)*second[i+1][k])*h[i]/6);};
 return{points,h,second,at,tangent};
}
