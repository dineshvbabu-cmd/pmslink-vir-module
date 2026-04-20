export async function compressEvidenceImage(file: File) {
  const imageBitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(imageBitmap.width, imageBitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(imageBitmap.width * scale));
  canvas.height = Math.max(1, Math.round(imageBitmap.height * scale));

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to prepare evidence image.");
  }

  context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Unable to compress image."));
        return;
      }

      resolve(result);
    }, "image/webp", 0.75);
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });

  return {
    contentType: blob.type || "image/webp",
    dataUrl,
    fileName: file.name.replace(/\.[^.]+$/, "") + ".webp",
    fileSizeKb: Math.max(1, Math.round(blob.size / 1024)),
  };
}
