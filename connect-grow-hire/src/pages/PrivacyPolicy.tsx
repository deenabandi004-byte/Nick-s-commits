import { useNavigate, Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AppHeader } from "@/components/AppHeader";

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isExtensionPrivacy = location.pathname === '/extension-privacy';

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          
          <main className="bg-white min-h-screen">
            <div className="max-w-3xl mx-auto px-8 pt-10 pb-8">
              {/* Back button - neutral styling */}
              <button
                onClick={() => navigate('/find')}
                className="flex items-center gap-2 text-gray-600 text-sm mb-6 hover:scale-105 transition-transform"
              >
                <ArrowLeft className="h-4 w-4" />
                Find people
              </button>

              {/* Privacy Policy Tabs */}
              <div className="flex gap-4 mb-6 border-b border-[#E2E8F0]">
                <Link
                  to="/privacy"
                  className={`pb-3 px-1 text-sm font-medium transition-colors ${
                    !isExtensionPrivacy
                      ? 'text-[#0F172A] border-b-2 border-[#0F172A]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Platform Privacy Policy
                </Link>
                <Link
                  to="/extension-privacy"
                  className={`pb-3 px-1 text-sm font-medium transition-colors ${
                    isExtensionPrivacy
                      ? 'text-[#0F172A] border-b-2 border-[#0F172A]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Chrome Extension Privacy
                </Link>
              </div>

              {/* Page Title */}
              <h1 className="text-[28px] font-semibold text-[#0F172A] mb-2">
                Privacy Policy
              </h1>
              <p className="text-gray-500 text-sm mb-8">
                <strong>Last Updated:</strong> 09.24.25
              </p>

              {/* Content */}
              <div className="prose prose-gray max-w-none">
                <p className="text-gray-600">
                  Welcome to Offerloop.ai ("Offerloop.ai," "we," "us," or "our"). This Privacy Policy
                  explains how we collect, use, disclose, and protect your information when you use our
                  application and services (collectively, the "Services"). Please read this Privacy
                  Policy carefully. If you do not agree with the terms, please do not use the Services.
                </p>
                <p className="text-gray-600">
                  We may update this Privacy Policy at any time. If we do, we will update the "Last
                  Updated" date at the top of this page. We encourage you to review this Privacy Policy
                  periodically to remain informed.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">1. Information We Collect</h2>
                <p className="text-gray-600">We may collect information about you in the following ways, depending on how you use the Services:</p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">a. Personal Data You Provide to Us</h3>
                <p className="text-gray-600">
                  <strong>Account Information:</strong> When you register for an account, we collect your name, email
                  address, and authentication information from your chosen provider (e.g., Google ID or Microsoft ID,
                  via Firebase).
                </p>
                <p className="text-gray-600">
                  <strong>Profile Information:</strong> To enhance your networking and outreach experience, you may
                  provide details such as your university, class year, major, work experience, organizations,
                  extracurricular activities, personal interests, target job roles, target locations, and resumes. You
                  may also choose to sync your LinkedIn profile.
                </p>
                <p className="text-gray-600">
                  <strong>User-Generated Content:</strong> Email templates you create or customize, notes you take on
                  contacts, and any content you generate within our performance-tracking modules.
                </p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">b. Data Related to Your Use of the Services</h3>
                <p className="text-gray-600">
                  <strong>Contact and Professional Information:</strong> Information about professionals you connect
                  with through Offerloop.ai, including names, positions, companies, contact details, and any notes or
                  status updates you log. Some of this data may also be provided by trusted third-party data providers
                  such as People Data Labs (PDL) to help you discover relevant professionals and enrich connections.
                </p>
                <p className="text-gray-600">
                  <strong>Email Data (Content &amp; Metadata):</strong> If you connect your Gmail or Outlook account, we
                  process:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>Email drafts saved via Gmail API (when you use our service to prepare outreach emails).</li>
                  <li>
                    Draft, sent, and received email data (subjects, bodies, recipients, timestamps, thread IDs,
                    conversation IDs, Message-IDs) that you choose to manage through Offerloop.ai.
                  </li>
                </ul>
                <p className="text-gray-600">
                  <strong>Tracking Information:</strong> We may include tracking pixels and tracked links in emails to
                  measure open rates, clicks, IP addresses, approximate locations, devices, and timestamps of activity.
                </p>
                <p className="text-gray-600">
                  <strong>Performance Data:</strong> Outreach performance metrics, such as emails sent, open rates,
                  response rates, meeting conversions, template effectiveness, and connection growth.
                </p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">c. Information from Third-Party Services</h3>
                <p className="text-gray-600">
                  <strong>Authentication (Firebase with Google/Microsoft):</strong> When registering or logging in, we
                  receive your name, email, profile picture, and authentication token. Encrypted access/refresh tokens
                  are stored to connect to your email provider.
                </p>
                <p className="text-gray-600">
                  <strong>AI Services (OpenAI/ChatGPT):</strong> When using AI-powered personalization or explanations,
                  relevant data may be securely sent to AI providers to generate responses.
                </p>
                <p className="text-gray-600">
                  <strong>Payment Processors (Stripe):</strong> Stripe processes all payments. We only receive
                  subscription details and a Stripe Customer ID - not full payment card details.
                </p>
                <p className="text-gray-600">
                  <strong>Hosting Providers (Render, Firebase Hosting):</strong> Used for backend infrastructure and
                  secure data storage.
                </p>
                <p className="text-gray-600">
                  <strong>Analytics Tools:</strong> Used to monitor performance and improve our Services.
                </p>
                <p className="text-gray-600">
                  <strong>Data Partners:</strong> External data labs such as People Data Labs may provide professional
                  contact information to supplement your searches and improve connection opportunities.
                </p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">d. Technical &amp; Usage Data</h3>
                <p className="text-gray-600">
                  <strong>Device &amp; Connection Info:</strong> IP address, browser type, device type, OS, and related
                  metadata.
                </p>
                <p className="text-gray-600">
                  <strong>Usage Data:</strong> Features accessed, time spent, click paths, and other interactions within
                  the Services.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">2. How We Use Your Information</h2>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>Create and manage your account.</li>
                  <li>
                    Provide, operate, and maintain the Services (e.g., connecting to email providers, saving drafts in
                    Gmail, sending emails, managing contacts, generating analytics).
                  </li>
                  <li>Personalize emails and generate AI-powered content suggestions.</li>
                  <li>Process subscriptions and payments securely through Stripe.</li>
                  <li>Deliver analytics, dashboards, and outreach performance insights.</li>
                  <li>Communicate updates, support responses, and account notices.</li>
                  <li>Detect, investigate, and prevent fraud, misuse, or security issues.</li>
                  <li>Comply with legal obligations.</li>
                  <li>Ensure compliance with privacy and anti-spam laws such as GDPR, CCPA, and CAN-SPAM.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">3. Legal Bases for Processing (GDPR)</h2>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>
                    <strong>Consent:</strong> When you provide explicit consent (e.g., connecting your Google account).
                  </li>
                  <li>
                    <strong>Contract:</strong> When processing is necessary to provide the Services under our Terms of
                    Service.
                  </li>
                  <li>
                    <strong>Legal Obligation:</strong> When processing is required to comply with applicable laws or
                    regulations.
                  </li>
                  <li>
                    <strong>Legitimate Interests:</strong> When processing is necessary for our legitimate business
                    interests, such as improving the Services, preventing abuse, or analyzing usage, provided those
                    interests are not overridden by your rights.
                  </li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">4. Security Measures</h2>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>
                    <strong>Encryption in Transit &amp; At Rest:</strong> TLS (HTTPS) for data in motion; AES-256 for
                    sensitive data like OAuth tokens.
                  </li>
                  <li>
                    <strong>Access Controls:</strong> Restricted to authorized personnel/systems.
                  </li>
                  <li>
                    <strong>Monitoring &amp; Auditing:</strong> Logging and vulnerability audits.
                  </li>
                  <li>
                    <strong>Compliance:</strong> Best practices aligned with the Google API Services User Data Policy.
                  </li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">5. Disclosure of Your Information</h2>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>
                    <strong>By Law / Protection of Rights:</strong> As required to comply with law, legal process, or
                    enforce our rights.
                  </li>
                  <li>
                    <strong>Third-Party Providers:</strong> For authentication (Firebase), email (Gmail API, Microsoft
                    Graph API), AI processing (OpenAI), payments (Stripe), hosting (Render, Firebase Hosting), and
                    analytics. All are bound by contractual obligations to protect your data.
                  </li>
                  <li>
                    <strong>Third-Party Data Sources:</strong> Data from People Data Labs (PDL) and similar providers is
                    used only for professional networking/recruiting functionality.
                  </li>
                  <li>
                    <strong>Business Transfers:</strong> If we undergo a merger, acquisition, or sale.
                  </li>
                  <li>
                    <strong>No Sale of Data:</strong> We do not sell, rent, or trade personal data.
                  </li>
                  <li>
                    <strong>No Advertising Use:</strong> We do not use Google user data or third-party data for
                    advertising or unrelated marketing.
                  </li>
                  <li>
                    <strong>With Your Consent:</strong> We share data only for purposes you explicitly approve.
                  </li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">6. Google API Services User Data Policy</h2>
                <p className="text-gray-600">
                  Offerloop.ai's use and transfer of information received from Google APIs strictly adheres to the
                  Google API Services User Data Policy, including the Limited Use requirements. Specifically:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>We only access Gmail data with your explicit consent through Google OAuth.</li>
                  <li>
                    Requested scopes (e.g., gmail.readonly, gmail.compose, gmail.modify, gmail.metadata, gmail.insert, gmail.send, openid, userinfo.email, userinfo.profile)
                    are used to:
                    <ul className="list-disc pl-6 mt-1">
                      <li>Save outreach emails into your Gmail Drafts folder at your request.</li>
                      <li>Schedule and send emails on your behalf.</li>
                      <li>Detect replies and update email status.</li>
                    </ul>
                  </li>
                  <li>We never sell Gmail data or use it for advertising.</li>
                  <li>
                    Humans cannot access Gmail content except with your explicit consent, for abuse/security
                    investigations, to comply with law, or after anonymization/aggregation for service operations.
                  </li>
                  <li>We do not use Gmail or Google Workspace data to train general AI/ML models.</li>
                  <li>You may revoke access at any time via your Google Account Security Settings.</li>
                  <li>
                    Upon account deletion or revocation, associated Google data is promptly deleted from our systems,
                    except where retention is legally required.
                  </li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">7. Data Retention</h2>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>
                    <strong>Account Data:</strong> Stored as long as your account is active.
                  </li>
                  <li>
                    <strong>Drafts &amp; Emails:</strong> Retained only as long as needed to fulfill Service functions
                    (draft storage, scheduling, reply detection).
                  </li>
                  <li>
                    <strong>Analytics Data:</strong> May be anonymized/aggregated for long-term storage.
                  </li>
                  <li>
                    <strong>Deletion Requests:</strong> Honored within 30 days, except where retention is legally
                    required.
                  </li>
                  <li>
                    <strong>Export Rights:</strong> Users may request an export of their personal data in a
                    machine-readable format (e.g., CSV or JSON) before deletion.
                  </li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">8. Your Rights &amp; Choices</h2>
                <p className="text-gray-600">Depending on your jurisdiction, you may request:</p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>Access to personal data we hold.</li>
                  <li>Correction of inaccuracies.</li>
                  <li>Deletion of personal data (with some legal/operational exceptions).</li>
                  <li>Restriction or objection to processing.</li>
                  <li>Data portability in machine-readable format.</li>
                  <li>Revocation of consent (e.g., disconnecting Google/Microsoft accounts).</li>
                  <li>Email tracking opt-out by disabling image loading in your client.</li>
                  <li>
                    The right to lodge a complaint with a supervisory authority if you believe our processing violates
                    applicable law.
                  </li>
                </ul>
                <p className="text-gray-600">
                  Requests may be made via <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a> or{" "}
                  <a href="mailto:support@offerloop.ai" className="text-[#3B82F6] hover:underline">support@offerloop.ai</a>.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">9. Chrome Extension ("Offerloop for LinkedIn")</h2>
                <p className="text-gray-600">
                  Our Chrome browser extension ("Offerloop for LinkedIn") provides additional functionality on
                  LinkedIn. This section explains what data the extension accesses, how it is used, and how it
                  complies with Chrome Web Store policies.
                </p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">a. Browser Permissions</h3>
                <p className="text-gray-600">The extension requests the following Chrome permissions, each limited to what is necessary for its features:</p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>tabs</strong> - Detects when you are viewing a LinkedIn profile or job posting so the extension can activate relevant features.</li>
                  <li><strong>activeTab</strong> - Reads publicly visible LinkedIn page content (name, headline, company, position) when you click the extension icon.</li>
                  <li><strong>storage</strong> - Saves your authentication state and preferences locally in your browser.</li>
                  <li><strong>identity</strong> - Authenticates you via Google OAuth through the Chrome Identity API.</li>
                  <li><strong>contextMenus</strong> - Provides right-click menu options for quick access to extension features.</li>
                  <li><strong>notifications</strong> - Displays browser notifications when actions complete (e.g., draft saved).</li>
                  <li><strong>downloads</strong> - Enables downloading of generated PDFs (Meeting Prep, Interview Prep).</li>
                </ul>
                <p className="text-gray-600">
                  Host permissions are limited to <code className="text-sm bg-gray-100 px-1 rounded">https://*.linkedin.com/*</code> (to read LinkedIn page content) and our backend server (to process requests).
                </p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">b. Data the Extension Collects</h3>
                <p className="text-gray-600">
                  <strong>LinkedIn Profile &amp; Job Page Data:</strong> When you click the extension icon on a LinkedIn
                  page, the extension reads publicly visible information from that page - such as the person's name,
                  headline, current position, company, and profile URL, or job title, company, and description - and
                  transmits it to our servers to power features like email lookup, outreach drafting, Meeting Prep,
                  Interview Prep, and cover letter generation.
                </p>
                <p className="text-gray-600">
                  <strong>Authentication Data:</strong> Your Google account email and profile information are collected
                  during sign-in via Google OAuth (Chrome Identity API) and used solely for authentication.
                </p>
                <p className="text-gray-600">
                  <strong>Local Preferences:</strong> Settings and authentication state are stored locally in your
                  browser using Chrome's storage API. This data never leaves your device.
                </p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">c. How Extension Data Is Used</h3>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>Looking up professional email addresses via our backend (People Data Labs).</li>
                  <li>Generating personalized outreach emails using AI (OpenAI).</li>
                  <li>Saving email drafts to your connected Gmail account at your request.</li>
                  <li>Generating Meeting Prep and Interview Prep documents.</li>
                  <li>Generating cover letters based on job posting details.</li>
                  <li>Tracking your credit usage and subscription status.</li>
                </ul>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">d. What the Extension Does NOT Do</h3>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>Does not track or store your general browsing history.</li>
                  <li>Does not collect data from any website other than LinkedIn.</li>
                  <li>Does not run in the background - it only activates when you click the extension icon or use the right-click menu.</li>
                  <li>Does not sell, rent, or trade any data collected through the extension.</li>
                  <li>Does not use any collected data for advertising, remarketing, or any purpose unrelated to Offerloop's core networking features.</li>
                  <li>Does not use data to train general AI or machine learning models.</li>
                </ul>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">e. Chrome Web Store User Data Policy Compliance</h3>
                <p className="text-gray-600">
                  Offerloop for LinkedIn's use of data complies with the{" "}
                  <a href="https://developer.chrome.com/docs/webstore/program-policies" className="text-[#3B82F6] hover:underline" target="_blank" rel="noopener noreferrer">
                    Chrome Web Store User Data Policy
                  </a>
                  , including the Limited Use requirements. Specifically:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>Data is used only to provide or improve the extension's single purpose: professional networking and outreach on LinkedIn.</li>
                  <li>Data is not transferred to third parties except as necessary to provide the service (e.g., our backend server, OpenAI for email generation, People Data Labs for email lookup).</li>
                  <li>Data is not used for personalized advertising, retargeting, or interest-based ads.</li>
                  <li>Humans do not read user data except (a) with your explicit consent for support purposes, (b) for security or abuse investigation, (c) to comply with applicable law, or (d) when aggregated and anonymized for internal operations.</li>
                </ul>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">f. Remote Code</h3>
                <p className="text-gray-600">
                  The extension loads the Firebase Authentication SDK from Google's official CDN
                  (gstatic.com) to securely handle user authentication. No other remote code is loaded.
                </p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">g. Revoking Extension Access</h3>
                <p className="text-gray-600">
                  You may uninstall the extension at any time from <code className="text-sm bg-gray-100 px-1 rounded">chrome://extensions</code>. Upon
                  uninstallation, all locally stored data is automatically removed. To request deletion of data
                  stored on our servers, contact us at{" "}
                  <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a>.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">10. Children's Privacy</h2>
                <p className="text-gray-600">
                  The Services are not intended for children under 13 (or 16 in certain regions). We do not knowingly
                  collect data from children under these ages. If such data is discovered, it will be deleted promptly.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">11. International Data Transfers</h2>
                <p className="text-gray-600">
                  Your information may be stored on servers located outside your home country (e.g., via Render and
                  Firebase Hosting). By using the Services, you consent to international transfers as permitted by law.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">12. Third-Party Websites &amp; Services</h2>
                <p className="text-gray-600">
                  Our Services may link to third-party sites (LinkedIn, Stripe, AI providers, etc.). We are not
                  responsible for their practices; please review their privacy policies separately.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">13. Cookies &amp; Tracking Technologies</h2>
                <p className="text-gray-600">We use:</p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>Session Cookies</strong> for secure navigation.</li>
                  <li><strong>Preference Cookies</strong> for saved settings.</li>
                  <li><strong>Analytics Cookies</strong> for performance insights.</li>
                  <li><strong>Tracking Pixels &amp; Links</strong> for email activity monitoring.</li>
                </ul>
                <p className="text-gray-600">You may disable cookies in browser settings, though this may impact functionality.</p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">14. Service Availability Disclaimer</h2>
                <p className="text-gray-600">
                  The Services may rely on third-party infrastructure providers (e.g., Firebase, Render, OpenAI). While
                  we use industry-standard practices to maintain availability, we cannot guarantee uninterrupted or
                  error-free operation, and availability may depend on those providers.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">15. Changes to This Policy</h2>
                <p className="text-gray-600">
                  We may update this Privacy Policy periodically. Updates are effective immediately once posted with a
                  new "Last Updated" date.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">16. Contact Us</h2>
                <p className="text-gray-600">If you have questions or concerns about this Privacy Policy, please contact us:</p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><a href="mailto:support@offerloop.ai" className="text-[#3B82F6] hover:underline">support@offerloop.ai</a> (general inquiries)</li>
                  <li><a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a> (privacy and data protection inquiries)</li>
                </ul>
              </div>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default PrivacyPolicy;