export const scannerOutcomeTypes = [
  "automation",
  "augmentation",
  "decision-support",
  "process-change",
  "do-nothing",
] as const;

export type ScannerOutcomeType = (typeof scannerOutcomeTypes)[number];

export type ScannerCandidate = {
  id: string;
  title: string;
  summary: string;
  outcomeType: ScannerOutcomeType;
  impact: number;
  feasibility: number;
  timeToValue: number;
  confidence: number;
  risk: number;
  evidence: string[];
  firstStep: string;
};

export type RankedScannerCandidate = ScannerCandidate & {
  score: number;
  rank: number;
};

export function rankScannerCandidates(
  candidates: readonly ScannerCandidate[],
): RankedScannerCandidate[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score:
        candidate.impact * 30 +
        candidate.feasibility * 25 +
        candidate.timeToValue * 20 +
        candidate.confidence * 15 -
        candidate.risk * 10,
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.impact - left.impact ||
        right.feasibility - left.feasibility ||
        left.risk - right.risk ||
        compareCodePoints(left.id, right.id),
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function compareCodePoints(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
