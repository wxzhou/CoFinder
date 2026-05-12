export type RowLike = { fullPath: string };

export type SelectionState = {
  selectedFullPaths: string[];
  selectionAnchorFullPath: string | null;
};

export type RectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type MarqueeRowRect = RowLike & RectLike;

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
      selectedFullPaths: range,
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

export function clearSelectionState(): SelectionState {
  return {
    selectedFullPaths: [],
    selectionAnchorFullPath: null
  };
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

export function rectsIntersect(a: RectLike, b: RectLike): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function normalizeDragRect(startX: number, startY: number, currentX: number, currentY: number): RectLike {
  return {
    left: Math.min(startX, currentX),
    top: Math.min(startY, currentY),
    right: Math.max(startX, currentX),
    bottom: Math.max(startY, currentY)
  };
}

export function applyMarqueeSelection(
  rows: MarqueeRowRect[],
  marquee: RectLike,
  current: SelectionState,
  options: { additive: boolean }
): SelectionState {
  const hits = rows.filter((row) => rectsIntersect(row, marquee)).map((row) => row.fullPath);
  const selectedFullPaths = options.additive ? Array.from(new Set([...current.selectedFullPaths, ...hits])) : hits;
  return {
    selectedFullPaths,
    selectionAnchorFullPath: hits[hits.length - 1] ?? current.selectionAnchorFullPath
  };
}
