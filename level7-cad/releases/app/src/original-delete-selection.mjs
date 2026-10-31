/** Fully-contained native path selection; no clipping or replacement geometry. */
export function selectPathsInsideRectangle(paths,a,b){
 if(!Array.isArray(paths)||!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2||![...a,...b].every(Number.isFinite))throw Error('حدود المستطيل غير صحيحة.');
 const min=a.map((n,i)=>Math.min(n,b[i])),max=a.map((n,i)=>Math.max(n,b[i]));if(max.some((n,i)=>n-min[i]<1e-7))throw Error('حدد مستطيلًا بعرض وارتفاع موجبين.');
 const selected=paths.filter(p=>p.points.length>=1&&p.points.every(q=>q.length===2&&q.every((n,i)=>Number.isFinite(n)&&n>=min[i]&&n<=max[i]))).map(p=>p.id);
 if(selected.length>128)throw Error('المستطيل يحتوي أكثر من 128 عنصرًا؛ حدد مساحة أصغر.');return selected;
}
