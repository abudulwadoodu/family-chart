import { TreeDatum } from "../types/treeData";
import { Data, Datum } from "../types/data";
import { CalculateTreeOptions } from "./calculate-tree";
export declare function sortChildrenWithSpouses(children: Datum[], datum: Datum, data: Data): Datum[] | undefined;
export declare function sortAddNewChildren(children: Datum[]): Datum[];
export declare function calculateEnterAndExitPositions(d: TreeDatum, entering: boolean, exiting: boolean): void;
export declare function setupSiblings({ tree, data_stash, node_separation, sortChildrenFunction }: {
    tree: TreeDatum[];
    data_stash: Data;
    node_separation: number;
    sortChildrenFunction: CalculateTreeOptions['sortChildrenFunction'];
}): void;
export declare function handlePrivateCards({ tree, data_stash, private_cards_config }: {
    tree: TreeDatum[];
    data_stash: Data;
    private_cards_config: {
        condition: (d: Datum) => boolean;
    };
}): void;
export declare function getMaxDepth(d_id: Datum['id'], data_stash: Data): {
    ancestry: number;
    progeny: number;
};
