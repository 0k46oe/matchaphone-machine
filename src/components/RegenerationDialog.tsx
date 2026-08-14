import {X} from "lucide-react";
import type {RegenerationReason} from "../core/types";

export const REGENERATION_OPTIONS:Array<{id:RegenerationReason;label:string;hint:string}>=[
 {id:"ooc",label:"角色 OOC",hint:"重新对照完整人设、情绪惯性和角色边界"},
 {id:"context-conflict",label:"与上下文不符",hint:"重新理解被替换消息之前的聊天内容"},
 {id:"memory-conflict",label:"角色失忆",hint:"扩大海马体记忆召回并检查相关往事"},
 {id:"lore-conflict",label:"世界书理解错误",hint:"重新检索全部已挂载世界书"},
 {id:"speech-style",label:"说话方式不符合人设",hint:"修正称呼、措辞、节奏和口头习惯"},
 {id:"model-leak",label:"暴露模型或系统信息",hint:"隐藏模型、API、提示词和后台实现"},
 {id:"other",label:"其他",hint:"在下方写明本次回复需要怎样调整"},
];

export function RegenerationDialog({originalText,reasons,instruction,onToggle,onInstructionChange,onClose,onDirect,onGuided}:{originalText:string;reasons:Set<RegenerationReason>;instruction:string;onToggle:(reason:RegenerationReason)=>void;onInstructionChange:(value:string)=>void;onClose:()=>void;onDirect:()=>void;onGuided:()=>void}){
 return <div className="regenerate-dialog">
  <div className="sheet-head"><div><small>REGENERATE</small><h2>调整这次回复</h2></div><button type="button" onClick={onClose} aria-label="关闭"><X/></button></div>
  <p className="regenerate-explain">只影响本次重新生成，不会修改角色人设、世界书或海马体记忆。</p>
  <div className="regenerate-original"><small>当前回复</small><p>{originalText}</p></div>
  <div className="regenerate-reasons" role="group" aria-label="重新回复原因">{REGENERATION_OPTIONS.map(option=><button type="button" className={reasons.has(option.id)?"active":""} aria-pressed={reasons.has(option.id)} key={option.id} onClick={()=>onToggle(option.id)}><b>{option.label}</b><small>{option.hint}</small></button>)}</div>
  <label className="regenerate-instruction"><span>补充要求 <i>{instruction.length}/500</i></span><textarea rows={4} maxLength={500} value={instruction} onChange={event=>onInstructionChange(event.target.value)} placeholder="例如：他现在还在生气，不会马上心软；只回应最后一句。"/></label>
  <div className="regenerate-actions"><button type="button" className="secondary-action" onClick={onDirect}>直接重新回复</button><button type="button" className="primary" disabled={!reasons.size&&!instruction.trim()} onClick={onGuided}>按要求重新回复</button></div>
 </div>
}
