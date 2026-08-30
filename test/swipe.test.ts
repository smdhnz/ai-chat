import { describe, expect, test } from "bun:test";
import { shouldCompleteSwipe } from "../src/lib/swipe";

describe("スワイプ判定", () => {
  test("距離または速度で完了し、逆向きのフリックでは戻る", () => {
    expect(shouldCompleteSwipe(51, 50, 0)).toBe(true);
    expect(shouldCompleteSwipe(0, 50, 601)).toBe(true);
    expect(shouldCompleteSwipe(49, 50, 0)).toBe(false);
    expect(shouldCompleteSwipe(100, 50, -601)).toBe(false);
  });
});
