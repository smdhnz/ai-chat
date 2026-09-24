import { eq } from "drizzle-orm";
import { writeFile } from "node:fs/promises";
import { detectImageMime } from "./agent-messages";
import { storedFilePath } from "./config";
import type { Database } from "./database";
import { createImagePreview, imagePreviewPath } from "./images";
import { files } from "./schema";

// Callers must authorize the file before serving its contents.
export async function serveStoredFile(
  database: Database,
  fileId: string,
  download: boolean,
  preview: boolean,
  cacheControl = "private, max-age=31536000, immutable",
): Promise<Response> {
  const missing = () => Response.json({ error: "not found" }, { status: 404 });
  const file = database
    .select({ name: files.name, path: files.path, mime: files.mime })
    .from(files)
    .where(eq(files.id, fileId))
    .get();
  if (!file) return missing();
  const originalPath = storedFilePath(file.path);
  const source = Bun.file(originalPath);
  if (!(await source.exists())) return missing();
  if (
    file.mime.startsWith("image/") &&
    detectImageMime(Buffer.from(await source.arrayBuffer())) !== file.mime
  )
    return missing();
  if (preview && !file.mime.startsWith("image/")) return missing();
  const path = preview ? imagePreviewPath(originalPath) : originalPath;
  if (preview && !(await Bun.file(path).exists()))
    await writeFile(
      path,
      await createImagePreview(Buffer.from(await source.arrayBuffer()), file.mime),
    );
  return new Response(Bun.file(path), {
    headers: {
      "Content-Type": preview ? "image/webp" : file.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
