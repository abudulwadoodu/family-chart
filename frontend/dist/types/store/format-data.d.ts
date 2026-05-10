import { Data, Datum } from "../types/data";
export interface LegacyDatum extends Omit<Datum, 'rels'> {
    rels: {
        father?: string;
        mother?: string;
        spouses?: string[];
        children?: string[];
        parents?: string[];
    };
}
export declare function formatData(data: any): Data;
export declare function formatDataForExport(data: LegacyDatum[], legacy_format?: boolean): LegacyDatum[];
