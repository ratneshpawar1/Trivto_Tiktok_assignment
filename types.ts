// The ONLY image shape the frontend knows about.
// Code against this DTO, never the raw Pexels/Picsum payload.
export interface FeedImage {
  id: string; // stable id from upstream
  width: number;
  height: number;
  srcUrl: string; // full-viewport image (portrait/large)
  thumbUrl: string; // tiny blur/placeholder
  author: string; // for attribution
  alt: string; // accessibility; falls back to author/"photo"
}

// Feed endpoint response
export interface FeedResponse {
  items: FeedImage[];
  nextPage: number | null; // null = no more pages
}

// Likes endpoint response
export interface LikesResponse {
  likedIds: string[];
}

// POST /api/likes/[id] response — the new state after toggling.
export interface LikeToggleResponse {
  id: string;
  liked: boolean;
}
