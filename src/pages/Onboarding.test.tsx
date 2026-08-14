import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import Onboarding from "./Onboarding";

const mocked = vi.hoisted(() => ({
  reload: vi.fn().mockResolvedValue(undefined),
  setSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../core/store", () => ({
  useStore: (selector: (state: {reload: typeof mocked.reload}) => unknown) =>
    selector({reload: mocked.reload}),
}));
vi.mock("../core/db", () => ({setSetting: mocked.setSetting}));

afterEach(() => {
  cleanup();
  mocked.reload.mockClear();
  mocked.setSetting.mockClear();
});

describe("first-run onboarding", () => {
  it("shows clear safety, local-data and API privacy guidance", () => {
    render(<Onboarding />);
    expect(screen.getByRole("heading", {name: "欢迎来到茶茶机"})).toBeInTheDocument();
    expect(screen.queryByLabelText("茶茶机")).not.toBeInTheDocument();
    expect(screen.queryByText("MATCHA PHONE")).not.toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-chacha-onboarding", "true");
    expect(screen.getByText("内容由 AI 生成")).toBeInTheDocument();
    expect(screen.getByText("数据主要保存在本机")).toBeInTheDocument();
    expect(screen.getByText("了解 API 与隐私")).toBeInTheDocument();
    expect(screen.getByText("我已年满 18 周岁")).toBeInTheDocument();
  });

  it("requires consent before entering and persists the adult confirmation", async () => {
    render(<Onboarding />);
    const enter = screen.getByRole("button", {name: "进入茶茶机"});
    expect(enter).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(enter).toBeEnabled();
    fireEvent.click(enter);
    await waitFor(() => expect(mocked.setSetting).toHaveBeenCalled());
    expect(mocked.setSetting.mock.calls[0][0]).toBe("app");
    expect(mocked.setSetting.mock.calls[0][1]).toMatchObject({
      onboarded: true,
      adultConfirmed: true,
      sensitiveContent: false,
    });
    expect(mocked.reload).toHaveBeenCalledOnce();
  });
});
