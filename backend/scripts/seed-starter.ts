/**
 * The starter kit for a fresh copy of Upwork Pro (R66, guide/setup.html): what any company needs and nothing that belongs to one.
 *  - the tag categories, with the exact names the matching depends on, and the compliance one ticked;
 *  - the platform tags (Product type), whose names decide what a job and a project run on, with a description each;
 *  - "AI powered" at score 0 (a baseline tag that should never decide a match).
 * Then `npm run seed:starter` also loads the signals and the eight proposal types without any sample proposal, the writing
 * guide and the default settings. Insert if missing: it never changes what is already there.
 */
import 'dotenv/config';
import { exec, pool, query } from '../src/db';

const CATEGORIES: [string, number, boolean][] = [
  ['Project stage', 0, false], ['Product type', 1, false], ['AI capability', 2, false], ['Automation', 3, false], ['Workflow type', 4, false],
  ['Industry', 5, false], ['Compliance / sensitive data', 6, true], ['CRM and business tools', 7, false], ['AI models and platforms', 8, false], ['Tech stack', 9, false],
];
// [name, score, description]: the names are read by the matching to know what a job and a project run on (src/screening/matching.ts)
const PRODUCT_TYPES: [string, number, string][] = [
  ['Web app', 2, 'The client wants an application used in a web browser: logins, screens and data. Not a simple marketing website (see Website / landing page).'],
  ['SaaS platform', 2, 'A web product sold to many customers on subscription, with accounts, plans or multi tenancy. Not a tool for one company\'s own staff (see Internal tool).'],
  ['Mobile app', 2, 'An app for iPhone or Android phones or tablets, native or cross platform. Not a website that merely works on phones.'],
  ['Website / landing page', 2, 'A marketing or company website or a landing page, mostly content and forms. Not an application with accounts and data (see Web app).'],
  ['Admin dashboard', 2, 'An admin panel or dashboard: tables, filters, reports and settings for the people who run the business.'],
  ['Chrome extension', 2, 'A browser extension for Chrome or another browser.'],
  ['Desktop app', 2, 'An application installed on Windows, macOS or Linux computers.'],
  ['Marketplace', 2, 'A two sided platform where buyers and sellers, or clients and providers, meet and transact.'],
  ['Internal tool', 2, 'A tool used only by the client\'s own team, for example an operations app or a back office system.'],
  ['API / backend service', 2, 'Only a backend: an API, a service, an integration or a data pipeline, with no screens to build.'],
];

(async () => {
  const n = { categories: 0, tags: 0 };
  for (const [name, sort, compliance] of CATEGORIES)
    n.categories += (await exec('INSERT IGNORE INTO tag_categories (name, sort_order, is_compliance) VALUES (?,?,?)', [name, sort, compliance ? 1 : 0])).affectedRows;
  const cats = new Map((await query<any>('SELECT id, name FROM tag_categories')).map((r) => [r.name, r.id]));
  const tag = async (cat: string, name: string, weight: number, description: string, sort: number) =>
    (n.tags += (await exec('INSERT IGNORE INTO tags (category_id, name, weight, description, sort_order) VALUES (?,?,?,?,?)', [cats.get(cat), name, weight, description, sort])).affectedRows);
  for (const [i, [name, w, d]] of PRODUCT_TYPES.entries()) await tag('Product type', name, w, d, i);
  await tag('AI capability', 'AI powered', 0, 'Baseline tag: almost every AI job has it, so it carries no matching weight. Use the specific AI capability tags to say what the AI does.', 0);
  console.log(`starter: ${n.categories} categories and ${n.tags} tags added (the rest were already there)`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
