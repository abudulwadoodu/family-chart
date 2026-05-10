import { Store } from "../../types/store";
import { TreeDatum } from "../../types/treeData";
import { CardDim } from "./templates";
declare const CardElements: {
    miniTree: typeof miniTree;
    cardBody: typeof cardBody;
    cardImage: typeof cardImage;
};
export default CardElements;
declare function miniTree(d: TreeDatum, props: {
    card_dim: CardDim;
    onMiniTreeClick?: (e: MouseEvent, d: TreeDatum) => void;
    store: Store;
}): Element | null | undefined;
declare function cardBody(d: TreeDatum, props: {
    card_dim: CardDim;
    onCardClick: (e: MouseEvent, d: TreeDatum) => void;
    store: Store;
    card_display: (data: TreeDatum['data']) => string;
}): Element | null;
declare function cardImage(d: TreeDatum, props: {
    card_dim: CardDim;
    store: Store;
}): Element | null | undefined;
export declare function appendElement(el_maybe: Element, parent: Element, is_first?: boolean): void;
