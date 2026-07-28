import { describe, it, expect } from "vitest";

describe("title parser", () => {
  function parseTitle(raw: string): string {
    return raw
      .replace(/\.[a-z0-9]{2,4}$/i, "")
      .replace(/[._-]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  it("removes file extension", () => {
    expect(parseTitle("My Video.mp4")).toBe("My Video");
  });

  it("replaces separators with spaces", () => {
    expect(parseTitle("My_Video_File.mkv")).toBe("My Video File");
  });

  it("handles dots in filenames", () => {
    expect(parseTitle("The.Show.S01E01.avi")).toBe("The Show S01E01");
  });

  it("handles already clean titles", () => {
    expect(parseTitle("Just a Title")).toBe("Just a Title");
  });
});

describe("category guesser", () => {
  function guessCategoryFromTitle(title: string): string {
    if (/[Ss]\d+[Ee]\d+|season|episode|series/i.test(title)) return "TV Series";
    if (/\bdoc(umentary)?\b/i.test(title)) return "Documentary";
    if (/\banim(e|ated)?\b/i.test(title)) return "Anime";
    return "Movies";
  }

  it("detects TV series by SxxExx pattern", () => {
    expect(guessCategoryFromTitle("The.Show.S01E02")).toBe("TV Series");
  });

  it("detects documentaries", () => {
    expect(guessCategoryFromTitle("Planet Earth documentary")).toBe("Documentary");
  });

  it("detects anime", () => {
    expect(guessCategoryFromTitle("Attack on Titan anime")).toBe("Anime");
  });

  it("defaults to Movies", () => {
    expect(guessCategoryFromTitle("Random Home Video")).toBe("Movies");
  });
});
