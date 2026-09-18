import { INTAKE_FIELDS, type ScannerIntakeFieldKey } from "@/lib/scanner-intake-fields";
import {
  emptyScannerIntakeFormValues,
  sanitizeScannerIntakeFormValues,
  type ScannerIntakeFormValues,
} from "@/lib/scanner-intake";

export type ScannerIntakeDraft = Partial<
  Record<ScannerIntakeFieldKey, string | null>
>;

export type ScannerIntakePrefillSource = {
  url: string;
  chars: number;
};

export type ScannerIntakeEnrichmentInput = {
  website: string | null;
  analyzedAt: string | null;
  model: string | null;
  sources: ScannerIntakePrefillSource[];
  draftedFields: ScannerIntakeFieldKey[];
  editedFields: ScannerIntakeFieldKey[];
  truncated: boolean | null;
  error: string | null;
};

export const emptyScannerIntakeEnrichment: ScannerIntakeEnrichmentInput = {
  website: null,
  analyzedAt: null,
  model: null,
  sources: [],
  draftedFields: [],
  editedFields: [],
  truncated: null,
  error: null,
};

const intakeFieldKeys = new Set(INTAKE_FIELDS.map((field) => field.key));

export function emptyScannerIntakeDraft(): ScannerIntakeDraft {
  return {};
}

export function isScannerIntakeFieldKey(value: string): value is ScannerIntakeFieldKey {
  return intakeFieldKeys.has(value as ScannerIntakeFieldKey);
}

export function mergeScannerIntakeDraft(
  values: ScannerIntakeFormValues,
  draft: ScannerIntakeDraft,
) {
  const nextValues = { ...values };
  const draftedFields: ScannerIntakeFieldKey[] = [];

  for (const [rawKey, rawValue] of Object.entries(draft)) {
    if (!isScannerIntakeFieldKey(rawKey) || rawValue == null) {
      continue;
    }

    // Never overwrite something the person already typed.
    if (String(values[rawKey] ?? "").trim() !== "") {
      continue;
    }

    nextValues[rawKey] = sanitizeScannerIntakeFormValues({
      ...emptyScannerIntakeFormValues,
      [rawKey]: rawValue,
    })[rawKey];
    draftedFields.push(rawKey);
  }

  return { values: nextValues, draftedFields };
}

export function clearScannerIntakeDraft(
  values: ScannerIntakeFormValues,
  draft: ScannerIntakeDraft,
  draftedFields: ScannerIntakeFieldKey[],
) {
  const nextValues = { ...values };

  for (const field of draftedFields) {
    const draftValue = draft[field];
    if (draftValue == null) {
      continue;
    }

    const sanitizedDraftValue = sanitizeScannerIntakeFormValues({
      ...emptyScannerIntakeFormValues,
      [field]: draftValue,
    })[field];

    if (values[field] === sanitizedDraftValue) {
      nextValues[field] = "";
    }
  }

  return nextValues;
}

export function computeEditedScannerIntakeFields(
  values: ScannerIntakeFormValues,
  draft: ScannerIntakeDraft,
  draftedFields: ScannerIntakeFieldKey[],
) {
  const sanitizedValues = sanitizeScannerIntakeFormValues(values);

  return draftedFields.filter((field) => {
    const draftValue = draft[field];
    if (draftValue == null) {
      return false;
    }

    const sanitizedDraftValue = sanitizeScannerIntakeFormValues({
      ...emptyScannerIntakeFormValues,
      [field]: draftValue,
    })[field];

    return sanitizedValues[field] !== sanitizedDraftValue;
  });
}
