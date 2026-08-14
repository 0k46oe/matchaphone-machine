import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
const ROOT=path.resolve(import.meta.dirname,"..");
const privateKey=await readFile(path.join(ROOT,"private","activation","license-private-key.pem"),"utf8");
const metadata=JSON.parse(await readFile(path.join(ROOT,"private","activation","license-public.json"),"utf8"));
const temp=await mkdtemp(path.join(os.tmpdir(),"chacha-activation-deploy-"));
const configPath=path.join(temp,"cloudbaserc.json");
const config={$schema:"https://static.cloudbase.net/cli/cloudbaserc.schema.json",envId:"matchaphone-d5gjgy87ybfb50382",functionRoot:"cloudfunctions",functions:[{name:"activation-gateway",timeout:10,memorySize:256,runtime:"Nodejs18.15",handler:"index.main",installDependency:false,description:"茶茶机一次性激活码与浏览器设备绑定服务",envVariables:{ACTIVATION_LICENSE_PRIVATE_KEY_B64:Buffer.from(privateKey,"utf8").toString("base64"),ACTIVATION_PUBLIC_KEY_ID:metadata.publicKeyId}}]};
try{await writeFile(configPath,JSON.stringify(config),{encoding:"utf8",mode:0o600});const cli=process.env.APPDATA?path.join(process.env.APPDATA,"npm","node_modules","@cloudbase","cli","bin","tcb"):"tcb",command=process.platform==="win32"?process.execPath:"tcb",args=process.platform==="win32"?[cli,"--config-file",configPath,"fn","deploy","activation-gateway","--force","--json"]:["--config-file",configPath,"fn","deploy","activation-gateway","--force","--json"],result=spawnSync(command,args,{cwd:ROOT,encoding:"utf8",windowsHide:true,stdio:"inherit"});if(result.status!==0)process.exitCode=result.status??1}finally{await rm(temp,{recursive:true,force:true})}

