import { Tree } from "../layout/calculate-tree";
export interface ViewProps {
    initial?: boolean;
    transition_time?: number;
    cardComponent?: boolean;
    cardHtml?: boolean;
    cardHtmlDiv?: HTMLElement;
    tree_position?: 'fit' | 'main_to_middle' | 'inherit';
    scale?: number;
}
export default function (tree: Tree, svg: SVGElement, Card: any, props?: ViewProps): boolean;
