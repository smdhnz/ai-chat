import { describe, expect, test } from "bun:test";
import { importRegistrySkill, searchRegistry } from "../src/api/skill-registry";

describe("skills.sh registry", () => {
  test("検索結果を検証し、対象SKILL.mdと同梱スクリプトだけを取り込む", async () => {
    const responses = new Map<string, Response>([
      [
        "https://skills.sh/api/search?q=sample&limit=20",
        Response.json({
          skills: [
            { id: "owner/repo/sample", name: "Sample", source: "owner/repo", installs: 12 },
            { id: "invalid", name: "Invalid", source: "owner/repo", installs: 1 },
          ],
        }),
      ],
      ["https://skills.sh/owner/repo/sample", new Response("skill")],
      ["https://api.github.com/repos/owner/repo", Response.json({ default_branch: "main" })],
      [
        "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1",
        Response.json({
          tree: [
            { type: "blob", path: "skills/sample/SKILL.md", size: 80, sha: "hash" },
            { type: "blob", path: "skills/sample/scripts/run.ts", size: 20, sha: "script" },
            { type: "blob", path: "skills/other/SKILL.md", size: 20, sha: "other" },
          ],
        }),
      ],
      [
        "https://raw.githubusercontent.com/owner/repo/main/skills/sample/SKILL.md",
        new Response("---\nname: Sample skill\ndescription: Does work\n---\nFollow these steps."),
      ],
      [
        "https://raw.githubusercontent.com/owner/repo/main/skills/sample/scripts/run.ts",
        new Response("console.log('ok')"),
      ],
    ]);
    const fetcher = (async (input: RequestInfo | URL) => {
      const response = responses.get(String(input));
      if (!response) return new Response("not found", { status: 404 });
      return response.clone();
    }) as typeof fetch;

    await expect(searchRegistry("sample", undefined, fetcher)).resolves.toEqual([
      { id: "owner/repo/sample", name: "Sample", source: "owner/repo", installs: 12 },
    ]);
    await expect(importRegistrySkill("owner/repo/sample", undefined, fetcher)).resolves.toEqual({
      name: "Sample skill",
      description: "Does work",
      instructions: "Follow these steps.",
      files: [
        {
          path: "SKILL.md",
          contents: "---\nname: Sample skill\ndescription: Does work\n---\nFollow these steps.",
        },
        { path: "scripts/run.ts", contents: "console.log('ok')" },
      ],
      sourceId: "owner/repo/sample",
    });
  });
});
