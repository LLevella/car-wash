import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "../components/StatusBadge";

describe("StatusBadge", () => {
  it("shows a human label for booking statuses", () => {
    render(<StatusBadge status="in_progress" />);

    expect(screen.getByTestId("status-badge")).toHaveTextContent("В работе");
  });
});
