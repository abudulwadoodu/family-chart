import { Datum, Data } from "../../types/data";
import { Kinships } from "./calculate-kinships";
export interface DatumKinship extends Datum {
    kinship?: string;
}
export declare function getKinshipsDataStash(main_id: Datum['id'], rel_id: Datum['id'], data_stash: Data, kinships: Kinships): void | DatumKinship[];
