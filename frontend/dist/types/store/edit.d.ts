import { Data, Datum } from "../types/data";
export declare function submitFormData(datum: Datum, data_stash: Data, form_data: FormData): void;
export declare function syncRelReference(datum: Datum, data_stash: Data): void;
export declare function onDeleteSyncRelReference(datum: Datum, data_stash: Data): void;
export declare function moveToAddToAdded(datum: Datum, data_stash: Data): Datum;
export declare function removeToAdd(datum: Datum, data_stash: Data): boolean;
export declare function deletePerson(datum: Datum, data_stash: Data, clean_to_add?: boolean): {
    success: boolean;
};
export declare function cleanupDataJson(data: Data): Data;
export declare function removeToAddFromData(data: Data): void;
