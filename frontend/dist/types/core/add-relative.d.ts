import { Data, Datum } from "../types/data";
import { Store } from "../types/store";
declare const _default: (store: Store, onActivate: () => void, cancelCallback: (datum: Datum) => void) => AddRelative;
export default _default;
export declare class AddRelative {
    store: Store;
    onActivate: () => void;
    cancelCallback: (datum: Datum) => void;
    datum: Datum | null;
    onChange: ((updated_datum: Datum, props: any) => void) | null;
    onCancel: (() => void) | null;
    is_active: boolean;
    addRelLabels: {
        father: string;
        mother: string;
        spouse: string;
        son: string;
        daughter: string;
    };
    canAdd?: (datum: Datum) => {
        parent?: boolean;
        spouse?: boolean;
        child?: boolean;
    };
    constructor(store: Store, onActivate: () => void, cancelCallback: (datum: Datum) => void);
    activate(datum: Datum): void;
    setAddRelLabels(add_rel_labels: AddRelative['addRelLabels']): this | undefined;
    setCanAdd(canAdd: AddRelative['canAdd']): this;
    addRelLabelsDefault(): {
        father: string;
        mother: string;
        spouse: string;
        son: string;
        daughter: string;
    };
    getStoreData(): Data;
    cleanUp(data?: Data | undefined): Data;
}
