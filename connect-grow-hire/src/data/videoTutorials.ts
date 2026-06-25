/**
 * Video tutorial data for the Documentation page.
 * Each entry gets videoId and thumbnailUrl derived from youtubeUrl.
 */

function extractVideoId(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&/]+)/);
  return match?.[1] ?? "";
}

export interface VideoTutorial {
  title: string;
  description: string;
  youtubeUrl: string;
  videoId: string;
  thumbnailUrl: string;
}

function toVideoTutorial(raw: { title: string; description: string; youtubeUrl: string }): VideoTutorial {
  const videoId = extractVideoId(raw.youtubeUrl);
  return {
    ...raw,
    videoId,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}

const featuresRaw = [
  {
    title: "Find People — Search, import, and email contacts",
    description: "Paste a LinkedIn URL, import a spreadsheet, or search by role, company, and location. Instantly find emails, draft personalized outreach, and save contacts to your networking tracker.",
    youtubeUrl: "https://youtu.be/OTd5LOOpgvQ",
  },
  {
    title: "Find Companies — Discover firms tailored to you",
    description: "Describe the type of companies you're looking for and get a tailored list with key details, open roles, and the right people to reach out to — organized in a spreadsheet.",
    youtubeUrl: "https://youtu.be/n_AYHEJSXrE",
  },
  {
    title: "Find Hiring Manager — Email the decision-maker",
    description: "Paste a job posting URL and instantly find the hiring manager for that position, get their verified email, and have a personalized outreach email drafted in your Gmail.",
    youtubeUrl: "https://youtu.be/TIERqtjc1tk",
  },
  {
    title: "Coffee Chat Prep — Walk into every call prepared",
    description: "Paste a LinkedIn URL and get a prep sheet with background info on the person, recent news about their company's division, and recommended questions to ask.",
    youtubeUrl: "https://youtu.be/D1--4aVisho",
  },
  {
    title: "Resume — Tailor your resume for any role",
    description: "Upload your resume and a job posting URL. Get ATS-optimized suggestions that tailor your experience to the specific position you're applying for.",
    youtubeUrl: "https://youtu.be/UJSlHiBRSyY",
  },
  {
    title: "Cover Letter — Generate a tailored cover letter in one click",
    description: "Paste a job posting URL and instantly generate a personalized cover letter based on your resume and the role. Download it as a PDF, ready to submit.",
    youtubeUrl: "https://youtu.be/VlHvxH44HCU",
  },
];

const chromeExtensionRaw = [
  {
    title: "Coffee Chat Prep — Prepare for any call in one click",
    description: "On a LinkedIn profile, click Coffee Chat Prep to instantly get a PDF with the contact's work history, recent projects, company news, and recommended questions to ask.",
    youtubeUrl: "https://youtu.be/3gZFhA8reRs",
  },
  {
    title: "Cover Letter — Write a cover letter in one click",
    description: "On any job posting, click Generate Cover Letter to instantly create a personalized, ATS-friendly cover letter based on your resume and the job description.",
    youtubeUrl: "https://youtu.be/cZ_bR-nCd6w",
  },
  {
    title: "Find Hiring Manager — Email the decision-maker from any job posting",
    description: "On a job posting on LinkedIn, Glassdoor, or anywhere else, click Find and Email Hiring Manager to find who's hiring, get their email, draft outreach, and save their info to a spreadsheet.",
    youtubeUrl: "https://youtu.be/FY6YDWdxIAI",
  },
  {
    title: "Find People — Instantly email anyone from their LinkedIn",
    description: "On someone's LinkedIn profile, click Find and Send Email to instantly find their email, draft a personalized message in your Gmail, and save their info to your inbox.",
    youtubeUrl: "https://youtu.be/TpXA4x8Cq0I",
  },
];

export const videoTutorials: VideoTutorial[] = featuresRaw.map(toVideoTutorial);
export const chromeExtensionVideos: VideoTutorial[] = chromeExtensionRaw.map(toVideoTutorial);
