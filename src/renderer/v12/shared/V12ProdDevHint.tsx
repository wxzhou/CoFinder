import type { ReactElement } from "react";

export function V12ProdDevHint(): ReactElement {
  return (
    <div className="cfv12-prod-devhint" aria-hidden>
      v12 · set <code>?ui=v11</code> or <code>COFINDER_LEGACY_UI=1</code> for classic UI
    </div>
  );
}
