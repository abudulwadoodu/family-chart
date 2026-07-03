Implement a visual export feature for the Family Tree application.

Add an "Export" action to the family tree toolbar that opens an export dialog.

Support the following formats:

PNG Image
PDF Document

The exported image/PDF should include the entire family tree, not just the currently visible viewport.

Requirements:

Automatically calculate the full tree bounds.
Add reasonable margins.
Preserve the current styling (colors, connectors, profile photos, fonts, rounded cards, etc.).
Produce high-quality output suitable for printing and sharing.
Preserve the user's current zoom level, pan position, and selected person after the export completes.
Show a loading indicator or progress UI while the export is being generated.
Handle large trees efficiently without freezing the UI.
Keep the implementation modular so additional formats (SVG) and export options (paper size, orientation, selected branch, etc.) can be added later.

Do not implement screenshots of the visible viewport. The export should render the entire tree regardless of what is currently visible on screen.


One additional suggestion

Since you're building this as a long-term application, I'd also ask Claude to create an ExportService abstraction rather than embedding export logic into the tree component. For example:

ExportService
├── exportAsPNG()
├── exportAsPDF()
└── (future) exportAsSVG()

This makes it much easier to add SVG, poster printing, or other export formats later without refactoring the tree component. It's a small architectural investment that will pay off as the export feature grows.