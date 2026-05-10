import { TreeDatum } from "../types/treeData";
import { Tree } from "../layout/calculate-tree";
export declare function isAllRelativeDisplayed(d: TreeDatum, data: TreeDatum[]): boolean;
export declare function calculateDelay(tree: Tree, d: {
    depth: number;
    is_ancestry?: boolean;
    spouse?: boolean;
} | TreeDatum, transition_time: number): number;
