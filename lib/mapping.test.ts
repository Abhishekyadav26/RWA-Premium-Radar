import { describe, expect, it } from "vitest";
import { OZ_G, underlyingRefFor } from "./mapping";

describe("underlyingRefFor", () => {
  it("gold resolves to XAU spot with GC=F fallback", () => {
    const r = underlyingRefFor("GOLD", "PAXG", "commodity");
    expect(r?.metal).toBe("XAU");
    expect(r?.ticker).toBe("GC=F");
    expect(r?.unitsPerToken).toBe(1);
  });
  it("gram gold tokens get fractional units", () => {
    const r = underlyingRefFor("GOLD", "CGO", "commodity");
    expect(r?.unitsPerToken).toBeCloseTo(1 / OZ_G, 10);
    expect(r?.unitSuffix).toBe("/g");
  });
  it("GOOGon maps to GOOG (Class C), not GOOGL", () => {
    expect(underlyingRefFor("GOOGL", "GOOGon", "stock")?.ticker).toBe("GOOG");
  });
  it("stock symbols fall back to Yahoo tickers with dot-to-dash", () => {
    expect(underlyingRefFor("BRK.B", "BRK.B", "stock")?.ticker).toBe("BRK-B");
    expect(underlyingRefFor("MU", "MU", "stock")?.ticker).toBe("MU");
  });
  it("returns null for unmapped exotica", () => {
    expect(underlyingRefFor("SPACE_X", "SPCX", "equity")).toBeNull();
  });
});
