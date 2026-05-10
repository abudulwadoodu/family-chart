import { EditTree } from "./edit";
import { Data, Datum } from "../types/data";
import { Store } from "../types/store";
import * as ST from "../types/store";
import { CardHtml } from "../core/cards/card-html";
import { CardSvg } from "../core/cards/card-svg";
import { TreeDatum } from "../types/treeData";
import { ViewProps } from "../renderers/view";
import { KinshipInfoConfig } from "../features/kinships/calculate-kinships";
type LinkSpouseText = ((sp1: TreeDatum, sp2: TreeDatum) => string) | null;
export default function createChart(cont: HTMLElement | string, data: Data): Chart;
/**
 * Main Chart class - The primary class for creating and managing family tree visualizations.
 *
 * This is the main entry point for the Family Chart library. Use this class to:
 * - Create and configure family tree visualizations
 * - Set up data, styling, and interaction options
 * - Control tree layout, orientation, and display settings
 * - Manage user interactions and updates
 *
 * @example
 * ```typescript
 * const f3Chart = createChart('#FamilyChart', data)  // returns a Chart instance;
 * ```
 */
export declare class Chart {
    cont: HTMLElement;
    store: Store;
    svg: SVGElement;
    getCard: null | (() => (d: TreeDatum) => void);
    is_card_html: boolean;
    transition_time: number;
    linkSpouseText: LinkSpouseText | null;
    personSearch: any;
    beforeUpdate: Function | null;
    afterUpdate: Function | null;
    editTreeInstance: EditTree | null;
    constructor(cont: HTMLElement | string, data: Data);
    private createStore;
    private setOnUpdate;
    /**
     * Update the tree
     * @param props - The properties to update the tree with.
     * @param props.initial - Whether to update the tree initially.
     * @param props.tree_position - The position of the tree.
     * - 'fit' to fit the tree to the container,
     * - 'main_to_middle' to center the tree on the main person,
     * - 'inherit' to inherit the position from the previous update.
     * @param props.transition_time - The transition time.
     * @returns The CreateChart instance
     */
    updateTree(props?: ViewProps): this;
    /**
     * Update the data
     * @param data - The data to update the tree with.
     * @returns The CreateChart instance
     */
    updateData(data: Data): this;
    /**
     * Set the card y spacing
     * @param card_y_spacing - The card y spacing between the cards. Level separation.
     * @returns The CreateChart instance
     */
    setCardYSpacing(card_y_spacing: ST.LevelSeparation): this;
    /**
     * Set the card x spacing
     * @param card_x_spacing - The card x spacing between the cards. Node separation.
     * @returns The CreateChart instance
     */
    setCardXSpacing(card_x_spacing: ST.NodeSeparation): this;
    /**
     * Set the orientation to vertical
     * @returns The CreateChart instance
     */
    setOrientationVertical(): this;
    /**
     * Set the orientation to horizontal
     * @returns The CreateChart instance
     */
    setOrientationHorizontal(): this;
    /**
     * Set whether to show the siblings of the main person
     * @param show_siblings_of_main - Whether to show the siblings of the main person.
     * @returns The CreateChart instance
     */
    setShowSiblingsOfMain(show_siblings_of_main: ST.ShowSiblingsOfMain): this;
    /**
     * set function that will modify the tree hierarchy. it can be used to delete or add cards in the tree.
     * @param modifyTreeHierarchy - function that will modify the tree hierarchy.
     * @returns The CreateChart instance
     */
    setModifyTreeHierarchy(modifyTreeHierarchy: ST.ModifyTreeHierarchy): this;
    /**
     * Set the private cards config
     * @param private_cards_config - The private cards config.
     * @param private_cards_config.condition - The condition to check if the card is private.
     * - Example: (d: Datum) => d.data.living === true
     * @returns The CreateChart instance
     */
    setPrivateCardsConfig(private_cards_config: ST.PrivateCardsConfig): this;
    /**
     * Option to set text on spouse links
     * @param linkSpouseText - The function to set the text on the spouse links.
     * - Example: (sp1, sp2) => getMarriageDate(sp1, sp2)
     * @returns The CreateChart instance
     */
    setLinkSpouseText(linkSpouseText: LinkSpouseText): this;
    /**
     * Set whether to show the single parent empty card
     * @param single_parent_empty_card - Whether to show the single parent empty card.
     * @param label - The label to display for the single parent empty card.
     * @returns The CreateChart instance
     */
    setSingleParentEmptyCard(single_parent_empty_card: boolean, { label }?: {
        label?: string | undefined;
    }): this;
    /**
     * Set the Card creation function
     * @param Card - The card function.
     * @returns The CreateChart instance
     */
    setCard(card: (cont: HTMLElement, store: Store) => CardHtml | CardSvg): CardHtml | CardSvg;
    /**
     * Set the Card HTML function
     * @returns The CardHtml instance
     */
    setCardHtml(): CardHtml;
    /**
     * Set the Card SVG function
     * @returns The CardSvg instance
     */
    setCardSvg(): CardSvg;
    /**
     * Set the transition time
     * @param transition_time - The transition time in milliseconds
     * @returns The CreateChart instance
     */
    setTransitionTime(transition_time: ST.TransitionTime): this;
    /**
     * Set the sort children function
     * @param sortChildrenFunction - The sort children function.
     * - Example: (a, b) => a.data.birth_date - b.data.birth_date
     * @returns The CreateChart instance
     */
    setSortChildrenFunction(sortChildrenFunction: ST.SortChildrenFunction): this;
    /**
     * Set the sort spouses function
     * @param sortSpousesFunction - The sort spouses function.
     * - Example:
     *   (d, data) => {
     *     const spouses = d.data.rels.spouses || []
     *     return spouses.sort((a, b) => {
     *       const sp1 = data.find(d0 => d0.id === a)
     *       const sp2 = data.find(d0 => d0.id === b)
     *       if (!sp1 || !sp2) return 0
     *       return getMarriageDate(d, sp1) - getMarriageDate(d, sp2)
     *    })
     *   })
     * }
     * @returns The CreateChart instance
     */
    setSortSpousesFunction(sortSpousesFunction: ST.SortSpousesFunction): this;
    /**
     * Set how many generations to show in the ancestry
     * @param ancestry_depth - The number of generations to show in the ancestry.
     * @returns The CreateChart instance
     */
    setAncestryDepth(ancestry_depth: ST.AncestryDepth): this;
    /**
     * Set how many generations to show in the progeny
     * @param progeny_depth - The number of generations to show in the progeny.
     * @returns The CreateChart instance
     */
    setProgenyDepth(progeny_depth: ST.ProgenyDepth): this;
    /**
     * Get the max depth of a person in the ancestry and progeny
     * @param d_id - The id of the person to get the max depth of.
     * @returns The max depth of the person in the ancestry and progeny. {ancestry: number, progeny: number}
     */
    getMaxDepth(d_id: Datum['id']): {
        ancestry: number;
        progeny: number;
    };
    /**
     * Calculate the kinships of a person
     * @param d_id - The id of the person to calculate the kinships of.
     * @param config - The config for the kinships.
     * @param config.show_in_law - Whether to show in law relations.
     * @returns The kinships of the person.
     */
    calculateKinships(d_id: Datum['id'], config?: KinshipInfoConfig): import("../features/kinships/calculate-kinships").Kinships;
    /**
     * Get the kinships data stash with which we can create small family tree with relatives that connects 2 people
     * @param main_id - The id of the main person.
     * @param rel_id - The id of the person to get the kinships of.
     * @returns The kinships data stash.
     */
    getKinshipsDataStash(main_id: Datum['id'], rel_id: Datum['id']): void | import("../features/kinships/kinships-data").DatumKinship[];
    /**
     * Set whether to show toggable tree branches are duplicated
     * @param duplicate_branch_toggle - Whether to show toggable tree branches are duplicated.
     * @returns The CreateChart instance
     */
    setDuplicateBranchToggle(duplicate_branch_toggle: ST.DuplicateBranchToggle): this;
    /**
     * Initialize the edit tree
     * @returns The edit tree instance.
     */
    editTree(): EditTree;
    /**
     * Update the main person
     * @param d - New main person.
     * @returns The CreateChart instance
     */
    updateMain(d: Datum): this;
    /**
     * Update the main person
     * @param id - New main person id.
     * @returns The CreateChart instance
     */
    updateMainId(id: Datum['id']): this;
    /**
     * Get the main person
     * @returns The main person.
     */
    getMainDatum(): Datum;
    /**
     * Set the before update of the tree.
     * @param fn - The function to call before the update.
     * @returns The CreateChart instance
     */
    setBeforeUpdate(fn: Function): this;
    /**
     * Set the after update of the tree.
     * @param fn - The function to call after the update.
     * @returns The CreateChart instance
     */
    setAfterUpdate(fn: Function): this;
    /**
     * Set the person dropdown
     * @param getLabel - The function to get the label of the person to show in the dropdown.
     * @param config - The config for the person dropdown.
     * @param config.cont - The container to put the dropdown in. Default is the .f3-nav-cont element.
     * @param config.onSelect - The function to call when a person is selected. Default is setting clicked person as main person and updating the tree.
     * @param config.placeholder - The placeholder for the search input. Default is 'Search'.
     * @returns The CreateChart instance
     */
    setPersonDropdown(getLabel: Function, { cont, onSelect, placeholder }?: {
        cont?: HTMLElement;
        onSelect?: (d_id: Datum['id']) => void;
        placeholder?: string;
    }): this;
    /**
     * Unset the person dropdown
     * @returns The CreateChart instance
     */
    unSetPersonSearch(): this;
}
export {};
