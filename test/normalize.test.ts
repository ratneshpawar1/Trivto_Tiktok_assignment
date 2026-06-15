import { describe, it, expect } from "vitest";
import {
  normalizePexels,
  normalizePicsum,
  type PexelsCuratedResponse,
  type PicsumPhoto,
} from "../lib/normalize";
import { MAX_PAGE } from "../lib/validate";

const picsumEntry = (id: string): PicsumPhoto => ({
  id,
  author: `Author ${id}`,
  width: 1080,
  height: 1920,
});

describe("normalizePexels", () => {
  const base: PexelsCuratedResponse = {
    photos: [
      {
        id: 101,
        width: 1200,
        height: 1800,
        photographer: "Ada",
        alt: "a tower",
        src: { portrait: "https://img/portrait.jpg", tiny: "https://img/tiny.jpg" },
      },
      // missing src entirely -> dropped
      { id: 102, width: 100, height: 100, photographer: "Bob" },
      // src present but no usable full URL (only tiny) -> dropped
      { id: 103, src: { tiny: "https://img/only-tiny.jpg" } },
      // missing id -> dropped
      { width: 1, height: 1, src: { portrait: "https://img/x.jpg" } },
      // usable via fallback chain (no portrait, has large)
      { id: 104, src: { large: "https://img/large.jpg" } },
    ],
    next_page: "https://api.pexels.com/v1/curated/?page=3",
  };

  it("drops records missing id or a usable image URL", () => {
    const out = normalizePexels(base, 2);
    expect(out.items.map((i) => i.id)).toEqual(["101", "104"]);
  });

  it("maps fields and falls back for alt/thumb", () => {
    const out = normalizePexels(base, 2);
    expect(out.items[0]).toEqual({
      id: "101",
      width: 1200,
      height: 1800,
      srcUrl: "https://img/portrait.jpg",
      thumbUrl: "https://img/tiny.jpg",
      author: "Ada",
      alt: "a tower",
    });
    // 104 has no tiny -> thumb falls back to srcUrl; no alt -> author
    expect(out.items[1].thumbUrl).toBe("https://img/large.jpg");
    expect(out.items[1].alt).toBe("Unknown");
    expect(out.items[1].author).toBe("Unknown");
  });

  it("derives nextPage from upstream next_page presence", () => {
    expect(normalizePexels(base, 2).nextPage).toBe(3);
    expect(normalizePexels({ photos: [], next_page: undefined }, 5).nextPage).toBe(
      null,
    );
  });

  it("never advertises a nextPage beyond MAX_PAGE", () => {
    // Upstream still signals more, but page+1 would be un-fetchable (400).
    expect(normalizePexels(base, MAX_PAGE).nextPage).toBe(null);
  });

  it("handles a malformed payload without throwing", () => {
    expect(normalizePexels({} as PexelsCuratedResponse, 1)).toEqual({
      items: [],
      nextPage: null,
    });
  });
});

describe("normalizePicsum", () => {
  const list: PicsumPhoto[] = [
    { id: "0", author: "Alejandro", width: 5000, height: 3333 },
    { id: "10", author: "Paul", width: 2500, height: 1667 },
    // missing id -> dropped
    { author: "Ghost", width: 1, height: 1 },
  ];

  it("drops records missing id and builds portrait URLs", () => {
    const out = normalizePicsum(list, 1, 15);
    expect(out.items.map((i) => i.id)).toEqual(["0", "10"]);
    expect(out.items[0].srcUrl).toBe("https://picsum.photos/id/0/1080/1920");
    expect(out.items[0].thumbUrl).toBe("https://picsum.photos/id/0/27/48");
    expect(out.items[0].alt).toBe("Photo by Alejandro");
  });

  it("advances cursor on a full page, stops on a short/empty page", () => {
    const LIMIT = 5;
    // All-valid fixtures so raw length and valid count agree — the cursor is
    // driven by how many records upstream RETURNED, not how many survived.
    const fullPage = ["1", "2", "3", "4", "5"].map(picsumEntry); // == LIMIT
    const shortPage = ["1", "2", "3", "4"].map(picsumEntry); // < LIMIT

    expect(normalizePicsum(fullPage, 1, LIMIT).nextPage).toBe(2); // full -> next
    expect(normalizePicsum(shortPage, 1, LIMIT).nextPage).toBe(null); // short -> stop
    expect(normalizePicsum([], 4, LIMIT).nextPage).toBe(null); // empty -> stop
  });

  it("never advertises a nextPage beyond MAX_PAGE", () => {
    const fullPage = Array.from({ length: 5 }, (_, i) => picsumEntry(`${i}`));
    expect(normalizePicsum(fullPage, MAX_PAGE, 5).nextPage).toBe(null);
  });
});
