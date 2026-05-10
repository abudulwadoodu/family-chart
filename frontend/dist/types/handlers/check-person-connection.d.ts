import { Datum } from "../types/data";
export declare function checkIfRelativesConnectedWithoutPerson(datum: Datum, data_stash: Datum[]): boolean;
export declare function checkIfConnectedToFirstPerson(datum: Datum, data_stash: Datum[], exclude_ids?: Datum['id'][]): boolean;
