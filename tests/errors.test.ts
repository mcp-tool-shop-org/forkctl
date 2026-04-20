import { describe, expect, it } from "vitest";
import { ForkableError, asForkableError } from "../src/lib/errors.js";
import { ok, fail, safe } from "../src/lib/result.js";

describe("ForkableError", () => {
  it("emits a clean user payload without the stack", () => {
    const err = new ForkableError("INVALID_INPUT", "bad thing", {
      hint: "do this instead",
      details: { field: "owner" },
    });
    const payload = err.toUserPayload();
    expect(payload).toEqual({
      code: "INVALID_INPUT",
      message: "bad thing",
      hint: "do this instead",
      details: { field: "owner" },
    });
    expect(payload).not.toHaveProperty("stack");
  });

  it("omits hint and details when not provided", () => {
    const err = new ForkableError("INTERNAL", "boom");
    expect(err.toUserPayload()).toEqual({ code: "INTERNAL", message: "boom" });
  });
});

describe("asForkableError", () => {
  it("returns ForkableError unchanged", () => {
    const err = new ForkableError("NOT_IMPLEMENTED", "todo");
    expect(asForkableError(err)).toBe(err);
  });

  it("wraps generic Error as INTERNAL", () => {
    const wrapped = asForkableError(new Error("nope"));
    expect(wrapped.code).toBe("INTERNAL");
    expect(wrapped.message).toBe("nope");
  });

  it("handles non-Error throws", () => {
    const wrapped = asForkableError("strange");
    expect(wrapped.code).toBe("INTERNAL");
  });

  it("scrubs GitHub PAT tokens from generic Error messages (backend F-005)", () => {
    const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ";
    const wrapped = asForkableError(new Error(`auth failed with ${token}`));
    expect(wrapped.code).toBe("INTERNAL");
    expect(wrapped.message).not.toContain(token);
    expect(wrapped.message).toContain("[redacted-token]");
  });

  it("scrubs github_pat_ style tokens from generic Error messages", () => {
    const token = "github_pat_11AAAAAA0ABCDEFGHIJKLMNOP_" + "a".repeat(40);
    const wrapped = asForkableError(new Error(`bad creds: ${token}`));
    expect(wrapped.message).not.toContain(token);
    expect(wrapped.message).toContain("[redacted-token]");
  });

  it("scrubs Bearer-header token echoes from generic Error messages", () => {
    const wrapped = asForkableError(new Error("Authorization: Bearer ghp_ZYXWVUTSRQPONMLKJIHGFEDCBA0123456789"));
    expect(wrapped.message).not.toMatch(/ghp_[A-Za-z0-9_]{16,}/);
    // Either the Bearer-pattern or the PAT-pattern may fire first; both must leave no raw token.
    expect(wrapped.message).toMatch(/redacted/);
  });

  it("scrubs OpenAI sk- keys from generic Error messages", () => {
    const key = "sk-" + "A".repeat(48);
    const wrapped = asForkableError(new Error(`openai rejected ${key}`));
    expect(wrapped.message).not.toContain(key);
    expect(wrapped.message).toContain("[redacted-key]");
  });
});

describe("ToolResult helpers", () => {
  it("ok returns success", () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
  });

  it("fail wraps a ForkableError", () => {
    const err = new ForkableError("INVALID_INPUT", "x");
    expect(fail(err)).toEqual({
      ok: false,
      error: { code: "INVALID_INPUT", message: "x" },
    });
  });

  it("safe captures thrown errors", async () => {
    const result = await safe(() => {
      throw new ForkableError("MISSING_TOKEN", "no token");
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "MISSING_TOKEN", message: "no token" },
    });
  });

  it("safe returns success on resolved promise", async () => {
    const result = await safe(async () => "value");
    expect(result).toEqual({ ok: true, data: "value" });
  });
});
