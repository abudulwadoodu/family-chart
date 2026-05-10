import { Store } from "../types/store";
import { Data } from "../types/data";
export interface History {
    changed: () => void;
    back: () => void;
    forward: () => void;
    canForward: () => boolean;
    canBack: () => boolean;
}
export interface HistoryControls {
    back_btn: HTMLElement;
    forward_btn: HTMLElement;
    updateButtons: () => void;
    destroy: () => void;
}
export interface HistoryWithControls extends History {
    controls: HistoryControls;
}
export declare function createHistory(store: Store, getStoreDataCopy: () => Data, onUpdate: () => void): History;
export declare function createHistoryControls(cont: HTMLElement, history: History): HistoryControls;
