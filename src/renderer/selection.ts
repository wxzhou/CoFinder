export type RowLike = { fullPath: string };

export type SelectionState = {
  selectedFullPaths: string[];
  selectionAnchorFullPath: string | null;
};

export function selectAllRows<T extends RowLike>(
  rows: T[],
  anchor: "first" | "last" = "first"
): SelectionState {
  const selectedFullPaths = rows.map((row) => row.fullPath);
  const selectionAnchorFullPath = selectedFullPaths.length
    ? anchor === "first"
      ? selectedFullPaths[0]
      : selectedFullPaths[selectedFullPaths.length - 1]
    : null;
  return { selectedFullPaths, selectionAnchorFullPath };
}

export function applyRowSelection<T extends RowLike>(
  rows: T[],
  current: SelectionState,
  clickedPath: string,
  options: { metaKey: boolean; shiftKey: boolean }
): SelectionState {
  const rowPaths = rows.map((row) => row.fullPath);
  if (!rowPaths.includes(clickedPath)) return current;

  if (options.shiftKey && current.selectionAnchorFullPath && rowPaths.includes(current.selectionAnchorFullPath)) {
    const from = rowPaths.indexOf(current.selectionAnchorFullPath);
    const to = rowPaths.indexOf(clickedPath);
    const [start, end] = from <= to ? [from, to] : [to, from];
    const range = rowPaths.slice(start, end + 1);
    return {
      selectedFullPaths: uniqueKeepOrder([...current.selectedFullPaths, ...range]),
      selectionAnchorFullPath: current.selectionAnchorFullPath
    };
  }

  if (options.metaKey) {
    const has = current.selectedFullPaths.includes(clickedPath);
    return {
      selectedFullPaths: has
        ? current.selectedFullPaths.filter((path) => path !== clickedPath)
        : [...current.selectedFullPaths, clickedPath],
      selectionAnchorFullPath: clickedPath
    };
  }

  return {
    selectedFullPaths: [clickedPath],
    selectionAnchorFullPath: clickedPath
  };
}

export function normalizeContextSelection(currentSelected: string[], clickedPath: string): string[] {
  if (currentSelected.includes(clickedPath)) return currentSelected;
  return [clickedPath];
}

export function stringifySelection(
  fullPaths: string[],
  entries: Array<{ fullPath: string; name: string }>,
  mode: "name" | "path"
): string {
  const selected = entries.filter((entry) => fullPaths.includes(entry.fullPath));
  const values = mode === "name" ? selected.map((entry) => entry.name) : selected.map((entry) => entry.fullPath);
  return values.join("\n");
}

function uniqueKeepOrder(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}
