import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { GradeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders a button with the default (brand) variant", () => {
    render(<Button>Get a quote</Button>);
    const button = screen.getByRole("button", { name: "Get a quote" });
    expect(button).toHaveAttribute("data-variant", "default");
    expect(button.className).toContain("bg-primary");
  });

  it("renders its child element when asChild is set", () => {
    render(
      <Button asChild variant="outline">
        <a href="/shop">Shop</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Shop" });
    expect(link).toHaveAttribute("href", "/shop");
    expect(link).toHaveAttribute("data-variant", "outline");
  });
});

describe("GradeBadge", () => {
  it.each([
    ["A", "Grade A · Excellent"],
    ["B", "Grade B · Very good"],
    ["C", "Grade C · Good"],
  ] as const)("spells out grade %s as text", (grade, text) => {
    const { container } = render(<GradeBadge grade={grade} />);
    expect(container.textContent).toBe(text);
    expect(container.firstElementChild).toHaveAttribute("data-grade", grade);
  });

  it("can hide the label", () => {
    const { container } = render(<GradeBadge grade="B" showLabel={false} />);
    expect(container.textContent).toBe("Grade B");
  });
});

describe("Breadcrumbs", () => {
  it("marks the last item as the current page and links the rest", () => {
    const { container } = render(
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Shop", href: "/shop" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Shop")).toHaveAttribute("aria-current", "page");

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(script!.textContent!)["@type"]).toBe("BreadcrumbList");
  });
});
