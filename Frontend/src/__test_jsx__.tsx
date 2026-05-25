import { useState } from "react";
import type { ReactNode } from "react";
function Test(): ReactNode {
  const [show, setShow] = useState(false);
  const x: ReactNode = show ? <div>hello</div> : null;
  return x;
}
export default Test;
