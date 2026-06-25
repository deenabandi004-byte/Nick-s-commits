import { useNavigate, Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AppHeader } from "@/components/AppHeader";

const ExtensionPrivacyPolicy = () => {
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
                Privacy Policy — Chrome Extension
              </h1>
              <p className="text-gray-500 text-sm mb-2">
                Offerloop for LinkedIn
              </p>
              <p className="text-gray-500 text-sm mb-8">
                <strong>Last Updated:</strong> 06.22.26
              </p>

              {/* Content */}
              <div className="prose prose-gray max-w-none">
                <p className="text-gray-600">
                  This Privacy Policy describes how Offerloop.ai ("Offerloop," "we," "us," or "our") collects,
                  uses, and protects your information when you use the Offerloop for LinkedIn Chrome extension
                  (the "Extension"). This policy applies specifically to the Extension. For our full platform
                  privacy policy, please visit{" "}
                  <Link to="/privacy" className="text-[#3B82F6] hover:underline">offerloop.ai/privacy</Link>.
                </p>
                <p className="text-gray-600">
                  By installing and using the Extension, you agree to the practices described in this policy.
                  If you do not agree, please uninstall the Extension.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">1. What the Extension Does</h2>
                <p className="text-gray-600">
                  Offerloop for LinkedIn helps students and job seekers connect with professionals directly
                  from LinkedIn. The Extension allows you to:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>Find professional email addresses from LinkedIn profiles.</li>
                  <li>Generate personalized outreach emails using AI.</li>
                  <li>Save email drafts to your connected Gmail account.</li>
                  <li>Generate Coffee Chat Prep documents.</li>
                  <li>Generate cover letters from job postings.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">2. Information We Collect</h2>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">a. LinkedIn Page Data</h3>
                <p className="text-gray-600">
                  When you click the Extension icon while viewing a LinkedIn profile or job posting, the
                  Extension reads publicly visible information from that page, including:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>Profile pages:</strong> Name, headline, current position, company, and profile URL.</li>
                  <li><strong>Job pages:</strong> Job title, company name, and job description.</li>
                </ul>
                <p className="text-gray-600">
                  This data is transmitted to Offerloop's servers to provide our services (email lookup,
                  outreach drafting, document generation). We do not collect data from any page other than
                  LinkedIn.
                </p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">b. Authentication Information</h3>
                <p className="text-gray-600">
                  When you sign in through the Extension, we collect your Google account email address and
                  basic profile information via Google OAuth (Chrome Identity API). This is used solely for
                  authenticating your Offerloop account.
                </p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">c. Locally Stored Data</h3>
                <p className="text-gray-600">
                  The Extension stores your authentication state and user preferences locally in your browser
                  using Chrome's storage API. This data does not leave your device.
                </p>

                <h3 className="text-base font-semibold text-[#0F172A] mt-6 mb-3">d. Usage and Credit Data</h3>
                <p className="text-gray-600">
                  We track your credit balance and feature usage (e.g., emails looked up, drafts created) to
                  manage your subscription and enforce plan limits.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">3. Information We Do NOT Collect</h2>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>Browsing history:</strong> We do not track, collect, or store your general web browsing activity.</li>
                  <li><strong>Non-LinkedIn data:</strong> The Extension does not read content from any website other than LinkedIn.</li>
                  <li><strong>Background activity:</strong> The Extension only activates when you click the Extension icon or use the right-click context menu. It does not run in the background.</li>
                  <li><strong>Keystrokes or form data:</strong> We do not capture any input outside of the Extension's own interface.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">4. How We Use Your Information</h2>
                <p className="text-gray-600">We use the information collected through the Extension to:</p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>Look up professional email addresses via our backend service (People Data Labs).</li>
                  <li>Generate personalized outreach emails using AI (OpenAI).</li>
                  <li>Save email drafts to your connected Gmail account at your request.</li>
                  <li>Generate Coffee Chat Prep and cover letter documents.</li>
                  <li>Authenticate your account and manage your subscription.</li>
                  <li>Track credit usage across your account.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">5. Third-Party Services</h2>
                <p className="text-gray-600">
                  The Extension communicates with the following third-party services to deliver its functionality:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>Firebase (Google):</strong> Authentication — receives email, profile info, and auth tokens.</li>
                  <li><strong>People Data Labs:</strong> Email lookup — receives name, company, and position from the LinkedIn page.</li>
                  <li><strong>OpenAI / Anthropic:</strong> AI-generated emails and prep docs — receive name, company, position, and context needed for personalization.</li>
                  <li><strong>Stripe:</strong> Payment processing — receives subscription status only (we never receive full card details).</li>
                  <li><strong>Render:</strong> Backend hosting — all data processed through our API.</li>
                </ul>
                <p className="text-gray-600">
                  Requests you make through the Extension are processed by our backend, which may use the additional
                  service providers listed in our{" "}
                  <Link to="/privacy" className="text-[#3B82F6] hover:underline">platform Privacy Policy</Link>.
                </p>
                <p className="text-gray-600">
                  All third-party providers are bound by contractual obligations to protect your data. We do
                  not sell, rent, or trade your data to any third party.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">6. Browser Permissions</h2>
                <p className="text-gray-600">
                  The Extension requests the following Chrome permissions, limited to what is necessary:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>activeTab</strong> — Reads publicly visible LinkedIn page content when you click the Extension icon or use the context menu.</li>
                  <li><strong>storage</strong> — Saves authentication state and preferences locally in your browser.</li>
                  <li><strong>identity</strong> — Authenticates you via Google OAuth through Chrome's Identity API.</li>
                  <li><strong>contextMenus</strong> — Provides right-click menu options for quick access to Extension features.</li>
                  <li><strong>notifications</strong> — Shows browser notifications when actions complete (e.g., "Draft saved to Gmail").</li>
                  <li><strong>downloads</strong> — Enables downloading generated PDF documents (Coffee Chat Prep).</li>
                </ul>
                <p className="text-gray-600">
                  Host permissions are limited to{" "}
                  <code className="text-sm bg-gray-100 px-1 rounded">https://*.linkedin.com/*</code> and our
                  backend API server.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">7. Remote Code</h2>
                <p className="text-gray-600">
                  The Extension loads the Firebase Authentication SDK from Google's official CDN (gstatic.com)
                  to securely handle user authentication. No other remote code is executed.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">8. Chrome Web Store User Data Policy Compliance</h2>
                <p className="text-gray-600">
                  The use of information received from Chrome APIs adheres to the{" "}
                  <a href="https://developer.chrome.com/docs/webstore/program-policies" className="text-[#3B82F6] hover:underline" target="_blank" rel="noopener noreferrer">
                    Chrome Web Store User Data Policy
                  </a>
                  , including the Limited Use requirements. Specifically:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>Limited use:</strong> Data collected through the Extension is used only to provide or improve the Extension's single purpose — professional networking and outreach on LinkedIn.</li>
                  <li><strong>Limited transfer:</strong> Data is not transferred to third parties except as necessary to provide the service (our backend, OpenAI for content generation, People Data Labs for email lookup).</li>
                  <li><strong>No advertising:</strong> Data is not used for personalized advertising, retargeting, or interest-based ads.</li>
                  <li><strong>No human access:</strong> Humans do not read user data except: (a) with your explicit consent for support purposes, (b) for security or abuse investigation, (c) to comply with applicable law, or (d) when data is aggregated and anonymized for internal operations.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">9. Data Security</h2>
                <p className="text-gray-600">We protect your data through:</p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>Encryption in transit:</strong> All data transmitted between the Extension, our servers, and third-party services uses TLS (HTTPS).</li>
                  <li><strong>Encryption at rest:</strong> Sensitive data such as OAuth tokens is encrypted using AES-256.</li>
                  <li><strong>Access controls:</strong> Server access is restricted to authorized systems and personnel.</li>
                  <li><strong>Minimal data retention:</strong> We retain only what is necessary to provide the service.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">10. Data Retention</h2>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>Locally stored data</strong> (authentication state, preferences) persists until you uninstall the Extension or clear Chrome storage.</li>
                  <li><strong>Server-side data</strong> (contacts saved, outreach history, credit usage) is retained as long as your Offerloop account is active.</li>
                  <li><strong>Deletion requests</strong> are honored within 30 days, except where retention is legally required.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">11. Your Rights</h2>
                <p className="text-gray-600">Depending on your jurisdiction, you may:</p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>Request access to the personal data we hold about you.</li>
                  <li>Request correction of inaccurate data.</li>
                  <li>Request deletion of your data.</li>
                  <li>Object to or restrict processing of your data.</li>
                  <li>Request your data in a portable, machine-readable format.</li>
                </ul>
                <p className="text-gray-600">
                  To exercise any of these rights, contact us at{" "}
                  <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a>.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">12. Revoking Access</h2>
                <p className="text-gray-600">
                  You may uninstall the Extension at any time by visiting{" "}
                  <code className="text-sm bg-gray-100 px-1 rounded">chrome://extensions</code> in your browser.
                  Upon uninstallation, all data stored locally by the Extension is automatically removed. To
                  request deletion of data stored on our servers, contact{" "}
                  <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a>.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">13. Children's Privacy</h2>
                <p className="text-gray-600">
                  The Extension is intended for users who are 18 or older. We do not knowingly collect data from
                  anyone under 13, and we do not knowingly sell or share the personal information of anyone under 16.
                  If we discover such data has been collected, it will be deleted promptly.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">14. Changes to This Policy</h2>
                <p className="text-gray-600">
                  We may update this Privacy Policy from time to time. Updates are effective immediately once
                  posted with a new "Last Updated" date. We encourage you to review this policy periodically.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">15. Contact Us</h2>
                <p className="text-gray-600">
                  If you have questions or concerns about this Privacy Policy or the Extension's data practices:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><a href="mailto:support@offerloop.ai" className="text-[#3B82F6] hover:underline">support@offerloop.ai</a> (general inquiries)</li>
                  <li><a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a> (privacy and data protection)</li>
                </ul>

                <p className="text-gray-500 text-sm mt-10 italic">
                  Offerloop.ai is operated by PipelinePath LLC.
                </p>
              </div>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default ExtensionPrivacyPolicy;
