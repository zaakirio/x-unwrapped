# X Unwrapped

Your last 12 months on X or Threads as a Spotify Wrapped style story: top accounts, when you scroll, topics, your vault of saves, and a persona.
It ends with a share link, a PNG card and an animated GIF.
Everything runs in your own browser; nothing is uploaded anywhere.

## Get yours (no coding needed)

You need Chrome (or Edge, Brave or Arc) on a computer.

1. Download `x-unwrapped-extension.zip` from the [latest release](https://github.com/zaakirio/x-unwrapped/releases/latest) and unzip it.
2. Open `chrome://extensions`, turn on Developer mode (top right), press "Load unpacked" and pick the unzipped folder.
3. Pin the extension from the puzzle-piece menu and click it.
4. Press "Unwrap my X" (or "Unwrap my Threads"). Log in when the new tab asks you to.
5. Leave that tab open. It scrolls your likes, bookmarks and posts by itself, about a minute per list, then plays your story.

On the last slide, "Copy share link" gives a link to your story on [the website](https://zaakirio.github.io/x-unwrapped/).
The link holds only summary numbers, never your posts or your login.

You can also drop your official X data archive (Settings, Your account, Download an archive of your data) on the website instead of using the extension.
The archive has no bookmarks, so the story is shorter.

## Userscript exporter

The repo also holds the userscript the extension grew out of.
It exports your X likes, bookmarks and posts to JSON and CSV.
X has no API access for these lists, so the script reads the timeline data the page itself loads while it scrolls.

### Install

Works in Violentmonkey (tested, Firefox 160) and Tampermonkey.

```sh
cd x-unwrapped && python3 -m http.server 8765
```

Open http://localhost:8765/x-export.user.js in the browser and press Install.
You can stop the server after that.

### Use

1. Open X and go to History (`/i/history` for Bookmarks, `/i/history/likes` for Likes) or to your own profile's Replies tab (`/<you>/with_replies`) for Posts. The panel at the bottom right has links to all three.
2. Press Start. The script scrolls to the end of the list and downloads `x-<kind>-<account>-<date>.json` when it gets there.
3. Press CSV for a spreadsheet copy, or JSON to download again at any time.

If X rate-limits the requests, the panel shows when it will resume, then it waits and presses Retry for you.
Keep the tab open until it finishes; captured posts live in memory only.

### Output

Each post has `id`, `url`, `created_at`, `author` (with `avatar`), `text` (full text of long posts, t.co links expanded), `lang`, `reply_to`, `metrics`, `media` (original-size photos, highest-bitrate mp4 for video and GIFs), `urls`, `quoted` (one level) and `retweet_of`.
The Posts export also holds the posts you replied to; keep those whose author is you.
Withheld or deleted posts appear as `{ id, url, unavailable: true, reason }`.
`complete` is true only when X returned its empty end page.

The like count on your profile is usually higher than the export.
That counter still includes likes on posts that were deleted or whose accounts are gone, which the Likes timeline no longer returns.

### How it works

The script runs in the page at `document-start` and wraps `XMLHttpRequest` and `fetch`.
It parses responses from the `Likes`, `Bookmarks`, `UserTweets` and `UserTweetsAndReplies` GraphQL operations and dedupes posts by id.
It does not call the API itself, because X signs each request with an `x-client-transaction-id` header.
It stops when X answers its last bottom cursor with an empty page, or after 45 seconds with no new posts.

### Tests

```sh
node --test test/parse.test.cjs
```

The fixtures are trimmed copies of real `Likes` responses.

## Building X Unwrapped

`unwrapped/` turns your last 12 months on X into a story with a share link, a PNG card and an animated GIF.
Everything runs in the browser; nothing is uploaded.
There are three ways in.

1. The Chrome extension. Press "Unwrap my X" or "Unwrap my Threads" and it opens the site in a new tab, scrolls your likes, bookmarks (Saved on Threads) and posts back 12 months, then plays the story. It can also download the collected JSON.
2. Your official X archive (Settings, Your account, Download an archive of your data). Drop the zip on the page. It gives likes and your posts with exact dates, but no bookmarks and no authors for likes.
3. The JSON files from the userscript above.

```sh
cd unwrapped && npm install
npm run dev                # website
npm run build              # website to dist/
npm run build:extension    # extension to extension-dist/
npm test
```

To try the extension, open `chrome://extensions`, turn on Developer mode, press "Load unpacked" and pick `unwrapped/extension-dist`.
Set `VITE_SITE_URL` to the hosted site when you build the extension, so its share links point there.

X does not record when you liked or saved a post, only the order, so each action is dated by the newest post below it in the list.
The extension stops a list once 40 posts in a row are older than 12 months.
With enough of your own posts, the clock slide shows when you post; otherwise it shows when the posts you liked went live.

On Threads the extension reads Liked, Saved, and the Threads and Replies tabs of your profile, from the posts Threads already puts in the page and loads as it scrolls.
Threads serves profile pictures only to its own pages, so the extension fetches them itself for the story; share links leave them out and show gradient orbs instead.
Threads data archives are not supported yet.

The share link puts the summary stats (counts, top accounts with their profile picture URLs, topics, persona, your top post's text) in the URL fragment, which browsers do not send to the server.
