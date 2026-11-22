const test = require('node:test');
const assert = require('node:assert/strict');
const page = require('./fixtures/likes-page.json');
const end = require('./fixtures/likes-end.json');
const { opKind, requestVariables, parseTimeline, toCsv } = require('../x-export.user.js');

test('opKind matches only the Likes and Bookmarks timelines', () => {
  assert.equal(opKind('https://x.com/i/api/graphql/abc/Likes?variables=%7B%7D'), 'likes');
  assert.equal(opKind('https://x.com/i/api/graphql/abc/Bookmarks?variables=%7B%7D'), 'bookmarks');
  assert.equal(opKind('https://x.com/i/api/graphql/abc/BookmarkFoldersSlice?variables=%7B%7D'), null);
  assert.equal(opKind('https://x.com/i/api/graphql/abc/UserByScreenName'), null);
});

test('requestVariables reads the cursor from the request URL', () => {
  const url = `https://x.com/i/api/graphql/abc/Likes?variables=${encodeURIComponent('{"userId":"1","cursor":"C"}')}`;
  assert.deepEqual(requestVariables(url), { userId: '1', cursor: 'C' });
});

test('parseTimeline returns every entry and the bottom cursor', () => {
  const { tweets, bottomCursor } = parseTimeline(page);
  assert.deepEqual(tweets.map((t) => t.tweet.id), ['2123353533831672236', '2123469815708885372', '2122726005219737649', '1', '999']);
  assert.match(bottomCursor, /^DAAH/);
});

test('an end page has no posts but still a cursor', () => {
  const { tweets, bottomCursor } = parseTimeline(end);
  assert.equal(tweets.length, 0);
  assert.ok(bottomCursor);
});

test('video keeps the highest bitrate mp4', () => {
  const [video] = parseTimeline(page).tweets.map((t) => t.tweet);
  assert.equal(video.media[0].type, 'video');
  assert.match(video.media[0].url, /720x1280.*\.mp4/);
  assert.doesNotMatch(video.text, /t\.co/);
});

test('quoted post is nested one level', () => {
  const quote = parseTimeline(page).tweets[1].tweet;
  assert.equal(quote.quoted.id, '2123352318913438201');
  assert.equal(quote.quoted.quoted, null);
});

test('long post uses the note text, not the truncated legacy text', () => {
  const t = parseTimeline(page).tweets[2].tweet;
  const raw = page.data.user.result.timeline.timeline.instructions
    .find((i) => i.type === 'TimelineAddEntries').entries[2].content.itemContent.tweet_results.result;
  assert.ok(t.text.length > raw.legacy.full_text.length);
});

test('visibility wrapper is unwrapped and tombstones keep id and url', () => {
  const tweets = parseTimeline(page).tweets.map((t) => t.tweet);
  assert.equal(tweets[3].author.screen_name, 'beffjezos');
  assert.deepEqual(tweets[4], {
    unavailable: true,
    reason: 'This Post was deleted.',
    id: '999',
    url: 'https://x.com/i/web/status/999',
  });
});

test('CSV quotes multi-line text and has one header plus one row per post', () => {
  const csv = toCsv(parseTimeline(page).tweets.map((t) => t.tweet));
  assert.ok(csv.startsWith('﻿position,id,url'));
  const t = parseTimeline(page).tweets[2].tweet;
  assert.ok(csv.includes(`"${t.text.replace(/"/g, '""')}"`));
  assert.match(csv, /This Post was deleted\.\r\n$/);
});
