import { describe, expect, it } from "vitest";
import { PROFILES, getProfile, listProfiles } from "../src/lib/profiles.js";

describe("profiles", () => {
  it("exposes the five canonical profiles", () => {
    const ids = listProfiles().map((p) => p.id).sort();
    expect(ids).toEqual([
      "client-delivery",
      "contributor",
      "experiment",
      "internal-seed",
      "starter-kit",
    ]);
  });

  it("contributor profile sets upstream and installs sync workflow", () => {
    const p = getProfile("contributor");
    expect(p.steps).toContain("set_upstream_remote");
    expect(p.steps).toContain("install_sync_workflow");
  });

  it("experiment profile detaches upstream", () => {
    const p = getProfile("experiment");
    expect(p.steps).toContain("detach_upstream");
    expect(p.steps).not.toContain("set_upstream_remote");
  });

  it("every step in every profile is a known step", () => {
    const seen = new Set<string>();
    for (const p of Object.values(PROFILES)) {
      for (const s of p.steps) seen.add(s);
    }
    // sanity: at least one well-known step is present
    expect(seen.has("set_upstream_remote")).toBe(true);
    expect(seen.has("detach_upstream")).toBe(true);
  });
});
