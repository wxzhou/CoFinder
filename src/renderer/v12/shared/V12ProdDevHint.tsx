import type { ReactElement } from "react";

export function V12ProdDevHint(): ReactElement {
  return (
    <div className="cfv12-prod-devhint" aria-hidden>
      v12 dev · remove <code>?ui=v12</code> for classic UI
    </div>
  );
}
