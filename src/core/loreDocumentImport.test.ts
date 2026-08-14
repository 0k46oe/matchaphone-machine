import {beforeEach,describe,expect,it,vi} from "vitest";
import mammoth from "mammoth";
import {changeLoreImportMode,readLoreImportFile} from "./lore";

vi.mock("mammoth",()=>({default:{extractRawText:vi.fn(),convertToHtml:vi.fn()}}));

describe("lore document file import",()=>{
 beforeEach(()=>{vi.mocked(mammoth.extractRawText).mockReset();vi.mocked(mammoth.convertToHtml).mockReset()});
 it("reads DOCX as one entry and preserves semantic headings for optional splitting",async()=>{
  vi.mocked(mammoth.extractRawText).mockResolvedValue({value:"月港\n关键词：月亮\n这里是月港。\n山城\n这里是山城。",messages:[]});
  vi.mocked(mammoth.convertToHtml).mockResolvedValue({value:"<h1>月港</h1><p>关键词：月亮</p><p>这里是月港。</p><h1>山城</h1><p>这里是山城。</p>",messages:[]});
  const file=new File(["docx"],"城市.docx",{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  const preview=await readLoreImportFile(file);
  expect(preview.format).toBe("docx");expect(preview.books[0].name).toBe("城市");expect(preview.books[0].entries).toHaveLength(1);
  const split=changeLoreImportMode(preview,"headings");expect(split.books[0].entries).toHaveLength(2);expect(split.books[0].entries[0].keywords).toEqual(["月亮"]);
 });
 it("rejects JSON files before reading their content",async()=>{const file=new File(["{}"],"世界书.json",{type:"application/json"});await expect(readLoreImportFile(file)).rejects.toThrow("不支持 JSON 世界书")});
});
