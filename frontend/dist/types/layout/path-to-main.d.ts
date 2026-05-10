import { TreeDatum } from "../types/treeData";
import { Link } from "./create-links";
import { CardHtmlSelection, LinkSelection } from "../types/view";
export default function pathToMain(cards: CardHtmlSelection, links: LinkSelection, datum: TreeDatum, main_datum: TreeDatum): {
    cards_node_to_main: {
        card: TreeDatum;
        node: HTMLDivElement;
    }[];
    links_node_to_main: {
        link: Link;
        node: SVGPathElement;
    }[];
};
