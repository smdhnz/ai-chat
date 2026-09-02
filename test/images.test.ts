import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { prepareImage } from "../src/api/images";

const width = 400;
const height = 300;
const pixels = Buffer.alloc(width * height * 3);
for (let index = 0; index < pixels.length; index++) pixels[index] = index % 251;
const png = await sharp(pixels, { raw: { width, height, channels: 3 } })
  .png()
  .toBuffer();

describe("prepareImage", () => {
  test("画素を変えずに最適化し、表示寸法の軽量ぼかし画像を作る", async () => {
    const image = await prepareImage(png, "image/png");
    const [optimizedPixels, previewMetadata] = await Promise.all([
      sharp(image.bytes).raw().toBuffer(),
      sharp(image.preview).metadata(),
    ]);

    expect(optimizedPixels).toEqual(pixels);
    expect(previewMetadata.width).toBe(227);
    expect(previewMetadata.height).toBe(170);
    expect(image.preview.length).toBeLessThan(png.length);
  });

  test("申告MIMEと実データの不一致を拒否する", async () => {
    await expect(prepareImage(png, "image/jpeg")).rejects.toThrow("MIME");
  });
});
