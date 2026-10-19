const mockSignUp = jest.fn();

jest.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signUp: mockSignUp },
  }),
}));

import { authService } from "../auth-v2.service";

describe("authService signup errors", () => {
  it("returns a useful message without logging expected email throttling", async () => {
    const error = Object.assign(new Error("email rate limit exceeded"), {
      code: "over_email_send_rate_limit",
      name: "AuthApiError",
      status: 429,
    });
    mockSignUp.mockResolvedValueOnce({ data: { user: null }, error });
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await authService.signUp({
      email: "new@example.com",
      username: "new_user",
      password: "correct-horse-battery-staple",
      displayName: "New User",
    });

    expect(result).toEqual({
      success: false,
      error:
        "Too many verification emails were requested. Please wait a few minutes, then try again.",
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
