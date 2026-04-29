// Fix PDF extraction artifacts: "SaúdeCidadania" → "Saúde Cidadania", "cidademelhor" stays as-is
function normalizeExtractedText(text) {
  return text
    // Insert space between a lowercase/accented char and an uppercase one
    .replace(/([a-záéíóúàèìòùâêîôûãõäëïöü])([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÄËÏÖÜ])/g, '$1 $2')
    // Collapse multiple spaces/newlines into single space within a line
    .replace(/[ \t]{2,}/g, ' ');
}

export function chunkText(text, maxChars = 800) {
  text = normalizeExtractedText(text);
  const paragraphs = text.split(/\n{2,}|\r\n{2,}/g).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of paragraphs) {
    if ((cur + '\n\n' + p).length > maxChars) {
      if (cur) chunks.push(cur.trim());
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
  }
  if (cur) chunks.push(cur.trim());
  return chunks;
}
