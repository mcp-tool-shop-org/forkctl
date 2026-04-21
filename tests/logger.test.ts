import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLogger, newCorrelationId } from "../src/lib/logger.js";

/**
 * Logger redaction pins the belt-and-suspenders guarantee: no secret ever
 * reaches a user-visible stderr line, even if one ends up inside a deeply
 * nested field or an Error's message.
 */

describe("logger redaction", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let captured: string[];

  beforeEach(() => {
    captured = [];
    writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
      if (typeof chunk === "string") captured.push(chunk);
      return true;
    }) as unknown as typeof process.stderr.write);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("replaces ghp_ tokens in the log message with a redacted placeholder", () => {
    const logger = buildLogger({ defaultLevel: "info", env: { FORKCTL_LOG: "info" } });
    const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ";
    logger.info(`auth failed: ${token}`, {});

    expect(captured).toHaveLength(1);
    expect(captured[0]).not.toContain(token);
    expect(captured[0]).toMatch(/redacted/);
  });

  it("redacts sk-proj- keys in nested fields, not just the top-level message", () => {
    const logger = buildLogger({ defaultLevel: "info", env: { FORKCTL_LOG: "info" } });
    const openaiKey = "sk-proj-" + "A".repeat(48);
    logger.info("outbound call", { request: { headers: { Authorization: `Bearer ${openaiKey}` } } });

    expect(captured).toHaveLength(1);
    const line = captured[0]!;
    expect(line).not.toContain(openaiKey);
    expect(line).toMatch(/redacted/);
  });

  it("redacts BOTH ghp_ and sk-proj- keys when they appear in the same field", () => {
    const logger = buildLogger({ defaultLevel: "info", env: { FORKCTL_LOG: "info" } });
    const gh = "ghp_thisisafaketokenbutshouldstillbe1234567";
    const openai = "sk-proj-" + "B".repeat(48);
    logger.error("two leaks in one string", { detail: `gh=${gh} openai=${openai}` });

    expect(captured).toHaveLength(1);
    expect(captured[0]).not.toContain(gh);
    expect(captured[0]).not.toContain(openai);
  });

  it("emits structured JSON lines with ts, level, msg", () => {
    const logger = buildLogger({ defaultLevel: "info", env: { FORKCTL_LOG: "info" } });
    logger.info("hello");
    expect(captured).toHaveLength(1);
    const line = captured[0]!.trim();
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("hello");
    expect(typeof parsed.ts).toBe("string");
  });

  it("respects FORKCTL_LOG=off and writes nothing at all", () => {
    const logger = buildLogger({ defaultLevel: "info", env: { FORKCTL_LOG: "off" } });
    logger.error("this must not appear");
    expect(captured).toHaveLength(0);
  });

  it("child() merges base fields into every line", () => {
    const logger = buildLogger({
      defaultLevel: "info",
      env: { FORKCTL_LOG: "info" },
      baseFields: { tool: "forkctl_assess" },
    });
    const child = logger.child({ correlation_id: "abc12345" });
    child.info("hi");
    const parsed = JSON.parse(captured[0]!.trim()) as Record<string, unknown>;
    expect(parsed.tool).toBe("forkctl_assess");
    expect(parsed.correlation_id).toBe("abc12345");
  });
});

describe("newCorrelationId", () => {
  it("returns an 8-char short id", () => {
    const id = newCorrelationId();
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("returns different ids on successive calls", () => {
    const a = newCorrelationId();
    const b = newCorrelationId();
    expect(a).not.toBe(b);
  });
});
