export type SelectableGroup = {
  name: string;
  required: boolean;
  options: { id: string }[];
};

export function assertPlanSelection(groups: SelectableGroup[], optionIds: string[]) {
  const chosen = new Set(optionIds);
  for (const group of groups) {
    const matches = group.options.filter((option) => chosen.has(option.id));
    if (group.required && matches.length !== 1) {
      return {
        ok: false as const,
        code: "INVALID_PLAN",
        message: `Choose one option for ${group.name}.`,
      };
    }
    if (!group.required && matches.length > 1) {
      return {
        ok: false as const,
        code: "INVALID_PLAN",
        message: `${group.name} accepts only one option.`,
      };
    }
  }
  const known = new Set(groups.flatMap((group) => group.options.map((option) => option.id)));
  if (optionIds.some((id) => !known.has(id))) {
    return { ok: false as const, code: "INVALID_PLAN", message: "One of the selected options does not belong to this plan." };
  }
  return { ok: true as const };
}
