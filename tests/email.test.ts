import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupeKey, normalizeUrl } from "../src/dedupe.js";
import { matchVacancy } from "../src/filter.js";
import { extractVacancies } from "../src/sources/emailParse.js";
import type { EmailRule, FilterConfig, SourceConfig, Vacancy } from "../src/types.js";

const received = new Date("2026-11-05T07:00:00Z");

const linkedin: EmailRule = {
  name: "LinkedIn",
  fromContains: "linkedin.com",
  linkPattern: "linkedin\\.com/(?:comm/)?jobs/view/(\\d+)",
  urlTemplate: "https://www.linkedin.com/jobs/view/{id}/",
};

const djinni: EmailRule = {
  name: "Djinni",
  fromContains: "djinni.co",
  linkPattern: "djinni\\.co/jobs/(\\d+)-",
};

const workua: EmailRule = {
  name: "Work.ua",
  fromContains: "work.ua",
  linkPattern: "work\\.ua/(?:[a-z]{2}/)?jobs/(\\d+)",
  urlTemplate: "https://www.work.ua/jobs/{id}/",
};

// Синтетичний лист у стилі LinkedIn: картинка-посилання, назва, рядок «компанія · місто», кнопка
const linkedinHtml = `
<table>
  <tr><td>
    <a href="https://www.linkedin.com/comm/jobs/view/4001?trackingId=abc&amp;refId=1"><img src="logo.png"></a>
    <a href="https://www.linkedin.com/comm/jobs/view/4001?trackingId=abc&amp;refId=1">Junior Full Stack Developer</a>
    <p>Acme Software · Kyiv, Ukraine</p>
    <p>Hybrid</p>
    <a href="https://www.linkedin.com/comm/jobs/view/4001?trackingId=abc&amp;refId=2">View job</a>
  </td></tr>
  <tr><td>
    <a href="https://www.linkedin.com/comm/jobs/view/4002?trackingId=def">React Developer</a>
    <p>Globex · Remote</p>
    <a href="https://www.linkedin.com/comm/jobs/view/4002?trackingId=def&amp;x=2">View job</a>
  </td></tr>
  <tr><td>
    <a href="https://www.linkedin.com/comm/jobs/view/4003?trackingId=ghi">View job</a>
  </td></tr>
  <tr><td><a href="https://www.linkedin.com/feed/">Відкрити LinkedIn</a></td></tr>
</table>`;

test("LinkedIn: групує посилання за id, бере назву, контекст і канонічний url", () => {
  const items = extractVacancies(linkedinHtml, linkedin, "Пошта · LinkedIn", received);
  assert.equal(items.length, 2); // 4003 має лише кнопку без назви, пропускаємо
  assert.deepEqual(
    items.map((i) => i.id),
    ["4001", "4002"],
  );
  assert.equal(items[0].title, "Junior Full Stack Developer");
  assert.equal(items[0].url, "https://www.linkedin.com/jobs/view/4001/");
  assert.equal(items[0].details, "Acme Software · Kyiv, Ukraine");
  assert.match(items[0].text, /Hybrid/);
  assert.equal(items[1].title, "React Developer");
  assert.equal(items[1].details, "Globex · Remote");
  assert.equal(items[1].publishedAt?.toISOString(), received.toISOString());
});

test("кнопки «View job» ніколи не стають назвою", () => {
  const html = `<a href="https://www.linkedin.com/jobs/view/9/">View job</a>
                <a href="https://www.linkedin.com/jobs/view/9/">Переглянути вакансію</a>`;
  assert.deepEqual(extractVacancies(html, linkedin, "s", received), []);
});

test("Djinni: розпаковує трекінг-редірект і чистить параметри", () => {
  const html = `<a href="https://click.djinni.co/track?u=https%3A%2F%2Fdjinni.co%2Fjobs%2F857101-back-end-engineer%2F%3Futm_source%3Demail&amp;s=1">Back-end Engineer (Node.js)</a>
                <div>Remote · Worldwide</div>`;
  const items = extractVacancies(html, djinni, "s", received);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "857101");
  assert.equal(items[0].url, "https://djinni.co/jobs/857101-back-end-engineer/");
  assert.equal(items[0].details, "Remote · Worldwide");
});

test("Djinni: пряме посилання без редіректу", () => {
  const html = `<a href="https://djinni.co/jobs/123456-react-developer/?utm=x">React Developer</a>`;
  const items = extractVacancies(html, djinni, "s", received);
  assert.equal(items[0].url, "https://djinni.co/jobs/123456-react-developer/");
});

test("Work.ua: українська й англійська версії посилань дають один id", () => {
  const html = `<a href="https://www.work.ua/en/jobs/4763471/">Front-end developer</a>
                <a href="https://www.work.ua/jobs/4763471/?from=mail">Front-end developer</a>`;
  const items = extractVacancies(html, workua, "s", received);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://www.work.ua/jobs/4763471/");
});

test("лист без підходящих посилань дає порожній результат", () => {
  assert.deepEqual(extractVacancies("<p>Привіт!</p>", linkedin, "s", received), []);
  assert.deepEqual(extractVacancies("", linkedin, "s", received), []);
});

// --- дедуплікація ---

const rssSrc: SourceConfig = { type: "rss", name: "A" };
const rssSrc2: SourceConfig = { type: "rss", name: "B" };
const tgSrc: SourceConfig = { type: "telegram", name: "T" };
const v = (over: Partial<Vacancy>): Vacancy => ({
  id: "1",
  title: "t",
  url: "https://djinni.co/jobs/1-x/",
  text: "",
  source: "s",
  ...over,
});

test("normalizeUrl прибирає параметри, www, слеш і регістр", () => {
  assert.equal(
    normalizeUrl("https://www.Example.com/Jobs/1/?utm=a#top"),
    "https://example.com/jobs/1",
  );
});

test("dedupeKey: одна вакансія з двох стрічок має однаковий ключ", () => {
  const a = dedupeKey(rssSrc, v({ url: "https://jobs.dou.ua/companies/x/vacancies/5/" }));
  const b = dedupeKey(rssSrc2, v({ url: "https://jobs.dou.ua/companies/x/vacancies/5/?from=rss" }));
  assert.equal(a, b);
});

test("dedupeKey: Telegram-пости з однаковим посиланням різні", () => {
  const a = dedupeKey(tgSrc, v({ id: "ch/1", url: "https://apply.example.com/" }));
  const b = dedupeKey(tgSrc, v({ id: "ch/2", url: "https://apply.example.com/" }));
  assert.notEqual(a, b);
});

// --- Telegram-дайджест ---

const digestHtml = `
<div class="tgme_widget_message_wrap js-widget_message_wrap">
  <div class="tgme_widget_message" data-post="Job_IT_Junior/4254">
    <div class="tgme_widget_message_text js-message_text" dir="auto"><b>Тримайте актуальну добірку вакансій для джуніорів</b><br/><br/><i class="emoji"><b>▪️</b></i> <a href="https://jobs.dou.ua/companies/lumysoft/vacancies/241522/" target="_blank"><b>Intern / Junior Fullstack developer</b></a> в <a href="https://jobs.dou.ua/companies/lumysoft/">Lumysoft</a><br/>віддалено<br/><br/><i class="emoji"><b>▪️</b></i> <a href="https://djinni.co/jobs/582840-junior-react-native-developer/"><b>Junior React native developer</b></a> в <a href="https://djinni.co/jobs/company-pozhduma/">Pozhduma</a><br/>Україна  Product  Office/Remote<br/><br/><i class="emoji"><b>▪️</b></i> <a href="https://djinni.co/jobs/580464-no-code-low-code-developer/"><b>No-code Developer at IAMPM</b></a><br/>Віддалено<br/><br/>Більше вакансій у <a href="https://t.me/Job_IT_Junior">каналі</a></div>
    <a class="tgme_widget_message_date"><time datetime="2026-11-05T11:32:00+00:00"></time></a>
  </div>
</div>`;

test("Telegram-дайджест розбивається на окремі вакансії з прямими посиланнями", async () => {
  const { parseChannelHtml } = await import("../src/sources/telegramChannel.js");
  const items = parseChannelHtml(digestHtml, "Job_IT_Junior");
  assert.equal(items.length, 3);
  assert.equal(items[0].title, "Intern / Junior Fullstack developer");
  assert.equal(items[0].url, "https://jobs.dou.ua/companies/lumysoft/vacancies/241522/");
  assert.equal(items[0].details, "Lumysoft · віддалено");
  assert.equal(items[1].title, "Junior React native developer");
  assert.equal(items[1].details, "Pozhduma · Україна Product Office/Remote");
  assert.equal(items[2].title, "No-code Developer at IAMPM");
  assert.equal(items[2].details, "Віддалено");
  assert.ok(items.every((i) => i.canonicalUrl === true));
  // рядок «Більше вакансій у каналі» та посилання на t.me вакансіями не є
  assert.ok(items.every((i) => !i.url.includes("t.me")));
});

test("вакансія з дайджесту й з Djinni RSS мають однаковий ключ дедуплікації", () => {
  const tg: SourceConfig = { type: "telegram", name: "T" };
  const rss: SourceConfig = { type: "rss", name: "Djinni" };
  const url = "https://djinni.co/jobs/582840-junior-react-native-developer/";
  assert.equal(
    dedupeKey(tg, v({ id: "ch/1#2", url, canonicalUrl: true })),
    dedupeKey(rss, v({ url: url + "?utm=x" })),
  );
});

// --- режим excludesOnly ---

const filters: FilterConfig = {
  includeTitle: ["react", "full stack"],
  excludeTitle: ["senior", "java"],
  excludeText: [],
  locations: ["remote"],
  maxAgeHours: 72,
};

test("excludesOnly: пропускає назви поза includeTitle, але виключення діють", () => {
  const generic = v({ title: "Software Engineer", publishedAt: received });
  const now = new Date("2026-11-05T09:00:00Z");
  assert.equal(matchVacancy(generic, filters, {}, now).ok, false);
  assert.equal(matchVacancy(generic, filters, { excludesOnly: true }, now).ok, true);
  const senior = v({ title: "Senior Software Engineer", publishedAt: received });
  assert.equal(matchVacancy(senior, filters, { excludesOnly: true }, now).ok, false);
});
