import { createMeasure } from "measure-fn";

export const httpMeasure = createMeasure("http");
export const buildMeasure = createMeasure("build");
export const cliBuildMeasure = createMeasure("cli:build");
export const routeMeasure = createMeasure("route");
export const importMapMeasure = createMeasure("imports");
export const ssgMeasure = createMeasure("ssg");
