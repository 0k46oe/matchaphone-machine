import {Component,type ErrorInfo,type ReactNode} from "react";
import {browserCapabilitySnapshot} from "../core/browserCompat";

const ERROR_KEY="chacha-last-client-error-v1";
function safeText(value:unknown){return String(value??"").replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").slice(0,180)}
function rememberClientError(error:unknown,phase:string){
  try{
    const row={at:Date.now(),phase,path:location.pathname,name:error instanceof Error?error.name:"Error",message:safeText(error instanceof Error?error.message:error),capabilities:browserCapabilitySnapshot()};
    sessionStorage.setItem(ERROR_KEY,JSON.stringify(row));
    console.error("[chacha-client-error]",row);
  }catch{/* Diagnostics must never hide the recovery screen. */}
}

interface Props{children:ReactNode;phase?:string}
interface State{error?:Error}
export default class AppErrorBoundary extends Component<Props,State>{
  state:State={};
  static getDerivedStateFromError(error:Error){return{error}}
  componentDidCatch(error:Error,_info:ErrorInfo){rememberClientError(error,this.props.phase??"application")}
  render(){
    if(!this.state.error)return this.props.children;
    return <main className="app-crash-screen" role="alert"><div><span>RECOVERY</span><h1>当前页面暂时无法打开</h1><p>页面遇到了兼容性问题。你可以重新加载当前页面，或先返回桌面。</p><button type="button" onClick={()=>location.reload()}>重新加载当前页面</button><button type="button" className="secondary" onClick={()=>location.assign("/")}>返回桌面</button></div></main>;
  }
}
