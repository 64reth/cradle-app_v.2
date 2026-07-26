import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberSelector } from "../src/MemberSelector";

const members = [
  { id: "owner", displayName: "Gareth", role: "owner", lifecycleState: "active" },
  { id: "parent", displayName: "Gillian", role: "parent_admin", lifecycleState: "active" },
  { id: "adult", displayName: "Tyrel", role: "adult", lifecycleState: "active" },
  { id: "teen", displayName: "Tajaun", role: "child", lifecycleState: "managed" },
  { id: "unclaimed", displayName: "Taryn", role: "child", lifecycleState: "unclaimed" },
  { id: "archived", displayName: "Archived", role: "adult", lifecycleState: "left" }
];

describe("canonical Family participant selector", () => {
  it("shows every real eligible member, keeps stable order, and supports select/clear", () => {
    const onChange = (value: string[]) => rerender(<MemberSelector members={members} multiple values={value}
      label="Who’s coming?" onValuesChange={onChange} />);
    const { rerender } = render(<MemberSelector members={members} multiple values={members.slice(0, 5).map(({ id }) => id)}
      label="Who’s coming?" onValuesChange={onChange} />);
    expect(screen.getAllByRole("checkbox").map((input) => input.getAttribute("aria-label"))).toEqual([
      "Gareth", "Gillian", "Tyrel", "Tajaun", "Taryn"
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getAllByRole("checkbox").every((input) => !(input as HTMLInputElement).checked)).toBe(true);
  });
});
