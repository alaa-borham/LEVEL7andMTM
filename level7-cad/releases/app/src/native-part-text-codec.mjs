const need=(x,m)=>{if(!x)throw Error(m);};
export const PART_NAME_TEXT_FIELD='{F 8..................}',PART_NUMBER_TEXT_FIELD='{F 7}';
export function resolvePartText(template,{partId,name}={}){
 need(Number.isInteger(partId)&&partId>=1&&partId<=999,'Unsupported native part text number');
 need(typeof template==='string'&&template.length>0&&template.length<=512,'Invalid native text template');
 need(!template.includes(PART_NAME_TEXT_FIELD)||typeof name==='string'&&name.length<=23&&/^[A-Za-z0-9 .,_+\-]*$/.test(name),'Unsupported native part text name');
 const plain=template.replaceAll(PART_NAME_TEXT_FIELD,'').replaceAll(PART_NUMBER_TEXT_FIELD,'');need(/^[A-Za-z0-9 .,_+\-]*$/.test(plain),'Unknown native text field or encoding');
 const text=template.replaceAll(PART_NAME_TEXT_FIELD,(name??'').padEnd(PART_NAME_TEXT_FIELD.length,' ')).replaceAll(PART_NUMBER_TEXT_FIELD,String(partId).padStart(3,'0').padEnd(PART_NUMBER_TEXT_FIELD.length,' '));need(text.length===template.length,'Native field width differs');return text;
}
