import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TouchEvent } from "react";
import { useTextLongPress } from "../src/app/(chat)/_hooks/use-text-long-press";
import { TextSelection } from "../src/app/(chat)/_components/text-selection";

function touch(x = 100, y = 100, count = 1, interactive = false) {
  return {
    touches: Array.from({ length: count }, () => ({ clientX: x, clientY: y })),
    target: { closest: () => (interactive ? {} : null) },
  } as unknown as TouchEvent<HTMLDivElement>;
}

function handlers(open: () => void, disabled = false) {
  let result!: ReturnType<typeof useTextLongPress>;
  function Harness() {
    result = useTextLongPress(open, disabled);
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result;
}

test("長押しは微小な揺れを許容し、タップ・スクロール・キャンセル・複数指・リンク・生成中は開かない", async () => {
  let opened = 0;
  const valid = handlers(() => opened++);
  valid.onTouchStart(touch());
  valid.onTouchMove(touch(103, 104));

  let unexpected = 0;
  const cancelled = Array.from({ length: 7 }, (_, i) => handlers(() => unexpected++, i === 6));
  for (const item of cancelled) item.onTouchStart(touch());
  cancelled[0].onTouchEnd();
  cancelled[1].onTouchMove(touch(100, 111));
  cancelled[2].onTouchCancel();
  cancelled[3].onTouchStart(touch(100, 100, 2));
  cancelled[4].onTouchStart(touch(100, 100, 1, true));
  cancelled[5].onTouchMove(touch(100, 100, 0));

  await new Promise((resolve) => setTimeout(resolve, 550));
  expect(opened).toBe(1);
  expect(unexpected).toBe(0);
  valid.onTouchEnd();
  expect(opened).toBe(1);
});

test("選択ボタンは通常非表示でキーボード操作時のみ表示し、生成中は追加しない", () => {
  const render = (disabled: boolean) =>
    renderToStaticMarkup(
      <TextSelection text="本文" disabled={disabled}>
        <div className="message-text">本文</div>
      </TextSelection>,
    );
  expect(render(false)).toContain('aria-haspopup="dialog"');
  expect(render(false)).toContain('class="sr-only focus:not-sr-only"');
  expect(render(false)).toContain("text-selection-trigger");
  expect(render(true)).not.toContain("<button");
  expect(render(true)).not.toContain("text-selection-trigger");
});
