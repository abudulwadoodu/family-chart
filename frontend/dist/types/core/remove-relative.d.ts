import { TreeDatum } from "../types/treeData";
import { Store } from "../types/store";
import { Datum } from "../types/data";
import { Modal } from "../features/modal";
declare const _default: (store: RemoveRelative["store"], onActivate: RemoveRelative["onActivate"], cancelCallback: RemoveRelative["cancelCallback"], modal: RemoveRelative["modal"]) => RemoveRelative;
export default _default;
export declare class RemoveRelative {
    store: Store;
    onActivate: () => void;
    cancelCallback: (datum: Datum) => void;
    modal: Modal;
    datum: Datum | null;
    onChange: ((rel_tree_datum: TreeDatum, onAccept: () => void) => void) | null;
    onCancel: (() => void) | null;
    is_active: boolean;
    constructor(store: RemoveRelative['store'], onActivate: RemoveRelative['onActivate'], cancelCallback: RemoveRelative['cancelCallback'], modal: RemoveRelative['modal']);
    activate(datum: Datum): void;
}
