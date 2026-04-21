import { describe, expect, it } from "vitest";
import { ForkctlError, asForkctlError } from "../src/lib/errors.js";
import { ok, fail, safe } from "../src/lib/result.js";

describe("ForkctlError", () => {
  it("emits a clean user payload without the stack", () => {
    const err = new ForkctlError("INVALID_INPUT", "bad thing", {
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
    const err = new ForkctlError("INTERNAL", "boom");
    expect(err.toUserPayload()).toEqual({ code: "INTERNAL", message: "boom" });
  });
});

describe("asForkctlError", () => {
  it("returns ForkctlError unchanged", () => {
    const err = new ForkctlError("NOT_IMPLEMENTED", "todo");
    expect(asForkctlError(err)).toBe(err);
  });

  it("wraps generic Error as INTERNAL", () => {
    const wrapped = asForkctlError(new Error("nope"));
    expect(wrapped.code).toBe("INTERNAL");
    expect(wrapped.message).toBe("nope");
  });

  it("handles non-Error throws", () => {
    const wrapped = asForkctlError("strange");
    expect(wrapped.code).toBe("INTERNAL");
  });

  it("scrubs GitHub PAT tokens from generic Error messages (backend F-005)", () => {
    const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ";
    const wrapped = asForkctlError(new Error(`auth failed with ${token}`));
    expect(wrapped.code).toBe("INTERNAL");
    expect(wrapped.message).not.toContain(token);
    expect(wrapped.message).toContain("[redacted-token]");
  });

  it("scrubs github_pat_ style tokens from generic Error messages", () => {
    const token = "github_pat_11AAAAAA0ABCDEFGHIJKLMNOP_" + "a".repeat(40);
    const wrapped = asForkctlError(new Error(`bad creds: ${token}`));
    expect(wrapped.message).not.toContain(token);
    expect(wrapped.message).toContain("[redacted-token]");
  });

  it("scrubs Bearer-header token echoes from generic Error messages", () => {
    const wrapped = asForkctlError(new Error("Authorization: Bearer ghp_ZYXWVUTSRQPONMLKJIHGFEDCBA0123456789"));
    expect(wrapped.message).not.toMatch(/ghp_[A-Za-z0-9_]{16,}/);
    // Either the Bearer-pattern or the PAT-pattern may fire first; both must leave no raw token.
    expect(wrapped.message).toMatch(/redacted/);
  });

  it("scrubs OpenAI sk- keys from generic Error messages", () => {
    const key = "sk-" + "A".repeat(48);
    const wrapped = asForkctlError(new Error(`openai rejected ${key}`));
    expect(wrapped.message).not.toContain(key);
    expect(wrapped.message).toContain("[redacted-key]");
  });
});

describe("ToolResult helpers", () => {
  it("ok returns success", () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
  });

  it("fail wraps a ForkctlError", () => {
    const err = new ForkctlError("INVALID_INPUT", "x");
    expect(fail(err)).toEqual({
      ok: false,
      error: { code: "INVALID_INPUT", message: "x" },
    });
  });

  it("safe captures thrown errors", async () => {
    const result = await safe(() => {
      throw new ForkctlError("MISSING_TOKEN", "no token");
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
