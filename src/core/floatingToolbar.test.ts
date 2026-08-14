import { describe, expect, it } from "vitest";
import { placeFloatingToolbar } from "./floatingToolbar";

describe("floating toolbar placement", () => {
  it("keeps a wide toolbar inside the left and top edges while pointing at its target", () => {
    const result = placeFloatingToolbar({ viewportWidth: 360, viewportHeight: 800, anchorX: 18, anchorTop: 32, anchorBottom: 76, toolbarWidth: 258, toolbarHeight: 108 });
    expect(result.placement).toBe("below");
    expect(result.x).toBeGreaterThanOrEqual(8);
    expect(result.y).toBeGreaterThanOrEqual(8);
    expect(result.arrowX).toBeGreaterThanOrEqual(14);
  });

  it("moves above a bottom target and constrains tall expanded content", () => {
    const result = placeFloatingToolbar({ viewportWidth: 390, viewportHeight: 300, anchorX: 370, anchorTop: 252, anchorBottom: 290, toolbarWidth: 258, toolbarHeight: 330 });
    expect(result.placement).toBe("above");
    expect(result.x + 258).toBeLessThanOrEqual(382);
    expect(result.maxHeight).toBeLessThan(330);
    expect(result.y).toBeGreaterThanOrEqual(8);
  });
});
