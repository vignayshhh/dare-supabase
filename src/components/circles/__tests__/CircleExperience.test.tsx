import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CircleGate } from "../CircleExperience";
import { useCirclesStore } from "@/stores/useCirclesStore";
import { circlesService } from "@/middleware/services/circles.service";

jest.mock("@/stores/resetCircleState", () => ({
  resetCircleState: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/stores/useAuthStore-v2", () => ({
  useAuthStore: () => ({ user: { id: "user-1" } }),
}));
jest.mock("@/middleware/services/circles.service", () => ({
  circlesService: {
    list: jest.fn().mockResolvedValue([]),
    preview: jest.fn(),
    accept: jest.fn(),
    create: jest.fn(),
  },
}));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  jest.clearAllMocks();
  useCirclesStore.setState({
    userId: null,
    activeId: null,
    circles: [],
    ready: false,
    error: "",
    pickerOpen: false,
  });
  (circlesService.list as jest.Mock).mockResolvedValue([]);
});

test("new users get three optional creation slots and a join route", async () => {
  render(
    <CircleGate userId="user-1">
      <div>private content</div>
    </CircleGate>,
  );
  expect(
    await screen.findAllByRole("button", { name: /Create a Circle/ }),
  ).toHaveLength(3);
  expect(screen.queryByText("private content")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Got an invite/ }),
  ).toBeInTheDocument();
});

test("previewing a six-digit invite never accepts it automatically", async () => {
  (circlesService.preview as jest.Mock).mockResolvedValue({
    circleId: "circle-1",
    name: "Besties",
    avatar: "🫶",
    inviter: "Ari",
    memberCount: 4,
    alreadyMember: false,
  });
  render(
    <CircleGate userId="user-1">
      <div>private content</div>
    </CircleGate>,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Got an invite/ }));
  fireEvent.change(screen.getByLabelText("Your six-digit invitation code"), {
    target: { value: "012345" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find my people" }));
  expect(await screen.findByText("Besties")).toBeInTheDocument();
  expect(circlesService.accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() =>
    expect(circlesService.accept).toHaveBeenCalledWith("012345"),
  );
});
