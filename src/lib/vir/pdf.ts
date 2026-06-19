export type PdfEmbeddedPhoto = {
  data: Buffer;
  width: number;
  height: number;
  components: number; // 1 = grayscale, 3 = RGB
  label: string;
  caption: string;
};

type PdfSection = {
  title: string;
  lines: string[];
  photos?: PdfEmbeddedPhoto[];
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

type ImageBlock = {
  xobjName: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Block = TextBlock | RectBlock | ImageBlock;

type RenderedPage = {
  contentStr: string;
  imageIndices: number[];
};

type PdfRawObject =
  | { kind: "text"; body: string }
  | { kind: "stream"; dictHeader: string; streamData: Buffer };

export function readJpegInfo(
  data: Buffer
): { width: number; height: number; components: number } | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let i = 2;
  while (i < data.length - 1) {
    if (data[i] !== 0xff) return null;
    while (i < data.length && data[i] === 0xff) i++;
    if (i >= data.length) return null;
    const marker = data[i++];
    if (marker === 0xd9) return null;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (i + 1 >= data.length) return null;
    const segLen = data.readUInt16BE(i);
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (segLen < 11 || i + 8 >= data.length) return null;
      return {
        height: data.readUInt16BE(i + 3),
        width: data.readUInt16BE(i + 5),
        components: data[i + 7],
      };
    }
    i += segLen;
  }
  return null;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, maxLength = 84) {
  if (text.length <= maxLength) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLength) { current = next; continue; }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function rgb([r, g, b]: [number, number, number]) {
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function scaleToFit(srcW: number, srcH: number, maxW: number, maxH: number) {
  if (srcW <= 0 || srcH <= 0) return { w: maxW, h: maxH };
  const scale = Math.min(maxW / srcW, maxH / srcH);
  return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) };
}

function buildPageContent(blocks: Block[]) {
  return blocks
    .map((block) => {
      if ("fill" in block) {
        return `${rgb(block.fill)} rg ${block.x} ${block.y} ${block.width} ${block.height} re f`;
      }
      if ("xobjName" in block) {
        return `q ${block.w} 0 0 ${block.h} ${block.x} ${block.y} cm ${block.xobjName} Do Q`;
      }
      const color = rgb(block.color ?? [0.063, 0.125, 0.2]);
      const fontRef = block.bold ? "/F2" : "/F1";
      return `BT ${color} rg ${fontRef} ${block.size} Tf 1 0 0 1 ${block.x} ${block.y} Tm (${escapePdfText(block.text)}) Tj ET`;
    })
    .join("\n");
}

function createRawObjects(renderedPages: RenderedPage[], allPhotos: PdfEmbeddedPhoto[]): PdfRawObject[] {
  const P = renderedPages.length;
  const N = allPhotos.length;
  const fontF1Id = 3 + P * 2;
  const fontF2Id = 4 + P * 2;
  const firstImageId = 5 + P * 2;

  const objects: PdfRawObject[] = new Array(4 + P * 2 + N);

  objects[0] = { kind: "text", body: "<< /Type /Catalog /Pages 2 0 R >>" };
  objects[1] = {
    kind: "text",
    body: `<< /Type /Pages /Kids [${renderedPages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${P} >>`,
  };

  renderedPages.forEach((page, i) => {
    const pageId = 3 + i * 2;
    const contentId = 4 + i * 2;
    const xobjEntry =
      page.imageIndices.length > 0
        ? ` /XObject << ${page.imageIndices.map((idx) => `/Im${idx} ${firstImageId + idx} 0 R`).join(" ")} >>`
        : "";
    objects[pageId - 1] = {
      kind: "text",
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontF1Id} 0 R /F2 ${fontF2Id} 0 R >>${xobjEntry} >> /Contents ${contentId} 0 R >>`,
    };
    objects[contentId - 1] = {
      kind: "text",
      body: `<< /Length ${Buffer.byteLength(page.contentStr, "utf8")} >>\nstream\n${page.contentStr}\nendstream`,
    };
  });

  objects[fontF1Id - 1] = { kind: "text", body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" };
  objects[fontF2Id - 1] = { kind: "text", body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>" };

  allPhotos.forEach((photo, i) => {
    const colorSpace = photo.components === 1 ? "/DeviceGray" : "/DeviceRGB";
    objects[firstImageId - 1 + i] = {
      kind: "stream",
      dictHeader: `<< /Type /XObject /Subtype /Image /Width ${photo.width} /Height ${photo.height} /ColorSpace ${colorSpace} /BitsPerComponent 8 /Filter /DCTDecode /Length ${photo.data.length} >>`,
      streamData: photo.data,
    };
  });

  return objects;
}

function finalizePdfBinary(objects: PdfRawObject[]): Buffer {
  const parts: Buffer[] = [];
  const offsets: number[] = [0];

  const header = Buffer.from("%PDF-1.4\n", "utf8");
  parts.push(header);
  let byteOffset = header.length;

  objects.forEach((obj, index) => {
    offsets.push(byteOffset);
    let objBuf: Buffer;
    if (obj.kind === "text") {
      objBuf = Buffer.from(`${index + 1} 0 obj\n${obj.body}\nendobj\n`, "utf8");
    } else {
      const prefix = Buffer.from(`${index + 1} 0 obj\n${obj.dictHeader}\nstream\n`, "utf8");
      const suffix = Buffer.from("\nendstream\nendobj\n", "utf8");
      objBuf = Buffer.concat([prefix, obj.streamData, suffix]);
    }
    parts.push(objBuf);
    byteOffset += objBuf.length;
  });

  const xrefStart = byteOffset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    xref += `${offsets[i].toString().padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  parts.push(Buffer.from(xref, "utf8"));

  const totalSize = parts.reduce((s, p) => s + p.length, 0);
  const result = Buffer.allocUnsafe(totalSize);
  let off = 0;
  for (const p of parts) {
    p.copy(result, off);
    off += p.length;
  }
  return result;
}

export function buildBrandedPdfDocument({
  title,
  brand = "ASM / UML / PMSLink QHSE",
  subtitleLines = [],
  sections,
}: PdfDocumentDefinition): Uint8Array<ArrayBuffer> {
  const renderedPages: RenderedPage[] = [];
  const allPhotos: PdfEmbeddedPhoto[] = [];

  const titleBlocks: Block[] = [
    { x: 0, y: 668, width: 612, height: 124, fill: [0.078, 0.192, 0.341] },
    { x: 46, y: 734, text: brand, size: 11, bold: true, color: [1, 1, 1] },
    { x: 46, y: 690, text: title, size: 24, bold: true, color: [1, 1, 1] },
  ];
  subtitleLines.forEach((line, index) => {
    titleBlocks.push({ x: 46, y: 650 - index * 18, text: line, size: index === 0 ? 12 : 11, color: [0.93, 0.96, 1] });
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
  renderedPages.push({ contentStr: buildPageContent(titleBlocks), imageIndices: [] });

  let currentBlocks: Block[] = [];
  let currentPageImageIndices: number[] = [];
  let y = 748;
  let pageNumber = 2;

  const startPage = () => {
    currentBlocks = [
      { x: 0, y: 760, width: 612, height: 32, fill: [0.078, 0.192, 0.341] },
      { x: 40, y: 771, text: brand, size: 10, bold: true, color: [1, 1, 1] },
      { x: 506, y: 34, text: `Page ${pageNumber}`, size: 9, color: [0.4, 0.46, 0.54] },
    ];
    currentPageImageIndices = [];
    y = 732;
  };

  const pushPage = () => {
    renderedPages.push({ contentStr: buildPageContent(currentBlocks), imageIndices: [...currentPageImageIndices] });
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

    if (section.photos && section.photos.length > 0) {
      const COL_W = 246;
      const COL_H = 185;
      const COL_GAP = 20;
      const CAPTION_H = 14;
      const ROW_H = COL_H + CAPTION_H + 12;

      y -= 8;

      for (let row = 0; row < Math.ceil(section.photos.length / 2); row++) {
        ensureRoom(ROW_H + 10);

        for (let col = 0; col < 2; col++) {
          const photoI = row * 2 + col;
          if (photoI >= section.photos.length) break;

          const photo = section.photos[photoI];
          const { w, h } = scaleToFit(photo.width, photo.height, COL_W, COL_H);
          const imgX = 44 + col * (COL_W + COL_GAP);
          const imgBottomY = y - h;

          const idx = allPhotos.length;
          allPhotos.push(photo);
          currentPageImageIndices.push(idx);

          currentBlocks.push({ xobjName: `/Im${idx}`, x: imgX, y: imgBottomY, w, h });
          currentBlocks.push({
            x: imgX,
            y: imgBottomY - CAPTION_H,
            text: photo.caption.substring(0, 50),
            size: 8,
            color: [0.4, 0.46, 0.54],
          });
        }

        y -= ROW_H;
      }

      y -= 6;
    }

    y -= 10;
  }

  pushPage();
  const raw = finalizePdfBinary(createRawObjects(renderedPages, allPhotos));
  const ab = new ArrayBuffer(raw.length);
  new Uint8Array(ab).set(raw);
  return new Uint8Array(ab);
}

export function buildSimplePdfDocument(title: string, rawLines: string[]): Uint8Array<ArrayBuffer> {
  return buildBrandedPdfDocument({ title, sections: [{ title: "Report content", lines: rawLines }] });
}
