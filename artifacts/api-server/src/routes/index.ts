import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import seriesRouter from "./series.js";
import categoriesRouter from "./categories.js";
import downloadRouter from "./download.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/series", seriesRouter);
router.use("/categories", categoriesRouter);
router.use("/download", downloadRouter);

export default router;
