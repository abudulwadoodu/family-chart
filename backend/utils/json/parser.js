// Pure JSON.parse wrapper with a friendlier error message - mirrors
// csv/parser.js's role as the "text -> structured value" layer.
export function parseJsonText(jsonText) {
  if (!jsonText || !jsonText.trim()) {
    throw new Error('JSON file is empty');
  }
  try {
    return JSON.parse(jsonText);
  } catch (_error) {
    throw new Error('File is not valid JSON');
  }
}
