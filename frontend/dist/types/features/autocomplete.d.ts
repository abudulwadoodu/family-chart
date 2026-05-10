import { Datum } from "../types/data";
export default function (cont: Autocomplete['cont'], onSelect: Autocomplete['onSelect'], config?: Autocomplete['config']): Autocomplete;
interface AutocompleteOption {
    label: string;
    value: string;
    optionHtml: (d: AutocompleteOption) => string;
    label_html?: string;
    class?: string;
}
declare class Autocomplete {
    cont: HTMLElement;
    autocomplete_cont: HTMLElement;
    options: AutocompleteOption[];
    onSelect: (value: string) => void;
    config?: {
        placeholder?: string;
    };
    getOptions?: () => Autocomplete['options'];
    constructor(cont: HTMLElement, onSelect: (value: string) => void, config?: {
        placeholder?: string;
    });
    create(): void;
    setOptionsGetter(getOptions: () => Autocomplete['options']): this;
    setOptionsGetterPerson(getData: () => Datum[], getLabel: (d: Datum) => string): this;
    destroy(): void;
}
export {};
