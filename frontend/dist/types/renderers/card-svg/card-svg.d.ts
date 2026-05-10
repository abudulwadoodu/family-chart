import { TreeDatum } from "../../types/treeData";
import { CardDim } from "./templates";
import { Store } from "../../types/store";
interface CardSvgProps {
    store: Store;
    svg: SVGElement;
    card_dim: CardDim;
    card_display: (data: TreeDatum['data']) => string;
    onCardClick: (e: MouseEvent, d: TreeDatum) => void;
    img?: boolean;
    mini_tree?: boolean;
    link_break?: boolean;
    onMiniTreeClick?: (e: MouseEvent, d: TreeDatum) => void;
    onLineBreakClick?: (e: MouseEvent, d: TreeDatum) => void;
    onCardUpdate?: (d: TreeDatum) => void;
}
export default function CardSvg(props: CardSvgProps): (this: HTMLElement, d: TreeDatum) => void;
/**
 * @deprecated Use cardSvg instead. This export will be removed in a future version.
 */
export declare function Card(props: CardSvgProps & {
    store: Store;
}): (this: HTMLElement, d: TreeDatum) => void;
export {};
