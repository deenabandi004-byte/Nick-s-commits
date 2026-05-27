/*
 * Public, anonymous resume review lead magnet at /tools/resume-review.
 *
 * This page is a thin wrapper: marketing nav + footer + SEO meta tags,
 * with the actual functionality delegated to <ResumeReviewWidget />. The
 * widget can be dropped into any other page (SEO landing pages, blog
 * posts, etc.) and will work identically, sending its leads through the
 * same /api/tools/resume-review backend.
 *
 * House style: no em dashes, no Sparkles icon.
 */
import { Helmet } from "react-helmet-async";
import { INK, PreviewNav, PreviewFooter } from "./seo-preview/_shared";
import { ResumeReviewWidget } from "../components/widgets/ResumeReviewWidget";

const ResumeReviewFree = () => (
  <div style={{ background: "#FAFAF7", minHeight: "100vh", color: INK }}>
    <Helmet>
      <title>Free Resume Review — Score your resume against any job in 30 seconds | Offerloop</title>
      <meta
        name="description"
        content="Free instant resume review. Upload your PDF, paste a job URL or paste the description, and see substantive line-by-line edits that get interviews. No account required."
      />
      <link rel="canonical" href="https://offerloop.ai/tools/resume-review" />
      <meta property="og:title" content="Free Resume Review by Offerloop" />
      <meta
        property="og:description"
        content="See your resume's ATS score and substantive line-by-line edits for any job. Free, no account required."
      />
    </Helmet>

    <PreviewNav />

    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 24px 80px" }}>
      <ResumeReviewWidget source="standalone-tools" />
    </main>

    <PreviewFooter />
  </div>
);

export default ResumeReviewFree;
