const YEAR = new Date().getFullYear();

const CUSTOM_OVERRIDES: Record<string, { title: string; description: string }> = {
  'pwc-vs-kpmg': {
    title: `PwC vs KPMG: Recruiting, Target Schools & Which to Choose (${YEAR})`,
    description: 'Comparing PwC and KPMG for consulting recruiting? See target schools, internship timelines, culture differences, and which firm is easier to break into.',
  },
  'vista-vs-thoma-bravo': {
    title: `Vista Equity vs Thoma Bravo: PE Recruiting & Culture Compared (${YEAR})`,
    description: 'Which software-focused PE firm is right for you? Compare Vista and Thoma Bravo on recruiting difficulty, target schools, and career trajectory.',
  },
  'mckinsey-vs-deloitte': {
    title: `McKinsey vs Deloitte: Consulting Recruiting Compared (${YEAR})`,
    description: 'MBB vs Big 4 - which is right for your background? Compare McKinsey and Deloitte on recruiting difficulty, target schools, salaries, and exit opportunities.',
  },
  'mckinsey-vs-oliver-wyman': {
    title: `McKinsey vs Oliver Wyman: Which Consulting Firm to Target? (${YEAR})`,
    description: 'Comparing McKinsey and Oliver Wyman for consulting recruiting. See differences in target schools, interview process, specializations, and how to break in.',
  },
  'houlihan-lokey-vs-lincoln-international': {
    title: `Houlihan Lokey vs Lincoln International: IB Recruiting (${YEAR})`,
    description: 'Comparing two top middle market banks for investment banking recruiting. See deal flow, target schools, culture, and which is easier to break into as an undergrad.',
  },
  'anthropic-vs-openai': {
    title: `Anthropic vs OpenAI: Which Tech Company to Target for Recruiting? (${YEAR})`,
    description: 'Comparing Anthropic and OpenAI for tech careers. See hiring volume, target schools, internship programs, and how to cold email employees at both companies.',
  },
  'sequoia-vs-kleiner-perkins': {
    title: `Sequoia vs Kleiner Perkins: VC Recruiting & Breaking In (${YEAR})`,
    description: 'Comparing Sequoia and Kleiner Perkins for venture capital careers. See which firm hires more MBAs vs undergrads, target schools, and how to cold email partners.',
  },
  'sequoia-vs-greylock': {
    title: `Sequoia vs Greylock: VC Recruiting & Career Paths Compared (${YEAR})`,
    description: 'Which top VC firm should you target? Compare Sequoia and Greylock on hiring, background preferences, and how students break into venture capital roles.',
  },
  'cloudflare-vs-palo-alto-networks': {
    title: `Cloudflare vs Palo Alto Networks: Tech Recruiting Compared (${YEAR})`,
    description: 'Comparing Cloudflare and Palo Alto Networks for engineering and business recruiting. See culture, compensation, target schools, and how to land an interview.',
  },
  'goldman-sachs-vs-jpmorgan': {
    title: `Goldman Sachs vs JPMorgan: IB Recruiting, Culture & Which to Choose (${YEAR})`,
    description: 'The two most targeted banks in investment banking recruiting - compared side by side. Target schools, interview format, culture, and which is harder to break into.',
  },
  'evercore-vs-lazard': {
    title: `Evercore vs Lazard: Elite Boutique IB Recruiting Compared (${YEAR})`,
    description: 'Comparing two top elite boutiques for investment banking. See which is harder to break into, target schools, deal types, and cold email tips for each firm.',
  },
  'apollo-vs-carlyle': {
    title: `Apollo vs Carlyle: PE Recruiting, Culture & Target Schools (${YEAR})`,
    description: 'Two of the biggest names in private equity - compared for recruiting. See on-cycle vs off-cycle timelines, target schools, and how to break into both firms.',
  },
};

const BLOG_OVERRIDES: Record<string, { title: string; description: string }> = {
  'how-to-find-professional-email-address': {
    title: `How to Find Professional Email Addresses Ethically (Free Methods, ${YEAR})`,
    description: 'The exact methods students use to ethically find verified emails for cold outreach to bankers, consultants, and PE professionals - no paid tools required.',
  },
  'cold-email-mckinsey-consultant': {
    title: `How to Cold Email a McKinsey Consultant (Template That Works, ${YEAR})`,
    description: 'The exact cold email framework that gets responses from McKinsey consultants. Includes subject line, opening line, and what to ask for.',
  },
};

export function generateMeta(
  routeType: string,
  data: Record<string, string>
): { title: string; description: string } {
  const slug = data.slug || '';

  if (routeType === 'compare' && CUSTOM_OVERRIDES[slug]) {
    return CUSTOM_OVERRIDES[slug];
  }

  if (routeType === 'blog' && BLOG_OVERRIDES[slug]) {
    return BLOG_OVERRIDES[slug];
  }

  switch (routeType) {
    case 'compare':
      return {
        title: `${data.companyA || ''} vs ${data.companyB || ''}: Recruiting, Target Schools & Culture (${YEAR})`,
        description: `See which firm fits your background - target schools, internship timelines, and who actually gets hired at ${data.companyA || ''} vs ${data.companyB || ''}.`,
      };
    case 'meeting':
      return {
        title: `How to Get a Meeting at ${data.company || ''} - Email Templates & Tips`,
        description: `Copy-paste cold email scripts that actually get responses from ${data.company || ''} employees. Used by students at target schools.`,
      };
    case 'cold-email':
      return {
        title: `Cold Email Templates for ${data.industry || ''} Jobs - ${YEAR}`,
        description: `Tested cold email templates for breaking into ${data.industry || ''}. Copy-paste ready for students with no prior connections.`,
      };
    case 'networking':
      return {
        title: `${data.company || ''} Networking Guide for Students (${YEAR})`,
        description: `How to build a connection at ${data.company || ''} before you apply - alumni paths, warm intro scripts, and timing.`,
      };
    case 'alumni':
      return {
        title: `${data.university || ''} Alumni Network Guide - Who to Reach & How`,
        description: `Find ${data.university || ''} alumni at top firms and learn exactly how to reach out. Built for students looking to break in.`,
      };
    case 'blog': {
      const title = data.title || 'Offerloop';
      return {
        title: title.includes('Offerloop') ? title : `${title} | Offerloop`,
        description: data.description ?? '',
      };
    }
    default:
      return {
        title: data.title || 'Offerloop',
        description: data.description || 'AI-powered career networking for college students.',
      };
  }
}
