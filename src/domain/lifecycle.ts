import type { LifecycleState, SpecialValidationRecord, TemplateFamily } from "./entities";
import type { Diagnostic } from "./validation";

export type LifecycleAction =
  | "submit_for_review"
  | "return_to_draft"
  | "publish"
  | "retire"
  | "reactivate";

export interface LifecycleContext {
  readonly templateFamily?: TemplateFamily;
  readonly specialValidation?: SpecialValidationRecord;
  readonly newVersionCreated?: boolean;
  readonly auditEventRecorded?: boolean;
}

export type LifecycleResult =
  | { readonly ok: true; readonly state: LifecycleState }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

const destinations: Readonly<Record<LifecycleAction, LifecycleState>> = {
  submit_for_review: "Review",
  return_to_draft: "Draft",
  publish: "Published",
  retire: "Retired",
  reactivate: "Draft",
};

const legalTransitions: Readonly<Record<LifecycleAction, readonly LifecycleState[]>> = {
  submit_for_review: ["Draft"],
  return_to_draft: ["Review"],
  publish: ["Review"],
  retire: ["Published"],
  reactivate: ["Retired"],
};

function reject(code: string, message: string): LifecycleResult {
  return {
    ok: false,
    diagnostic: { code, path: "lifecycle_state", message, severity: "error" },
  };
}

export function transitionLifecycle(
  state: LifecycleState,
  action: LifecycleAction,
  context?: LifecycleContext,
): LifecycleResult {
  if (!legalTransitions[action].includes(state)) {
    return reject("transition_not_allowed", `Cannot ${action} a record in ${state}.`);
  }

  if (action === "reactivate" && (!context?.newVersionCreated || !context.auditEventRecorded)) {
    return reject(
      "reactivation_requirements_missing",
      "Reactivation requires a new version and a recorded audit event.",
    );
  }

  if (action === "publish" && !context?.templateFamily) {
    return reject(
      "publication_context_required",
      "Publishing requires the template family so family-specific publication rules can be enforced.",
    );
  }

  if (action === "publish" && context?.templateFamily === "gang-special-2up") {
    const validation = context.specialValidation;
    const hasCompleteValidation =
      validation?.state === "validated" &&
      typeof validation.reviewer_id === "string" &&
      validation.reviewer_id.trim().length > 0 &&
      typeof validation.reviewed_at === "string" &&
      Number.isFinite(Date.parse(validation.reviewed_at)) &&
      typeof validation.evidence_ref === "string" &&
      validation.evidence_ref.trim().length > 0;

    if (!hasCompleteValidation) {
      return reject(
        "special_record_not_validated",
        "A special Gang record requires a reviewer, review date, and evidence reference before publication.",
      );
    }
  }

  return { ok: true, state: destinations[action] };
}
