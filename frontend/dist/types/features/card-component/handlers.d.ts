import { TreeDatum } from "../../types/treeData";
export default function cardComponentSetup(cont: HTMLElement): (new_tree_data: TreeDatum[]) => TreeDatum[];
declare function setupReactiveTreeData(getHtmlSvg: () => HTMLElement): (new_tree_data: TreeDatum[]) => TreeDatum[];
export declare function getCardsViewFake(getHtmlSvg: () => HTMLElement): HTMLElement;
/** @deprecated This export will be removed in a future version. Use setupReactiveTreeData instead. */
export declare function setupHtmlSvg(getHtmlSvg: () => HTMLElement): void;
/** @deprecated This export will be removed in a future version. Use setupReactiveTreeData instead. */
declare const _setupReactiveTreeData: typeof setupReactiveTreeData;
export { _setupReactiveTreeData as setupReactiveTreeData };
/** @deprecated This export will be removed in a future version. Use setupReactiveTreeData instead. */
export declare function getUniqueId(d: any): any;
