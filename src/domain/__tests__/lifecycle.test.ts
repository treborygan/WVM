import { describe, expect, it } from "vitest";

import { transitionLifecycle } from "../lifecycle";

describe("lifecycle transitions", () => {
  it.each([
    ["Draft", "submit_for_review", "Review"],
    ["Review", "return_to_draft", "Draft"],
    ["Review", "publish", "Published"],
    ["Published", "retire", "Retired"],
  ] as const)("transitions %s with %s to %s", (state, action, expected) => {
    expect(transitionLifecycle(state, action)).toEqual({ ok: true, state: expected });
  });

  it("rejects an illegal transition with a structured diagnostic", () => {
    const result = transitionLifecycle("Draft", "publish");

    expect(result).toEqual({
      ok: false,
      diagnostic: expect.objectContaining({
        code: "transition_not_allowed",
        path: "lifecycle_state",
      }),
    });
  });

  it("requires a new version and audit event to reactivate a retired record", () => {
    const rejected = transitionLifecycle("Retired", "reactivate", {
      newVersionCreated: true,
      auditEventRecorded: false,
    });
    const accepted = transitionLifecycle("Retired", "reactivate", {
      newVersionCreated: true,
      auditEventRecorded: true,
    });

    expect(rejected).toMatchObject({ ok: false, diagnostic: { code: "reactivation_requirements_missing" } });
    expect(accepted).toEqual({ ok: true, state: "Draft" });
  });

  it("blocks a special Gang record from publication until its validation is recorded", () => {
    const result = transitionLifecycle("Review", "publish", {
      isSpecialGang: true,
      specialValidation: { status: "pending" },
    });

    expect(result).toMatchObject({ ok: false, diagnostic: { code: "special_record_not_validated" } });
  });

  it("allows a special Gang publication only with reviewer, date, and evidence", () => {
    const result = transitionLifecycle("Review", "publish", {
      isSpecialGang: true,
      specialValidation: {
        status: "validated",
        reviewer_id: "reviewer-1",
        reviewed_at: "2026-09-25T08:00:00.000Z",
        evidence_ref: "validation-record-1",
      },
    });

    expect(result).toEqual({ ok: true, state: "Published" });
  });
});
