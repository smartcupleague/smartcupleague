import { ProcessorContext } from "../processor.js";

export abstract class BaseHandler {
  protected _ctx!: ProcessorContext;

  async process(ctx: ProcessorContext): Promise<void> {
    this._ctx = ctx;
    this.clear();
  }

  abstract clear(): void;
  abstract save(): Promise<void>;
}
