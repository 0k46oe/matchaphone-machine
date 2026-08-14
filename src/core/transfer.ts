import {z} from "zod";
import {db} from "./db";
import {OpenAIProvider} from "./provider";
import {type Character,type Message,type ProviderSettings} from "./types";
import {settleOutgoingWalletTransfer} from "./mall";
const decisionSchema=z.object({action:z.enum(["accept","refund","pending"]),reason:z.string().max(200).optional()});
export function pendingTransfer(messages:Message[]){return [...messages].reverse().find(message=>message.senderType==="user"&&message.attachments?.some(a=>a.type==="transfer"&&a.state==="pending"))}
export async function decidePendingTransfer(input:{messages:Message[];character:Character;provider:ProviderSettings;replyText:string;signal?:AbortSignal}){const message=pendingTransfer(input.messages);if(!message)return null;const transfer=message.attachments?.find(a=>a.type==="transfer");if(!transfer||transfer.type!=="transfer")return null;const prompt=["判断角色在刚才的回复后是否会处理这笔转账。","角色："+input.character.name,"金额：¥"+(transfer.amountCents/100).toFixed(2),"备注："+(transfer.note||"无"),"角色回复："+input.replyText,"只返回 JSON：{\"action\":\"accept|refund|pending\",\"reason\":\"简短原因\"}"].join("\n");const raw=await new OpenAIProvider(input.provider).chat([{role:"user",content:prompt}],{stream:false,signal:input.signal}),trimmed=raw.trim(),cleaned=trimmed.startsWith("{")?trimmed:trimmed.replace(/^\x60{3}(?:json)?/i,"").replace(/\x60{3}$/,"").trim(),decision=decisionSchema.parse(JSON.parse(cleaned));if(decision.action==="pending")return decision;await settleOutgoingWalletTransfer(message.id,decision.action,input.character.id);return decision}
