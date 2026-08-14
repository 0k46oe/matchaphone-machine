import {beforeEach,describe,expect,it,vi} from "vitest";
import mammoth from "mammoth";
import {readCharacterDocumentText} from "./characterDocumentImport";

vi.mock("mammoth",()=>({default:{extractRawText:vi.fn()}}));

describe("character document import",()=>{
 beforeEach(()=>vi.mocked(mammoth.extractRawText).mockReset());

 it("reads TXT content for the persona editor",async()=>{
  const file=new File(["慢热、敏锐，会认真记住对方说过的小事。"],"人物设定.txt",{type:"text/plain"});
  await expect(readCharacterDocumentText(file)).resolves.toBe("慢热、敏锐，会认真记住对方说过的小事。");
 });

 it("extracts plain text from DOCX content",async()=>{
  vi.mocked(mammoth.extractRawText).mockResolvedValue({value:"安静的旧书店店员",messages:[]});
  const file=new File(["docx"],"人物设定.docx",{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  await expect(readCharacterDocumentText(file)).resolves.toBe("安静的旧书店店员");
  expect(mammoth.extractRawText).toHaveBeenCalledOnce();
 });

 it("rejects JSON files even when supplied outside the file picker",async()=>{
  const file=new File(["{}"],"character.json",{type:"application/json"});
  await expect(readCharacterDocumentText(file)).rejects.toThrow("不支持 JSON 角色卡");
 });
});
