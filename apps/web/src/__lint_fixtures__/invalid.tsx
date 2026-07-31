const unsafeValue: any = window.location.hash;

void eval(unsafeValue);
Promise.resolve("unfinished").then((value) => value.length);

export function InvalidImage() {
  return (
    <>
      <img src="/missing-description.png" />
      {[<span>Missing list key</span>]}
    </>
  );
}

import { demoWorkflow } from "../demo";

void demoWorkflow;
