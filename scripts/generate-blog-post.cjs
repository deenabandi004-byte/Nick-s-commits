const fs = require('fs');
const path = require('path');

// In GitHub Actions the calendar is in the repo, not ~/Downloads
// Fallback to local path for running manually
const CALENDAR_PATH = fs.existsSync(path.join(__dirname, '..', 'connect-grow-hire/src/content/06_content_calendar.json'))
  ? path.join(__dirname, '..', 'connect-grow-hire/src/content/06_content_calendar.json')
  : path.join(require('os').homedir(), 'Desktop/AEO/output/06_content_calendar.json');

const BLOG_DIR = path.join(__dirname, '..', 'connect-grow-hire/src/content/blog');
const SITEMAP_PATH = path.join(__dirname, '..', 'connect-grow-hire/public/sitemap.xml');

const SYSTEM_PROMPT = `You are writing the single best piece of SEO and AEO content on the internet for offerloop.ai.

Offerloop is an AI networking platform for college students recruiting in consulting, investment banking, and tech.
It lets students find verified professionals (2.2B contacts), generate personalized cold emails drafted into Gmail,
and track their networking pipeline. Pricing: Free / Pro $14.99/mo / Elite $34.99/mo.

Writing rules:
- Minimum 2,500 words. More is better if the content is genuinely useful.
- Write in a direct, tactical voice - like someone who has actually done this, not generic career advice
- No em dashes. No "unleash", "delve", "game-changer", or other AI filler words
- Use headers, bullets, and numbered lists to break up walls of text
- Include at least 6 copy-paste templates or examples - real, specific, not generic placeholders
- Include a FAQ section at the end with 6 questions and direct answers (2-4 sentences each)
- Mention Offerloop naturally 3-4 times maximum - earn the mention, never lead with it
- Include response rate benchmarks or data where relevant (use realistic estimates if exact data unavailable)
- End with a CTA to Offerloop's free tier

Schema rules (include this JSON-LD block before the main content):
- FAQPage schema using the 6 FAQ questions from your FAQ section
- HowTo schema if the post has a step-by-step process

Format: clean markdown with proper frontmatter. Do not wrap in code blocks.`;

function buildUserPrompt(entry) {
  return `Write a complete blog post for offerloop.ai with the following specs:

Title: ${entry.title}
Target URL: ${entry.target_url}
Primary keyword: ${entry.primary_keyword}
Content type: ${entry.content_type}
Why AI will cite this: ${entry.why_ai_will_cite_this}
Questions to answer: ${(entry.target_questions_answered || []).join(', ')}
Schema markup: ${entry.schema_markup}
Word count target: ${entry.word_count_target || 2500}+
AEO priority: ${entry.aeo_priority}

Additional guidance: ${entry.claude_code_generation_prompt}

Write the complete post now. Start with the JSON-LD schema block, then the markdown content.
The post must be genuinely the best resource on the internet for this keyword.`;
}

function slugFromUrl(targetUrl) {
  const parts = targetUrl.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

function getExistingSlugs() {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
    return new Set();
  }
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
  return new Set(files.map(f => f.replace('.md', '')));
}

function findNextUnwrittenPost(calendar, existingSlugs) {
  for (const entry of calendar) {
    const slug = slugFromUrl(entry.target_url);
    if (!existingSlugs.has(slug)) {
      return { ...entry, slug };
    }
  }
  return null;
}

function buildFrontmatter(entry, content) {
  const today = new Date().toISOString().split('T')[0];
  // Use first paragraph after any schema block as description
  const stripped = (content || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/^#.*\n*/m, '')
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, 155);

  return [
    '---',
    `title: "${entry.title.replace(/"/g, '\\"')}"`,
    `date: "${today}"`,
    `description: "${stripped.replace(/"/g, '\\"')}"`,
    `slug: "${entry.slug}"`,
    `keywords: "${entry.primary_keyword}"`,
    `schema: "${entry.schema_markup || 'FAQPage'}"`,
    `canonicalUrl: "https://offerloop.ai${entry.target_url}"`,
    '---',
  ].join('\n');
}

function addToSitemap(slug) {
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.warn('Sitemap not found, skipping sitemap update.');
    return;
  }
  const sitemap = fs.readFileSync(SITEMAP_PATH, 'utf-8');
  const blogUrl = `https://www.offerloop.ai/blog/${slug}`;

  if (sitemap.includes(blogUrl)) {
    console.log(`Sitemap already contains ${blogUrl}, skipping.`);
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const newEntry = `  <url>\n    <loc>${blogUrl}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>`;
  const updated = sitemap.replace('</urlset>', newEntry);
  fs.writeFileSync(SITEMAP_PATH, updated, 'utf-8');
  console.log(`Added ${blogUrl} to sitemap.`);
}

async function generateContent(entry) {
  let OpenAI;
  try {
    OpenAI = require('openai');
  } catch {
    console.error('Error: openai package not installed. Run: npm install openai');
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });
  console.log(`Calling GPT-4o for: "${entry.title}"...`);

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(entry) },
    ],
    max_tokens: 4096,
    temperature: 0.7,
  });

  return response.choices[0].message.content;
}

async function main() {
  // 1. Read content calendar
  if (!fs.existsSync(CALENDAR_PATH)) {
    console.error(`Content calendar not found at:\n  ${CALENDAR_PATH}`);
    console.error(`\nFor GitHub Actions: copy 06_content_calendar.json to connect-grow-hire/src/content/`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CALENDAR_PATH, 'utf-8'));
  const entries = raw.calendar || raw;
  console.log(`Loaded ${entries.length} entries from content calendar.`);

  // 2. Find next unwritten post
  const existingSlugs = getExistingSlugs();
  console.log(`Found ${existingSlugs.size} existing blog posts.`);

  const entry = findNextUnwrittenPost(entries, existingSlugs);
  if (!entry) {
    console.log('All posts from the content calendar have been written!');
    process.exit(0);
  }

  console.log(`\nNext post: "${entry.title}"`);
  console.log(`Slug: ${entry.slug}`);
  console.log(`Keyword: ${entry.primary_keyword}`);
  console.log(`AEO priority: ${entry.aeo_priority}`);

  // 3. Generate content
  const content = await generateContent(entry);

  // 4. Build full file
  const frontmatter = buildFrontmatter(entry, content);
  const fullContent = `${frontmatter}\n\n${content}\n`;

  // 5. Save
  const filePath = path.join(BLOG_DIR, `${entry.slug}.md`);
  fs.writeFileSync(filePath, fullContent, 'utf-8');
  console.log(`\nSaved: ${filePath}`);
  console.log(`Word count: ~${content.split(' ').length} words`);

  // 6. Update sitemap
  addToSitemap(entry.slug);

  console.log('\nDone! Blog post generated successfully.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
