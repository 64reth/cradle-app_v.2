import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";

describe("App", () => {
  it("renders the Phase 1 application shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /calm operating system/i })).toBeInTheDocument();
    expect(screen.getByText(/validated slices/i)).toBeInTheDocument();
  });
});
