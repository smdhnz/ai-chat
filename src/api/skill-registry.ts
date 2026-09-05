export type RegistrySkill = {
  id: string;
  name: string;
  source: string;
  installs: number;
};

export type RegistryPage = {
  skills: RegistrySkill[];
  hasMore: boolean;
};

export type ImportedSkill = {
  name: string;
  description: string;
  instructions: string;
  files: { path: string; contents: string }[];
  sourceId: string;
  sourceCommitSha: string;
};

const registryOrigin = "https://skills.sh";
const githubApi = "https://api.github.com";
const maxFiles = 100;
const maxBytes = 1_000_000;
const catalogCache = new Map<string, { expires: number; skills: RegistrySkill[] }>();
const catalogCacheTtl = 60_000;
const rankingPattern =
  /\{\\"source\\":\\"([^"\\]+)\\",\\"skillId\\":\\"([^"\\]+)\\",\\"name\\":\\"([^"\\]+)\\",\\"installs\\":(\d+)/g;

export async function searchRegistry(
  query: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<RegistrySkill[]> {
  const value = query.trim();
  if (value.length < 1 || value.length > 100)
    throw new Error("検索語は1〜100文字で入力してください");
  const response = await fetcher(
    `${registryOrigin}/api/search?${new URLSearchParams({ q: value, limit: "200" })}`,
    { signal },
  );
  if (!response.ok) throw new Error(`skills.shの検索に失敗しました (${response.status})`);
  const body = (await response.json()) as { skills?: unknown };
  if (!Array.isArray(body.skills)) throw new Error("skills.shの応答形式が不正です");
  return uniqueSkills(body.skills.flatMap(registrySkill));
}

export function parseRegistryRanking(html: string): RegistrySkill[] {
  if (html.length > 2_000_000) throw new Error("skills.shのHTMLが大きすぎます");
  const skills = uniqueSkills(
    [...html.matchAll(rankingPattern)].flatMap((match) =>
      registrySkill({
        id: `${match[1]}/${match[2]}`,
        name: match[3],
        source: match[1],
        installs: Number(match[4]),
      }),
    ),
  );
  if (skills.length < 10) throw new Error("skills.shのランキング形式が不正です");
  return skills;
}

export async function listRegistry(
  query: string,
  offset: number,
  limit: number,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<RegistryPage> {
  if (!Number.isSafeInteger(offset) || offset < 0 || limit !== 10)
    throw new Error("一覧の取得範囲が不正です");
  const key = query.trim();
  const cached = fetcher === fetch ? catalogCache.get(key) : undefined;
  let skills = cached?.expires && cached.expires > Date.now() ? cached.skills : undefined;
  if (!skills) {
    if (key) {
      skills = await searchRegistry(key, signal, fetcher);
    } else {
      const response = await fetcher(`${registryOrigin}/`, { signal });
      if (!response.ok)
        throw new Error(`skills.shのランキング取得に失敗しました (${response.status})`);
      skills = parseRegistryRanking(await response.text());
    }
    if (fetcher === fetch) {
      if (catalogCache.size >= 20) catalogCache.delete(catalogCache.keys().next().value!);
      catalogCache.set(key, { expires: Date.now() + catalogCacheTtl, skills });
    }
  }
  return { skills: skills.slice(offset, offset + limit), hasMore: offset + limit < skills.length };
}

function registrySkill(item: unknown): RegistrySkill[] {
  if (!item || typeof item !== "object" || Array.isArray(item)) return [];
  const row = item as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.source !== "string" ||
    typeof row.installs !== "number" ||
    !Number.isSafeInteger(row.installs) ||
    row.installs < 0 ||
    !/^[\w.-]+\/[\w.-]+\/.+/.test(row.id) ||
    !/^[\w.-]+\/[\w.-]+$/.test(row.source) ||
    !row.id.startsWith(`${row.source}/`)
  )
    return [];
  return [{ id: row.id, name: row.name.slice(0, 80), source: row.source, installs: row.installs }];
}

function uniqueSkills(skills: RegistrySkill[]): RegistrySkill[] {
  const seen = new Set<string>();
  return [...skills]
    .sort((left, right) => right.installs - left.installs)
    .filter((skill) => !seen.has(skill.id) && Boolean(seen.add(skill.id)));
}

export async function importRegistrySkill(
  catalogId: string,
  sourceCommitSha?: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ImportedSkill> {
  const match = /^([\w.-]+)\/([\w.-]+)\/(.+)$/.exec(catalogId);
  if (!match) throw new Error("スキルIDが不正です");
  if (sourceCommitSha !== undefined && !/^[0-9a-f]{40}$/i.test(sourceCommitSha))
    throw new Error("コミットSHAが不正です");
  const [, owner, repo, slug] = match;
  const headers: HeadersInit = { Accept: "application/vnd.github+json", "User-Agent": "ai-chat" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const registryResponse = await fetcher(`${registryOrigin}/${catalogId}`, {
    method: "HEAD",
    signal,
  });
  if (!registryResponse.ok) throw new Error("skills.shに登録されていないスキルです");
  if (!sourceCommitSha) {
    const repositoryResponse = await fetcher(`${githubApi}/repos/${owner}/${repo}`, {
      headers,
      signal,
    });
    if (!repositoryResponse.ok)
      throw new Error(`スキルのリポジトリを取得できません (${repositoryResponse.status})`);
    const repository = (await repositoryResponse.json()) as { default_branch?: unknown };
    if (typeof repository.default_branch !== "string")
      throw new Error("既定ブランチを取得できません");
    const commitResponse = await fetcher(
      `${githubApi}/repos/${owner}/${repo}/commits/${encodeURIComponent(repository.default_branch)}`,
      { headers, signal },
    );
    if (!commitResponse.ok)
      throw new Error(`スキルのコミットを取得できません (${commitResponse.status})`);
    const commit = (await commitResponse.json()) as { sha?: unknown };
    if (typeof commit.sha !== "string" || !/^[0-9a-f]{40}$/i.test(commit.sha))
      throw new Error("コミットSHAが不正です");
    sourceCommitSha = commit.sha;
  }
  sourceCommitSha = sourceCommitSha.toLowerCase();

  const treeResponse = await fetcher(
    `${githubApi}/repos/${owner}/${repo}/git/trees/${sourceCommitSha}?recursive=1`,
    { headers, signal },
  );
  if (!treeResponse.ok)
    throw new Error(`スキルのファイル一覧を取得できません (${treeResponse.status})`);
  const treeBody = (await treeResponse.json()) as { tree?: unknown; truncated?: unknown };
  if (treeBody.truncated || !Array.isArray(treeBody.tree))
    throw new Error("スキルのファイル一覧が大きすぎます");
  const blobs = treeBody.tree.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return row.type === "blob" && typeof row.path === "string" && typeof row.size === "number"
      ? [{ path: row.path, size: row.size }]
      : [];
  });
  const normalizedSlug = slug.toLowerCase().replaceAll(" ", "-");
  const manifests = blobs.filter(
    (file) =>
      file.path.endsWith("/SKILL.md") &&
      file.path.split("/").at(-2)?.toLowerCase().replaceAll(" ", "-") === normalizedSlug,
  );
  if (manifests.length !== 1) throw new Error("リポジトリ内のスキルを一意に特定できません");
  const root = manifests[0]!.path.slice(0, -"SKILL.md".length);
  const selected = blobs.filter((file) => file.path.startsWith(root));
  if (
    selected.length > maxFiles ||
    selected.some(
      (file) => !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 250_000,
    ) ||
    selected.reduce((total, file) => total + file.size, 0) > maxBytes
  )
    throw new Error("スキルが取込上限を超えています");

  let totalBytes = 0;
  const contents = await Promise.all(
    selected.map(async (file) => {
      const response = await fetcher(
        `https://raw.githubusercontent.com/${owner}/${repo}/${sourceCommitSha}/${file.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
        { signal },
      );
      if (!response.ok) throw new Error(`スキルファイルを取得できません (${response.status})`);
      if (!response.body) throw new Error("スキルファイルの本文がありません");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fileBytes = 0;
      let contents = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fileBytes += value.byteLength;
          totalBytes += value.byteLength;
          if (fileBytes > 250_000 || totalBytes > maxBytes)
            throw new Error("スキルが取込上限を超えています");
          contents += decoder.decode(value, { stream: true });
        }
        contents += decoder.decode();
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      return { path: file.path.slice(root.length), contents };
    }),
  );
  const manifest = contents.find((file) => file.path === "SKILL.md")!;
  const metadata = frontmatter(manifest.contents);
  const instructions = manifest.contents.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
  if (!instructions || instructions.length > 30_000) throw new Error("SKILL.mdの指示が不正です");
  return {
    name: (metadata.name || slug).slice(0, 80),
    description: (metadata.description || "").slice(0, 500),
    instructions,
    files: contents,
    sourceId: catalogId,
    sourceCommitSha,
  };
}

function frontmatter(content: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const field = /^(name|description):\s*(.+)$/.exec(line);
    if (field) result[field[1]!] = field[2]!.trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return result;
}
