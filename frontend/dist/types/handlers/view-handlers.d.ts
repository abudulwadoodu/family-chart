import * as d3 from "d3";
import { TreeDatum } from "../types/treeData";
type SvgDim = {
    width: number;
    height: number;
};
type TreeDim = {
    width: number;
    height: number;
    x_off: number;
    y_off: number;
};
interface TreeFitProps {
    svg: SVGElement;
    svg_dim: SvgDim;
    tree_dim: TreeDim;
    transition_time?: number;
}
export declare function treeFit({ svg, svg_dim, tree_dim, transition_time }: TreeFitProps): void;
export declare function calculateTreeFit(svg_dim: SvgDim, tree_dim: TreeDim): {
    k: number;
    x: number;
    y: number;
};
type CardToMiddleProps = {
    datum: TreeDatum;
    svg: SVGElement;
    svg_dim: SvgDim;
    scale?: number;
    transition_time?: number;
};
export declare function cardToMiddle({ datum, svg, svg_dim, scale, transition_time }: CardToMiddleProps): void;
type ManualZoomProps = {
    amount: number;
    svg: SVGElement;
    transition_time?: number;
};
export declare function manualZoom({ amount, svg, transition_time }: ManualZoomProps): void;
export declare function getCurrentZoom(svg: SVGElement): d3.ZoomTransform;
export declare function zoomTo(svg: SVGElement, zoom_level: number): void;
export interface ZoomProps {
    onZoom?: (e: any) => void;
    zoom_polite?: boolean;
}
export declare function setupZoom(el: any, props?: ZoomProps): void;
export {};
