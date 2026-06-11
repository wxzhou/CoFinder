import type { ContentViewerOpenRequest } from "../shared/types/ipc";

export type ContentViewerPane = "local" | "remote";

export type ContentOpenRequest = ContentViewerOpenRequest;

export type ContentViewerTab = {
  id: string;
  kind: "text" | "search";
  pane: ContentViewerPane;
  path: string;
  connectionId?: string;
  title: string;
  initialLine?: number;
  highlightQuery?: string;
  query?: string;
};

export function contentTabKey(input: Pick<ContentOpenRequest | ContentViewerTab, "kind" | "pane" | "path" | "connectionId">): string {
  return [input.kind, input.pane, input.connectionId ?? "", input.path].join("\u0000");
}

export function makeContentTab(request: ContentOpenRequest): ContentViewerTab {
  return {
    id: contentTabKey(request),
    kind: request.kind,
    pane: request.pane,
    path: request.path,
    connectionId: request.connectionId,
    title: request.title?.trim() || basenameForContentPath(request.path),
    initialLine: request.kind === "text" ? normalizeInitialLine(request.initialLine) : undefined,
    highlightQuery: request.kind === "text" ? request.highlightQuery?.trim() || undefined : undefined,
    query: request.kind === "search" ? request.query ?? "" : undefined
  };
}

export function applyContentOpenRequest(
  tabs: ContentViewerTab[],
  activeTabId: string | null,
  request: ContentOpenRequest
): { tabs: ContentViewerTab[]; activeTabId: string } {
  const nextTab = makeContentTab(request);
  const existingIndex = tabs.findIndex((tab) => tab.id === nextTab.id);
  if (existingIndex < 0) return { tabs: [...tabs, nextTab], activeTabId: nextTab.id };
  const nextTabs = tabs.map((tab, index) =>
    index === existingIndex
      ? {
          ...tab,
          title: nextTab.title,
          initialLine: nextTab.initialLine,
          highlightQuery: nextTab.highlightQuery,
          query: nextTab.query ?? tab.query
        }
      : tab
  );
  return { tabs: nextTabs, activeTabId: nextTab.id || activeTabId || nextTabs[existingIndex].id };
}

export function requestFromSearchResult(args: {
  pane: ContentViewerPane;
  path: string;
  connectionId?: string;
  line: number;
  query: string;
}): ContentOpenRequest {
  return {
    kind: "text",
    pane: args.pane,
    path: args.path,
    connectionId: args.connectionId,
    initialLine: normalizeInitialLine(args.line),
    highlightQuery: args.query
  };
}

export function lineWindowStart(targetLine: number | undefined, contextBefore: number): number {
  const line = normalizeInitialLine(targetLine) ?? 1;
  return Math.max(1, line - Math.max(0, Math.floor(contextBefore)));
}

export function highlightTextLine(line: string, query: string | undefined): Array<{ text: string; match: boolean }> {
  const needle = query?.trim();
  if (!needle) return [{ text: line, match: false }];
  const lowerLine = line.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  while (cursor < line.length) {
    const index = lowerLine.indexOf(lowerNeedle, cursor);
    if (index < 0) {
      parts.push({ text: line.slice(cursor), match: false });
      break;
    }
    if (index > cursor) parts.push({ text: line.slice(cursor, index), match: false });
    parts.push({ text: line.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
  }
  return parts.length ? parts : [{ text: line, match: false }];
}

function normalizeInitialLine(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.floor(value));
}

function basenameForContentPath(input: string): string {
  const normalized = input.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").pop() || input || "Untitled";
}
