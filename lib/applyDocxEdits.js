const fs = require('node:fs/promises');
const JSZip = require('jszip');

const WORD_XML = /^word\/(document|header\d+|footer\d+)\.xml$/;

function escapeXml(value) {
  return value.replace(/[<>&'\"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
}

async function applyDocxEdits(filePath, edits) {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const applied = [];
  const rejected = [];
  for (const edit of edits) {
    if (!edit?.original || !edit?.replacement || edit.original === edit.replacement) {
      rejected.push({ ...edit, reason: 'Invalid or empty edit.' });
      continue;
    }
    const original = escapeXml(edit.original);
    const replacement = escapeXml(edit.replacement);
    let changed = false;
    for (const entry of Object.values(zip.files)) {
      if (changed || !WORD_XML.test(entry.name)) continue;
      const xml = await entry.async('string');
      if (!xml.includes(original)) continue;
      zip.file(entry.name, xml.replace(original, replacement));
      changed = true;
    }
    if (changed) applied.push(edit);
    else rejected.push({ ...edit, reason: 'Exact text was not found in one contiguous document text run.' });
  }
  return { buffer: await zip.generateAsync({ type: 'nodebuffer' }), applied, rejected };
}

module.exports = { applyDocxEdits };
