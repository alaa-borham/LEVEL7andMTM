// Read-only metadata from locally verified GRAFIS V6/VA containers and MAS charts.
// These offsets describe measured fixtures, not a complete native-file schema.
import { parseMdl } from './native-mdl.js';

const CP850 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';
const BASE_SIZE_SOURCE = 'https://help12.grafis.de/en-gb/Content/Die%20Konstruktionsparameter%20X-Werte/Interaktive%20Konstruktionen%20gr%C3%B6%C3%9Fenabh%C3%A4ngig%20einstellen.htm';
const trimField = value => value.replace(/[\0 ]+$/g, '').replace(/^ +/, '');
const idKey = block => block.id.join('.');

function bytesOf(input) {
  // Normalize subclasses too: Node Buffer.slice() aliases memory while
  // Uint8Array.slice() copies it. Returned raw fields must be independent.
  if (input instanceof Uint8Array) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Expected native file bytes as Uint8Array or ArrayBuffer.');
}

function latin1(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return result;
}

function chooseEncoding(bytes, requested = 'auto') {
  const name = requested.toLowerCase();
  if (!['auto', 'latin1', 'windows-1252', 'ibm850', 'cp850', 'utf-8'].includes(name)) throw new Error('Unsupported chart text encoding.');
  if (name !== 'auto') return { name: name === 'cp850' ? 'ibm850' : name, inferred: false };
  // Legacy installed Müller/Sohn charts contain DOS byte 0x81 for ü; newer
  // BASIS_A/D charts contain Windows byte 0xfc. Keep original bytes in all cases.
  const dosCandidate = bytes.some(byte => byte >= 0x80 && byte <= 0x9f);
  return { name: dosCandidate ? 'ibm850' : 'windows-1252', inferred: true };
}

function decode(bytes, encoding) {
  if (encoding === 'latin1') return latin1(bytes);
  if (encoding === 'ibm850') {
    let text = '';
    for (const byte of bytes) text += byte < 128 ? String.fromCharCode(byte) : CP850[byte - 128];
    return text;
  }
  return new TextDecoder(encoding, { fatal: encoding === 'utf-8' }).decode(bytes);
}

function boundedPayload(doc, block) {
  const start = block.payloadOffset, length = block.payloadSize;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > doc.bytes.length) throw new Error('Metadata block lies outside the native document.');
  return doc.bytes.subarray(start, start + length);
}

function uniqueBlock(doc, key, unknowns) {
  const found = doc.blocks.filter(block => idKey(block) === key);
  if (found.length > 1) { unknowns.push(`Duplicate metadata block ${key}; its meaning is not resolved.`); return null; }
  return found[0] || null;
}

function readableField(bytes, encoding) {
  const value = trimField(decode(bytes, encoding));
  return /[\x00-\x1f\x7f]/.test(value) ? null : value;
}

/** Read metadata only. No unknown field is assigned a guessed semantic role. */
export function readNativeMetadata(input, options = {}) {
  const doc = input && input.bytes && Array.isArray(input.blocks) ? input : parseMdl(bytesOf(input));
  const bytes = bytesOf(doc.bytes);
  const checkedDoc = { ...doc, bytes };
  const unknowns = [], warnings = [], sizes = [], partsById = new Map();
  // Binary payload bytes cannot identify a text codepage. Default only the text
  // presentation to Windows-1252; callers may explicitly select DOS IBM850.
  const enc = options.encoding && options.encoding !== 'auto' ? chooseEncoding(new Uint8Array(), options.encoding) : { name: 'windows-1252', inferred: true };
  let measurementSystem = null, referenceSize = null;
  const systemBlock = uniqueBlock(checkedDoc, '2.4.0.0', unknowns);
  if (systemBlock) {
    const data = boundedPayload(checkedDoc, systemBlock);
    if (data.length >= 32 && data[0] === 4 && data[1] === 0 && data[2] === 3) {
      let code = null;
      if (data.length === 48 && data[32] === 2 && data[33] === 0 && data[34] === 6 && data[35] === 0) code = readableField(data.subarray(36, 48), enc.name);
      else if (data.length !== 32) unknowns.push('Additional measurement-system record layout is not decoded.');
      measurementSystem = { title: readableField(data.subarray(4, 32), enc.name), code, declaredMeasurementCount: data[3], source: 'block 2.4.0.0', rawBytes: data.slice() };
      if (!code) unknowns.push('Measurement-system directory code is absent or not decoded; the display title is not a directory identifier.');
    } else unknowns.push('Measurement-system metadata uses an unsupported record layout.');
  } else unknowns.push('Measurement-system metadata block is unavailable.');

  const sizeBlock = uniqueBlock(checkedDoc, '2.2.0.0', unknowns);
  if (sizeBlock) {
    const data = boundedPayload(checkedDoc, sizeBlock);
    if (data.length === 99 * 32) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      for (let row = 0; row < 99; row++) {
        const offset = row * 32;
        if (data[offset] !== 4 || data[offset + 1] !== 0 || data[offset + 2] !== 2 || view.getUint16(offset + 4, true) !== row + 1) {
          unknowns.push(`Unsupported size-table record at position ${row + 1}; it was not interpreted.`);
          continue;
        }
        const name = readableField(data.subarray(offset + 7, offset + 15), enc.name);
        if (name === null) { unknowns.push(`Size-table name ${row + 1} contains an unsupported text sequence.`); continue; }
        if (name) sizes.push({ index: row + 1, name, chartCode: name, rawFlags: { byte3: data[offset + 3], byte6: data[offset + 6], byte15: data[offset + 15] }, rawReferenceField: data.slice(offset + 16, offset + 24), sourceOffset: sizeBlock.payloadOffset + offset, rawBytes: data.slice(offset, offset + 32) });
      }
      const base = sizes.find(size => size.index === 1);
      if (base) referenceSize = { index: base.index, name: base.name, role: 'base-size-table-row', evidence: 'Size-table position 01 is the base size in the V12 manual; X-reference sizes are separate.', documentation: BASE_SIZE_SOURCE };
      else unknowns.push('No readable size at position 01; no base size was inferred from a later row.');
      unknowns.push('Size-table flag semantics, activated/graded state and per-size X/alternative references are not decoded.');
    } else unknowns.push('Size-table payload is not the verified 99 × 32-byte layout.');
  } else unknowns.push('Size-table metadata block is unavailable.');

  // The 152-byte part header contains a 23-byte name at +101. Cross-check it
  // against #TLIST rather than treating nearby integer pointers as parent IDs.
  for (const block of doc.blocks.filter(block => block.id[0] === 3 && block.id[2] === 1 && block.id[3] === 0)) {
    const data = boundedPayload(checkedDoc, block), id = block.id[1];
    if (partsById.has(id)) { unknowns.push(`Repeated part header ${id} is not resolved.`); continue; }
    const name = data.length === 152 ? readableField(data.subarray(101, 124), enc.name) : null;
    if (data.length !== 152) unknowns.push(`Part ${id} header differs from the verified 152-byte layout.`);
    partsById.set(id, { id, name, parentRefs: null, persistentId: null, nameSource: name !== null ? 'part header +101/23' : null, rawNameBytes: data.length === 152 ? data.slice(101, 124) : null });
  }
  const infoBlock = uniqueBlock(checkedDoc, '2.1.0.0', unknowns);
  if (infoBlock) {
    const data = boundedPayload(checkedDoc, infoBlock), text = decode(data, enc.name).replace(/\0+$/, '');
    let section = '';
    for (const line of text.split(/\r\n|\n|\r/)) {
      if (line.startsWith('#')) { section = line.trim(); continue; }
      if (section !== '#TLIST' || !/^\d{3}$/.test(line.slice(3, 6)) || line.length < 32) continue;
      const id = Number(line.slice(3, 6)), name = trimField(line.slice(9, 32));
      if (/[\x00-\x1f\x7f]/.test(name)) { unknowns.push(`Part ${id} summary name contains unsupported text.`); continue; }
      const part = partsById.get(id) || { id, name: null, parentRefs: null, persistentId: null, nameSource: null, rawNameBytes: null };
      if (part.name !== null && part.name !== name) warnings.push(`Part ${id} has different #TLIST and binary-header names; both were retained.`);
      part.summaryName = name;
      part.summaryRawLine = line;
      part.persistentId = /\bID=([0-9A-Fa-f]{16})\b/.exec(line)?.[1] || null;
      if (part.name === null) { part.name = name; part.nameSource = '#TLIST columns 9..31'; }
      partsById.set(id, part);
    }
  }
  const parts = [...partsById.values()].sort((a, b) => a.id - b.id);
  unknowns.push('Part parent/dependency references and embedded body-measurement values are not decoded.');
  return { measurementSystem, referenceSize, sizes, parts, encoding: enc.name, encodingInferred: enc.inferred, unknowns, warnings };
}

function numericField(raw) {
  const text = raw.trim();
  if (!text) return null;
  return /^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text) ? Number(text.replace(',', '.')) : null;
}

function splitOriginalLines(bytes) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 10 && bytes[i] !== 13) continue;
    const end = i;
    if (bytes[i] === 13 && bytes[i + 1] === 10) i++;
    lines.push({ start, bytes: bytes.subarray(start, end), ending: bytes.subarray(end, i + 1) });
    start = i + 1;
  }
  if (start < bytes.length) lines.push({ start, bytes: bytes.subarray(start), ending: bytes.subarray(bytes.length) });
  return lines;
}

/**
 * Parse fixed byte columns, never whitespace-split a measurement label.
 * Observed MAS layouts use 70-byte lines: row number [0,2), label [4,42),
 * marker [42], '[' [43], numeric value [44,48), ']' [48]. 55-value BASIS_A
 * charts include additional own-measurement rows through 70; retain all rows.
 * Native lengths are millimetres. Angles and arbitrary user fields are not
 * blindly labelled millimetres; entry.unit stays null until semantics are known.
 */
export function parseMasChart(input, options = {}) {
  const bytes = bytesOf(input), enc = chooseEncoding(bytes, options.encoding || 'auto');
  const originalLines = splitOriginalLines(bytes), lines = originalLines.map(line => decode(line.bytes, enc.name));
  const header = lines[0] || '', headerBytes = originalLines[0]?.bytes;
  if (!headerBytes || headerBytes.length < 49 || latin1(headerBytes.subarray(33, 36)) !== 'Gr=') throw new Error('Not a supported fixed-width GRAFIS MAS chart.');
  const warnings = [], unknowns = ['MAS row numbers are preserved chart positions; no universal G-index/name mapping is assumed.', 'Per-entry units and the optional Individual/Difference columns are not semantically decoded.'];
  if (enc.inferred && bytes.some(byte => byte >= 128)) warnings.push(`Text encoding ${enc.name} was inferred; original bytes are retained and options.encoding can override it.`);
  const entries = [], seen = new Set();
  for (let i = 1; i < originalLines.length; i++) {
    const original = originalLines[i], raw = latin1(original.bytes), match = /^\s*(\d{1,3})\s/.exec(raw);
    if (!match) continue;
    const index = Number(match[1]);
    if (original.bytes.length < 49 || raw[43] !== '[' || raw[48] !== ']') { warnings.push(`Measurement row at line ${i + 1} does not match the verified fixed columns and was not interpreted.`); continue; }
    const valueText = raw.slice(44, 48), value = numericField(valueText);
    if (value === null) warnings.push(`Measurement ${index} has an unsupported or blank numeric field; its raw value was retained.`);
    if (seen.has(index)) warnings.push(`Duplicate measurement row number ${index}; original order was retained.`);
    seen.add(index);
    const label = trimField(decode(original.bytes.subarray(4, 42), enc.name));
    entries.push({ index, label, standardValue: value, value, unit: null, marker: raw[42], rawValueField: valueText, rawLabel: decode(original.bytes.subarray(4, 42), enc.name), rawTail: decode(original.bytes.subarray(49), enc.name), rawLine: lines[i], rawBytes: original.bytes.slice(), lineEnding: latin1(original.ending), lineNumber: i + 1, byteOffset: original.start });
  }
  if (!entries.length) throw new Error('No supported measurement rows found in the MAS chart.');
  const title = trimField(decode(headerBytes.subarray(0, 33), enc.name));
  const declaredMeasurementCount = /^\s*(\d+)-/.exec(title)?.[1];
  if (entries.some((entry, i) => entry.index !== i + 1)) warnings.push('Measurement row numbers are not a sequential run beginning at 1; no rows were reordered or filled.');
  if (originalLines.some(line => line.bytes.length !== 70)) warnings.push('Some lines differ from the observed 70-byte width; original line contents were retained.');
  return { format: 'GRAFIS-MAS-fixed-width', title, declaredMeasurementCount: declaredMeasurementCount ? Number(declaredMeasurementCount) : null, sizeReference: trimField(decode(headerBytes.subarray(36, 43), enc.name)), chartCode: trimField(decode(headerBytes.subarray(46, 54), enc.name)), dateText: trimField(decode(headerBytes.subarray(57, 65), enc.name)), linearUnit: 'mm', entries, encoding: enc.name, encodingInferred: enc.inferred, rawBytes: bytes.slice(), rawText: decode(bytes, enc.name), header, unknowns, warnings };
}

export const readMasChart = parseMasChart;
