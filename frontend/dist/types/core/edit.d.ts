import { HistoryWithControls } from "../features/history";
import { RemoveRelative } from "./remove-relative";
import { Modal } from "../features/modal";
import { Store } from "../types/store";
import { Data, Datum } from "../types/data";
import { AddRelative } from "./add-relative";
import { FormCreator, FormCreatorSetupProps } from "../types/form";
import { CardHtml } from "./cards/card-html";
import { CardSvg } from "./cards/card-svg";
import { LegacyDatum } from "../store/format-data";
type Card = CardHtml | CardSvg;
declare const _default: (cont: HTMLElement, store: Store) => EditTree;
export default _default;
/**
 * EditTree class - Provides comprehensive editing capabilities for family tree data.
 *
 * This class handles all editing operations for family tree data, including:
 * - Adding new family members and relationships
 * - Editing existing person information
 * - Removing family members and relationships
 * - Form management and validation
 * - History tracking and undo/redo functionality
 * - Modal dialogs and user interactions
 *
 * @example
 * ```typescript
 * import * as f3 from 'family-chart'
 * const f3Chart = f3.createChart('#FamilyChart', data)
 * const f3EditTree = f3Chart.editTree()  // returns an EditTree instance
 *   .setFields(["first name","last name","birthday"])
 *   .setOnChange(() => {
 *      const updated_data = f3EditTree.exportData()
 *      // do something with the updated data
 *   })
 * ```
 */
export declare class EditTree {
    cont: HTMLElement;
    store: Store;
    fields: {
        type: string;
        label: string;
        id: string;
    }[];
    formCont: {
        el?: HTMLElement;
        populate: (form_element: HTMLElement) => void;
        open: () => void;
        close: () => void;
    };
    is_fixed: boolean;
    no_edit: boolean;
    onChange: (() => void) | null;
    editFirst: boolean;
    postSubmit: ((datum: Datum, data: Data) => void) | null;
    link_existing_rel_config?: FormCreatorSetupProps['link_existing_rel_config'];
    onFormCreation: null | ((props: {
        cont: HTMLElement;
        form_creator: FormCreator;
    }) => void);
    addRelativeInstance: AddRelative;
    removeRelativeInstance: RemoveRelative;
    history: HistoryWithControls;
    modal: Modal;
    createFormEdit: ((form_creator: FormCreator, closeCallback: () => void) => HTMLElement) | null;
    createFormNew: ((form_creator: FormCreator, closeCallback: () => void) => HTMLElement) | null;
    onSubmit: FormCreatorSetupProps['onSubmit'];
    onDelete: FormCreatorSetupProps['onDelete'];
    canEdit: FormCreatorSetupProps['canEdit'];
    canDelete: FormCreatorSetupProps['canDelete'];
    constructor(cont: HTMLElement, store: Store);
    /**
     * Open the edit form
     * @param datum - The datum to edit
     */
    open(datum: Datum): void;
    private setupAddRelative;
    private setupRemoveRelative;
    private createHistory;
    /**
     * Open the edit form without canceling the add relative or remove relative view
     * @param datum - The datum to edit
     */
    openWithoutRelCancel(datum: Datum): void;
    private getFormContDefault;
    setFormCont(formCont: EditTree['formCont']): this;
    cardEditForm(datum: Datum): void;
    openForm(): void;
    closeForm(): void;
    fixed(): this;
    absolute(): this;
    setCardClickOpen(card: Card): this;
    openFormWithId(d_id: Datum['id']): void;
    setNoEdit(): this;
    setEdit(): this;
    setFields(fields: any[]): this;
    /**
     * Set the onChange function to be called when the data changes via editing, adding, or removing a relative
     * @param fn - The onChange function
     */
    setOnChange(fn: EditTree['onChange']): this;
    setCanEdit(canEdit: EditTree['canEdit']): this;
    setCanDelete(canDelete: EditTree['canDelete']): this;
    setCanAdd(canAdd: AddRelative['canAdd']): this;
    addRelative(datum: Datum | undefined): this;
    setupModal(): Modal;
    setEditFirst(editFirst: EditTree['editFirst']): this;
    isAddingRelative(): boolean;
    isRemovingRelative(): boolean;
    setAddRelLabels(add_rel_labels: AddRelative['addRelLabels']): this;
    setLinkExistingRelConfig(link_existing_rel_config: EditTree['link_existing_rel_config']): this;
    setOnFormCreation(onFormCreation: EditTree['onFormCreation']): this;
    setCreateFormEdit(createFormEdit: EditTree['createFormEdit']): this;
    setCreateFormNew(createFormNew: EditTree['createFormNew']): this;
    private _getStoreDataCopy;
    /**
     * deprecated: use exportData instead. This function will be removed in a future version.
     * Export the data
     * @returns family chart data
     */
    getStoreDataCopy(): Data | LegacyDatum[];
    /**
     * @returns family chart data
     */
    exportData(): Data | LegacyDatum[];
    getDataJson(): string;
    updateHistory(): void;
    setPostSubmit(postSubmit: EditTree['postSubmit']): this;
    setOnSubmit(onSubmit: EditTree['onSubmit']): this;
    setOnDelete(onDelete: EditTree['onDelete']): this;
    destroy(): this;
}
