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
                <strong>Last Updated:</strong> 06.22.26
              </p>

              {/* Content */}
              <div className="prose prose-gray max-w-none">
                <p className="text-gray-600">
                  Offerloop.ai is operated by <strong>PipelinePath LLC</strong> ("Offerloop," "we," "us," or
                  "our"). This Privacy Policy explains what information we collect, how we use it, who we share it
                  with, and the choices and rights you have when you use our website, web application, and related
                  services (collectively, the "Services"). It does not cover our Chrome extension, which has its
                  own policy on the <Link to="/extension-privacy" className="text-[#3B82F6] hover:underline">Chrome Extension Privacy</Link> tab above.
                </p>
                <p className="text-gray-600">
                  Please read this policy carefully. By using the Services you agree to it. If you do not agree, do
                  not use the Services. We may update this policy from time to time; when we make material changes
                  we will update the "Last Updated" date and, where required by law, provide additional notice.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">1. The two kinds of people this policy covers</h2>
                <p className="text-gray-600">
                  Offerloop is a networking tool. That means we handle information about two different groups, and
                  your rights depend on which group you fall into:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>
                    <strong>Users</strong> — the people who create an Offerloop account (typically students and job
                    seekers). Most of this policy is about you.
                  </li>
                  <li>
                    <strong>Professional contacts</strong> — the professionals our Users research and reach out to.
                    We obtain limited professional information about these individuals from third-party data
                    providers and public sources. If you are one of these contacts and want your information
                    removed, see <strong>Section 10 (Rights of professional contacts)</strong> and contact{" "}
                    <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a>.
                  </li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">2. Information we collect from Users</h2>
                <p className="text-gray-600">
                  <strong>Account information.</strong> When you sign in with Google, we receive your name, email
                  address, profile picture, and a Google authentication token, via Firebase.
                </p>
                <p className="text-gray-600">
                  <strong>Profile and onboarding information.</strong> Information you provide to set up and use the
                  Services, such as your first and last name, phone number, LinkedIn URL, university, degree, major,
                  graduation year, whether you are a student, your school email, target industries, target
                  companies and roles, preferred locations, and your networking goals.
                </p>
                <p className="text-gray-600">
                  <strong>Resume data.</strong> If you upload a resume, we store the file and extract its text and
                  structured details (which may include your contact information, education, GPA, and work history)
                  to power resume tools, email personalization, and job matching. Resume content is processed by our
                  AI providers as described in Section 5.
                </p>
                <p className="text-gray-600">
                  <strong>User-generated content.</strong> Email drafts and templates you create, notes and status
                  updates you log on contacts, conversations with our Scout assistant, and other content you create
                  in the Services.
                </p>
                <p className="text-gray-600">
                  <strong>Gmail data (if you connect Gmail).</strong> Connecting Gmail is optional. If you do, we
                  describe exactly what we access, store, and process in <strong>Section 6 (Google user data and
                  Gmail)</strong>.
                </p>
                <p className="text-gray-600">
                  <strong>Payment information.</strong> Subscriptions are processed by Stripe. We do not receive or
                  store your full payment card details — only a Stripe customer ID and your subscription status.
                </p>
                <p className="text-gray-600">
                  <strong>Technical and usage data.</strong> IP address, browser and device type, and how you
                  interact with the Services. If you use our free, signed-out resume or cover-letter tools, we store
                  the email address you provide along with your IP address and browser user-agent for that request.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">3. Information we collect about professional contacts</h2>
                <p className="text-gray-600">
                  To help Users find and reach the right people, we obtain professional information about individuals
                  from third-party data providers and publicly available sources. This may include a person's name,
                  job title, employer, work and personal email addresses, phone number, city and state, LinkedIn URL,
                  and education and employment history.
                </p>
                <p className="text-gray-600">
                  <strong>Where this data comes from.</strong> Our sources include People Data Labs, Hunter.io,
                  Coresignal, Bright Data, Apify, and publicly accessible web pages. We do not collect this
                  information directly from the individuals it describes, and they generally have not interacted with
                  Offerloop. We use it only to provide networking and recruiting features to our Users.
                </p>
                <p className="text-gray-600">
                  If you are one of these individuals, you have rights over this information, including the right to
                  have it deleted — see Section 10.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">4. How we use information</h2>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>Create, secure, and manage your account.</li>
                  <li>Provide and operate the Services — contact search, email generation, meeting prep, job matching, network tracking, and (if connected) Gmail drafting and reply detection.</li>
                  <li>Personalize content and generate AI-powered suggestions.</li>
                  <li>Process subscriptions and payments through Stripe.</li>
                  <li>Send you service-related and lifecycle emails (you can unsubscribe from non-essential email).</li>
                  <li>Provide support and respond to your requests.</li>
                  <li>Detect, investigate, and prevent fraud, abuse, and security incidents.</li>
                  <li>Comply with legal obligations and enforce our Terms.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">5. AI and automated processing</h2>
                <p className="text-gray-600">
                  We use third-party AI providers — primarily OpenAI and Anthropic — to generate emails, prepare for
                  meetings, score and match jobs, and power our Scout assistant. To do this, we send these providers
                  the information needed for the task, which may include your resume content, the professional
                  details of a contact you are reaching out to, and, for the reply-coaching feature, the content of
                  an email thread you choose to work with.
                </p>
                <p className="text-gray-600">
                  Our AI providers process this data to return a result to you. They do not use data submitted
                  through their business APIs to train their general models. We do not use Google user data to train
                  any AI or machine-learning model (see Section 6).
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">6. Google user data and Gmail</h2>
                <p className="text-gray-600">
                  Connecting your Google account is optional and always requires your explicit consent through
                  Google OAuth. When you connect Gmail, we request these scopes:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><code className="text-sm bg-gray-100 px-1 rounded">gmail.compose</code> — create and save outreach drafts in your Gmail.</li>
                  <li><code className="text-sm bg-gray-100 px-1 rounded">gmail.send</code> — send outreach emails on your behalf when you ask us to.</li>
                  <li><code className="text-sm bg-gray-100 px-1 rounded">gmail.readonly</code> — detect replies to your outreach and power reply-coaching and thread features.</li>
                  <li><code className="text-sm bg-gray-100 px-1 rounded">openid</code>, <code className="text-sm bg-gray-100 px-1 rounded">userinfo.email</code>, <code className="text-sm bg-gray-100 px-1 rounded">userinfo.profile</code> — identify your account.</li>
                </ul>
                <p className="text-gray-600">
                  <strong>What we store.</strong> We store your OAuth access and refresh tokens so the integration
                  keeps working, the drafts and emails you create through Offerloop, identifiers for the threads we
                  track, and short snippets of replies we detect so we can show you that a contact responded. We do
                  not maintain a full, ongoing copy of your mailbox.
                </p>
                <p className="text-gray-600">
                  <strong>AI processing of Gmail content.</strong> For reply-coaching, when you choose to work with
                  a thread, its contents are sent to our AI provider (OpenAI) solely to generate a suggested reply
                  for you. This data is not used to train any model.
                </p>
                <p className="text-gray-600">
                  <strong>Limited Use.</strong> Offerloop's use and transfer to any other app of information received
                  from Google APIs will adhere to the{" "}
                  <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-[#3B82F6] hover:underline" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>,
                  including the Limited Use requirements. Specifically, we do not:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>transfer or sell Google user data to advertising platforms, data brokers, or information resellers;</li>
                  <li>use Google user data to serve advertisements;</li>
                  <li>use Google user data for any credit, lending, or unrelated purpose; or</li>
                  <li>use Google user data to develop, improve, or train generalized AI or machine-learning models.</li>
                </ul>
                <p className="text-gray-600">
                  No human reads your Gmail content except: with your explicit consent (e.g., for support);
                  for security or abuse investigations; to comply with applicable law; or in anonymized, aggregated
                  form for internal operations.
                </p>
                <p className="text-gray-600">
                  <strong>Revoking access.</strong> You can disconnect Gmail in your Offerloop account settings or at
                  any time via your{" "}
                  <a href="https://myaccount.google.com/permissions" className="text-[#3B82F6] hover:underline" target="_blank" rel="noopener noreferrer">Google Account permissions</a> page.
                  On revocation or account deletion, we delete the associated Google data from our systems except
                  where retention is legally required.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">7. Who we share information with</h2>
                <p className="text-gray-600">
                  We do not sell your personal information for money. We share information with service providers who
                  process it on our behalf to operate the Services, each bound by contract to protect it and use it
                  only for that purpose:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>Google / Firebase</strong> — authentication, database, file storage, and (if connected) Gmail.</li>
                  <li><strong>OpenAI, Anthropic</strong> — AI content generation.</li>
                  <li><strong>People Data Labs, Hunter.io, Coresignal, Bright Data, Apify</strong> — professional contact discovery and enrichment.</li>
                  <li><strong>NeverBounce</strong> — email-address verification.</li>
                  <li><strong>Perplexity, Firecrawl</strong> — live search and web extraction for jobs, companies, and verification.</li>
                  <li><strong>Stripe</strong> — payment processing.</li>
                  <li><strong>Resend</strong> — sending our service and lifecycle emails to you.</li>
                  <li><strong>PostHog</strong> — product analytics (keyed to an anonymous user ID; we do not send your name or email).</li>
                  <li><strong>beehiiv</strong> — our newsletter and related attribution.</li>
                  <li><strong>Render</strong> — application hosting.</li>
                </ul>
                <p className="text-gray-600">
                  We may also disclose information to comply with law or legal process, to protect our rights, users,
                  or the public, and in connection with a merger, acquisition, or sale of assets.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">8. "Sale" and "sharing," and your privacy choices</h2>
                <p className="text-gray-600">
                  We do not sell personal information in exchange for money. Because Offerloop's purpose is to make
                  professional-contact information available to its Users, some of this activity may be considered a
                  "sale" or "sharing" of personal information under certain U.S. state privacy laws. You can exercise
                  your choices, including opting out, by emailing{" "}
                  <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a>. We honor
                  Global Privacy Control (GPC) browser signals where required. We do not use personal information for
                  cross-context behavioral advertising.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">9. Your privacy rights (Users)</h2>
                <p className="text-gray-600">
                  Depending on where you live, you may have the right to:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>know what personal information we hold and access a copy of it;</li>
                  <li>correct inaccurate personal information;</li>
                  <li>delete your account and personal information;</li>
                  <li>opt out of any "sale" or "sharing" and limit the use of sensitive personal information;</li>
                  <li>restrict or object to certain processing;</li>
                  <li>receive your data in a portable, machine-readable format;</li>
                  <li>withdraw consent (e.g., by disconnecting Google); and</li>
                  <li>not be discriminated against for exercising these rights.</li>
                </ul>
                <p className="text-gray-600">
                  To exercise any of these rights, email{" "}
                  <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a>. We will
                  verify your request and respond within the time required by law (generally 30–45 days). You may use
                  an authorized agent to submit a request on your behalf. If you are in the EEA or UK, you also have
                  the right to lodge a complaint with your local supervisory authority.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">10. Rights of professional contacts (non-users)</h2>
                <p className="text-gray-600">
                  If you are a professional whose information appears in Offerloop because a User searched for you,
                  you have rights over that information even though you do not have an account. You may request that
                  we access, correct, or delete the information we hold about you, and that we stop making it
                  available. Email{" "}
                  <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a> and we
                  will process your request. We will also pass deletion requests we receive through state data-broker
                  deletion mechanisms to our service providers where applicable.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">11. EEA and UK users (GDPR)</h2>
                <p className="text-gray-600">
                  <strong>Legal bases.</strong> We process personal data on the bases of: <em>contract</em> (to
                  provide the Services you request), <em>consent</em> (e.g., connecting Google), <em>legal
                  obligation</em>, and <em>legitimate interests</em> (e.g., operating, securing, and improving the
                  Services, and enabling professional networking), balanced against individuals' rights.
                </p>
                <p className="text-gray-600">
                  <strong>Information not collected from you.</strong> Where we obtain a professional contact's data
                  from third-party providers or public sources rather than from the person directly, we rely on
                  legitimate interests, and the categories and sources are described in Section 3. Individuals have
                  the right to object to this processing — including an absolute right to object to direct marketing
                  — and to request erasure, by contacting{" "}
                  <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a>.
                </p>
                <p className="text-gray-600">
                  <strong>Transfers.</strong> We are based in the United States, so personal data is processed there
                  and in other countries where our service providers operate. Where required, we rely on appropriate
                  safeguards such as Standard Contractual Clauses.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">12. Data retention</h2>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><strong>Account and profile data</strong> — kept while your account is active and for a reasonable period afterward.</li>
                  <li><strong>Resume, contacts, and outreach data</strong> — kept while your account is active or until you delete it.</li>
                  <li><strong>Gmail tokens and related data</strong> — kept until you disconnect Gmail or delete your account, then removed except where retention is legally required.</li>
                  <li><strong>Some assistant data</strong> — automatically expires on a set schedule.</li>
                  <li><strong>Deletion requests</strong> — honored within 30 days, except where we must retain data to meet a legal obligation or resolve disputes.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">13. Security</h2>
                <p className="text-gray-600">
                  We use industry-standard measures to protect personal information, including encryption in transit
                  (HTTPS/TLS), access controls, and authentication. No method of transmission or storage is
                  completely secure, and we cannot guarantee absolute security.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">14. Children and minors</h2>
                <p className="text-gray-600">
                  The Services are intended for users who are 18 or older. We do not knowingly collect personal
                  information from anyone under 13, and we do not knowingly sell or share the personal information of
                  anyone under 16. If you believe a minor has provided us personal information, contact{" "}
                  <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a> and we
                  will delete it.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">15. Cookies and analytics</h2>
                <p className="text-gray-600">
                  We use cookies and local storage to keep you signed in, remember preferences, and run product
                  analytics (PostHog). We do not use third-party advertising or cross-site tracking cookies. You can
                  control cookies in your browser settings, though some features may not work without them.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">16. Third-party links</h2>
                <p className="text-gray-600">
                  The Services may link to third-party sites (such as LinkedIn or Stripe). We are not responsible for
                  their practices; please review their privacy policies separately.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">17. Changes to this policy</h2>
                <p className="text-gray-600">
                  We may update this Privacy Policy from time to time. When we do, we will update the "Last Updated"
                  date above and, for material changes, provide additional notice where required.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">18. Contact us</h2>
                <p className="text-gray-600">
                  Offerloop.ai is operated by PipelinePath LLC. For questions or to exercise your rights:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li><a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a> — privacy and data-protection requests</li>
                  <li><a href="mailto:support@offerloop.ai" className="text-[#3B82F6] hover:underline">support@offerloop.ai</a> — general inquiries</li>
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
