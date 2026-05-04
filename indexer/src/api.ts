import "reflect-metadata";
import express from "express";
import { postgraphile, PostGraphileOptions } from "postgraphile";
import ConnectionFilterPlugin from "postgraphile-plugin-connection-filter";
import { createServer } from "node:http";
import { Pool } from "pg";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const isDev = process.env.NODE_ENV !== "production";
const dbUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/bolao_indexer";
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const port = Number(process.env.GQL_PORT || 4350);

async function main() {
  const dbPool = new Pool({ connectionString: dbUrl });

  const options: PostGraphileOptions = {
    watchPg: isDev,
    graphiql: true,
    enhanceGraphiql: isDev,
    subscriptions: false,
    dynamicJson: true,
    disableDefaultMutations: true,
    ignoreRBAC: false,
    showErrorStack: isDev ? "json" : true,
    legacyRelations: "omit",
    appendPlugins: [ConnectionFilterPlugin],
    graphqlRoute: "/graphql",
    graphiqlRoute: "/graphiql",
  };

  const app = express();

  // CORS: allow frontend dev server to reach GraphQL directly
  app.use(cors({ origin: [frontendUrl, "http://localhost:3000", "http://127.0.0.1:5173"] }));
  app.use(postgraphile(dbPool, "public", options));

  const server = createServer(app);

  server.listen({ host: "0.0.0.0", port }, () => {
    console.log(`GraphQL  → http://0.0.0.0:${port}/graphql`);
    console.log(`GraphiQL → http://0.0.0.0:${port}/graphiql`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
