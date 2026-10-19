import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthScreen } from "../AuthScreen";

describe("AuthScreen signup", () => {
  it("stops submitting and explains email verification when no session is returned", async () => {
    const user = userEvent.setup();
    const onLogin = jest.fn().mockResolvedValue({
      requiresEmailConfirmation: true,
    });

    render(<AuthScreen onLogin={onLogin} />);

    await user.click(screen.getByRole("button", { name: "Sign up" }));
    await user.type(screen.getByPlaceholderText("Username"), "new_user");
    await user.type(screen.getByPlaceholderText("Display name"), "New User");
    await user.type(screen.getByPlaceholderText("Email"), "new@example.com");
    await user.type(
      screen.getByPlaceholderText("Password"),
      "correct-horse-battery-staple",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText(
        "Account created. Check your email to verify it, then sign in.",
      ),
    ).not.toBeNull();
    expect(
      (screen.getByRole("button", {
        name: "Create account",
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(onLogin).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.com",
      password: "correct-horse-battery-staple",
      username: "new_user",
      displayName: "New User",
    });
  });
});
