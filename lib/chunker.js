function normalizeExtractedText(text) {
  return text
    // space between lowercase/accented → Uppercase (e.g. "saúdeCidadania")
    .replace(/([a-záéíóúàèìòùâêîôûãõäëïöü])([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÄËÏÖÜ])/g, '$1 $2')
    // remove lines that are only a page number (1-3 digits alone on a line)
    .replace(/^\s*\d{1,3}\s*$/gm, '')
    // collapse multiple spaces/tabs
    .replace(/[ \t]{2,}/g, ' ')
    // collapse 3+ newlines to double
    .replace(/\n{3,}/g, '\n\n');
}

// Returns false for chunks that are pure noise: too short or look like a table of contents
function isUsefulChunk(text) {
  const t = text.trim();
  if (t.length < 80) return false;
  // TOC lines contain runs of dots (e.g. "Capítulo 1 .......... 12")
  const dotRuns = (t.match(/\.{4,}/g) || []).length;
  if (dotRuns >= 3) return false;
  return true;
}

// Splits a single oversized string at word boundaries without losing content
function hardSplit(text, maxChars) {
  if (text.length <= maxChars * 1.5) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf(' ', maxChars);
    if (splitAt < Math.floor(maxChars / 2)) splitAt = maxChars;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export function chunkText(text, maxChars = 600) {
  text = normalizeExtractedText(text);
  const paragraphs = text.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of paragraphs) {
    if ((cur + '\n\n' + p).length > maxChars) {
      if (cur) {
        hardSplit(cur.trim(), maxChars).filter(isUsefulChunk).forEach(c => chunks.push(c));
      }
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
  }
  if (cur) {
    hardSplit(cur.trim(), maxChars).filter(isUsefulChunk).forEach(c => chunks.push(c));
  }
  return chunks;
}
