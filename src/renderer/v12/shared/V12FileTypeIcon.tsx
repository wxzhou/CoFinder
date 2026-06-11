import type { ReactElement } from "react";
import type { FileEntry } from "../../../shared/types/models";
import { classifyFileIcon } from "../fileIconClassifier";
import { V12Icon } from "./V12Icons";

export function V12FileTypeIcon(props: { entry: FileEntry; size?: "sm" | "md" | "lg" }): ReactElement {
  const descriptor = classifyFileIcon(props.entry);
  if (descriptor.kind === "folder") return <V12Icon name="folder" size={props.size} />;
  const sizeClass = props.size === "lg" ? " is-lg" : props.size === "sm" ? " is-sm" : "";
  return (
    <span className={`v12m-type-icon kind-${descriptor.kind}${sizeClass}`} aria-hidden>
      <V12Icon name="doc" size={props.size} />
      {descriptor.label ? <span className="v12m-type-badge">{descriptor.label}</span> : null}
    </span>
  );
}

