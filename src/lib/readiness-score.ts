import {
  SCANNER_MATURITY_DIMENSIONS,
  type ScannerMaturity,
} from "@/lib/scanner-scoring";

export type ReadinessDimensionKey = (typeof SCANNER_MATURITY_DIMENSIONS)[number];

export type ReadinessOptionValue = 1 | 2 | 3 | 4 | 5;

export type ReadinessOption = {
  value: ReadinessOptionValue;
  label: string;
};

type ReadinessDimensionContent = {
  label: string;
  prompt: string;
  optionLabels: readonly [string, string, string, string, string];
};

export type ReadinessDimension = {
  key: ReadinessDimensionKey;
  label: string;
  prompt: string;
  options: readonly ReadinessOption[];
};

export type ReadinessScoreBandName = "Early" | "Developing" | "Advanced";

export type ReadinessScoreBand = {
  name: ReadinessScoreBandName;
  min: number;
  max: number;
  explanation: string;
};

export type ReadinessScoreFormValues = Record<
  ReadinessDimensionKey,
  "" | `${ReadinessOptionValue}`
>;

export type ReadinessScoreFormErrors = Partial<
  Record<ReadinessDimensionKey | "form", string>
>;

export type ReadinessScoreResult = {
  score: number;
  band: ReadinessScoreBand;
};

export type ReadinessScoreFormState =
  | {
      status: "idle";
      values: ReadinessScoreFormValues;
      errors: ReadinessScoreFormErrors;
      result?: undefined;
    }
  | {
      status: "error";
      values: ReadinessScoreFormValues;
      errors: ReadinessScoreFormErrors;
      result?: undefined;
    }
  | {
      status: "success";
      values: ReadinessScoreFormValues;
      errors: ReadinessScoreFormErrors;
      result: ReadinessScoreResult;
    };

type ReadinessScoreValidationResult =
  | {
      isValid: true;
      values: ReadinessScoreFormValues;
      maturity: ScannerMaturity;
      errors: {};
    }
  | {
      isValid: false;
      values: ReadinessScoreFormValues;
      errors: ReadinessScoreFormErrors;
    };

const READINESS_DIMENSION_CONTENT = {
  toolAdoption: {
    label: "AI tool adoption",
    prompt: "How widely is AI used in day-to-day work today?",
    optionLabels: [
      "No meaningful use yet",
      "A few isolated experiments",
      "Used by some people for some tasks",
      "Used across several recurring workflows",
      "Broad, reliable use across the business",
    ],
  },
  processIntegration: {
    label: "Process integration",
    prompt: "How embedded is AI in repeatable business processes?",
    optionLabels: [
      "Not built into workflows",
      "Used ad hoc without a repeatable process",
      "Applied in a few documented workflows",
      "Integrated into several recurring processes",
      "Standardized in core operating workflows",
    ],
  },
  dataReadiness: {
    label: "Data readiness",
    prompt: "How ready is your data for useful AI work?",
    optionLabels: [
      "Scattered, incomplete, or hard to access",
      "Partly organized but inconsistent",
      "Usable for some AI work with cleanup",
      "Organized and accessible for many use cases",
      "Well-structured, governed, and dependable",
    ],
  },
  technicalCapacity: {
    label: "Technical capacity",
    prompt: "How prepared is your team to implement and support AI?",
    optionLabels: [
      "No practical internal capacity yet",
      "Limited support for simple tools only",
      "Can support a few focused implementations",
      "Can deploy and maintain multiple solutions",
      "Strong in-house capability and ownership",
    ],
  },
  governance: {
    label: "Governance",
    prompt: "How clear are your safeguards, ownership, and review practices?",
    optionLabels: [
      "No clear guardrails or ownership",
      "Early discussions but little structure",
      "Basic guidelines for some use cases",
      "Defined review and accountability in place",
      "Mature governance with active oversight",
    ],
  },
} satisfies Record<ReadinessDimensionKey, ReadinessDimensionContent>;

export const READINESS_SCORE_BANDS: readonly ReadinessScoreBand[] = [
  {
    name: "Early",
    min: 0,
    max: 40,
    explanation:
      "You appear to be in the early stages of AI readiness, with core foundations still being established.",
  },
  {
    name: "Developing",
    min: 41,
    max: 70,
    explanation:
      "You appear to have meaningful AI foundations in place, with room to make adoption more consistent and operational.",
  },
  {
    name: "Advanced",
    min: 71,
    max: 100,
    explanation:
      "You appear to have strong AI readiness across several dimensions, with a solid base for broader execution.",
  },
] as const;

export const READINESS_DIMENSIONS: readonly ReadinessDimension[] =
  SCANNER_MATURITY_DIMENSIONS.map((key) => ({
    key,
    label: READINESS_DIMENSION_CONTENT[key].label,
    prompt: READINESS_DIMENSION_CONTENT[key].prompt,
    options: READINESS_DIMENSION_CONTENT[key].optionLabels.map((label, index) => ({
      value: (index + 1) as ReadinessOptionValue,
      label,
    })),
  }));

export const emptyReadinessScoreValues: ReadinessScoreFormValues =
  createEmptyReadinessScoreValues();

export const emptyReadinessScoreState: ReadinessScoreFormState = {
  status: "idle",
  values: emptyReadinessScoreValues,
  errors: {},
};

export function validateReadinessScoreFormData(
  formData: FormData,
): ReadinessScoreValidationResult {
  const values = createEmptyReadinessScoreValues();
  const errors: ReadinessScoreFormErrors = {};
  const maturity = {} as ScannerMaturity;

  for (const key of SCANNER_MATURITY_DIMENSIONS) {
    const submitted = formData.getAll(key);

    if (submitted.length === 0) {
      errors[key] = "Select one option for this area.";
      continue;
    }

    if (submitted.length !== 1) {
      errors[key] = "Submit exactly one value for this area.";
      continue;
    }

    const entry = submitted[0];
    if (typeof entry !== "string") {
      errors[key] = "Submit a numeric answer for this area.";
      continue;
    }

    const rawValue = entry.trim();
    if (!rawValue) {
      errors[key] = "Select one option for this area.";
      continue;
    }

    if (!/^-?\d+(?:\.\d+)?$/.test(rawValue)) {
      errors[key] = "Submit a whole-number answer for this area.";
      continue;
    }

    const parsedValue = Number(rawValue);
    if (!Number.isInteger(parsedValue)) {
      errors[key] = "Choose one whole-number level from 1 to 5.";
      continue;
    }

    if (parsedValue < 1 || parsedValue > 5) {
      errors[key] = "Choose a level from 1 to 5.";
      continue;
    }

    values[key] = String(parsedValue) as `${ReadinessOptionValue}`;
    maturity[key] = parsedValue;
  }

  if (Object.keys(errors).length > 0) {
    return {
      isValid: false,
      values,
      errors,
    };
  }

  return {
    isValid: true,
    values,
    maturity,
    errors: {},
  };
}

export function resolveReadinessScoreBand(score: number): ReadinessScoreBand | null {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return null;
  }

  return READINESS_SCORE_BANDS.find((band) => score >= band.min && score <= band.max) ?? null;
}

function createEmptyReadinessScoreValues(): ReadinessScoreFormValues {
  return Object.fromEntries(
    SCANNER_MATURITY_DIMENSIONS.map((key) => [key, ""]),
  ) as ReadinessScoreFormValues;
}
