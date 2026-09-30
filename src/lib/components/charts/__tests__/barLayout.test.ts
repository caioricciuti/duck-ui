import { describe, it, expect } from "vitest";
import { barSlot, categoryRange, categorySplits } from "../barLayout";

describe("categoryRange", () => {
  it("leaves half a slot on each side", () => {
    expect(categoryRange(0, 4)).toEqual([-0.5, 4.5]);
  });

  it("centres a single category", () => {
    expect(categoryRange(0, 0)).toEqual([-0.5, 0.5]);
  });
});

describe("categorySplits", () => {
  it("puts one tick on every category when they fit", () => {
    expect(categorySplits(4, 400, 50)).toEqual([0, 1, 2, 3]);
  });

  it("thins the ticks evenly when labels would collide", () => {
    expect(categorySplits(10, 200, 50)).toEqual([0, 3, 6, 9]);
  });

  it("never returns a position between two categories", () => {
    expect(categorySplits(1000, 300, 40).every(Number.isInteger)).toBe(true);
  });

  it("returns a single tick for one category, however wide the plot", () => {
    expect(categorySplits(1, 1200, 40)).toEqual([0]);
  });

  it("returns nothing for an empty result", () => {
    expect(categorySplits(0, 400, 50)).toEqual([]);
  });
});

describe("barSlot", () => {
  it("centres a lone bar on its category", () => {
    const slot = barSlot(100, 1, 0);
    expect(slot.offset + slot.width / 2).toBeCloseTo(0);
  });

  it("caps the width of a lone bar on a wide plot", () => {
    expect(barSlot(1200, 1, 0).width).toBeLessThanOrEqual(96);
  });

  it("places any number of series side by side without overlap", () => {
    const slots = [0, 1, 2, 3, 4].map((i) => barSlot(200, 5, i));
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].offset).toBeGreaterThanOrEqual(slots[i - 1].offset + slots[i - 1].width);
    }
  });

  it("keeps the whole group inside its slot", () => {
    const first = barSlot(200, 5, 0);
    const last = barSlot(200, 5, 4);
    expect(first.offset).toBeGreaterThanOrEqual(-100);
    expect(last.offset + last.width).toBeLessThanOrEqual(100);
  });

  it("never draws a bar thinner than a pixel", () => {
    expect(barSlot(2, 6, 3).width).toBeGreaterThanOrEqual(1);
  });
});
