export default function (cont: HTMLElement, onClose?: () => void): InfoPopup;
export declare class InfoPopup {
    cont: HTMLElement;
    popup_cont: HTMLElement;
    active: boolean;
    onClose?: () => void;
    constructor(cont: HTMLElement, onClose?: () => void);
    create(): void;
    activate(content?: HTMLElement): void;
    open(): void;
    close(): void;
}
