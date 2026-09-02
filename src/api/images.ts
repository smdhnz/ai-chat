import sharp from "sharp";

const mimeByFormat: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const imagePreviewPath = (path: string) => `${path}.preview.webp`;

async function imageMetadata(bytes: Buffer, claimedMime: string) {
  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  const actualMime = metadata.format ? mimeByFormat[metadata.format] : undefined;
  if (!actualMime || actualMime !== claimedMime.toLowerCase())
    throw new Error("Image MIME does not match its data");
  return { metadata, actualMime };
}

export async function createImagePreview(bytes: Buffer, claimedMime: string): Promise<Buffer> {
  await imageMetadata(bytes, claimedMime);
  return sharp(bytes)
    .rotate()
    .resize({ width: 260, height: 170, fit: "inside", withoutEnlargement: true })
    .blur(8)
    .webp({ quality: 10, effort: 4 })
    .toBuffer();
}

export async function prepareImage(
  bytes: Buffer,
  claimedMime: string,
): Promise<{ bytes: Buffer; mime: string; extension: string; preview: Buffer }> {
  const { metadata, actualMime } = await imageMetadata(bytes, claimedMime);
  const preview = await createImagePreview(bytes, claimedMime);

  if (actualMime === "image/gif") return { bytes, mime: actualMime, extension: ".gif", preview };

  const optimized = await sharp(bytes).rotate().webp({ lossless: true, effort: 6 }).toBuffer();
  return optimized.length < bytes.length
    ? { bytes: optimized, mime: "image/webp", extension: ".webp", preview }
    : {
        bytes,
        mime: actualMime,
        extension: actualMime === "image/jpeg" ? ".jpg" : `.${metadata.format}`,
        preview,
      };
}
