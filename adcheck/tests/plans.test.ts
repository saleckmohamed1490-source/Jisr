import { describe, expect, it } from "vitest";
import { PLANS, priceFor, isDuration, isPaidPlan } from "@/lib/plans";

describe("plans", () => {
  it("matches the published quotas", () => {
    expect(PLANS.free).toMatchObject({ checks: 3, images: 0, appeals: 0 });
    expect(PLANS.starter).toMatchObject({ priceUsd: 6, checks: 100, images: 25, appeals: 5 });
    expect(PLANS.pro).toMatchObject({ priceUsd: 19, checks: 1000, images: 100, appeals: null, fairUseChecks: true });
    expect(PLANS.agency).toMatchObject({ priceUsd: 49, checks: 1000, images: 300, appeals: null, workspaces: 5 });
  });

  it("prices 1, 3 and 12 months (yearly = 10 months)", () => {
    expect([1, 3, 12].map((m) => priceFor("starter", m as 1))).toEqual([6, 18, 60]);
    expect([1, 3, 12].map((m) => priceFor("pro", m as 1))).toEqual([19, 57, 190]);
    expect([1, 3, 12].map((m) => priceFor("agency", m as 1))).toEqual([49, 147, 490]);
  });

  it("validates inputs", () => {
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("free")).toBe(false);
    expect(isDuration("12")).toBe(true);
    expect(isDuration(2)).toBe(false);
  });
});
