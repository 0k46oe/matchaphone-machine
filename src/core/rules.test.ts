import {describe,expect,it} from "vitest";
import {clampRelationshipValue,relationshipMetricLabel,relationshipStage} from "./rules";

describe("relationship presentation",()=>{
 it("clamps relationship values",()=>{expect(clampRelationshipValue(-8)).toBe(0);expect(clampRelationshipValue(38.6)).toBe(39);expect(clampRelationshipValue(130)).toBe(100)});
 it("derives stable relationship stages",()=>{expect(relationshipStage(0,0).label).toBe("初次相识");expect(relationshipStage(80,80).label).toBe("深度羁绊");expect(relationshipStage(50,70).label).toBe("相互信赖")});
 it("labels intimacy and trust independently",()=>{expect(relationshipMetricLabel("intimacy",52)).toBe("亲近");expect(relationshipMetricLabel("trust",12)).toBe("戒备")});
});
