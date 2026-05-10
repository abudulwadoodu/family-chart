import * as d3 from "d3";
import type { Datum, Data } from "../types/data";
import type { TreeData } from "../types/treeData";
interface HN extends d3.HierarchyNode<Datum> {
}
export interface CalculateTreeOptions {
    main_id?: string | null;
    node_separation?: number;
    level_separation?: number;
    single_parent_empty_card?: boolean;
    is_horizontal?: boolean;
    one_level_rels?: boolean;
    sortChildrenFunction?: ((a: Datum, b: Datum) => number) | undefined;
    sortSpousesFunction?: ((d: Datum, data: Data) => void) | undefined;
    ancestry_depth?: number | undefined;
    progeny_depth?: number | undefined;
    show_siblings_of_main?: boolean;
    modifyTreeHierarchy?: (tree: HN, is_ancestry: boolean) => void;
    private_cards_config?: any;
    duplicate_branch_toggle?: boolean;
    on_toggle_one_close_others?: boolean;
}
export interface Tree {
    data: TreeData;
    data_stash: Data;
    dim: {
        width: number;
        height: number;
        x_off: number;
        y_off: number;
    };
    main_id: string;
    is_horizontal: boolean;
}
export default function calculateTree(data: Data, { main_id, node_separation, level_separation, single_parent_empty_card, is_horizontal, one_level_rels, sortChildrenFunction, sortSpousesFunction, ancestry_depth, progeny_depth, show_siblings_of_main, modifyTreeHierarchy, private_cards_config, duplicate_branch_toggle, on_toggle_one_close_others, }: CalculateTreeOptions): Tree;
/**
 * Calculate the tree
 * @param options - The options for the tree
 * @param options.data - The data for the tree
 * @returns The tree
 * @deprecated Use f3.calculateTree instead
 */
export declare function CalculateTree(options: CalculateTreeOptions & {
    data: Data;
}): Tree;
import { LegacyDatum } from "../store/format-data";
/**
 * Calculate the tree with v1 data
 * @param data - The data for the tree
 * @param options - The options for the tree
 * @returns The tree
 */
export declare function calculateTreeWithV1Data(data: LegacyDatum[], options: CalculateTreeOptions): Tree;
export {};
