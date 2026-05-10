import { Store } from "../../types/store";
import { TreeDatum } from "../../types/treeData";
import { CardDim } from "../../renderers/card-svg/templates";
export default function CardSvgWrapper(cont: HTMLElement, store: Store): CardSvg;
export declare class CardSvg {
    cont: HTMLElement;
    store: Store;
    svg: SVGElement;
    card_dim: CardDim;
    card_display: any;
    mini_tree: boolean;
    link_break: boolean;
    onCardClick: (e: MouseEvent, d: TreeDatum) => void;
    onCardUpdate: ((d: TreeDatum) => void) | undefined;
    constructor(cont: HTMLElement, store: Store);
    getCard(): (d: TreeDatum) => void;
    setCardDisplay(card_display: CardSvg['card_display']): this;
    setCardDim(card_dim: CardSvg['card_dim']): this;
    setOnCardUpdate(onCardUpdate: CardSvg['onCardUpdate']): this;
    setMiniTree(mini_tree: CardSvg['mini_tree']): this;
    setLinkBreak(link_break: CardSvg['link_break']): this;
    onCardClickDefault(e: MouseEvent, d: TreeDatum): void;
    setOnCardClick(onCardClick: CardSvg['onCardClick']): this;
}
