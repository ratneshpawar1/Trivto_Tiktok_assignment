import { describe, it, expect } from "vitest";
import {
  parsePage,
  validateLikeId,
  validateFeedImage,
  MAX_PAGE,
} from "../lib/validate";
import { AppError } from "../lib/errors";

const validImage = {
  id: "5",
  width: 1080,
  height: 1920,
  srcUrl: "https://images.pexels.com/photos/5/p.jpg?auto=compress",
  thumbUrl: "https://images.pexels.com/photos/5/t.jpg",
  author: "Ada",
  alt: "a tower",
};

describe("parsePage", () => {
  it("defaults missing/empty to 1", () => {
    expect(parsePage(null)).toBe(1);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
  });

  it("accepts valid positive integers", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("42")).toBe(42);
    expect(parsePage(String(MAX_PAGE))).toBe(MAX_PAGE);
  });

  it.each(["abc", "0", "-1", "1.5", "1e3", " 2", "2 ", "0x10", "NaN", "Infinity"])(
    "rejects junk: %s",
    (raw) => {
      expect(() => parsePage(raw)).toThrowError(AppError);
    },
  );

  it("rejects out-of-range pages", () => {
    expect(() => parsePage(String(MAX_PAGE + 1))).toThrowError(AppError);
    try {
      parsePage("0");
    } catch (e) {
      expect((e as AppError).status).toBe(400);
      expect((e as AppError).code).toBe("bad_request");
    }
  });
});

describe("validateLikeId", () => {
  it("accepts ids in the allowed charset", () => {
    expect(validateLikeId("12345")).toBe("12345");
    expect(validateLikeId("abc_DE-9")).toBe("abc_DE-9");
    expect(validateLikeId("a".repeat(64))).toBe("a".repeat(64));
  });

  it.each([
    "", // empty
    "a".repeat(65), // too long
    "a b", // space
    "1;DROP TABLE likes", // sql-ish junk
    "../etc", // path-ish
    "%20", // decodes to a space -> invalid
    "emoji😀",
  ])("rejects invalid id: %s", (raw) => {
    expect(() => validateLikeId(raw)).toThrowError(AppError);
  });

  it.each(["%", "%zz", "%E0%A4%A"])(
    "maps malformed percent-encoding to a 400 (not a raw URIError): %s",
    (raw) => {
      try {
        validateLikeId(raw);
        throw new Error("expected validateLikeId to throw");
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).status).toBe(400);
        expect((e as AppError).code).toBe("bad_request");
      }
    },
  );

  it("rejects non-string input", () => {
    // @ts-expect-error testing runtime guard
    expect(() => validateLikeId(123)).toThrowError(AppError);
  });
});

describe("validateFeedImage", () => {
  it("accepts a well-formed image on an allowed host", () => {
    const out = validateFeedImage("5", validImage);
    expect(out).toMatchObject({ id: "5", author: "Ada", alt: "a tower" });
    expect(out.srcUrl).toBe(validImage.srcUrl);
  });

  it("rejects an id that doesn't match the route param", () => {
    expect(() => validateFeedImage("9", validImage)).toThrowError(AppError);
  });

  it.each([
    ["http (not https)", { ...validImage, srcUrl: "http://images.pexels.com/x.jpg" }],
    ["disallowed host", { ...validImage, srcUrl: "https://evil.example.com/x.jpg" }],
    ["missing srcUrl", { ...validImage, srcUrl: undefined }],
    ["bad thumb host", { ...validImage, thumbUrl: "https://tracker.com/t.gif" }],
  ])("rejects %s", (_label, bad) => {
    expect(() => validateFeedImage("5", bad)).toThrowError(AppError);
  });

  it("rejects a non-object", () => {
    expect(() => validateFeedImage("5", null)).toThrowError(AppError);
    expect(() => validateFeedImage("5", "nope")).toThrowError(AppError);
  });

  it("falls back author/alt and clamps absurd dimensions", () => {
    expect(() => validateFeedImage("5", { ...validImage, width: 9e9 })).toThrowError(
      AppError,
    );
    const out = validateFeedImage("5", { ...validImage, author: "", alt: "  " });
    expect(out.author).toBe("Unknown");
    expect(out.alt).toBe("photo");
  });
});
