export default function (cont: HTMLElement): Modal;
export declare class Modal {
    cont: HTMLElement;
    modal_cont: HTMLElement;
    active: boolean;
    onClose: (() => void) | null;
    constructor(cont: HTMLElement);
    create(): void;
    activate(content: string | HTMLElement, { boolean, onAccept, onCancel }?: {
        boolean?: boolean;
        onAccept?: () => void;
        onCancel?: () => void;
    }): void;
    reset(): void;
    open(): void;
    close(): void;
}
