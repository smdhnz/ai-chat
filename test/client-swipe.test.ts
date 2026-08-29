import { describe, expect, test } from "bun:test";
import { horizontalSwipe } from "../src/client/swipe";

describe("horizontalSwipe", () => {
  test("横方向に60px以上動いたスワイプだけを判定する", () => {
    expect(horizontalSwipe({ x: 10, y: 20 }, { x: 80, y: 25 })).toBe(1);
    expect(horizontalSwipe({ x: 100, y: 20 }, { x: 30, y: 25 })).toBe(-1);
    expect(horizontalSwipe({ x: 10, y: 20 }, { x: 50, y: 20 })).toBe(0);
    expect(horizontalSwipe({ x: 10, y: 20 }, { x: 80, y: 100 })).toBe(0);
  });
});
