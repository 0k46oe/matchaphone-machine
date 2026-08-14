import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {defaultAppearance} from "../core/appearance";
import Home from "./Home";

const mocked=vi.hoisted(()=>({
  setSetting:vi.fn().mockResolvedValue(undefined),
  reload:vi.fn().mockResolvedValue(undefined),
  put:vi.fn().mockResolvedValue(undefined),
  compressImage:vi.fn(),
  state:{} as any
}));
vi.mock("../core/db",()=>({setSetting:mocked.setSetting,db:{imageAssets:{put:mocked.put}}}));
vi.mock("../core/imageAssets",()=>({compressImage:mocked.compressImage}));
vi.mock("../core/store",()=>({useStore:()=>mocked.state}));

function setup(appearance=structuredClone(defaultAppearance)){
  mocked.state={appearance,imageAssets:[],messages:[],feedPosts:[],memoryExtractionBatches:[],reload:mocked.reload};
  return render(<MemoryRouter><Home/></MemoryRouter>);
}
function savedItems(){return mocked.setSetting.mock.calls.at(-1)?.[1].items as typeof defaultAppearance.items}
function desktopApp(container:HTMLElement,name:string){return Array.from(container.querySelectorAll<HTMLButtonElement>(".desktop-app")).find(button=>button.textContent===name)}
function withSecondPage(){const appearance=structuredClone(defaultAppearance);const forum=appearance.items.find(item=>item.appId==="forum")!;forum.page=1;forum.x=0;forum.y=0;return appearance}
function rect(left:number,top:number,width:number,height:number){return {left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON:()=>({})} as DOMRect}
function mockRect(element:Element|null,value:DOMRect){Object.defineProperty(element!,"getBoundingClientRect",{configurable:true,value:()=>value})}

describe("Home desktop widgets",()=>{
  afterEach(()=>cleanup());
  beforeEach(()=>{
    mocked.setSetting.mockClear();mocked.reload.mockClear();mocked.put.mockClear();mocked.compressImage.mockReset();
    mocked.compressImage.mockResolvedValue({id:"asset-uploaded",kind:"widget",data:"data:image/png;base64,abc",createdAt:1});
  });

  it("renders the reference details and transparent bubble structure",()=>{
    const {container}=setup();
    expect(screen.getByRole("img",{name:"用户头像"})).toHaveAttribute("src","/desktop-widgets/profile-cat.png");
    expect(screen.getByRole("button",{name:"该用户是一只猫"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:/正在输入中/})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"luv u...TT"})).toBeInTheDocument();
    expect(container.querySelector(".profile-status-back")).toHaveTextContent("返回");
    expect(container.querySelectorAll(".profile-status-menu i")).toHaveLength(3);
    expect(container.querySelector(".profile-status-chat-badge")).toBeInTheDocument();
    expect(container.querySelector(".profile-status-typing>i")).toBeInTheDocument();
    expect(container.querySelector(".widget-compliment-bubble .compliment-main-bubble>span")).toHaveTextContent("luv u...TT");
    expect(container.querySelector(".widget-compliment-bubble .compliment-heart")).toBeInTheDocument();
    expect(container.querySelectorAll(".widget-compliment-bubble .compliment-typing-bubble i")).toHaveLength(3);
    const dockButtons=Array.from(container.querySelectorAll<HTMLButtonElement>(".cha-dock .dock-app"));
    expect(dockButtons.map(button=>button.getAttribute("aria-label"))).toEqual(["消息","角色","外观","设置"]);
  });

  it("edits profile copy in place and saves on blur without a modal",async()=>{
    const {container}=setup();
    fireEvent.click(screen.getByRole("button",{name:"该用户是一只猫"}));
    const input=screen.getByRole("textbox",{name:"组件文字输入"});
    expect(input).toHaveClass("profile-status-caption");
    expect(container.querySelector(".modal")).not.toBeInTheDocument();
    fireEvent.change(input,{target:{value:"新的猫咪状态"}});
    fireEvent.blur(input);
    await waitFor(()=>expect(mocked.setSetting).toHaveBeenCalledOnce());
    expect(savedItems().find(item=>item.widgetType==="profile-status")?.profileStatus).toMatchObject({captionText:"新的猫咪状态",typingText:"正在输入中..."});
  });

  it("edits the compliment bubble in place and saves with Enter",async()=>{
    const {container}=setup();
    fireEvent.click(screen.getByRole("button",{name:"luv u...TT"}));
    const input=screen.getByRole("textbox",{name:"组件文字输入"});
    expect(input.tagName).toBe("TEXTAREA");
    fireEvent.change(input,{target:{value:"今天也很可爱"}});
    fireEvent.keyDown(input,{key:"Enter"});
    await waitFor(()=>expect(mocked.setSetting).toHaveBeenCalledOnce());
    expect(container.querySelector(".modal")).not.toBeInTheDocument();
    expect(savedItems().find(item=>item.widgetType==="compliment-bubble")?.complimentBubble?.text).toBe("今天也很可爱");
    expect(savedItems().find(item=>item.widgetType==="profile-status")?.profileStatus?.captionText).toBe("该用户是一只猫");
  });

  it("cancels inline text editing with Escape or blank content",()=>{
    setup();
    fireEvent.click(screen.getByRole("button",{name:"该用户是一只猫"}));
    let input=screen.getByRole("textbox",{name:"组件文字输入"});
    fireEvent.change(input,{target:{value:"不会保存"}});
    fireEvent.keyDown(input,{key:"Escape"});
    expect(screen.getByRole("button",{name:"该用户是一只猫"})).toBeInTheDocument();
    expect(mocked.setSetting).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button",{name:"该用户是一只猫"}));
    input=screen.getByRole("textbox",{name:"组件文字输入"});
    fireEvent.change(input,{target:{value:"   "}});
    fireEvent.blur(input);
    expect(screen.getByRole("button",{name:"该用户是一只猫"})).toBeInTheDocument();
    expect(mocked.setSetting).not.toHaveBeenCalled();
  });

  it("shows an anchored image toolbar and applies a URL without a modal",async()=>{
    const {container}=setup();
    fireEvent.click(screen.getByRole("button",{name:"编辑头像图片"}));
    expect(screen.getByRole("toolbar",{name:"组件图片工具"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"相册"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"相机"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"默认"})).toBeInTheDocument();
    expect(container.querySelector(".modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button",{name:"URL"}));
    fireEvent.change(screen.getByRole("textbox",{name:"组件图片 URL"}),{target:{value:"https://example.com/cat.png"}});
    fireEvent.click(screen.getByRole("button",{name:"应用"}));
    await waitFor(()=>expect(mocked.setSetting).toHaveBeenCalledOnce());
    expect(savedItems().find(item=>item.widgetType==="profile-status")?.profileStatus?.image).toEqual({type:"url",value:"https://example.com/cat.png"});
  });

  it("uploads a local image, supports camera input and ignores cancelled selection",async()=>{
    const {container}=setup();
    const imageButton=container.querySelector<HTMLButtonElement>(".hero-collage-bg")!;
    fireEvent.click(imageButton);
    const albumInput=container.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    fireEvent.change(albumInput,{target:{files:[]}});
    expect(mocked.compressImage).not.toHaveBeenCalled();
    expect(mocked.setSetting).not.toHaveBeenCalled();

    const file=new File(["image"],"photo.png",{type:"image/png"});
    fireEvent.change(albumInput,{target:{files:[file]}});
    await waitFor(()=>expect(mocked.compressImage).toHaveBeenCalledWith(file,"widget"));
    await waitFor(()=>expect(mocked.put).toHaveBeenCalledOnce());
    await waitFor(()=>expect(mocked.setSetting).toHaveBeenCalledOnce());
    expect(savedItems().find(item=>item.widgetType==="hero-profile")?.hero?.topBackground).toEqual({type:"asset",value:"asset-uploaded"});

    fireEvent.click(imageButton);
    const cameraInput=container.querySelector<HTMLInputElement>('input[type="file"][capture]')!;
    const clickSpy=vi.spyOn(cameraInput,"click");
    fireEvent.click(screen.getByRole("button",{name:"相机"}));
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("restores only the selected image to its default",async()=>{
    const appearance=structuredClone(defaultAppearance);
    const profile=appearance.items.find(item=>item.widgetType==="profile-status")!;
    profile.profileStatus={captionText:profile.profileStatus?.captionText??"该用户是一只猫",typingText:profile.profileStatus?.typingText??"正在输入中...",image:{type:"url",value:"https://example.com/custom.png"}};
    setup(appearance);
    fireEvent.click(screen.getByRole("button",{name:"编辑头像图片"}));
    fireEvent.click(screen.getByRole("button",{name:"默认"}));
    await waitFor(()=>expect(mocked.setSetting).toHaveBeenCalledOnce());
    expect(savedItems().find(item=>item.widgetType==="profile-status")?.profileStatus?.image).toBeUndefined();
    expect(savedItems().find(item=>item.widgetType==="hero-profile")?.hero?.topBackground).toEqual(defaultAppearance.items.find(item=>item.widgetType==="hero-profile")?.hero?.topBackground);
  });

  it("closes image tools on outside press and disables paging while tools are open",()=>{
    const {container}=setup(withSecondPage());
    fireEvent.click(screen.getByRole("button",{name:"编辑头像图片"}));
    const grid=container.querySelector(".desktop-pages") as HTMLElement;
    fireEvent.pointerDown(grid,{pointerId:7,pointerType:"touch",isPrimary:true,clientX:310,clientY:300});
    fireEvent.pointerMove(grid,{pointerId:7,pointerType:"touch",isPrimary:true,clientX:220,clientY:302});
    fireEvent.pointerUp(grid,{pointerId:7,pointerType:"touch",isPrimary:true,clientX:220,clientY:302});
    expect(screen.queryByRole("button",{name:"论坛"})).not.toBeInTheDocument();

    const home=container.querySelector(".cha-home") as HTMLElement;
    fireEvent.pointerDown(home,{pointerId:8,pointerType:"touch",isPrimary:true,clientX:340,clientY:700});
    fireEvent.pointerUp(home,{pointerId:8,pointerType:"touch",isPrimary:true,clientX:340,clientY:700});
    expect(screen.queryByRole("toolbar",{name:"组件图片工具"})).not.toBeInTheDocument();

    fireEvent.pointerDown(grid,{pointerId:9,pointerType:"touch",isPrimary:true,clientX:310,clientY:300});
    fireEvent.pointerMove(grid,{pointerId:9,pointerType:"touch",isPrimary:true,clientX:220,clientY:302});
    fireEvent.pointerUp(grid,{pointerId:9,pointerType:"touch",isPrimary:true,clientX:220,clientY:302});
    expect(screen.getByRole("button",{name:"论坛"})).toBeInTheDocument();
  });

  it("maps persisted logical rows to the locked PWA visual tracks without changing stored coordinates",()=>{
    const {container}=setup();
    const hero=container.querySelector<HTMLElement>(".widget-hero-profile")!,profile=container.querySelector<HTMLElement>(".widget-profile-status")!,compliment=container.querySelector<HTMLElement>(".widget-compliment-bubble")!;
    expect(hero.style.getPropertyValue("--y")).toBe("0");
    expect(hero.style.getPropertyValue("--h")).toBe("2");
    expect(hero.style.getPropertyValue("--pwa-row-start")).toBe("1");
    expect(hero.style.getPropertyValue("--pwa-row-end")).toBe("4");
    expect(profile.style.getPropertyValue("--y")).toBe("2");
    expect(profile.style.getPropertyValue("--h")).toBe("2");
    expect(profile.style.getPropertyValue("--pwa-row-start")).toBe("5");
    expect(profile.style.getPropertyValue("--pwa-row-end")).toBe("8");
    expect(compliment.style.getPropertyValue("--y")).toBe("4");
    expect(compliment.style.getPropertyValue("--h")).toBe("2");
    expect(compliment.style.getPropertyValue("--pwa-row-start")).toBe("9");
    expect(compliment.style.getPropertyValue("--pwa-row-end")).toBe("12");
  });
  it("keeps page dots and the unique four-app Dock in one footer stack",()=>{
    const {container}=setup();
    const footer=container.querySelector(".desktop-footer-stack");
    expect(footer).toBeInTheDocument();expect(footer?.firstElementChild).toHaveClass("page-dots");expect(footer?.lastElementChild).toHaveClass("cha-dock");
    expect(container.querySelectorAll(".cha-dock .dock-app")).toHaveLength(4);
    expect(desktopApp(container,"消息")).toBeUndefined();
    expect(container.querySelectorAll('[data-app-id="messages"]')).toHaveLength(1);
  });

  it("swipes to an existing second page and back",()=>{
    const {container}=setup(withSecondPage());
    expect(screen.queryByRole("button",{name:"论坛"})).not.toBeInTheDocument();
    const lore=desktopApp(container,"世界书")!;
    fireEvent.pointerDown(lore,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:310,clientY:300});
    fireEvent.pointerMove(lore,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:230,clientY:304});
    fireEvent.pointerUp(lore,{pointerId:1,pointerType:"touch",isPrimary:true,clientX:230,clientY:304});
    expect(screen.getByRole("button",{name:"论坛"})).toBeInTheDocument();
    const grid=container.querySelector(".desktop-pages") as HTMLElement;
    fireEvent.pointerDown(grid,{pointerId:2,pointerType:"touch",isPrimary:true,clientX:80,clientY:300});
    fireEvent.pointerMove(grid,{pointerId:2,pointerType:"touch",isPrimary:true,clientX:155,clientY:304});
    fireEvent.pointerUp(grid,{pointerId:2,pointerType:"touch",isPrimary:true,clientX:155,clientY:304});
    expect(desktopApp(container,"世界书")).toBeInTheDocument();
  });

  it("ignores short, vertical and boundary swipes",()=>{
    const {container}=setup(withSecondPage());const grid=container.querySelector(".desktop-pages") as HTMLElement;
    fireEvent.pointerDown(grid,{pointerId:4,pointerType:"touch",isPrimary:true,clientX:250,clientY:180});fireEvent.pointerMove(grid,{pointerId:4,pointerType:"touch",isPrimary:true,clientX:244,clientY:250});fireEvent.pointerUp(grid,{pointerId:4,pointerType:"touch",isPrimary:true,clientX:244,clientY:250});
    expect(screen.queryByRole("button",{name:"论坛"})).not.toBeInTheDocument();
    fireEvent.pointerDown(grid,{pointerId:5,pointerType:"touch",isPrimary:true,clientX:310,clientY:300});fireEvent.pointerMove(grid,{pointerId:5,pointerType:"touch",isPrimary:true,clientX:230,clientY:302});fireEvent.pointerUp(grid,{pointerId:5,pointerType:"touch",isPrimary:true,clientX:230,clientY:302});
    expect(screen.getByRole("button",{name:"论坛"})).toBeInTheDocument();
    const secondGrid=container.querySelector(".desktop-pages") as HTMLElement;fireEvent.pointerDown(secondGrid,{pointerId:6,pointerType:"touch",isPrimary:true,clientX:310,clientY:300});fireEvent.pointerMove(secondGrid,{pointerId:6,pointerType:"touch",isPrimary:true,clientX:220,clientY:302});fireEvent.pointerUp(secondGrid,{pointerId:6,pointerType:"touch",isPrimary:true,clientX:220,clientY:302});
    expect(screen.getByRole("button",{name:"论坛"})).toBeInTheDocument();
  });

  it("limits touch feedback to the icon and clears the pressed state",()=>{
    vi.useFakeTimers();
    const {container}=setup(),app=container.querySelector<HTMLButtonElement>('[data-app-id="lore"]')!;
    fireEvent.pointerDown(app,{pointerId:10,pointerType:"touch",isPrimary:true,clientX:220,clientY:220});
    expect(app).toHaveClass("desktop-app-pressed");
    fireEvent.pointerUp(window,{pointerId:10,pointerType:"touch",isPrimary:true,clientX:220,clientY:220});
    expect(app).not.toHaveClass("desktop-app-pressed");
    fireEvent.pointerDown(app,{pointerId:11,pointerType:"touch",isPrimary:true,clientX:220,clientY:220});
    fireEvent.pointerMove(window,{pointerId:11,pointerType:"touch",isPrimary:true,clientX:240,clientY:220});
    expect(app).not.toHaveClass("desktop-app-pressed");
    vi.useRealTimers();
  });

  it("cancels the long press when the finger moves before 450ms",()=>{
    vi.useFakeTimers();const {container}=setup();const lore=desktopApp(container,"世界书")!;
    fireEvent.pointerDown(lore,{pointerId:11,pointerType:"touch",isPrimary:true,clientX:220,clientY:220});
    fireEvent.pointerMove(window,{pointerId:11,pointerType:"touch",isPrimary:true,clientX:240,clientY:220});
    act(()=>vi.advanceTimersByTime(500));
    expect(container.querySelector(".desktop-drag-overlay")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"完成"})).not.toBeInTheDocument();expect(mocked.setSetting).not.toHaveBeenCalled();vi.useRealTimers();
  });

  it("creates a separate RAF drag layer and does not persist during pointer moves",()=>{
    vi.useFakeTimers();const raf=vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>window.setTimeout(()=>callback(performance.now()),0));const caf=vi.spyOn(window,"cancelAnimationFrame").mockImplementation(id=>window.clearTimeout(id));
    const {container}=setup();const lore=desktopApp(container,"世界书")!,grid=container.querySelector(".desktop-pages")!,home=container.querySelector(".cha-home")!,dock=container.querySelector(".cha-dock")!;
    mockRect(home,rect(0,0,400,800));mockRect(grid,rect(0,80,400,600));mockRect(dock,rect(20,680,360,88));mockRect(lore,rect(200,280,90,82));
    fireEvent.pointerDown(lore,{pointerId:12,pointerType:"touch",isPrimary:true,clientX:230,clientY:310});act(()=>vi.advanceTimersByTime(451));act(()=>vi.advanceTimersByTime(1));
    expect(container.querySelector(".desktop-drag-overlay")).toBeInTheDocument();expect(lore).toHaveClass("drag-source-hidden");
    for(let x=232;x<250;x+=2)fireEvent.pointerMove(window,{pointerId:12,pointerType:"touch",isPrimary:true,clientX:x,clientY:312});act(()=>vi.advanceTimersByTime(1));
    expect(mocked.setSetting).not.toHaveBeenCalled();fireEvent.pointerCancel(window,{pointerId:12,pointerType:"touch",isPrimary:true});act(()=>vi.advanceTimersByTime(190));expect(mocked.setSetting).not.toHaveBeenCalled();raf.mockRestore();caf.mockRestore();vi.useRealTimers();
  });

  it("moves a desktop app into a full Dock with one final write",async()=>{
    vi.useFakeTimers();const raf=vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>window.setTimeout(()=>callback(performance.now()),0));const caf=vi.spyOn(window,"cancelAnimationFrame").mockImplementation(id=>window.clearTimeout(id));
    const {container}=setup();const lore=desktopApp(container,"世界书")!,grid=container.querySelector(".desktop-pages")!,home=container.querySelector(".cha-home")!,dock=container.querySelector(".cha-dock")!;
    mockRect(home,rect(0,0,400,800));mockRect(grid,rect(0,70,400,590));mockRect(dock,rect(20,680,360,88));mockRect(lore,rect(200,270,90,82));
    fireEvent.pointerDown(lore,{pointerId:13,pointerType:"touch",isPrimary:true,clientX:230,clientY:300});act(()=>vi.advanceTimersByTime(451));act(()=>vi.advanceTimersByTime(1));
    fireEvent.pointerMove(window,{pointerId:13,pointerType:"touch",isPrimary:true,clientX:230,clientY:720});act(()=>vi.advanceTimersByTime(1));expect(mocked.setSetting).not.toHaveBeenCalled();
    fireEvent.pointerUp(window,{pointerId:13,pointerType:"touch",isPrimary:true,clientX:230,clientY:720});act(()=>vi.advanceTimersByTime(190));await act(async()=>{await Promise.resolve();await Promise.resolve()});
    expect(mocked.setSetting).toHaveBeenCalledOnce();const saved=mocked.setSetting.mock.calls[0][1];expect(saved.dock).toContain("lore");expect(saved.items.some((item:any)=>item.appId==="lore")).toBe(false);expect(saved.items.some((item:any)=>item.appId==="appearance")).toBe(true);raf.mockRestore();caf.mockRestore();vi.useRealTimers();
  });

  it("auto-pages after dwelling at the right edge while dragging",()=>{
    vi.useFakeTimers();const raf=vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>window.setTimeout(()=>callback(performance.now()),0));const caf=vi.spyOn(window,"cancelAnimationFrame").mockImplementation(id=>window.clearTimeout(id));
    const {container}=setup();const lore=desktopApp(container,"世界书")!,grid=container.querySelector(".desktop-pages")!,home=container.querySelector(".cha-home")!,dock=container.querySelector(".cha-dock")!;
    mockRect(home,rect(0,0,400,800));mockRect(grid,rect(0,70,400,590));mockRect(dock,rect(20,680,360,88));mockRect(lore,rect(200,270,90,82));
    fireEvent.pointerDown(lore,{pointerId:14,pointerType:"touch",isPrimary:true,clientX:230,clientY:300});act(()=>vi.advanceTimersByTime(451));act(()=>vi.advanceTimersByTime(1));fireEvent.pointerMove(window,{pointerId:14,pointerType:"touch",isPrimary:true,clientX:395,clientY:300});act(()=>vi.advanceTimersByTime(1));act(()=>vi.advanceTimersByTime(500));act(()=>vi.advanceTimersByTime(1));
    expect(screen.getByRole("button",{name:"第 2 页"})).toHaveClass("active");fireEvent.pointerCancel(window,{pointerId:14,pointerType:"touch",isPrimary:true});act(()=>vi.advanceTimersByTime(190));raf.mockRestore();caf.mockRestore();vi.useRealTimers();
  });
});

