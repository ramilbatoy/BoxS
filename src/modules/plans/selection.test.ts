import { describe, expect, it } from "vitest";
import { assertPlanSelection } from "./selection";

const groups = [
  { name: "Duration", required: true, options: [{ id: "d7" }, { id: "d30" }] },
  { name: "Serving", required: true, options: [{ id: "regular" }] },
];

describe("plan selection", () => {
  it("rejects a missing required option", () => {
    const result = assertPlanSelection(groups, ["d7"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_PLAN");
  });

  it("accepts one option from each required group", () => {
    expect(assertPlanSelection(groups, ["d30", "regular"]).ok).toBe(true);
  });
});
