import assert from "node:assert/strict";
import { test } from "node:test";
import { matchVacancy, matchesTerm } from "../src/filter.js";
import { parseChannelHtml } from "../src/sources/telegramChannel.js";
import { parseFeed } from "../src/sources/rss.js";
import { stripHtml } from "../src/util.js";
import type { FilterConfig, Vacancy } from "../src/types.js";

const filters: FilterConfig = {
  includeTitle: ["full stack", "full-stack", "frontend", "front end", "react", "node.js"],
  excludeTitle: ["senior", "lead", "java", "php", "react native"],
  excludeText: [],
  locations: ["remote", "віддалено", "київ"],
  maxAgeHours: 72,
};

const now = new Date("2026-11-05T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

const vac = (over: Partial<Vacancy>): Vacancy => ({
  id: "1",
  title: "Frontend Developer (React)",
  url: "https://example.com/1",
  text: "Remote, full time",
  publishedAt: hoursAgo(2),
  source: "test",
  ...over,
});

test("matchesTerm: цілі слова, java не збігається з JavaScript", () => {
  assert.equal(matchesTerm("JavaScript Developer", "java"), false);
  assert.equal(matchesTerm("Java Developer", "java"), true);
  assert.equal(matchesTerm("Node.js Engineer", "node.js"), true);
  assert.equal(matchesTerm("Full-Stack Engineer", "full-stack"), true);
  assert.equal(matchesTerm("Старший React розробник", "react"), true);
});

test("підходяща вакансія проходить", () => {
  assert.equal(matchVacancy(vac({}), filters, { requireLocation: true }, now).ok, true);
});

test("Senior відсікається за назвою", () => {
  const r = matchVacancy(vac({ title: "Senior Frontend Developer" }), filters, { requireLocation: true }, now);
  assert.equal(r.ok, false);
});

test("React Native відсікається, але React проходить", () => {
  assert.equal(matchVacancy(vac({ title: "React Native Developer" }), filters, { requireLocation: true }, now).ok, false);
  assert.equal(matchVacancy(vac({ title: "React Developer" }), filters, { requireLocation: true }, now).ok, true);
});

test("JavaScript-вакансія не відсікається словом java", () => {
  const r = matchVacancy(vac({ title: "Full Stack JavaScript Developer" }), filters, { requireLocation: true }, now);
  assert.equal(r.ok, true);
});

test("невідповідна назва відсікається", () => {
  assert.equal(matchVacancy(vac({ title: "Sales Manager" }), filters, { requireLocation: true }, now).ok, false);
});

test("локація: потрібна, якщо requireLocation", () => {
  const onsite = vac({ text: "Office in Lviv" });
  assert.equal(matchVacancy(onsite, filters, { requireLocation: true }, now).ok, false);
  assert.equal(matchVacancy(onsite, filters, { requireLocation: false }, now).ok, true);
  assert.equal(matchVacancy(vac({ text: "Офіс у Києві, Київ" }), filters, { requireLocation: true }, now).ok, true);
});

test("надто стара вакансія відсікається", () => {
  assert.equal(matchVacancy(vac({ publishedAt: hoursAgo(100) }), filters, { requireLocation: true }, now).ok, false);
  assert.equal(matchVacancy(vac({ publishedAt: undefined }), filters, { requireLocation: true }, now).ok, true);
});

test("parseFeed: стрічка з тисячами екранованих сутностей не падає", () => {
  const description = "&lt;p&gt;Remote &amp;amp; flexible&lt;/p&gt;".repeat(100);
  const item = (i: number) =>
    `<item><title>Dev ${i}</title><link>https://jobs.example.com/v/${i}/</link><description>${description}</description></item>`;
  const xml = `<rss version="2.0"><channel>${Array.from({ length: 100 }, (_, i) => item(i)).join("")}</channel></rss>`;
  assert.equal(parseFeed(xml, "s").length, 100);
});

test("parseFeed: RSS 2.0", () => {
  const xml = `<?xml version="1.0"?>
  <rss version="2.0"><channel><title>x</title>
    <item>
      <title>Front End Developer в Acme</title>
      <link>https://jobs.example.com/v/1/</link>
      <guid>https://jobs.example.com/v/1/</guid>
      <pubDate>Thu, 05 Nov 2026 10:00:00 +0200</pubDate>
      <description>&lt;p&gt;Remote &amp;amp; flexible&lt;/p&gt;</description>
    </item>
    <item>
      <title>Node.js Developer</title>
      <link>https://jobs.example.com/v/2/</link>
    </item>
  </channel></rss>`;
  const items = parseFeed(xml, "s");
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Front End Developer в Acme");
  assert.equal(items[0].url, "https://jobs.example.com/v/1/");
  assert.ok(items[0].publishedAt instanceof Date);
  assert.match(items[0].text, /Remote/);
  assert.equal(items[1].id, "https://jobs.example.com/v/2/");
});

test("parseFeed: Atom і один елемент", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry><id>abc</id><title>React Dev</title>
      <link href="https://x.example/abc"/><updated>2026-11-05T09:00:00Z</updated>
      <summary>Remote</summary></entry></feed>`;
  const items = parseFeed(xml, "s");
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://x.example/abc");
  assert.equal(items[0].id, "abc");
});

test("parseFeed: порожній або невалідний фід не падає", () => {
  assert.deepEqual(parseFeed("<rss><channel></channel></rss>", "s"), []);
});

test("parseChannelHtml: пост із зовнішнім посиланням", () => {
  const html = `
  <div class="tgme_widget_message_wrap js-widget_message_wrap">
    <div class="tgme_widget_message" data-post="jobs_channel/42">
      <div class="tgme_widget_message_text js-message_text" dir="auto">🔥 Full Stack Developer<br/>Remote, <a href="https://apply.example.com/x?a=1&amp;b=2">apply</a></div>
      <a class="tgme_widget_message_date"><time datetime="2026-11-05T08:00:00+00:00"></time></a>
    </div>
  </div>`;
  const items = parseChannelHtml(html, "ch");
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "jobs_channel/42");
  assert.match(items[0].title, /Full Stack Developer/);
  assert.equal(items[0].url, "https://apply.example.com/x?a=1&b=2");
});

test("stripHtml прибирає теги й декодує сутності", () => {
  assert.equal(stripHtml("<p>A &amp; B</p><br>C"), "A & B\nC");
});
