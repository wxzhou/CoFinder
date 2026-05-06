import { describe, expect, it } from "vitest";
import { pathToSegments } from "../src/renderer/v12/pane/pathSegments";

describe("pathToSegments", () => {
  it("returns root only for /", () => {
    expect(pathToSegments("/")).toEqual([{ label: "/", path: "/" }]);
  });

  it("builds cumulative POSIX paths", () => {
    expect(pathToSegments("/Users/foo")).toEqual([
      { label: "/", path: "/" },
      { label: "Users", path: "/Users" },
      { label: "foo", path: "/Users/foo" }
    ]);
  });
});
