// Compose existing authenticated segment writers; never commit an intermediate
// document to the UI. Shared corners retain native point identities.
export async function appendNativePath(document, {partId, vertices, closed = false}, appendSegment) {
  if (!Array.isArray(vertices) || vertices.length < 2 || vertices.length > 32 || (closed && vertices.length < 3)) throw Error('A path requires 2–32 vertices (at least 3 when closed).');
  const inputs = vertices.map(p => {
    if (!p || typeof p !== 'object') throw Error('Missing path vertex.');
    return p.pointId !== undefined ? {pointId:p.pointId} : {x: typeof p.x === 'object' ? {...p.x} : p.x, y: typeof p.y === 'object' ? {...p.y} : p.y};
  });
  const pointIds = [], lineIds = [];
  let current = document;
  for (let i = 0; i < inputs.length - 1 + Number(closed); i++) {
    const start = i ? {pointId:pointIds[i]} : inputs[0];
    const end = i + 1 === inputs.length ? {pointId:pointIds[0]} : inputs[i+1];
    const result = await appendSegment(current, {partId, start, end});
    current = result.document;
    pointIds[i] = result.pointIds[0];
    if (i + 1 < inputs.length) pointIds[i+1] = result.pointIds[1];
    lineIds.push(result.lineId);
  }
  return {document:current, pointIds, lineIds, lineId:lineIds.at(-1)};
}

export function rectangleVertices(a, b) {
  if (Math.fround(a.x) === Math.fround(b.x) || Math.fround(a.y) === Math.fround(b.y)) throw Error('المستطيل يحتاج عرضًا وارتفاعًا أكبر من صفر.');
  // Preserve optional X/Z operands on the two additional corners too.
  return [a, {x:b.x,y:a.y,xOperand:b.xOperand,yOperand:a.yOperand}, b, {x:a.x,y:b.y,xOperand:a.xOperand,yOperand:b.yOperand}];
}
