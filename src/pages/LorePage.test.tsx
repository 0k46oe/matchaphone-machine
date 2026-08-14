import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LorePage from "./LorePage";

const mocked = vi.hoisted(() => ({
  groups: [] as Array<{ id: string; name: string; order: number; createdAt: number; updatedAt: number }>,
  state: {} as any,
}));

vi.mock("../core/store", () => ({ useStore: () => mocked.state }));
vi.mock("../core/loreShelfGroups", () => ({
  getLoreShelfGroups: vi.fn(async () => mocked.groups),
  ensureLoreShelfGroup: vi.fn(),
  renameLoreShelfGroup: vi.fn(),
  deleteLoreShelfGroup: vi.fn(),
}));

function setup(loreBooks: any[] = []) {
  mocked.state = { loreBooks, characters: [], conversations: [], reload: vi.fn() };
  return render(<MemoryRouter><LorePage /></MemoryRouter>);
}

const book = {
  id: "book-1",
  schemaVersion: 14,
  createdAt: 1,
  updatedAt: 1,
  name: "雾港市",
  description: "城市设定",
  entries: [],
  enabled: true,
  mount: { mode: "none", characterIds: [], conversationIds: [] },
  triggerSettings: { defaultScanDepth: 20, maxContextChars: 3000 },
};

describe("LorePage library states", () => {
  beforeEach(() => { mocked.groups = []; });
  afterEach(() => cleanup());

  it("shows a page-level empty state without shelves or filters while keeping group management available", async () => {
    mocked.groups = [{ id: "saved-empty", name: "已保存空分组", order: 0, createdAt: 1, updatedAt: 1 }];
    const { container } = setup();
    await waitFor(() => expect(screen.getByText("书架还是空的")).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "新建世界书" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "导入文档" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("搜索世界书")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "管理分组" })).toBeInTheDocument();
    expect(screen.queryByText("未分组")).not.toBeInTheDocument();
    expect(screen.queryByText("共 0 本世界书")).not.toBeInTheDocument();
    expect(container.querySelector(".lore-shelf")).not.toBeInTheDocument();
  });

  it("keeps filters for a non-empty library and shows a filtered no-results state", async () => {
    setup([book]);
    await waitFor(() => expect(screen.getByPlaceholderText("搜索世界书")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("搜索世界书"), { target: { value: "不存在的设定" } });
    expect(screen.getByText("没有符合条件的世界书")).toBeInTheDocument();
    expect(screen.getByText("共 0 本世界书")).toBeInTheDocument();
    expect(screen.queryByText("书架还是空的")).not.toBeInTheDocument();
  });
});
