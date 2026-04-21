import { describe, expect, it } from "vitest";
import {
  GoalSchema,
  PathChoiceSchema,
  ProfileIdSchema,
  RepoRefSchema,
  VisibilitySchema,
} from "../src/schemas/common.js";

describe("RepoRefSchema", () => {
  it.each(["octocat/hello-world", "Some.Org/some-repo", "a/b", "x/y_z.foo"])(
    "accepts %s",
    (ref) => {
      expect(RepoRefSchema.safeParse(ref).success).toBe(true);
    },
  );

  it.each(["", "no-slash", "/leading", "trailing/", "a/b/c", "https://github.com/o/r"])(
    "rejects %s",
    (ref) => {
      expect(RepoRefSchema.safeParse(ref).success).toBe(false);
    },
  );
});

describe("enum schemas", () => {
  it("GoalSchema enumerates the five goals", () => {
    expect(GoalSchema.options).toEqual([
      "contribute_upstream",
      "ship_derivative",
      "internal_seed",
      "client_copy",
      "experiment",
    ]);
  });

  it("PathChoiceSchema enumerates the four duplication paths", () => {
    expect(PathChoiceSchema.options).toEqual(["fork", "template", "import", "clone_detached"]);
  });

  it("ProfileIdSchema matches the five profiles", () => {
    expect(new Set(ProfileIdSchema.options)).toEqual(
      new Set(["contributor", "starter-kit", "internal-seed", "client-delivery", "experiment"]),
    );
  });

  it("VisibilitySchema covers public/private/internal", () => {
    expect(VisibilitySchema.options).toEqual(["public", "private", "internal"]);
  });
});
