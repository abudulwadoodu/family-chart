import { Tree } from "../layout/calculate-tree";
import { TreeDatum } from "../types/treeData";
interface LinkSpouseTextProps {
    node_separation: number;
    initial?: boolean;
    transition_time?: number;
    linkSpouseText: (sp1: TreeDatum, sp2: TreeDatum) => string;
}
export default function linkSpouseText(svg: SVGElement, tree: Tree, props: LinkSpouseTextProps): void;
export {};
