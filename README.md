# X Likes, Bookmarks & Posts Exporter

A userscript that exports your X likes, bookmarks and posts to JSON and CSV.
X has no API access for these lists, so the script reads the timeline data the page itself loads while it scrolls.

## Install

Works in Violentmonkey (tested, Firefox 160) and Tampermonkey.

```sh
cd x-unwrapped && python3 -m http.server 8765
```

Open http://localhost:8765/x-export.user.js in the browser and press Install.
You can stop the server after that.

## Use

1. Open X and go to History (`/i/history` for Bookmarks, `/i/history/likes` for Likes) or to your own profile's Replies tab (`/<you>/with_replies`) for Posts. The panel at the bottom right has links to all three.
2. Press Start. The script scrolls to the end of the list and downloads `x-<kind>-<account>-<date>.json` when it gets there.
3. Press CSV for a spreadsheet copy, or JSON to download again at any time.

If X rate-limits the requests, the panel shows when it will resume, then it waits and presses Retry for you.
Keep the tab open until it finishes; captured posts live in memory only.

## Output

Each post has `id`, `url`, `created_at`, `author` (with `avatar`), `text` (full text of long posts, t.co links expanded), `lang`, `reply_to`, `metrics`, `media` (original-size photos, highest-bitrate mp4 for video and GIFs), `urls`, `quoted` (one level) and `retweet_of`.
The Posts export also holds the posts you replied to; keep those whose author is you.
Withheld or deleted posts appear as `{ id, url, unavailable: true, reason }`.
`complete` is true only when X returned its empty end page.

The like count on your profile is usually higher than the export.
That counter still includes likes on posts that were deleted or whose accounts are gone, which the Likes timeline no longer returns.

## How it works

The script runs in the page at `document-start` and wraps `XMLHttpRequest` and `fetch`.
It parses responses from the `Likes`, `Bookmarks`, `UserTweets` and `UserTweetsAndReplies` GraphQL operations and dedupes posts by id.
It does not call the API itself, because X signs each request with an `x-client-transaction-id` header.
It stops when X answers its last bottom cursor with an empty page, or after 45 seconds with no new posts.

## Tests

```sh
node --test test/parse.test.cjs
```

The fixtures are trimmed copies of real `Likes` responses.

## X Unwrapped

`unwrapped/` is a web app that turns the exports into a year-in-review story and a share card.
Everything runs in the browser; the files are never uploaded.

```sh
cd unwrapped && npm install && npm run dev
```

Drop the likes and bookmarks JSON files on the page.
The story covers the 12 months before the export date.
X does not record when you liked or saved a post, only the order, so each action is dated by the newest post below it in the list.
The clock slide shows when the posts you liked went live, not when you were online.

The share link puts the summary stats (counts, top accounts, topics, persona) in the URL fragment, which browsers do not send to the server.
No posts or files go in the link.
The last slide copies the link and saves a PNG card or an animated GIF.

`npm run build` writes a static site to `unwrapped/dist`, with the userscript copied next to it.
`npm test` runs the stats and link tests.
