import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { QuickQuoteSearch } = await import("./quick-quote-search");

const results = [
  {
    slug: "iphone-15",
    brandSlug: "apple",
    name: "iPhone 15",
    brand: "Apple",
    maxPricePence: 31000,
  },
  { slug: "iphone-13", brandSlug: "apple", name: "iPhone 13", brand: "Apple", maxPricePence: null },
];

beforeEach(() => {
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ results }), { status: 200 })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("QuickQuoteSearch", () => {
  it("is a labelled combobox that submits to /sell without JS", () => {
    const { container } = render(<QuickQuoteSearch />);
    const input = screen.getByRole("combobox", { name: "Which phone are you selling?" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector("form")).toHaveAttribute("action", "/sell");
    expect(input).toHaveAttribute("name", "q");
  });

  it("shows server prices and announces the result count", async () => {
    render(<QuickQuoteSearch />);
    await userEvent.type(screen.getByRole("combobox"), "iphone");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("Apple iPhone 15");
    expect(options[0]).toHaveTextContent("Up to £310");
    expect(screen.getByText("2 phones found.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/models/search?q=iphone", expect.anything());
  });

  it("supports arrow keys and Enter", async () => {
    render(<QuickQuoteSearch />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "iphone");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringMatching(/-1$/));
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/sell/apple/iphone-13");
  });

  it("closes with Escape", async () => {
    render(<QuickQuoteSearch />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "iphone");
    await screen.findAllByRole("option");
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("doesn't search for a single character", async () => {
    render(<QuickQuoteSearch />);
    await userEvent.type(screen.getByRole("combobox"), "i");
    await new Promise((r) => setTimeout(r, 300));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tells the user when search fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    render(<QuickQuoteSearch />);
    await userEvent.type(screen.getByRole("combobox"), "iphone");
    await waitFor(() =>
      expect(
        screen.getByText("Search isn’t working right now. Please try again."),
      ).toBeInTheDocument(),
    );
  });
});
