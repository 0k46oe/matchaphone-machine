import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {MessageActionOverlay,MessageQuoteCard} from "./MessageInteractions";
import type {Message} from "../core/types";

afterEach(cleanup);
const message:Message={id:"m",schemaVersion:1,createdAt:1,updatedAt:1,conversationId:"c",senderType:"character",senderId:"ch",content:"你好",status:"complete"};
const anchor={top:120,left:20,width:100,height:40,rootWidth:360,rootHeight:800,fontSize:"12px",lineHeight:"18px"};

describe("message interaction components",()=>{
 it("renders iMessage actions, regeneration and six reaction choices",()=>{
  const onQuote=vi.fn(),onReact=vi.fn();
  render(<MemoryRouter><MessageActionOverlay message={message} assets={new Map()} anchor={anchor} canEdit canRegenerate onClose={vi.fn()} onQuote={onQuote} onRegenerate={vi.fn()} onCopy={vi.fn()} onEdit={vi.fn()} onMulti={vi.fn()} onDelete={vi.fn()} onReact={onReact}/></MemoryRouter>);
  expect(screen.getByRole("dialog",{name:"消息操作"})).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"重新生成"})).toBeInTheDocument();
  expect(["爱心","赞","踩","哈哈","强调","疑问"].map(name=>screen.getByRole("button",{name}))).toHaveLength(6);
  fireEvent.click(screen.getByRole("button",{name:"引用"}));expect(onQuote).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button",{name:"赞"}));expect(onReact).toHaveBeenCalledWith("like");
 });

 it("offers a manual translation action when provided",()=>{const onTranslate=vi.fn();render(<MemoryRouter><MessageActionOverlay message={message} assets={new Map()} anchor={anchor} canEdit canRegenerate onClose={vi.fn()} onQuote={vi.fn()} onRegenerate={vi.fn()} onCopy={vi.fn()} onEdit={vi.fn()} onMulti={vi.fn()} onDelete={vi.fn()} onReact={vi.fn()} translationLabel="翻译这条" onTranslate={onTranslate}/></MemoryRouter>);fireEvent.click(screen.getByRole("button",{name:"翻译这条"}));expect(onTranslate).toHaveBeenCalledOnce()});
});

describe("sticker action preview",()=>{
 it("uses explicit transparent-bubble classes and hides meaning",()=>{
  const sticker:Message={...message,kind:"sticker",content:"[表情包]",attachments:[{type:"sticker",stickerId:"s",name:"无语",description:"无语地看着你",url:"https://example.com/sticker.png"}]};
  render(<MemoryRouter><MessageActionOverlay message={sticker} assets={new Map()} anchor={anchor} canEdit={false} canRegenerate onClose={vi.fn()} onQuote={vi.fn()} onRegenerate={vi.fn()} onCopy={vi.fn()} onEdit={vi.fn()} onMulti={vi.fn()} onDelete={vi.fn()} onReact={vi.fn()}/></MemoryRouter>);
  expect(document.querySelector(".action-message-preview.sticker-only")).toBeTruthy();
  expect(document.querySelector(".bubble.sticker-bubble")).toBeTruthy();
  expect(screen.queryByText("无语地看着你")).not.toBeInTheDocument();
 });
});
