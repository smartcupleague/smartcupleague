import { existsSync, readFileSync } from "node:fs";
import { getFnNamePrefix, getServiceNamePrefix, Sails } from "sails-js";
import { SailsIdlParser } from "sails-js-parser";
import { UserMessageSentEvent } from "./types/index.js";

interface Message {
  service: string;
  method: string;
}

interface OutputMessage<T> extends Message {
  payload: T;
}

export class SailsDecoder {
  private constructor(private readonly program: Sails) {}

  static async new(idlPath: string): Promise<SailsDecoder> {
    if (!existsSync(idlPath)) {
      throw new Error(`IDL file not found: ${idlPath}`);
    }

    const parser = await SailsIdlParser.new();
    const sails = new Sails(parser);
    sails.parseIdl(readFileSync(idlPath, "utf8"));

    return new SailsDecoder(sails);
  }

  private serviceName(payload: `0x${string}`): string {
    return getServiceNamePrefix(payload);
  }

  private methodName(payload: `0x${string}`): string {
    return getFnNamePrefix(payload);
  }

  decodeEvent<T>(event: UserMessageSentEvent): OutputMessage<T> {
    const payload = event.args.message.payload;
    const service = this.serviceName(payload);
    const method = this.methodName(payload);
    const result = this.program.services[service]?.events[method]?.decode(
      payload
    ) as T;

    return { service, method, payload: result };
  }
}
