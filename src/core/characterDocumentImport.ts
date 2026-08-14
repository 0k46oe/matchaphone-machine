import mammoth from "mammoth";

export const CHARACTER_DOCUMENT_ACCEPT=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_CHARACTER_DOCUMENT_SIZE=5_000_000;

export async function readCharacterDocumentText(file:File):Promise<string>{
 const extension=file.name.toLowerCase().match(/\.[^.]+$/)?.[0]??"";
 if(extension!==".txt"&&extension!==".docx")throw new Error("不支持 JSON 角色卡，只能选择 TXT 或 DOCX 文件。");
 if(file.size>MAX_CHARACTER_DOCUMENT_SIZE)throw new Error("文件过大，角色文档不能超过 5 MB。");
 try{
  const value=extension===".txt"?await file.text():(await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value;
  const text=value.replace(/\r\n?/g,"\n").replace(/\u0000/g,"").trim();
  if(!text)throw new Error("文档中没有可导入的文字内容。");
  return text;
 }catch(error){
  if(error instanceof Error&&/文档中没有|不支持 JSON|文件过大/.test(error.message))throw error;
  throw new Error(extension===".docx"?"无法读取这个 DOCX 文件，请确认它是有效的 Word 文档。":"无法读取这个 TXT 文件，请确认文件编码和内容正常。");
 }
}
