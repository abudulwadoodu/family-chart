import { Data, Datum } from "../types/data";
import { AddRelative } from "../core/add-relative";
export declare function updateGendersForNewRelatives(updated_datum: Datum, data: Data): void;
export declare function cleanUp(data: Data): void;
export declare function addDatumRelsPlaceholders(datum: Datum, store_data: Data, addRelLabels: AddRelative['addRelLabels'], canAdd?: AddRelative['canAdd']): Data;
