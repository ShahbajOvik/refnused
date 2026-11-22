import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GuideBody, safeHref } from "./portable-text";

describe("safeHref", () => {
  it("allows relative, http(s), mailto and tel links", () => {
    expect(safeHref("/sell")).toBe("/sell");
    expect(safeHref("#steps")).toBe("#steps");
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("mailto:hello@example.com")).toBe("mailto:hello@example.com");
    expect(safeHref("tel:+441913800456")).toBe("tel:+441913800456");
  });

  it("blocks script and protocol-relative URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref(" JavaScript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref(42)).toBeNull();
  });
});

describe("GuideBody", () => {
  it("renders headings from h2 and drops unsafe links but keeps their text", () => {
    render(
      <GuideBody
        value={[
          {
            _type: "block",
            _key: "h",
            style: "h1",
            markDefs: [],
            children: [{ _type: "span", _key: "s", text: "Heading", marks: [] }],
          },
          {
            _type: "block",
            _key: "p",
            style: "normal",
            markDefs: [
              { _type: "link", _key: "bad", href: "javascript:alert(1)" },
              { _type: "link", _key: "good", href: "/sell" },
            ],
            children: [
              { _type: "span", _key: "a", text: "Bad link", marks: ["bad"] },
              { _type: "span", _key: "b", text: " and ", marks: [] },
              { _type: "span", _key: "c", text: "good link", marks: ["good"] },
            ],
          },
          { _type: "image", _key: "i", url: "https://evil.example/x.png", alt: "x" },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Heading" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bad link" })).toBeNull();
    expect(screen.getByText(/Bad link and/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "good link" })).toHaveAttribute("href", "/sell");
    expect(screen.queryByRole("img")).toBeNull();
  });
});
