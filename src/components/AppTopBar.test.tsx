import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {AppTopBar,APP_TOPBAR_CONTENT_HEIGHT} from "./ui";

afterEach(cleanup);

describe("AppTopBar",()=>{
 it("keeps one canonical 58px content height and a centered single-line title",()=>{
  const onBack=vi.fn();
  render(<AppTopBar title="设置" backLabel="返回桌面" onBack={onBack}/>);
  const header=screen.getByRole("banner");
  expect(APP_TOPBAR_CONTENT_HEIGHT).toBe(58);
  expect(header).toHaveClass("app-topbar");
  expect(header).toHaveStyle({"--app-topbar-content-height":"58px"});
  expect(screen.getByRole("heading",{name:"设置"})).toHaveClass("app-topbar-title");
  fireEvent.click(screen.getByRole("button",{name:"返回桌面"}));
  expect(onBack).toHaveBeenCalledOnce();
 });
 it("supports multiple right-side actions without changing the header contract",()=>{
  render(<AppTopBar title="记忆小屋" onBack={()=>undefined} actions={<><button aria-label="添加记忆">+</button><button aria-label="记忆设置">s</button></>}/>);
  expect(screen.getByRole("button",{name:"添加记忆"})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"记忆设置"})).toBeInTheDocument();
  expect(document.querySelector(".app-topbar-actions")?.children).toHaveLength(2);
 });
});
