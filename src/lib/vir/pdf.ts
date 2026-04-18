function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function chunkLines(lines: string[], linesPerPage = 42) {
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }

  return pages.length > 0 ? pages : [["No content"]];
}

function wrapLine(line: string, maxLength = 92) {
  if (line.length <= maxLength) {
    return [line];
  }

  const words = line.split(/\s+/);
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      wrapped.push(current);
    }

    current = word;
  }

  if (current) {
    wrapped.push(current);
  }

  return wrapped;
}

export function buildSimplePdfDocument(title: string, rawLines: string[]) {
  const wrappedLines = [title, "", ...rawLines.flatMap((line) => wrapLine(line))];
  const pageLines = chunkLines(wrappedLines);

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  const fontObjectId = pageLines.length * 2 + 3;

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";

  for (let index = 0; index < pageLines.length; index += 1) {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);
    contentObjectIds.push(contentObjectId);

    const textCommands = pageLines[index]
      .map((line, lineIndex) => {
        const y = 792 - 48 - lineIndex * 16;
        return `BT /F1 ${lineIndex === 0 ? 16 : 11} Tf 48 ${y} Td (${escapePdfText(line)}) Tj ET`;
      })
      .join("\n");

    objects[pageObjectId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId - 1] = `<< /Length ${textCommands.length} >>\nstream\n${textCommands}\nendstream`;
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  objects[fontObjectId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((objectBody, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objectBody}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}
