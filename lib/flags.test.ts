import { describe, expect, it } from "vitest";
import { flagFor, isDerivativeToken } from "./flags";

describe("flagFor", () => {
  it("flags a liquid >1% gap as dislocation", () => {
    expect(
      flagFor({ premUnd: 2.5, premAgg: 0.1, marketCap: 1_000_000, volume: 0, isDerivative: false })
    ).toBe("dislocation");
  });
  it("marks >25% gaps as check-data, not dislocation", () => {
    expect(
      flagFor({ premUnd: 96, premAgg: 96, marketCap: 1_000_000, volume: 0, isDerivative: false })
    ).toBe("check-data");
  });
  it("falls back to the aggregate premium when no underlying ref exists", () => {
    expect(
      flagFor({ premUnd: null, premAgg: -3, marketCap: 1_000_000, volume: 0, isDerivative: false })
    ).toBe("dislocation");
  });
  it("never flags derivatives or illiquid rows", () => {
    expect(
      flagFor({ premUnd: 96, premAgg: 96, marketCap: 10_000_000, volume: 0, isDerivative: true })
    ).toBe("none");
    // $6k mcap, no volume (Hyperliquid-style) → none
    expect(
      flagFor({ premUnd: -15, premAgg: -15, marketCap: 6000, volume: 0, isDerivative: false })
    ).toBe("none");
  });
  it("returns none on missing data", () => {
    expect(
      flagFor({ premUnd: null, premAgg: null, marketCap: 1_000_000, volume: 0, isDerivative: false })
    ).toBe("none");
  });
});

describe("isDerivativeToken", () => {
  it("detects perp rows", () => {
    expect(isDerivativeToken("NA (Derivatives)", "NVIDIA (Derivatives)")).toBe(true);
    expect(isDerivativeToken("Backed Assets", "NVIDIA tokenized stock (xStock)")).toBe(false);
  });
});
