import { describe, expect, test } from "bun:test";
import {
  installedRegistryIds,
  mergeRegistrySkills,
  skillInstallBody,
} from "../src/app/settings/_components/skill-catalog";
import type { RegistrySkill, Skill } from "../src/lib/api";

const catalogSkill = (id: string): RegistrySkill => ({
  id,
  name: id,
  source: "owner/repo",
  installs: 1,
});

describe("skill catalog state", () => {
  test("無限ロードで同一IDを重複追加しない", () => {
    expect(
      mergeRegistrySkills(
        [catalogSkill("owner/repo/one")],
        [catalogSkill("owner/repo/one"), catalogSkill("owner/repo/two")],
      ).map((skill) => skill.id),
    ).toEqual(["owner/repo/one", "owner/repo/two"]);
  });

  test("source_idで導入済みを判定する", () => {
    const skills = [{ source_id: "owner/repo/one" }, { source_id: null }] as Skill[];
    expect(installedRegistryIds(skills)).toEqual(new Set(["owner/repo/one"]));
  });

  test("一般とプロジェクトの導入先を分離する", () => {
    expect(skillInstallBody("owner/repo/one")).toEqual({ catalogId: "owner/repo/one" });
    expect(skillInstallBody("owner/repo/one", "project-1")).toEqual({
      catalogId: "owner/repo/one",
      projectId: "project-1",
    });
  });
});
