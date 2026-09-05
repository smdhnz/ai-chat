"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Eye, Search, X } from "lucide-react";
import { toast } from "sonner";
import { LoadingWave } from "@/components/loading-wave";
import {
  api,
  type RegistryPage,
  type RegistrySkill,
  type RegistrySkillDetail,
  type Skill,
} from "@/lib/api";
const pageSize = 10;
const inputClass =
  "w-full rounded-[11px] border border-border bg-background py-2.5 pr-9 pl-9 text-xs text-foreground outline-none focus:border-ring";

export function mergeRegistrySkills(
  current: RegistrySkill[],
  incoming: RegistrySkill[],
): RegistrySkill[] {
  const ids = new Set(current.map((skill) => skill.id));
  return [
    ...current,
    ...incoming.filter((skill) => !ids.has(skill.id) && Boolean(ids.add(skill.id))),
  ];
}

export function installedRegistryIds(skills: Skill[]): Set<string> {
  return new Set(
    skills
      .map((skill) => skill.source_id)
      .filter((sourceId): sourceId is string => Boolean(sourceId)),
  );
}
export function SkillCatalog({
  installedSourceIds,
  select,
}: {
  installedSourceIds: Set<string>;
  select: (skill: RegistrySkill) => void;
}) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<RegistrySkill[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const offset = useRef(0);
  const loadingRequest = useRef(false);
  const requestVersion = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    loadingRequest.current = true;
    offset.current = 0;
    setSkills([]);
    setHasMore(true);
    setLoading(true);
    setError("");
    void api<RegistryPage>(catalogUrl(query, 0), { signal: controller.signal })
      .then((page) => {
        if (version !== requestVersion.current) return;
        setSkills(mergeRegistrySkills([], page.skills));
        offset.current = pageSize;
        setHasMore(page.hasMore);
      })
      .catch((reason: unknown) => {
        if (version !== requestVersion.current || controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "スキルを取得できませんでした");
      })
      .finally(() => {
        if (version !== requestVersion.current) return;
        loadingRequest.current = false;
        setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  const loadMore = useCallback(async () => {
    if (loadingRequest.current || !hasMore) return;
    const version = requestVersion.current;
    const nextOffset = offset.current;
    loadingRequest.current = true;
    setLoading(true);
    try {
      const page = await api<RegistryPage>(catalogUrl(query, nextOffset));
      if (version !== requestVersion.current) return;
      setSkills((current) => mergeRegistrySkills(current, page.skills));
      offset.current = nextOffset + pageSize;
      setHasMore(page.hasMore);
    } catch (reason) {
      if (version === requestVersion.current)
        setError(reason instanceof Error ? reason.message : "スキルを取得できませんでした");
    } finally {
      if (version === requestVersion.current) {
        loadingRequest.current = false;
        setLoading(false);
      }
    }
  }, [hasMore, query]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "160px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore, skills.length]);

  return (
    <div className="flex flex-col gap-3 p-4 pb-[max(28px,env(safe-area-inset-bottom))]">
      <label className="relative block">
        <span className="sr-only">skills.shを検索</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className={inputClass}
          value={input}
          maxLength={100}
          placeholder="skills.shを検索"
          onChange={(event) => setInput(event.target.value)}
        />
        {input ? (
          <button
            type="button"
            className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 items-center justify-center text-muted-foreground [&_svg]:size-4"
            aria-label="検索を解除"
            onClick={() => setInput("")}
          >
            <X />
          </button>
        ) : null}
      </label>
      <p className="text-[10px] font-bold text-muted-foreground">
        {query ? "検索結果（インストール数順）" : "累計インストール数ランキング"}
      </p>
      {skills.length ? (
        <div className="overflow-hidden rounded-[11px] bg-card">
          {skills.map((skill) => {
            const isInstalled = installedSourceIds.has(skill.id);
            return (
              <div
                key={skill.id}
                className="flex min-h-16 items-center gap-2 border-b border-border px-3 last:border-b-0"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 py-2 text-left"
                  onClick={() => select(skill)}
                >
                  <span className="block truncate text-xs font-semibold">{skill.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {skill.source}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    インストール数 {skill.installs.toLocaleString("ja-JP")}
                  </span>
                </button>
                <button
                  type="button"
                  className="inline-flex size-9 shrink-0 items-center justify-center text-primary disabled:text-muted-foreground [&_svg]:size-4"
                  disabled={isInstalled}
                  aria-label={isInstalled ? `${skill.name}は追加済み` : `${skill.name}の内容を確認`}
                  onClick={() => select(skill)}
                >
                  {isInstalled ? <Check /> : <Eye />}
                </button>
              </div>
            );
          })}
        </div>
      ) : !loading && !error ? (
        <p className="text-[11px] text-muted-foreground">該当するスキルはありません。</p>
      ) : null}
      {error ? (
        <p className="text-[11px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="flex justify-center py-3" aria-label="スキルを読み込み中">
          <LoadingWave />
        </div>
      ) : null}
      <div ref={sentinel} className="h-px" aria-hidden="true" />
    </div>
  );
}

export function SkillCatalogDetail({
  skill,
  installed,
  projectId,
  refresh,
}: {
  skill: RegistrySkill;
  installed: boolean;
  projectId?: string;
  refresh: () => Promise<void>;
}) {
  const { detail, error } = useRegistryDetail(skill.id);
  const [installing, setInstalling] = useState(false);

  async function install() {
    if (installing || installed || !detail) return;
    setInstalling(true);
    try {
      await api("/api/skills/install", {
        method: "POST",
        body: JSON.stringify({
          catalogId: skill.id,
          sourceCommitSha: detail.sourceCommitSha,
          ...(projectId ? { projectId } : {}),
        }),
      });
      await refresh();
      toast.success("スキルを追加しました");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "追加できませんでした");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <article className="flex flex-col gap-4 p-5 pb-[max(28px,env(safe-area-inset-bottom))]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold">{detail?.name ?? skill.name}</h3>
          <p className="text-[11px] text-muted-foreground">{skill.source}</p>
          <p className="text-[11px] text-muted-foreground">
            累計インストール数 {skill.installs.toLocaleString("ja-JP")}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground [&_svg]:size-4"
          disabled={installed || installing || !detail}
          aria-label={installed ? `${skill.name}は追加済み` : `${skill.name}を追加`}
          onClick={() => void install()}
        >
          {installing ? <LoadingWave label="追加中" /> : installed ? <Check /> : <Download />}
        </button>
      </div>
      <DetailState detail={detail} error={error} />
    </article>
  );
}

export function InstalledSkillDetail({ skill }: { skill: Skill }) {
  return (
    <article className="flex flex-col gap-4 p-5 pb-[max(28px,env(safe-area-inset-bottom))]">
      <div>
        <h3 className="text-lg font-bold">{skill.name}</h3>
        {skill.source_id ? (
          <p className="text-[11px] text-muted-foreground">{skill.source_id}</p>
        ) : null}
        <p className="cursor-text select-text text-[11px] break-all text-muted-foreground">
          保存コミットSHA: {skill.source_commit_sha ?? "null（不明）"}
        </p>
      </div>
      <p className="cursor-text select-text whitespace-pre-wrap text-xs leading-relaxed">
        {skill.description || "説明はありません。"}
      </p>
      <section className="flex flex-col gap-2">
        <h4 className="text-[10px] font-bold text-muted-foreground">保存済みの指示</h4>
        <pre className="max-h-96 overflow-auto rounded-[11px] bg-card p-3 text-xs whitespace-pre-wrap break-words">
          {skill.instructions}
        </pre>
      </section>
    </article>
  );
}

function useRegistryDetail(id: string) {
  const [result, setResult] = useState<{ id: string; detail: RegistrySkillDetail }>();
  const [error, setError] = useState("");

  useEffect(() => {
    setResult(undefined);
    setError("");
    const controller = new AbortController();
    void api<RegistrySkillDetail>(`/api/skill-catalog/detail?id=${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then((detail) => {
        if (!controller.signal.aborted) setResult({ id, detail });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "詳細を取得できませんでした");
      });
    return () => controller.abort();
  }, [id]);

  return { detail: result?.id === id ? result.detail : undefined, error };
}

function DetailState({ detail, error }: { detail?: RegistrySkillDetail; error: string }) {
  if (detail)
    return (
      <>
        <section className="flex flex-col gap-1">
          <h4 className="text-[10px] font-bold text-muted-foreground">説明</h4>
          <p className="cursor-text select-text whitespace-pre-wrap text-xs leading-relaxed">
            {detail.description || "説明はありません。"}
          </p>
        </section>
        <p className="cursor-text select-text text-[11px] break-all text-muted-foreground">
          確認コミットSHA: {detail.sourceCommitSha}
        </p>
        <p className="text-[11px] text-muted-foreground">
          以下の本文とスクリプトを確認してから追加してください。このコミットの内容を保存します。
        </p>
        <section className="flex flex-col gap-2">
          <h4 className="text-[10px] font-bold text-muted-foreground">同梱ファイル</h4>
          {detail.files.length ? (
            <ul className="overflow-hidden rounded-[11px] bg-card">
              {detail.files.map((file) => (
                <li key={file.path} className="border-b border-border last:border-b-0">
                  <details open={file.path === "SKILL.md"}>
                    <summary className="cursor-pointer px-3 py-2 text-[11px] break-all">
                      {file.path}
                    </summary>
                    <pre className="max-h-96 overflow-auto px-3 pb-3 text-xs whitespace-pre-wrap break-words">
                      {file.contents}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">同梱ファイルはありません。</p>
          )}
        </section>
      </>
    );
  if (error)
    return (
      <p className="text-[11px] text-destructive" role="alert">
        {error}
      </p>
    );
  return (
    <div className="flex justify-center py-6" aria-label="詳細を読み込み中">
      <LoadingWave />
    </div>
  );
}

function catalogUrl(query: string, offset: number): string {
  return `/api/skill-catalog?${new URLSearchParams({
    query,
    offset: String(offset),
    limit: String(pageSize),
  })}`;
}
