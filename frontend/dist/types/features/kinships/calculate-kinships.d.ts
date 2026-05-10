import { Datum, Data } from "../../types/data";
import { DatumKinship } from "./kinships-data";
export interface KinshipInfoConfig {
    self_id?: Datum['id'];
    getLabel?: (d: DatumKinship) => string;
    title?: string;
    show_in_law?: boolean;
}
export interface Kinships {
    [key: Datum['id']]: string;
}
export declare function calculateKinships(d_id: Datum['id'], data_stash: Data, kinship_info_config: KinshipInfoConfig): Kinships;
export declare function findSameAncestor(main_id: Datum['id'], rel_id: Datum['id'], data_stash: Data): {
    found: string | string[];
    is_ancestor: undefined;
    is_half_kin: undefined;
} | null;
