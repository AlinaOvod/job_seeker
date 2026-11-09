import assert from "node:assert/strict";
import { test } from "node:test";
import { detectAts } from "../src/detect.js";
import {
  atsUrl,
  mapAshby,
  mapBreezy,
  mapGreenhouse,
  mapLever,
  mapSmartRecruiters,
  mapWorkable,
} from "../src/sources/ats.js";
import { extractVacancies } from "../src/sources/emailParse.js";

test("Greenhouse: поля відповідають документованому формату", () => {
  const items = mapGreenhouse(
    {
      jobs: [
        {
          id: 101,
          title: " Frontend Engineer ",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/101",
          location: { name: "Kyiv, Ukraine" },
          updated_at: "2026-11-09T08:00:00-05:00",
        },
        { id: 102, title: "Без посилання" },
      ],
    },
    "Acme",
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Frontend Engineer");
  assert.equal(items[0].details, "Kyiv, Ukraine");
  assert.match(items[0].text, /Kyiv/);
  assert.ok(items[0].publishedAt instanceof Date);
});

test("Lever: createdAt у мілісекундах, workplaceType потрапляє в текст", () => {
  const items = mapLever(
    [
      {
        id: "abc",
        text: "Full Stack Engineer",
        hostedUrl: "https://jobs.lever.co/ajax/abc",
        createdAt: 1762680000000,
        workplaceType: "remote",
        categories: { location: "Kyiv", team: "Web", commitment: "Full-time" },
      },
    ],
    "Ajax",
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://jobs.lever.co/ajax/abc");
  assert.match(items[0].text, /remote/);
  assert.equal(items[0].details, "Kyiv · remote");
  assert.equal(items[0].publishedAt?.getTime(), 1762680000000);
});

test("Lever: не масив (помилка API) дає порожній результат", () => {
  assert.deepEqual(mapLever({ ok: false, error: "Document not found" }, "x"), []);
});

test("Ashby: ігнорує непублічні вакансії, isRemote додає Remote", () => {
  const items = mapAshby(
    {
      jobs: [
        { id: "1", title: "React Developer", jobUrl: "https://jobs.ashbyhq.com/a/1", location: "Ukraine", isRemote: true, publishedAt: "2026-11-08T10:00:00Z" },
        { id: "2", title: "Hidden", jobUrl: "https://jobs.ashbyhq.com/a/2", isListed: false },
      ],
    },
    "A",
  );
  assert.equal(items.length, 1);
  assert.match(items[0].text, /Remote/);
});

test("Workable і SmartRecruiters", () => {
  const w = mapWorkable(
    { jobs: [{ title: "Node.js Developer", shortcode: "ABC123", url: "https://apply.workable.com/co/j/ABC123/", city: "Kyiv", country: "Ukraine", telecommuting: false, published_on: "2026-11-07" }] },
    "Co",
  );
  assert.equal(w[0].details, "Kyiv, Ukraine");
  const s = mapSmartRecruiters(
    { content: [{ id: "743999", name: "Frontend Developer", releasedDate: "2026-11-08T07:00:00.000Z", location: { city: "Kyiv", country: "ua", remote: true } }] },
    "Co",
    "CompanyInc",
  );
  assert.equal(s[0].url, "https://jobs.smartrecruiters.com/CompanyInc/743999");
  assert.equal(s[0].details, "Kyiv, UA · Remote");
});

test("Breezy: назва без шаблонів, локація і Remote в тексті, детектор знаходить компанію", () => {
  const items = mapBreezy(
    [
      {
        id: "c3caf5f989a5",
        name: " Frontend Developer ",
        url: "https://acme.breezy.hr/p/c3caf5f989a5-frontend-developer",
        published_date: "2026-10-20T11:24:48.105Z",
        location: { name: "Ukraine", is_remote: true },
        department: "Web",
      },
      { id: "no-url", name: "Без посилання" },
    ],
    "Acme",
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Frontend Developer");
  assert.equal(items[0].details, "Ukraine · Remote");
  assert.match(items[0].text, /Remote/);
  assert.ok(items[0].publishedAt instanceof Date);
  assert.deepEqual(mapBreezy({ error: "x" }, "Acme"), []);
  assert.equal(atsUrl("breezy", "acme"), "https://acme.breezy.hr/json");
  assert.deepEqual(detectAts('<script src="https://acme.breezy.hr/embed/js"></script>'), [
    { system: "breezy", board: "acme", supported: true },
  ]);
});

test("atsUrl: адреси публічних API", () => {
  assert.equal(atsUrl("greenhouse", "acme"), "https://boards-api.greenhouse.io/v1/boards/acme/jobs");
  assert.equal(atsUrl("lever", "ajax"), "https://api.lever.co/v0/postings/ajax?mode=json");
  assert.equal(atsUrl("ashby", "a b"), "https://api.ashbyhq.com/posting-api/job-board/a%20b");
});

test("html-список: відносні посилання, id з кінця слага, числа всередині слага", () => {
  const pattern = "career\\.softserveinc\\.com/en-us/vacancies/[^\"?#/]*?-(\\d+)(?![\\w-])";
  const html = `
    <div class="card">
      <a href="/en-us/vacancies/junior-front-end-developer-91501"><h3>Junior Front-End Developer</h3>
        <span>Ukraine</span><span>Trainee</span></a>
      <a href="/en-us/vacancies/junior-front-end-developer-91501">Apply</a>
    </div>
    <div class="card">
      <a href="/en-us/vacancies/net-core-2-developer-91777?utm=x">.NET Core 2 Developer</a>
      <p>Poland</p>
    </div>
    <a href="/en-us/about">Про нас</a>`;
  const items = extractVacancies(
    html,
    { name: "SoftServe", fromContains: "", linkPattern: pattern },
    "SoftServe",
    new Date(),
    "https://career.softserveinc.com/en-us/vacancies",
  );
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "91501");
  assert.equal(items[0].url, "https://career.softserveinc.com/en-us/vacancies/junior-front-end-developer-91501");
  assert.match(items[0].title, /Junior Front-End Developer/);
  assert.equal(items[1].id, "91777"); // не «2» зі слага
  assert.equal(items[1].url, "https://career.softserveinc.com/en-us/vacancies/net-core-2-developer-91777");
});

test("detectAts: знаходить Lever, Greenhouse і розпізнає непідтримувані системи", () => {
  const lever = detectAts('<a href="https://jobs.lever.co/ajax">Open roles</a>');
  assert.deepEqual(lever, [{ system: "lever", board: "ajax", supported: true }]);

  const gh = detectAts(
    '<script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script><iframe src="https://boards.greenhouse.io/embed/job_board?for=acme"></iframe>',
  );
  assert.equal(gh.length, 1);
  assert.equal(gh[0].board, "acme");

  const wd = detectAts('<a href="https://epam.wd3.myworkdayjobs.com/en-US/x">Jobs</a>');
  assert.equal(wd[0].system, "workday");
  assert.equal(wd[0].supported, false);

  assert.deepEqual(detectAts("<html>нічого</html>"), []);
});
