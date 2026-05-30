import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import seriesRouter from "./series.js";
import categoriesRouter from "./categories.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/series", seriesRouter);
router.use("/categories", categoriesRouter);

export default router;
