import { describe, expect, test } from "bun:test";
import { parseTurnPlan } from "../src/turn-plan";

describe("parseTurnPlan", () => {
  test("JSONを抽出し、未登録スキルを除外する", () => {
    expect(
      parseTurnPlan(
        '```json\n{"title":"短い題名","image":true,"search":"最新情報","skills":["検索","偽"]}\n```',
        ["検索"],
      ),
    ).toEqual({ title: "短い題名", image: true, search: "最新情報", skills: ["検索"] });
  });
});
