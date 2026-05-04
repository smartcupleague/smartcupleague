import "reflect-metadata";
import { TypeormDatabase } from "@subsquid/typeorm-store";

import { processor } from "./processor.js";
import { BolaoHandler } from "./handlers/index.js";
import { config } from "./config.js";

async function main() {
  const handler = new BolaoHandler(config.programId);
  await handler.init(config.idlPath);

  const db = new TypeormDatabase({
    supportHotBlocks: true,
    stateSchema: "gear_processor",
  });

  processor.run(db, async (ctx) => {
    await handler.process(ctx);
    await handler.save();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
