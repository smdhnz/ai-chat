import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const maxRequestBytes = 1_500_000;
const maxOutputBytes = 100_000;
const server = Bun.serve({
  port: Number(process.env.PORT || 3010),
  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/execute")
      return Response.json({ error: "not found" }, { status: 404 });
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (!contentLength || contentLength > maxRequestBytes)
      return Response.json({ error: "invalid request size" }, { status: 413 });
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !Array.isArray(body.files) || typeof body.script !== "string")
      return Response.json({ error: "invalid request" }, { status: 400 });
    const args = Array.isArray(body.args) ? body.args : [];
    if (
      args.length > 20 ||
      args.some((arg) => typeof arg !== "string" || arg.length > 1_000) ||
      body.files.length > 100
    )
      return Response.json({ error: "invalid request" }, { status: 400 });

    let files: { path: string; contents: string }[];
    let script: string;
    try {
      files = body.files.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const file = item as Record<string, unknown>;
        if (typeof file.path !== "string" || typeof file.contents !== "string") return [];
        return [{ path: safePath(file.path), contents: file.contents }];
      });
      script = safePath(body.script);
    } catch {
      return Response.json({ error: "invalid files" }, { status: 400 });
    }
    if (files.length !== body.files.length)
      return Response.json({ error: "invalid files" }, { status: 400 });
    if (!files.some((file) => file.path === script))
      return Response.json({ error: "script not found" }, { status: 400 });

    const directory = await mkdtemp(join(tmpdir(), "skill-"));
    try {
      await Promise.all(
        files.map(async (file) => {
          const path = join(directory, file.path);
          await mkdir(dirname(path), { recursive: true });
          await writeFile(path, file.contents, { mode: 0o600 });
        }),
      );
      const command = interpreter(script);
      const process = Bun.spawn([...command, join(directory, script), ...(args as string[])], {
        cwd: directory,
        env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: directory, LANG: "C.UTF-8" },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const timeout = setTimeout(() => process.kill(), 25_000);
      const [stdout, stderr, exitCode] = await Promise.all([
        limitedText(process.stdout, process),
        limitedText(process.stderr, process),
        process.exited,
      ]).finally(() => clearTimeout(timeout));
      return Response.json({ stdout, stderr, exitCode });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "execution failed" },
        { status: 400 },
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
});

console.log(`Skill executor listening on ${server.port}`);

function safePath(value: string): string {
  const path = value.replaceAll("\\", "/");
  if (
    path.startsWith("/") ||
    path.includes("\0") ||
    path.length > 240 ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("invalid path");
  return path;
}

function interpreter(script: string): string[] {
  if (/\.(?:js|ts|mjs|cjs)$/.test(script)) return [process.execPath];
  if (script.endsWith(".py")) return ["python3"];
  if (script.endsWith(".sh")) return ["/bin/sh"];
  throw new Error("unsupported script type");
}

async function limitedText(
  stream: ReadableStream<Uint8Array>,
  process: { kill(): void },
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxOutputBytes) {
      process.kill();
      throw new Error("script output limit exceeded");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(output);
}
