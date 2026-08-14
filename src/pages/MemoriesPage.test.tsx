import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import MemoriesPage from "./MemoriesPage";
import type {Character,Memory,MemoryExtractionBatch} from "../core/types";

const mocked=vi.hoisted(()=>({state:null as any}));
vi.mock("../core/store",()=>({useStore:()=>mocked.state}));
afterEach(cleanup);
const character={id:"c",name:"月白",avatar:"",schemaVersion:1,createdAt:1,updatedAt:1} as Character;
const memory={id:"m",schemaVersion:1,createdAt:Date.now(),updatedAt:Date.now(),characterId:"c",kind:"fact",title:"雨天偏好",content:"用户喜欢在下雨天散步",meaning:"这是用户放松自己的方式",source:"AI 聊天提炼",importance:8,locked:false,occurredAt:Date.now(),topics:["雨天"],entities:["用户"],valence:.8,arousal:.3,state:"active"} as Memory;
function setup(memories:Memory[]=[],batches:MemoryExtractionBatch[]=[]){mocked.state={memories,characters:[character],conversations:[],memoryExtractionBatches:batches,reload:vi.fn().mockResolvedValue(undefined)};return render(<MemoryRouter><MemoriesPage/></MemoryRouter>)}
describe("memory hub page",()=>{
 it("renders the branded empty state and manual add entry",()=>{setup();expect(screen.getByRole("heading",{name:"记忆小屋"})).toBeInTheDocument();expect(screen.getByText("海马体正在等待第一段故事。")).toBeInTheDocument();expect(screen.getByRole("button",{name:"手动添加第一条记忆"})).toBeInTheDocument()});
 it("shows real memory metrics, searchable content and metadata",()=>{setup([memory]);expect(screen.getByText("雨天偏好")).toBeInTheDocument();expect(screen.getByText(/强度 \d+%/)).toBeInTheDocument();expect(screen.getAllByText("积极平静").length).toBeGreaterThan(0);fireEvent.change(screen.getByPlaceholderText("搜索记忆内容、标签或成因…"),{target:{value:"不存在"}});expect(screen.getByText("没有找到符合条件的记忆")).toBeInTheDocument()});
 it("opens the pending batch stream and existing review modal",()=>{const batch={id:"b",schemaVersion:1,createdAt:1,updatedAt:1,characterId:"c",source:"chat",sourceIds:["x"],cursorKey:"c:chat:v",status:"pending",candidates:[{id:"x",kind:"fact",content:"候选记忆",importance:8,selected:true,locked:false}]} as MemoryExtractionBatch;setup([], [batch]);fireEvent.change(screen.getByLabelText("状态筛选"),{target:{value:"pending"}});expect(screen.getByText("1 条候选等待确认")).toBeInTheDocument();fireEvent.click(screen.getByText("1 条候选等待确认"));expect(screen.getByRole("heading",{name:"审核记忆候选"})).toBeInTheDocument()});
 it("opens and closes the memory metric explanations",()=>{setup();const vitality=screen.getByRole("button",{name:"查看记忆生命力说明"});expect(vitality).toHaveAttribute("aria-expanded","false");fireEvent.click(vitality);expect(screen.getByRole("heading",{name:"记忆生命力说明"})).toBeInTheDocument();expect(screen.getByText(/0–100/)).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"关闭说明"}));expect(screen.queryByRole("heading",{name:"记忆生命力说明"})).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"查看情绪坐标说明"}));expect(screen.getByRole("heading",{name:"情绪坐标说明"})).toBeInTheDocument();expect(screen.getByText(/横轴 · 效价/)).toBeInTheDocument();const shade=document.querySelector(".modal-shade");expect(shade).not.toBeNull();fireEvent.mouseDown(shade!);expect(screen.queryByRole("heading",{name:"情绪坐标说明"})).not.toBeInTheDocument()});
 it("keeps all memory operations behind one menu",()=>{setup([memory]);fireEvent.click(screen.getByRole("button",{name:"记忆操作"}));for(const label of ["锁定记忆","停止召回","沉入深处","编辑记忆","删除记忆"])expect(screen.getByRole("button",{name:label})).toBeInTheDocument()});
});
