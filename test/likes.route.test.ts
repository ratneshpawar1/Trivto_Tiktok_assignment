import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";

// Use an ephemeral DB so the route's singleton store doesn't touch the real
// data/ file. Must be set before the route modules first call likesStore().
beforeAll(() => {
  process.env.LIKES_DB_PATH = ":memory:";
});

const image = {
  id: "5",
  width: 1080,
  height: 1920,
  srcUrl: "https://images.pexels.com/5.jpg",
  thumbUrl: "https://images.pexels.com/5-t.jpg",
  author: "Ada",
  alt: "a tower",
};

async function imports() {
  const likesGet = (await import("../app/api/likes/route")).GET;
  const toggle = (await import("../app/api/likes/[id]/route")).POST;
  return { likesGet, toggle };
}

function postReq(id: string, body?: unknown) {
  return new Request(`http://localhost/api/likes/${id}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("likes routes", () => {
  it("likes with image, returns it from ?full=1, then unlikes", async () => {
    const { likesGet, toggle } = await imports();

    // like
    const liked = await toggle(postReq("5", { image }), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(liked.status).toBe(200);
    expect(await liked.json()).toEqual({ id: "5", liked: true });

    // ids
    const ids = await likesGet(new NextRequest("http://localhost/api/likes"));
    expect((await ids.json()).likedIds).toContain("5");

    // full -> includes the stored image
    const full = await likesGet(
      new NextRequest("http://localhost/api/likes?full=1"),
    );
    const fullBody = await full.json();
    expect(fullBody.items).toHaveLength(1);
    expect(fullBody.items[0]).toMatchObject({ id: "5", author: "Ada" });

    // unlike
    const unliked = await toggle(postReq("5"), {
      params: Promise.resolve({ id: "5" }),
    });
    expect(await unliked.json()).toEqual({ id: "5", liked: false });

    const after = await likesGet(
      new NextRequest("http://localhost/api/likes?full=1"),
    );
    expect((await after.json()).items).toHaveLength(0);
  });

  it("rejects a like whose image is on a disallowed host with 400", async () => {
    const { toggle } = await imports();
    const res = await toggle(
      postReq("9", { image: { ...image, id: "9", srcUrl: "https://evil.com/x.jpg" } }),
      { params: Promise.resolve({ id: "9" }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_request");
  });

  it("rejects liking a new photo with no image (would be un-renderable) with 400", async () => {
    const { toggle } = await imports();
    const res = await toggle(postReq("123"), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_request");
  });
});
