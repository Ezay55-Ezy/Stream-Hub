import { describe, it, expect } from "vitest";

describe("health endpoint", () => {
  it("returns ok status", async () => {
    const res = await fetch("http://localhost:3001/api/healthz");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
