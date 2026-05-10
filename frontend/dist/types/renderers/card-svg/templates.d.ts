import { TreeDatum } from "../../types/treeData";
export interface CardDim {
    w: number;
    h: number;
    text_x: number;
    text_y: number;
    img_w: number;
    img_h: number;
    img_x: number;
    img_y: number;
}
export declare function CardBody({ d, card_dim, card_display }: {
    d: TreeDatum;
    card_dim: CardDim;
    card_display: (data: TreeDatum['data']) => string;
}): {
    template: string;
};
export declare function CardBodyAddNewRel({ d, card_dim, label }: {
    d: TreeDatum;
    card_dim: CardDim;
    label: string;
}): {
    template: string;
};
export declare function CardText({ d, card_dim, card_display }: {
    d: TreeDatum;
    card_dim: CardDim;
    card_display: (data: TreeDatum['data']) => string;
}): {
    template: string;
};
export declare function CardBodyOutline({ d, card_dim, is_new }: {
    d: TreeDatum;
    card_dim: CardDim;
    is_new: boolean;
}): {
    template: string;
};
export declare function MiniTree({ d, card_dim }: {
    d: TreeDatum;
    card_dim: CardDim;
}): {
    template: string;
};
export declare function LinkBreakIcon({ x, y, rt, closed }: {
    x: number;
    y: number;
    rt: number;
    closed: boolean;
}): {
    template: string;
};
export declare function LinkBreakIconWrapper({ d, card_dim }: {
    d: TreeDatum;
    card_dim: CardDim;
}): {
    template: string;
};
export declare function CardImage({ d, image, card_dim, maleIcon, femaleIcon }: {
    d: TreeDatum;
    image: string;
    card_dim: CardDim;
    maleIcon?: ({ card_dim }: {
        card_dim: CardDim;
    }) => string;
    femaleIcon?: ({ card_dim }: {
        card_dim: CardDim;
    }) => string;
}): {
    template: string;
};
export declare function appendTemplate(template: string, parent: Element, is_first: boolean): void;
