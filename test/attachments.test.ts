import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { utils, write } from "xlsx";
import { attachmentText } from "../src/api/attachments";

const directory = await mkdtemp(join(tmpdir(), "ai-chat-attachments-"));
afterAll(() => rm(directory, { recursive: true, force: true }));

describe("attachmentText", () => {
  test("XLSXのシート名とセルを抽出する", async () => {
    const path = join(directory, "sales.xlsx");
    const workbook = utils.book_new();
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([
        ["商品", "金額"],
        ["りんご", 120],
      ]),
      "売上",
    );
    await writeFile(path, write(workbook, { type: "buffer", bookType: "xlsx" }));

    const text = await attachmentText([
      {
        name: "sales.xlsx",
        path,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 1,
      },
    ]);
    expect(text).toContain("# 売上");
    expect(text).toContain("りんご,120");
  });
});
