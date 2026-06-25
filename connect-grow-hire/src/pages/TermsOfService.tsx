import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { AppHeader } from "@/components/AppHeader";

const TermsOfService = () => {
  const navigate = useNavigate();

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

              {/* Page Title */}
              <h1 className="text-[28px] font-semibold text-[#0F172A] mb-2">
                Terms of Service
              </h1>
              <p className="text-gray-500 text-sm mb-8">
                <strong>Last Updated:</strong> 06.22.26
              </p>

              {/* Content */}
              <div className="prose prose-gray max-w-none">
                <p className="text-gray-600">
                  These Terms of Service ("Terms") are a binding agreement between you ("you," "User") and
                  <strong> PipelinePath LLC</strong>, which operates Offerloop.ai ("Offerloop," "we," "us," or
                  "our"), governing your use of our website, application, APIs, and related services (collectively,
                  the "Services"). By creating an account or using the Services, you agree to these Terms and our{" "}
                  <a href="/privacy" className="text-[#3B82F6] hover:underline">Privacy Policy</a> (incorporated by
                  reference). <strong>These Terms include a mandatory arbitration agreement and a class-action
                  waiver in Section 25, which affect how disputes are resolved.</strong> If you do not agree, do not
                  use the Services.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">1. Eligibility</h2>
                <p className="text-gray-600">
                  You must be at least 18 years old (or the age of majority where you live), legally able to enter
                  this agreement, not barred under any applicable law or restricted-party list, and not under 18
                  unless using the Services under the supervision and consent of a parent or legal guardian who
                  agrees to these Terms on your behalf. The Services are not directed to children under 13.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">2. Acceptance of Terms</h2>
                <p className="text-gray-600">
                  You accept these Terms when you check the acceptance box or click the button presented at sign-up,
                  or by accessing or using the Services. We may update these Terms; material changes will be
                  communicated by email or in-app notice and take effect on the "Last Updated" date. Continued use
                  after changes take effect means you accept them.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">3. Account Registration &amp; Security</h2>
                <p className="text-gray-600">
                  You must provide accurate, up-to-date information and keep it current. You are responsible for
                  keeping your login credentials secure and for all activity on your account. Notify us immediately
                  at <a href="mailto:support@offerloop.ai" className="text-[#3B82F6] hover:underline">support@offerloop.ai</a> if
                  you suspect unauthorized access.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">4. Subscriptions, Payments &amp; Auto-Renewal</h2>
                <p className="text-gray-600"><strong>Plans &amp; Fees:</strong> Some features require a paid subscription ("Paid Plan"). Plan prices, included features, and billing cycles are shown at the point of purchase before you pay.</p>
                <p className="text-gray-600"><strong>Billing Authorization:</strong> By providing payment details, you authorize Stripe to charge applicable fees, taxes, and adjustments.</p>
                <p className="text-gray-600">
                  <strong>Auto-Renewal &amp; Consent:</strong> Paid Plans renew automatically at the then-current
                  price until you cancel. Before you are charged, we present the renewal frequency, the amount, and
                  the cancellation method, and we obtain your affirmative consent to automatic renewal separately
                  from your general acceptance of these Terms. We will send renewal and price-change reminders where
                  required by law.
                </p>
                <p className="text-gray-600">
                  <strong>Cancellation:</strong> You may cancel auto-renewal at any time from your account settings
                  (the same medium in which you subscribed) or by emailing{" "}
                  <a href="mailto:support@offerloop.ai" className="text-[#3B82F6] hover:underline">support@offerloop.ai</a>.
                  Cancellation takes effect at the end of the current billing period.
                </p>
                <p className="text-gray-600"><strong>Changes:</strong> We may adjust plan pricing or features prospectively with advance notice. Continuing to use the Services after changes take effect means you accept them.</p>
                <p className="text-gray-600"><strong>Upgrades/Downgrades:</strong> Upgrades may bill immediately on a prorated basis; downgrades apply at the next renewal.</p>
                <p className="text-gray-600">
                  <strong>Refunds:</strong> We offer a goodwill refund window after your first charge on each product:
                </p>
                <ul className="list-disc pl-6 text-gray-600 space-y-1">
                  <li><strong>Pro and Elite (monthly or annual):</strong> 7 days from the date of the charge. Cancel anytime after that to stop future renewals — no refund will be issued for time already used.</li>
                  <li><strong>Recruiting Season Pass:</strong> 14 days from the date of the charge, provided you have used less than 50% of your month-1 credit allocation. After 14 days, the pass is non-refundable.</li>
                  <li><strong>Top-up credit packs:</strong> Non-refundable, because purchased credits never expire and remain available on your account indefinitely.</li>
                  <li><strong>Post-checkout add-ons</strong> (e.g., the one-time Pro→Elite upgrade offer): fall under the same 7-day window as the underlying subscription.</li>
                </ul>
                <p className="text-gray-600">
                  To request a refund, contact <a href="mailto:support@offerloop.ai" className="text-[#3B82F6] hover:underline">support@offerloop.ai</a> or
                  submit a request from your account settings. We typically respond within 24 hours.
                </p>
                <p className="text-gray-600">
                  <strong>Anti-abuse:</strong> Refunds are issued in good faith and at Offerloop's discretion.
                  We reserve the right to deny refund requests where usage patterns indicate evaluation in bad
                  faith — for example, bulk credit consumption immediately followed by a refund request.
                  Outside these stated windows, payments are non-refundable except where required by law.
                </p>
                <p className="text-gray-600"><strong>Taxes:</strong> You are responsible for applicable taxes, though we may collect and remit them when legally required.</p>
                <p className="text-gray-600"><strong>Chargebacks:</strong> Fraudulent or unwarranted chargebacks may result in suspension or termination.</p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">5. License &amp; Access</h2>
                <p className="text-gray-600">
                  Subject to these Terms and payment of applicable fees, Offerloop grants you a limited, revocable,
                  non-exclusive, non-transferable license to use the Services for personal or internal professional
                  purposes (such as networking, recruiting outreach, and related learning). All other rights are
                  reserved.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">6. User Content</h2>
                <p className="text-gray-600">
                  "User Content" includes resumes, text, email templates, contact notes, and other material you
                  provide or generate through the Services. You retain ownership of your User Content. You grant
                  Offerloop a worldwide, royalty-free, non-exclusive license to host, store, process, reproduce,
                  transmit, and display User Content only as necessary to (i) operate and improve the Services, (ii)
                  comply with legal obligations, and (iii) enforce these Terms. You represent that you have the
                  rights to your User Content and that it does not infringe any law or third-party right.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">7. Outreach &amp; Anti-Spam Responsibilities</h2>
                <p className="text-gray-600">
                  Offerloop helps you draft and send outreach from your own connected email account.{" "}
                  <strong>You are the sender of every message you send through the Services and are solely
                  responsible for it and for compliance with all applicable laws</strong>, including the CAN-SPAM
                  Act, state anti-spam laws (such as California Business &amp; Professions Code § 17529.5), and, where
                  applicable, the GDPR and ePrivacy rules. You agree that you will not:
                </p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>send messages without an appropriate basis to contact the recipient;</li>
                  <li>use false or misleading headers, sender names, or subject lines, or impersonate anyone;</li>
                  <li>send bulk, automated, or templated commercial blasts, spam, or messages unrelated to genuine professional networking;</li>
                  <li>upload, import, or send to harvested, scraped, purchased, or auto-generated email lists;</li>
                  <li>continue to contact anyone who has asked you to stop, and you will honor opt-out requests promptly; or</li>
                  <li>fail to include any disclosures the law requires for the messages you send.</li>
                </ul>
                <p className="text-gray-600">
                  We may throttle, filter, suspend, or terminate accounts that appear to violate this section.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">8. AI &amp; Automated Features</h2>
                <p className="text-gray-600">
                  The Services use AI (e.g., OpenAI and Anthropic) to generate emails, prep documents, analyses, and
                  other content. <strong>AI output may be inaccurate, incomplete, outdated, or inappropriate, and you
                  must review and verify it before relying on it or sending it to anyone.</strong> AI output is not
                  legal, financial, career, or professional advice. We do not guarantee any outcome — including
                  replies, meetings, interviews, or job offers. You are responsible for the messages and decisions
                  you make using AI output, and Offerloop disclaims liability for them.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">9. Integrations &amp; Third-Party Services</h2>
                <p className="text-gray-600">
                  The Services integrate with third parties including Google (Gmail), Stripe, LinkedIn, and our AI,
                  data, search, hosting, and analytics providers. Each integration is governed by its own terms, and
                  we are not responsible for the availability, performance, or data practices of third parties
                  outside our reasonable control.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">10. Third-Party Data Providers</h2>
                <p className="text-gray-600">
                  Offerloop obtains professional and publicly available information from data providers such as
                  People Data Labs, Hunter.io, Coresignal, Bright Data, and Apify, which may include names, titles,
                  employers, professional and personal contact details, and education and employment history. This
                  data is provided to enable networking and recruiting features. You must use it only for legitimate
                  professional networking, not for harassment, discrimination, or any unlawful purpose. Individuals
                  may request removal of their information as described in our Privacy Policy.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">11. Google API Services; Limited Use</h2>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>We access Google data only with your explicit OAuth consent.</li>
                  <li>We request only the scopes needed to create drafts, send outreach, and detect replies (<code className="text-sm bg-gray-100 px-1 rounded">gmail.compose</code>, <code className="text-sm bg-gray-100 px-1 rounded">gmail.send</code>, <code className="text-sm bg-gray-100 px-1 rounded">gmail.readonly</code>, plus basic profile scopes).</li>
                  <li>Our use of Google user data adheres to the Google API Services User Data Policy, including the Limited Use requirements, as described in our Privacy Policy.</li>
                  <li>We never sell Google data, use it for advertising, or use it to train generalized AI/ML models.</li>
                  <li>You may revoke our access at any time via your Google Account settings or in-app.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">12. Prohibited Uses</h2>
                <p className="text-gray-600">You may not:</p>
                <ul className="text-gray-600 list-disc pl-6 space-y-1">
                  <li>violate any law, regulation, or third-party right;</li>
                  <li>reverse engineer, decompile, or attempt to extract source code;</li>
                  <li>introduce malware or impose excessive load on our systems;</li>
                  <li>bypass or probe system security without authorization;</li>
                  <li>scrape or harvest personal data without a lawful basis, or resell data obtained through the Services;</li>
                  <li>upload or distribute unlawful, defamatory, or infringing content; or</li>
                  <li>upload sensitive categories of personal data (such as health data, financial account numbers, government identifiers, or children's data) unless expressly permitted.</li>
                </ul>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">13. Intellectual Property</h2>
                <p className="text-gray-600">
                  The Services (including software, interfaces, design, branding, and trademarks) are owned by
                  PipelinePath LLC or its licensors. Except for the limited license in Section 5, you gain no rights
                  in the Services. Third-party marks remain the property of their respective owners.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">14. Feedback</h2>
                <p className="text-gray-600">
                  If you provide feedback or suggestions, you grant Offerloop a perpetual, worldwide, royalty-free
                  license to use and incorporate them without restriction or obligation.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">15. Beta / Experimental Features</h2>
                <p className="text-gray-600">
                  Beta or trial features may change or be removed at any time and are provided "as is," without
                  warranties.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">16. Privacy &amp; Data Protection</h2>
                <p className="text-gray-600">
                  Your use of the Services is subject to our Privacy Policy. Unless a separate data processing
                  agreement is in place, each party acts as an independent controller of the personal data it
                  determines the purposes for. You are responsible for ensuring you have an appropriate basis to
                  contact any individual you reach through the Services.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">17. Security Practices</h2>
                <p className="text-gray-600">
                  Offerloop uses industry-standard security measures, including encryption in transit and access
                  controls, to protect user data. No system is completely secure.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">18. Data Deletion &amp; Retention</h2>
                <p className="text-gray-600">
                  You may request deletion of your account and associated personal data by emailing{" "}
                  <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a>. We
                  will delete your data within 30 days, except where retention is required to comply with a legal
                  obligation or to resolve disputes. We retain personal data only as long as necessary to provide the
                  Services.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">19. Compliance With Privacy &amp; Anti-Spam Laws</h2>
                <p className="text-gray-600">
                  You are responsible for ensuring that your use of the Services complies with all applicable laws,
                  including the GDPR, CCPA/CPRA and other U.S. state privacy laws, CAN-SPAM, and other data-protection
                  and anti-spam regulations.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">20. Suspension &amp; Termination</h2>
                <p className="text-gray-600">
                  We may suspend or terminate your access immediately for breach of these Terms, suspected abuse,
                  non-payment, or legal reasons. You may cancel your account at any time in-app; cancellation takes
                  effect at the end of the current billing period. Sections that by their nature should survive
                  termination (including 6–8, 10–14, and 21–31) survive.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">21. Disclaimers</h2>
                <p className="text-gray-600">
                  THE SERVICES, INCLUDING AI FEATURES AND BETA FUNCTIONALITY, ARE PROVIDED "AS IS" AND "AS
                  AVAILABLE." WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A
                  PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY OF AI OUTPUT OR THIRD-PARTY DATA, AND THAT THE
                  SERVICES WILL BE ERROR-FREE OR UNINTERRUPTED.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">22. Limitation of Liability</h2>
                <p className="text-gray-600">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW: (a) OFFERLOOP SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
                  CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES (INCLUDING LOST PROFITS, LOST DATA, OR BUSINESS
                  INTERRUPTION), EVEN IF ADVISED OF THE POSSIBILITY; AND (b) OUR TOTAL LIABILITY FOR ALL CLAIMS SHALL
                  NOT EXCEED THE GREATER OF (i) THE FEES YOU PAID IN THE PRIOR 12 MONTHS OR (ii) US $100.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">23. Indemnification</h2>
                <p className="text-gray-600">
                  You agree to defend, indemnify, and hold harmless PipelinePath LLC and its affiliates, officers,
                  and employees against any claims, damages, or expenses arising from your User Content, your
                  outreach and messages, your use of third-party data, your use of the Services, or your violation of
                  these Terms or applicable law.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">24. Modifications</h2>
                <p className="text-gray-600">
                  We may modify these Terms or the Services at any time. Material changes will be communicated via
                  email or in-app notice and take effect as of the "Last Updated" date. Continued use after changes
                  constitutes acceptance.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">25. Governing Law &amp; Dispute Resolution</h2>
                <p className="text-gray-600">These Terms are governed by the laws of the State of Delaware, excluding its conflict-of-laws rules.</p>
                <p className="text-gray-600"><strong>Arbitration:</strong> Any dispute arising out of or relating to these Terms or the Services will be resolved by binding individual arbitration administered by the American Arbitration Association (AAA) in Wilmington, Delaware (or virtually) before a single arbitrator. The arbitrator decides all issues, including the scope and enforceability of this arbitration agreement.</p>
                <p className="text-gray-600"><strong>Exceptions:</strong> Either party may seek injunctive relief in court to protect intellectual property, and either party may bring an individual claim in small claims court.</p>
                <p className="text-gray-600"><strong>Class Action Waiver:</strong> Claims must proceed only on an individual basis. No class, collective, consolidated, or representative actions are permitted. If this waiver is unenforceable for a given claim, that claim proceeds in court.</p>
                <p className="text-gray-600"><strong>30-Day Opt-Out:</strong> You may opt out of this arbitration agreement (but not the class-action waiver) by emailing <a href="mailto:support@offerloop.ai" className="text-[#3B82F6] hover:underline">support@offerloop.ai</a> within 30 days of first accepting these Terms, stating your name and account email.</p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">26. Export &amp; Sanctions Compliance</h2>
                <p className="text-gray-600">
                  You represent that you are not located in, or a resident of, a country under U.S. embargo, and are
                  not on any restricted-party list. You agree not to export or re-export the Services in violation of
                  applicable laws.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">27. Force Majeure</h2>
                <p className="text-gray-600">
                  We are not responsible for delays or failures caused by circumstances beyond our reasonable
                  control, including natural disasters, government actions, labor disputes, or third-party outages.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">28. Assignment</h2>
                <p className="text-gray-600">
                  You may not assign these Terms without our prior written consent. We may assign them freely (e.g.,
                  through merger, acquisition, or reorganization).
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">29. Severability</h2>
                <p className="text-gray-600">
                  If any provision is held invalid, the rest remain in effect, and a valid term will replace the
                  invalid one to best reflect the original intent.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">30. Waiver &amp; Entire Agreement</h2>
                <p className="text-gray-600">
                  Failure to enforce any provision is not a waiver of future enforcement. These Terms, our Privacy
                  Policy, and any subscription details constitute the entire agreement between you and PipelinePath
                  LLC, replacing all prior agreements on the subject.
                </p>

                <h2 className="text-lg font-semibold text-[#0F172A] mt-8 mb-4">31. Notices &amp; Contact</h2>
                <p className="text-gray-600">
                  We may notify you via email (to your registered address) or in-app messaging; keep your contact
                  information current. Legal and other notices to us may be sent to{" "}
                  <a href="mailto:support@offerloop.ai" className="text-[#3B82F6] hover:underline">support@offerloop.ai</a> or{" "}
                  <a href="mailto:privacy@offerloop.ai" className="text-[#3B82F6] hover:underline">privacy@offerloop.ai</a>{" "}
                  (Subject: "Legal Notice"). Offerloop.ai is operated by PipelinePath LLC.
                </p>
              </div>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default TermsOfService;
