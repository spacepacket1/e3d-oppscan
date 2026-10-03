import { describe, expect, it } from "vitest";

import { assessHvacFit, buildHvacLeadContext } from "@/lib/hvac-fit";
import { emptyHvacDetectedStack } from "@/lib/scanner-lite-stack";

const hvacProfile = {
  companyName: "Redwood Heating & Air",
  industry: "HVAC services",
  companyDescription: "Family-owned heating and cooling contractor.",
};

describe("assessHvacFit", () => {
  it("rates a Jobber shop as a strong fit (open developer platform)", () => {
    expect(assessHvacFit(hvacProfile, ["jobber"]).tier).toBe("strong");
  });

  it("rates ServiceTitan and Housecall Pro as possible (gated access)", () => {
    expect(assessHvacFit(hvacProfile, ["servicetitan"]).tier).toBe("possible");
    expect(assessHvacFit(hvacProfile, ["housecall_pro"]).tier).toBe("possible");
  });

  it("rates spreadsheets/paper as strong: nothing to integrate with", () => {
    expect(assessHvacFit(hvacProfile, ["spreadsheets_paper"]).tier).toBe("strong");
  });

  it("is possible when the stack is unknown", () => {
    const result = assessHvacFit(hvacProfile, [], emptyHvacDetectedStack);
    expect(result.tier).toBe("possible");
    expect(result.reasons[0]).toMatch(/unknown/i);
  });

  it("uses a detected platform when nothing was self-reported", () => {
    const result = assessHvacFit(hvacProfile, [], {
      platform: "jobber",
      onlineBooking: true,
      chatWidget: false,
    });
    expect(result.tier).toBe("strong");
  });

  it("takes the best tier when several platforms are in play", () => {
    expect(assessHvacFit(hvacProfile, ["servicetitan", "jobber"]).tier).toBe("strong");
  });

  it("marks a non-HVAC business as unlikely regardless of tools", () => {
    const result = assessHvacFit(
      { companyName: "Acme Bakery", industry: "Food", companyDescription: "Bread." },
      ["jobber"],
    );
    expect(result.tier).toBe("unlikely");
  });

  it("caps a franchised operation at possible", () => {
    const result = assessHvacFit(
      { ...hvacProfile, companyDescription: "Franchise HVAC locations nationwide." },
      ["jobber"],
    );
    expect(result.tier).toBe("possible");
    expect(result.reasons.join(" ")).toMatch(/franchised/i);
  });
});

describe("buildHvacLeadContext", () => {
  it("prefers the self-reported platform over the detected one", () => {
    const context = buildHvacLeadContext(hvacProfile, ["jobber"], {
      platform: "servicetitan",
      onlineBooking: true,
      chatWidget: false,
    });
    expect(context.primaryPlatform).toBe("jobber");
    expect(context.detected.platform).toBe("servicetitan");
  });

  it("falls back to the detected platform, then null", () => {
    expect(
      buildHvacLeadContext(hvacProfile, [], {
        platform: "workiz",
        onlineBooking: false,
        chatWidget: false,
      }).primaryPlatform,
    ).toBe("workiz");
    expect(
      buildHvacLeadContext(hvacProfile, ["other"], emptyHvacDetectedStack).primaryPlatform,
    ).toBeNull();
  });
});
