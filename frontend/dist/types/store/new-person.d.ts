import { Data, Datum } from "../types/data";
type RelType = 'daughter' | 'son' | 'mother' | 'father' | 'spouse';
export declare function createNewPerson({ data, rels }: {
    data: Datum['data'];
    rels?: {
        parents?: string[];
        spouses?: string[];
        children?: string[];
    };
}): {
    id: string;
    data: {
        [key: string]: any;
        gender: "M" | "F";
    };
    rels: {
        parents: string[];
        spouses: string[];
        children: string[];
    };
};
export declare function createNewPersonWithGenderFromRel({ data, rel_type, rel_datum }: {
    data: Datum['data'];
    rel_type: RelType;
    rel_datum: Datum;
}): {
    id: string;
    data: {
        [key: string]: any;
        gender: "M" | "F";
    };
    rels: {
        parents: string[];
        spouses: string[];
        children: string[];
    };
};
export declare function addNewPerson({ data_stash, datum }: {
    data_stash: Data;
    datum: Datum;
}): void;
export {};
