import { Store } from "../../types/store";
import { Datum } from "../../types/data";
import { TreeDatum } from "../../types/treeData";
export default function CardHtmlWrapper(cont: HTMLElement, store: Store): CardHtml;
/**
 * CardHtml class - Handles HTML-based card rendering and customization for family tree nodes.
 *
 * @example
 * ```typescript
 * import * as f3 from 'family-chart'
 * const f3Chart = f3.createChart('#FamilyChart', data)
 * const f3Card = f3Chart.setCardHtml()  // returns a CardHtml instance
 *   .setCardDisplay([["first name","last name"],["birthday"]]);
 * ```
 */
export declare class CardHtml {
    cont: HTMLElement;
    svg: SVGElement;
    store: Store;
    card_display: any;
    cardImageField: string;
    onCardClick: any;
    style: 'default' | 'imageCircleRect' | 'imageCircle' | 'imageRect' | 'rect';
    mini_tree: boolean;
    onCardUpdate: any;
    card_dim: {
        [key: string]: number | boolean;
    };
    cardInnerHtmlCreator: undefined | ((d: TreeDatum) => string);
    defaultPersonIcon: undefined | ((d: TreeDatum) => string);
    onCardMouseenter: undefined | ((e: Event, d: TreeDatum) => void);
    onCardMouseleave: undefined | ((e: Event, d: TreeDatum) => void);
    to_transition: Datum['id'] | undefined | false;
    constructor(cont: HTMLElement, store: Store);
    getCard(): (d: TreeDatum) => void;
    setCardDisplay(card_display: CardHtml['card_display']): this;
    setCardImageField(cardImageField: CardHtml['cardImageField']): this;
    setDefaultPersonIcon(defaultPersonIcon: CardHtml['defaultPersonIcon']): this;
    setOnCardClick(onCardClick: CardHtml['onCardClick']): this;
    onCardClickDefault(e: MouseEvent, d: TreeDatum): void;
    setStyle(style: CardHtml['style']): this;
    setMiniTree(mini_tree: CardHtml['mini_tree']): this;
    setOnCardUpdate(onCardUpdate: CardHtml['onCardUpdate']): this;
    setCardDim(card_dim: CardHtml['card_dim']): this;
    resetCardDim(): this;
    setCardInnerHtmlCreator(cardInnerHtmlCreator: CardHtml['cardInnerHtmlCreator']): this;
    setOnHoverPathToMain(): this;
    unsetOnHoverPathToMain(): this;
    onEnterPathToMain(e: Event, datum: TreeDatum): this;
    onLeavePathToMain(e: Event, d: TreeDatum): this;
}
