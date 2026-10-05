import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DataDeletionPage from "../app/data-deletion/page";

describe("data deletion page", () => {
  const markup = renderToStaticMarkup(createElement(DataDeletionPage));

  it("explains how to request deletion, with a prefilled mailto subject", () => {
    expect(markup).toContain("Delete your data");
    expect(markup).toContain("mailto:help@futco.ai?subject=Data%20deletion%20request");
    expect(markup).toContain("within");
  });

  it("states that no Facebook account data is stored", () => {
    expect(markup).toContain("does not use Facebook Login");
    expect(markup).toContain("does not store any data from your Facebook");
  });
});
