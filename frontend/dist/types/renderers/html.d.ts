export default function htmlContSetup(cont: HTMLElement): {
    svg: SVGElement;
    svgView: Element | null;
    htmlSvg: Element | null;
    htmlView: Element | null;
};
declare function createHtmlSvg(cont: HTMLElement): HTMLDivElement | null;
export declare function onZoomSetup(getSvgView: () => HTMLElement, getHtmlView: () => HTMLElement): (e: any) => void;
/** @deprecated This export will be removed in a future version. Use htmlContSetup instead. */
export { createHtmlSvg };
