import { TreeDatum } from "../types/treeData";
export interface Link {
    d: [number, number][];
    _d: () => [number, number][];
    curve: boolean;
    id: string;
    depth: number;
    is_ancestry: boolean | undefined;
    source: TreeDatum | TreeDatum[];
    target: TreeDatum | TreeDatum[];
    spouse?: boolean;
}
export declare function createLinks(d: TreeDatum, is_horizontal?: boolean): Link[];
