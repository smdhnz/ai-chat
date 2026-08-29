import { readFile } from "node:fs/promises";
import { read as readWorkbook, utils } from "xlsx";

export type Attachment = { name: string; path: string; mime: string; size: number };

export async function attachmentText(files: Attachment[]): Promise<string> {
  if (!files.length) return "";
  return (await Promise.all(files.map(fileText))).join("\n").slice(0, 200_000);
}

async function fileText(file: Attachment): Promise<string> {
  const name = file.name.replace(/[&"<>]/g, (character) => `&#${character.charCodeAt(0)};`);
  const wrap = (content: string) => `<file name="${name}">\n${content}\n</file>`;
  if (/^image\/(png|jpeg|webp|gif)$/i.test(file.mime)) return wrap("");
  if (
    file.mime.startsWith("text/") ||
    /\.(md|json|csv|xml|ya?ml|js|ts|py|go|rs|java|css|html)$/i.test(file.name)
  )
    return wrap((await readFile(file.path, "utf8")).slice(0, 100_000));
  if (/\.(xlsx|xls|xlsm|xlsb|ods)$/i.test(file.name)) {
    try {
      const workbook = readWorkbook(await readFile(file.path), { type: "buffer" });
      return wrap(
        workbook.SheetNames.map(
          (sheet) => `# ${sheet}\n${utils.sheet_to_csv(workbook.Sheets[sheet])}`,
        ).join("\n\n"),
      );
    } catch {
      return wrap("[表計算ファイルを読み取れませんでした]");
    }
  }
  return wrap(`[内容抽出未対応: ${file.mime}, ${file.size} bytes]`);
}
