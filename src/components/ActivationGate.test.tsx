import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
const activationMocks=vi.hoisted(()=>({verify:vi.fn(),activate:vi.fn()}));
vi.mock("../core/activation",async importOriginal=>{const actual=await importOriginal<typeof import("../core/activation")>();return{...actual,verifyStoredActivation:activationMocks.verify,activateDevice:activationMocks.activate}});
import ActivationGate from "./ActivationGate";
afterEach(()=>{cleanup();vi.clearAllMocks()});
describe("ActivationGate",()=>{
 it("does not mount the protected app without a stored license",async()=>{
  activationMocks.verify.mockResolvedValue(false);
  render(<ActivationGate><div>protected app</div></ActivationGate>);
  expect(screen.queryByText("protected app")).not.toBeInTheDocument();
  expect(await screen.findByRole("heading",{name:"激活茶茶机"})).toBeInTheDocument();
 });
 it("mounts the protected app after successful activation",async()=>{
  activationMocks.verify.mockResolvedValue(false);activationMocks.activate.mockResolvedValue({});
  render(<ActivationGate><div>protected app</div></ActivationGate>);
  const input=await screen.findByLabelText("设备激活码");
  fireEvent.change(input,{target:{value:"MATCHA-ABCD-EFGH-2345-6789"}});
  fireEvent.click(screen.getByRole("button",{name:"激活这台设备"}));
  await waitFor(()=>expect(screen.getByText("protected app")).toBeInTheDocument());
  expect(activationMocks.activate).toHaveBeenCalledWith("MATCHA-ABCD-EFGH-2345-6789");
 });
 it("keeps the protected app hidden when the code has already been used",async()=>{
  activationMocks.verify.mockResolvedValue(false);const actual=await import("../core/activation");activationMocks.activate.mockRejectedValue(new actual.ActivationClientError("already-used","used"));
  render(<ActivationGate><div>protected app</div></ActivationGate>);
  fireEvent.change(await screen.findByLabelText("设备激活码"),{target:{value:"MATCHA-ABCD-EFGH-2345-6789"}});
  fireEvent.click(screen.getByRole("button",{name:"激活这台设备"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("已经绑定其他设备");
  expect(screen.queryByText("protected app")).not.toBeInTheDocument();
 });
});
