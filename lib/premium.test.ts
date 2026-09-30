import { describe, expect, it } from "vitest";
import { issuerSpread, premiumVsAggregate, premiumVsUnderlying } from "./premium";

describe("premiumVsAggregate", () => {
  it("computes positive premium", () => {
    expect(premiumVsAggregate(105, 100)).toBeCloseTo(5, 10);
  });
  it("computes discount", () => {
    expect(premiumVsAggregate(99, 100)).toBeCloseTo(-1, 10);
  });
  it("PAXG-like values", () => {
    // 4166.27 vs avg 4162.60 ≈ +0.088%
    expect(premiumVsAggregate(4166.270236597787, 4162.597575067926)).toBeCloseTo(0.088, 2);
  });
  it("returns null on null/zero, never NaN", () => {
    expect(premiumVsAggregate(null, 100)).toBeNull();
    expect(premiumVsAggregate(100, null)).toBeNull();
    expect(premiumVsAggregate(100, 0)).toBeNull();
    expect(premiumVsAggregate(NaN, 100)).toBeNull();
  });
});

describe("premiumVsUnderlying", () => {
  it("applies units-per-token (CGO grams example)", () => {
    // token 133.40, gold 4162.60/oz, 1/31.1035 oz per token → ref ≈ 133.82 → ≈ -0.3%
    const ref = 4162.6 / 31.1035;
    expect(premiumVsUnderlying(133.4, 4162.6, 1 / 31.1035)).toBeCloseTo(
      (133.4 / ref - 1) * 100,
      10
    );
  });
  it("defaults to 1 unit", () => {
    expect(premiumVsUnderlying(230.6, 230.0)).toBeCloseTo((230.6 / 230 - 1) * 100, 10);
  });
  it("returns null on bad input, never NaN", () => {
    expect(premiumVsUnderlying(null, 100)).toBeNull();
    expect(premiumVsUnderlying(100, null)).toBeNull();
    expect(premiumVsUnderlying(100, 0)).toBeNull();
    expect(premiumVsUnderlying(100, 100, 0)).toBeNull();
  });
});

describe("issuerSpread", () => {
  it("computes max-min spread vs min", () => {
    expect(issuerSpread([100, 105])).toBeCloseTo(5, 10);
  });
  it("ignores nulls, needs 2+ valid prices", () => {
    expect(issuerSpread([100, null])).toBeNull();
    expect(issuerSpread([null, null])).toBeNull();
    expect(issuerSpread([100, null, 110])).toBeCloseTo(10, 10);
  });
  it("returns null when min is zero", () => {
    expect(issuerSpread([0, 100])).toBeNull();
  });
});
