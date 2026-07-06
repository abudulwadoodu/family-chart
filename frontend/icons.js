function svg(paths, viewBox = '0 0 24 24') {
  return `<svg class="icon" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const icons = {
  logo: svg(
    '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="8.5" y="14" width="7" height="7" rx="1.5"></rect><path d="M6.5 10v2a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2"></path><path d="M12 14v-2"></path>'
  ),
  trees: svg(
    '<circle cx="6" cy="5" r="2.25"></circle><circle cx="18" cy="5" r="2.25"></circle><circle cx="12" cy="12" r="2.25"></circle><circle cx="12" cy="19.5" r="2.25"></circle><path d="M6 7.25V10a2 2 0 0 0 2 2h2.2"></path><path d="M18 7.25V10a2 2 0 0 0-2 2h-2.2"></path><path d="M12 14.25v2.8"></path>'
  ),
  shield: svg(
    '<path d="M12 3.5 19 6.2v5.4c0 4.4-3 7.6-7 8.9-4-1.3-7-4.5-7-8.9V6.2L12 3.5Z"></path><path d="M9.25 12.25 11 14l3.75-4"></path>'
  ),
  logout: svg(
    '<path d="M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h3"></path><path d="M15.5 16 19.5 12 15.5 8"></path><path d="M19.5 12H9.5"></path>'
  ),
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M19.5 19.5 15.4 15.4"></path>'),
  plus: svg('<path d="M12 5v14"></path><path d="M5 12h14"></path>'),
  upload: svg(
    '<path d="M12 15.5V4"></path><path d="M7.5 8.5 12 4l4.5 4.5"></path><path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"></path>'
  ),
  download: svg(
    '<path d="M12 4v11.5"></path><path d="M7.5 11 12 15.5 16.5 11"></path><path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"></path>'
  ),
  kebab: svg('<circle cx="12" cy="5.5" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="12" cy="18.5" r="1.4"></circle>'),
  pencil: svg(
    '<path d="M16.5 4.5 19.5 7.5 8 19 4.5 19.5 5 16 16.5 4.5Z"></path>'
  ),
  trash: svg(
    '<path d="M5 7h14"></path><path d="M9.5 7V5.2c0-.66.54-1.2 1.2-1.2h2.6c.66 0 1.2.54 1.2 1.2V7"></path><path d="M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7"></path><path d="M10.2 11v5"></path><path d="M13.8 11v5"></path>'
  ),
  share: svg(
    '<circle cx="6" cy="12" r="2.25"></circle><circle cx="17.5" cy="6" r="2.25"></circle><circle cx="17.5" cy="18" r="2.25"></circle><path d="M8 11l7.7-3.6"></path><path d="M8 13l7.7 3.6"></path>'
  ),
  save: svg(
    '<path d="M5 4.5h11l3 3V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z"></path><path d="M8 4.5V9h7V4.5"></path><path d="M8 14.5h7"></path>'
  ),
  settings: svg(
    '<circle cx="12" cy="12" r="2.75"></circle><path d="M12 4.5v2"></path><path d="M12 17.5v2"></path><path d="M4.5 12h2"></path><path d="M17.5 12h2"></path><path d="M6.6 6.6l1.4 1.4"></path><path d="M16 16l1.4 1.4"></path><path d="M16 8l1.4-1.4"></path><path d="M6.6 17.4l1.4-1.4"></path>'
  ),
  chevronDown: svg('<path d="M6 9l6 6 6-6"></path>'),
  home: svg(
    '<path d="M4 11.5 12 4l8 7.5"></path><path d="M6 10v8a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-8"></path>'
  ),
  close: svg('<path d="M6 6l12 12"></path><path d="M18 6 6 18"></path>'),
  menu: svg('<path d="M4 6.5h16"></path><path d="M4 12h16"></path><path d="M4 17.5h16"></path>'),
  folderPlus: svg(
    '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h4.2l2 2.2H18.5A1.5 1.5 0 0 1 20 9.7V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V7.5Z"></path><path d="M12 11.5v4"></path><path d="M10 13.5h4"></path>',
    '0 0 24 22'
  ),
  external: svg(
    '<path d="M9 6H6.5A1.5 1.5 0 0 0 5 7.5v10A1.5 1.5 0 0 0 6.5 19h10a1.5 1.5 0 0 0 1.5-1.5V15"></path><path d="M13 5h6v6"></path><path d="M19 5 11 13"></path>'
  ),
  spinner: svg('<path d="M12 3.5v3.2"></path><path d="M12 17.3v3.2" opacity=".3"></path><path d="M5.4 5.4l2.2 2.2" opacity=".5"></path><path d="M16.4 16.4l2.2 2.2" opacity=".2"></path><path d="M3.5 12h3.2" opacity=".7"></path><path d="M17.3 12h3.2" opacity=".4"></path><path d="M5.4 18.6l2.2-2.2" opacity=".6"></path><path d="M16.4 7.6l2.2-2.2" opacity=".15"></path>'),
  mail: svg(
    '<rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="M4.5 7 12 12.5 19.5 7"></path>'
  ),
  lock: svg(
    '<rect x="5" y="10.5" width="14" height="9" rx="2"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path>'
  ),
  eye: svg(
    '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"></path><circle cx="12" cy="12" r="2.5"></circle>'
  ),
  eyeOff: svg(
    '<path d="M2.5 12S6 5.5 12 5.5c1.6 0 2.96.36 4.1.9M21.5 12S18 18.5 12 18.5c-1.6 0-2.96-.36-4.1-.9"></path><path d="M9.9 14.1a2.5 2.5 0 0 1 3.5-3.5"></path><path d="M3.5 3.5l17 17"></path>'
  ),
  clock: svg(
    '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3.2 2"></path>'
  ),
  github: svg(
    '<path d="M12 3.5c-4.7 0-8.5 3.8-8.5 8.5 0 3.8 2.5 7 5.9 8.1.3.1.6-.1.6-.5v-1.7c-2.4.5-3-1-3-1-.4-1-1-1.3-1-1.3-.8-.6 0-.6 0-.6.9.1 1.4.9 1.4.9.8 1.4 2.1 1 2.6.8.1-.6.3-1 .6-1.3-2-.2-4-1-4-4.5 0-1 .3-1.8 1-2.4-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6.9.8-.2 1.6-.3 2.4-.3.8 0 1.6.1 2.4.3 1.8-1.2 2.6-.9 2.6-.9.5 1.3.2 2.3.1 2.5.6.6 1 1.4 1 2.4 0 3.5-2.1 4.3-4.1 4.5.3.3.6.9.6 1.8v2.6c0 .3.3.6.6.5 3.4-1.1 5.9-4.3 5.9-8.1 0-4.7-3.8-8.5-8.5-8.5Z"></path>'
  ),
  check: svg('<path d="M5 13l4.5 4.5L19 7"></path>'),
  paperclip: svg(
    '<path d="M8 12.5 15 5.5a3 3 0 0 1 4.2 4.2L11 18a4.5 4.5 0 0 1-6.4-6.3L13 3.5"></path>'
  ),
  arrowUp: svg('<path d="M12 19V5"></path><path d="M6 11l6-6 6 6"></path>'),
  list: svg(
    '<path d="M9 6.5h10"></path><path d="M9 12h10"></path><path d="M9 17.5h10"></path><circle cx="5" cy="6.5" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="5" cy="17.5" r="1.1" fill="currentColor" stroke="none"></circle>'
  ),
  image: svg(
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><circle cx="8.5" cy="9.5" r="1.5"></circle><path d="M20.5 15.5 15.5 11 6.5 19.5"></path>'
  ),
  fileText: svg(
    '<path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"></path><path d="M14 3.5V8h4"></path><path d="M9 12.5h6"></path><path d="M9 16h6"></path>'
  ),
  maximize: svg(
    '<path d="M9 4.5H5.5A1 1 0 0 0 4.5 5.5V9"></path><path d="M15 4.5h3.5a1 1 0 0 1 1 1V9"></path><path d="M19.5 15v3.5a1 1 0 0 1-1 1H15"></path><path d="M4.5 15v3.5a1 1 0 0 0 1 1H9"></path>'
  ),
  minimize: svg(
    '<path d="M9 9H5.5a1 1 0 0 1-1-1V4.5"></path><path d="M15 9h3.5a1 1 0 0 0 1-1V4.5"></path><path d="M19.5 19.5V16a1 1 0 0 0-1-1H15"></path><path d="M4.5 19.5V16a1 1 0 0 1 1-1H9"></path>'
  ),
  zoomIn: svg(
    '<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M19.5 19.5 15.4 15.4"></path><path d="M10.5 7.5v6"></path><path d="M7.5 10.5h6"></path>'
  ),
  zoomOut: svg(
    '<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M19.5 19.5 15.4 15.4"></path><path d="M7.5 10.5h6"></path>'
  ),
  scan: svg(
    '<path d="M4.5 9V6.5a2 2 0 0 1 2-2H9"></path><path d="M15 4.5h2.5a2 2 0 0 1 2 2V9"></path><path d="M19.5 15v2.5a2 2 0 0 1-2 2H15"></path><path d="M9 19.5H6.5a2 2 0 0 1-2-2V15"></path><rect x="8.5" y="8.5" width="7" height="7" rx="1"></rect>'
  ),
  crosshair: svg(
    '<circle cx="12" cy="12" r="7"></circle><path d="M12 3v3"></path><path d="M12 18v3"></path><path d="M3 12h3"></path><path d="M18 12h3"></path><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"></circle>'
  ),
  sun: svg(
    '<circle cx="12" cy="12" r="4.2"></circle><path d="M12 3v2.2"></path><path d="M12 18.8V21"></path><path d="M4.4 4.4l1.55 1.55"></path><path d="M18.05 18.05 19.6 19.6"></path><path d="M3 12h2.2"></path><path d="M18.8 12H21"></path><path d="M4.4 19.6l1.55-1.55"></path><path d="M18.05 5.95 19.6 4.4"></path>'
  ),
  moon: svg(
    '<path d="M20 13.7A8.5 8.5 0 1 1 10.3 4a6.6 6.6 0 0 0 9.7 9.7Z"></path>'
  ),
  panelLeft: svg(
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M9.5 4.5v15"></path><path d="M14.5 9.5l-2.5 2.5 2.5 2.5" transform="translate(-1.5,0)"></path>'
  ),
  user: svg(
    '<circle cx="12" cy="8" r="3.5"></circle><path d="M4.5 19.5a7.5 7.5 0 0 1 15 0"></path>'
  ),
  undo: svg('<path d="M6 8.5H15a4.5 4.5 0 0 1 0 9H10"></path><path d="M9.5 5 6 8.5 9.5 12"></path>'),
  redo: svg('<path d="M18 8.5H9a4.5 4.5 0 0 0 0 9h5"></path><path d="M14.5 5 18 8.5 14.5 12"></path>'),
  chevronRight: svg('<path d="M9 6l6 6-6 6"></path>'),
};

export function icon(name) {
  return icons[name] || '';
}
