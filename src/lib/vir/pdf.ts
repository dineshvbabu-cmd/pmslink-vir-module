type PdfSection = {
  title: string;
  lines: string[];
};

type PdfDocumentDefinition = {
  title: string;
  brand?: string;
  subtitleLines?: string[];
  sections: PdfSection[];
};

type TextBlock = {
  text: string;
  size: number;
  x: number;
  y: number;
  bold?: boolean;
  color?: [number, number, number];
};

type RectBlock = {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: [number, number, number];
};

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, maxLength = 84) {
  if (text.length <= maxLength) {
    return [text];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function rgb([r, g, b]: [number, number, number]) {
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function buildPageContent(blocks: Array<TextBlock | RectBlock>) {
  return blocks
    .map((block) => {
      if ("fill" in block) {
        return `${rgb(block.fill)} rg ${block.x} ${block.y} ${block.width} ${block.height} re f`;
      }

      const color = rgb(block.color ?? [0.063, 0.125, 0.2]);
      const fontRef = block.bold ? "/F2" : "/F1";
      return `BT ${color} rg ${fontRef} ${block.size} Tf 1 0 0 1 ${block.x} ${block.y} Tm (${escapePdfText(block.text)}) Tj ET`;
    })
    .join("\n");
}

function createObjects(pageContents: string[]) {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const fontObjectId = pageContents.length * 2 + 3;
  const boldFontObjectId = fontObjectId + 1;

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";

  pageContents.forEach((content, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    pageObjectIds.push(pageObjectId);

    objects[pageObjectId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId - 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  objects[fontObjectId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[boldFontObjectId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  return objects;
}

function finalizePdf(objects: string[]) {
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
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

export function buildBrandedPdfDocument({
  title,
  brand = "Atlantas Marine / PMSLink QHSE",
  subtitleLines = [],
  sections,
}: PdfDocumentDefinition) {
  const pages: string[] = [];
  const titleBlocks: Array<TextBlock | RectBlock> = [
    { x: 0, y: 668, width: 612, height: 124, fill: [0.078, 0.192, 0.341] },
    { x: 46, y: 734, text: brand, size: 11, bold: true, color: [1, 1, 1] },
    { x: 46, y: 690, text: title, size: 24, bold: true, color: [1, 1, 1] },
  ];

  subtitleLines.forEach((line, index) => {
    titleBlocks.push({
      x: 46,
      y: 650 - index * 18,
      text: line,
      size: index === 0 ? 12 : 11,
      color: [0.93, 0.96, 1],
    });
  });

  titleBlocks.push(
    { x: 46, y: 594, text: "Executive inspection pack", size: 12, bold: true, color: [0.078, 0.192, 0.341] },
    {
      x: 46,
      y: 570,
      text: "Prepared for operational review, corrective-action governance, and vessel-to-office assurance.",
      size: 11,
      color: [0.365, 0.42, 0.49],
    }
  );
  pages.push(buildPageContent(titleBlocks));

  let currentBlocks: Array<TextBlock | RectBlock> = [];
  let y = 748;
  let pageNumber = 2;

  const startPage = () => {
    currentBlocks = [
      { x: 0, y: 760, width: 612, height: 32, fill: [0.078, 0.192, 0.341] },
      { x: 40, y: 771, text: brand, size: 10, bold: true, color: [1, 1, 1] },
      { x: 506, y: 34, text: `Page ${pageNumber}`, size: 9, color: [0.4, 0.46, 0.54] },
    ];
    y = 732;
  };

  const pushPage = () => {
    pages.push(buildPageContent(currentBlocks));
    pageNumber += 1;
  };

  startPage();

  const ensureRoom = (requiredHeight: number) => {
    if (y - requiredHeight < 48) {
      pushPage();
      startPage();
    }
  };

  for (const section of sections) {
    ensureRoom(40);
    currentBlocks.push(
      { x: 40, y, text: section.title, size: 15, bold: true, color: [0.078, 0.192, 0.341] },
      { x: 40, y: y - 10, width: 532, height: 1.2, fill: [0.863, 0.902, 0.949] }
    );
    y -= 28;

    for (const rawLine of section.lines) {
      const line = rawLine.trim().length > 0 ? rawLine : " ";
      const wrapped = wrapText(line, 92);
      ensureRoom(wrapped.length * 14 + 10);

      wrapped.forEach((wrappedLine, index) => {
        currentBlocks.push({
          x: 44,
          y: y - index * 14,
          text: wrappedLine,
          size: line === " " ? 6 : 10.5,
          color: [0.13, 0.18, 0.25],
        });
      });

      y -= wrapped.length * 14 + 4;
    }

    y -= 10;
  }

  pushPage();
  return finalizePdf(createObjects(pages));
}

export function buildSimplePdfDocument(title: string, rawLines: string[]) {
  return buildBrandedPdfDocument({
    title,
    sections: [
      {
        title: "Report content",
        lines: rawLines,
      },
    ],
  });
}
