import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware
app.use((req, res, next) => {
  logger.info({ url: req.url, method: req.method, body: req.body }, "Incoming Request");
  next();
});

app.use("/api", router);

// Custom Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  // Extract deep Postgres errors if they exist
  const pgError = {
    message: err.message,
    code: err.code,
    detail: err.detail,
    hint: err.hint,
    position: err.position,
    where: err.where,
    schema: err.schema,
    table: err.table,
    column: err.column,
    dataType: err.dataType,
    constraint: err.constraint,
    stack: err.stack,
  };

  logger.error({ err: pgError, url: req.url, method: req.method }, "Unhandled API Error");

  res.status(err.status || 500).json({
    error: "UNHANDLED_ERROR",
    message: err.message || "No error message",
    details: err.stack,
    pg_hint: err.hint,
    pg_detail: err.detail,
    pg_code: err.code
  });
});

export default app;
