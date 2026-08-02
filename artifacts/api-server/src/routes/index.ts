import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkpointsRouter from "./checkpoints";
import nfcRouter from "./nfc";
import routinesRouter from "./routines";
import sessionsRouter from "./sessions";
import historyRouter from "./history";
import settingsRouter from "./settings";
import eventsRouter from "./events";
import insightsRouter from "./insights";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkpointsRouter);
router.use(nfcRouter);
router.use(routinesRouter);
router.use(sessionsRouter);
router.use(historyRouter);
router.use(settingsRouter);
router.use(eventsRouter);
router.use(insightsRouter);

export default router;
