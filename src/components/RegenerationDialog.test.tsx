import {useState} from "react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {RegenerationDialog} from "./RegenerationDialog";
import type {RegenerationReason} from "../core/types";

afterEach(cleanup);
function Harness({onClose=vi.fn(),onDirect=vi.fn(),onGuided=vi.fn()}:{onClose?:()=>void;onDirect?:()=>void;onGuided?:()=>void}){const [reasons,setReasons]=useState<Set<RegenerationReason>>(new Set()),[instruction,setInstruction]=useState("");const toggle=(reason:RegenerationReason)=>setReasons(previous=>{const next=new Set(previous);next.has(reason)?next.delete(reason):next.add(reason);return next});return <RegenerationDialog originalText="原来的回复" reasons={reasons} instruction={instruction} onToggle={toggle} onInstructionChange={setInstruction} onClose={onClose} onDirect={onDirect} onGuided={onGuided}/>}

describe("regeneration correction dialog",()=>{
 it("supports multiple reasons and enables guided regeneration",()=>{render(<Harness/>);const guided=screen.getByRole("button",{name:"按要求重新回复"});expect(guided).toBeDisabled();const ooc=screen.getByRole("button",{name:/角色 OOC/}),memory=screen.getByRole("button",{name:/角色失忆/});fireEvent.click(ooc);fireEvent.click(memory);expect(ooc).toHaveAttribute("aria-pressed","true");expect(memory).toHaveAttribute("aria-pressed","true");expect(guided).toBeEnabled()});
 it("limits the one-time instruction and exposes direct, guided and close actions",()=>{const onClose=vi.fn(),onDirect=vi.fn(),onGuided=vi.fn();render(<Harness onClose={onClose} onDirect={onDirect} onGuided={onGuided}/>);const textarea=screen.getByPlaceholderText(/他现在还在生气/) as HTMLTextAreaElement;expect(textarea.maxLength).toBe(500);fireEvent.change(textarea,{target:{value:"只回应最后一句"}});expect(screen.getByText("7/500")).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"直接重新回复"}));expect(onDirect).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole("button",{name:"按要求重新回复"}));expect(onGuided).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole("button",{name:"关闭"}));expect(onClose).toHaveBeenCalledOnce()});
});
