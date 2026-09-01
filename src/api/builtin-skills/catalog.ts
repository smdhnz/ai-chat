import { and, desc, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "../database";
import { skills } from "../schema";

export type SkillSource = "builtin" | "user";

export type SkillCatalogItem = {
  name: string;
  description: string;
  source: SkillSource;
};

type BuiltinSkill = {
  name: string;
  description: string;
  instructionsPath: string;
};

export const builtinSkills: readonly BuiltinSkill[] = [
  {
    name: "imagegen",
    description: "画像生成・編集用のプロンプト設計手順",
    instructionsPath: join(import.meta.dir, "imagegen.md"),
  },
];

export function builtinSkill(name: string): BuiltinSkill | undefined {
  return builtinSkills.find((skill) => skill.name === name);
}

export function readBuiltinSkill(skill: BuiltinSkill): string {
  return readFileSync(skill.instructionsPath, "utf8").slice(0, 30_000);
}

export function availableSkillCatalog(database: Database, userId: string): SkillCatalogItem[] {
  return [
    ...builtinSkills.map(({ name, description }) => ({
      name,
      description,
      source: "builtin" as const,
    })),
    ...database
      .select({ name: skills.name, description: skills.description })
      .from(skills)
      .where(and(eq(skills.user_id, userId), eq(skills.enabled, 1)))
      .orderBy(desc(skills.updated_at))
      .all()
      .map((skill) => ({ ...skill, source: "user" as const })),
  ];
}

export function availableSkill(
  database: Database,
  userId: string,
  name: string,
): { instructions: string; source: SkillSource } | undefined {
  const builtin = builtinSkill(name);
  if (builtin) return { instructions: readBuiltinSkill(builtin), source: "builtin" };
  const skill = database
    .select({ instructions: skills.instructions })
    .from(skills)
    .where(and(eq(skills.user_id, userId), eq(skills.enabled, 1), eq(skills.name, name)))
    .get();
  return skill ? { instructions: skill.instructions.slice(0, 30_000), source: "user" } : undefined;
}
