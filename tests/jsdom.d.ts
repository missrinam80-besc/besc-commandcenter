// Only the existing static-markup tests use JSDOM. Keep their small type surface
// explicit instead of leaving this runtime dependency implicitly any.
declare module "jsdom" {
  export class JSDOM {
    constructor(markup?: string);
    readonly window: Window & typeof globalThis;
  }
}
