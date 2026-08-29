export type TurnPlan = { title: string; image: boolean; search: string; skills: string[] };

export function parseTurnPlan(raw: string, availableSkills: string[]): TurnPlan {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AIの実行計画が不正です");
  const value = JSON.parse(match[0]) as Partial<TurnPlan>;
  const available = new Set(availableSkills);
  return {
    title: typeof value.title === "string" ? value.title.trim() : "",
    image: value.image === true,
    search: typeof value.search === "string" ? value.search.trim() : "",
    skills: Array.isArray(value.skills)
      ? value.skills.filter(
          (name): name is string => typeof name === "string" && available.has(name),
        )
      : [],
  };
}
