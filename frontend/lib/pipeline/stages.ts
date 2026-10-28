/**
 * Canonical /pipeline column order (E2E-CRM-07 pack example).
 * Existing pipeline_stage keys are kept; no bulk remap of live companies.
 * contact_lead stays so inbound /api/leads cards remain visible.
 * competitor is tracking-only and is not a board column.
 */
export const PIPELINE_BOARD_STAGES = [
  { key: "prospect",          label: "Prospect",                 color: "bg-gray-100 text-gray-700",     border: "border-gray-200" },
  { key: "contact_lead",      label: "Contact Lead",             color: "bg-sky-100 text-sky-700",       border: "border-sky-200" },
  { key: "contacted",         label: "Contacted",                color: "bg-indigo-100 text-indigo-700", border: "border-indigo-200" },
  { key: "qualified",         label: "Qualified",                color: "bg-blue-100 text-blue-700",     border: "border-blue-200" },
  { key: "diagnosis",         label: "Diagnosis & Presentation", color: "bg-indigo-100 text-indigo-700", border: "border-indigo-200" },
  { key: "prepare_proposal",  label: "Prepare Proposal",         color: "bg-purple-100 text-purple-700", border: "border-purple-200" },
  { key: "proposal_sent",     label: "Proposal Sent",            color: "bg-purple-100 text-purple-700", border: "border-purple-200" },
  { key: "negotiation",       label: "Negotiation & Contract",   color: "bg-amber-100 text-amber-700",   border: "border-amber-200" },
  { key: "closed_won",        label: "Closed Won",               color: "bg-green-100 text-green-700",   border: "border-green-200" },
  { key: "closed_lost",       label: "Closed Lost",              color: "bg-red-100 text-red-700",       border: "border-red-200" },
] as const;

export type PipelineBoardStageKey = (typeof PIPELINE_BOARD_STAGES)[number]["key"];

export const PIPELINE_BOARD_STAGE_KEYS: PipelineBoardStageKey[] =
  PIPELINE_BOARD_STAGES.map((s) => s.key);

export const PIPELINE_FORM_STAGES: Array<{ key: string; label: string }> = [
  { key: "competitor", label: "Competitor (tracking only)" },
  ...PIPELINE_BOARD_STAGES.map((s) => ({ key: s.key, label: s.label })),
];
