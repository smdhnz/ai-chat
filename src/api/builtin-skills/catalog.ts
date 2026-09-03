import { and, desc, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "../database";
import { projectSkills, skills } from "../schema";

export type SkillSource = "builtin" | "general" | "project";

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

export type SkillFile = { path: string; contents: string };

function scopedSkills(database: Database, userId: string, projectId: string | null) {
  return projectId
    ? database
        .select({
          name: projectSkills.name,
          description: projectSkills.description,
          instructions: projectSkills.instructions,
          files: projectSkills.files,
        })
        .from(projectSkills)
        .where(and(eq(projectSkills.project_id, projectId), eq(projectSkills.enabled, 1)))
        .orderBy(desc(projectSkills.updated_at))
        .all()
    : database
        .select({
          name: skills.name,
          description: skills.description,
          instructions: skills.instructions,
          files: skills.files,
        })
        .from(skills)
        .where(and(eq(skills.user_id, userId), eq(skills.enabled, 1)))
        .orderBy(desc(skills.updated_at))
        .all();
}

export function availableSkillCatalog(
  database: Database,
  userId: string,
  projectId: string | null,
): SkillCatalogItem[] {
  return [
    ...builtinSkills.map(({ name, description }) => ({
      name,
      description,
      source: "builtin" as const,
    })),
    ...scopedSkills(database, userId, projectId).map(({ name, description }) => ({
      name,
      description,
      source: projectId ? ("project" as const) : ("general" as const),
    })),
  ];
}

export function availableSkill(
  database: Database,
  userId: string,
  projectId: string | null,
  name: string,
): { instructions: string; files: SkillFile[]; source: SkillSource } | undefined {
  const builtin = builtinSkill(name);
  if (builtin)
    return {
      instructions: readBuiltinSkill(builtin),
      files: [],
      source: "builtin",
    };
  const skill = scopedSkills(database, userId, projectId).find((item) => item.name === name);
  if (!skill) return;
  let files: SkillFile[] = [];
  try {
    files = JSON.parse(skill.files) as SkillFile[];
  } catch {
    // Legacy rows had no supporting files.
  }
  return {
    instructions: skill.instructions.slice(0, 30_000),
    files,
    source: projectId ? "project" : "general",
  };
}
