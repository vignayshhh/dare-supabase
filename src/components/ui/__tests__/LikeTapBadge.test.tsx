import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { LikeTapBadge } from "../LikeTapBadge";

describe("LikeTapBadge", () => {
  const props = { count: 49, actorId: "one", actorName: "Sam", color: "#ff3b6b" };
  let cancel: jest.Mock;
  let animate: jest.Mock;

  beforeEach(() => {
    cancel = jest.fn();
    animate = jest.fn().mockReturnValue({ cancel });
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: jest.fn().mockReturnValue({ matches: false }) });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
    jest.restoreAllMocks();
  });

  it("shows the latest count immediately and cancels superseded animations", () => {
    const { rerender } = render(<LikeTapBadge {...props} />);
    expect(animate).not.toHaveBeenCalled();
    rerender(<LikeTapBadge {...props} count={50} />);
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(animate).toHaveBeenCalledTimes(3);
    rerender(<LikeTapBadge {...props} count={53} />);
    expect(screen.getByText("53")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(cancel).toHaveBeenCalledTimes(3);
  });

  it("opens likes without triggering the underlying media interaction", () => {
    const onOpen = jest.fn();
    const onMediaClick = jest.fn();
    render(<div onClick={onMediaClick}><LikeTapBadge {...props} onOpen={onOpen} /></div>);
    fireEvent.click(screen.getByRole("button", { name: "Sam liked 49 times. Open likes" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMediaClick).not.toHaveBeenCalled();
  });

  it("does not celebrate another leading liker or a rollback", () => {
    const { rerender } = render(<LikeTapBadge {...props} />);
    rerender(<LikeTapBadge {...props} actorId="two" count={80} />);
    rerender(<LikeTapBadge {...props} actorId="two" count={79} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it("updates the number without movement for reduced motion", () => {
    jest.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    const { rerender } = render(<LikeTapBadge {...props} />);
    rerender(<LikeTapBadge {...props} count={50} />);
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
  });
});
