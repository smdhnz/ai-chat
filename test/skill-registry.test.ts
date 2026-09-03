import { describe, expect, test } from "bun:test";
import {
  importRegistrySkill,
  listRegistry,
  parseRegistryRanking,
  searchRegistry,
} from "../src/api/skill-registry";

describe("skills.sh registry", () => {
  test("検索結果を検証し、対象SKILL.mdと同梱スクリプトだけを取り込む", async () => {
    const responses = new Map<string, Response>([
      [
        "https://skills.sh/api/search?q=sample&limit=200",
        Response.json({
          skills: [
            { id: "owner/repo/sample", name: "Sample", source: "owner/repo", installs: 12 },
            { id: "owner/repo/popular", name: "Popular", source: "owner/repo", installs: 20 },
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
      { id: "owner/repo/popular", name: "Popular", source: "owner/repo", installs: 20 },
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

  test("累計ランキングを解析し、installs降順で10件ずつ返す", async () => {
    const html = Array.from(
      { length: 12 },
      (_, index) =>
        `{\\"source\\":\\"owner/repo\\",\\"skillId\\":\\"skill-${index}\\",\\"name\\":\\"Skill ${index}\\",\\"installs\\":${index}}`,
    ).join(",");
    const fetcher = (async (input: RequestInfo | URL) => {
      void input;
      return new Response(html);
    }) as typeof fetch;

    expect(parseRegistryRanking(html).map((skill) => skill.installs)).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    ]);
    await expect(listRegistry("", 0, 10, undefined, fetcher)).resolves.toEqual({
      skills: parseRegistryRanking(html).slice(0, 10),
      hasMore: true,
    });
    await expect(listRegistry("", 10, 10, undefined, fetcher)).resolves.toEqual({
      skills: parseRegistryRanking(html).slice(10),
      hasMore: false,
    });
  });

  test("検索結果をinstalls降順にし、非対応のsite形式を除外する", async () => {
    const fetcher = (async (input: RequestInfo | URL) => {
      void input;
      return Response.json({
        skills: [
          { id: "owner/repo/low", name: "Low", source: "owner/repo", installs: 1 },
          { id: "docs.example/skill", name: "Site", source: "docs.example", installs: 99 },
          { id: "owner/repo/high", name: "High", source: "owner/repo", installs: 10 },
        ],
      });
    }) as typeof fetch;

    await expect(listRegistry("skill", 0, 10, undefined, fetcher)).resolves.toEqual({
      skills: [
        { id: "owner/repo/high", name: "High", source: "owner/repo", installs: 10 },
        { id: "owner/repo/low", name: "Low", source: "owner/repo", installs: 1 },
      ],
      hasMore: false,
    });
  });

  test("ランキング形式不一致と10件以外の取得を拒否する", async () => {
    expect(() => parseRegistryRanking("<html></html>")).toThrow(
      "skills.shのランキング形式が不正です",
    );
    await expect(listRegistry("", 0, 20)).rejects.toThrow("一覧の取得範囲が不正です");
  });
});
