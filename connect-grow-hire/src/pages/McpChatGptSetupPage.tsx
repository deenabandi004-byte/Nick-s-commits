// McpChatGptSetupPage — /mcp-server/chatgpt
// Step-by-step directions for adding the Offerloop MCP server to ChatGPT as
// a custom connector. Claude's equivalent guide is the /connector page.

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";

const CONNECTOR_URL = "https://www.offerloop.ai/mcp";

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Turn on developer mode",
    body: (
      <>
        In ChatGPT, open <strong>Settings → Connectors → Advanced settings</strong> and
        toggle on <strong>Developer mode</strong>. Custom connectors require a paid
        ChatGPT plan (Plus, Pro, Team, or Enterprise).
      </>
    ),
  },
  {
    title: "Create the connector",
    body: (
      <>
        Still under <strong>Settings → Connectors</strong>, click <strong>Create</strong>.
        Name it <strong>Offerloop</strong>, paste the MCP server URL below, and set
        authentication to <strong>OAuth</strong>. Confirm and create.
      </>
    ),
  },
  {
    title: "Sign in to Offerloop",
    body: (
      <>
        ChatGPT opens an Offerloop sign-in window. Use the same Google account as your
        Offerloop account, then click <strong>Allow</strong>.
      </>
    ),
  },
  {
    title: "Use it in a chat",
    body: (
      <>
        In a new conversation, enable the Offerloop connector from the tools menu and
        ask ChatGPT to find contacts, pull company intel, or draft outreach. Results
        follow your Offerloop tier.
      </>
    ),
  },
];

const McpChatGptSetupPage = () => {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(CONNECTOR_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="MCP Server" />

          <div className="flex-1 overflow-y-auto" style={{ background: "#FBFCFE" }}>
            <div className="mx-auto w-full max-w-[820px] px-5 py-6 sm:px-10 sm:py-8">
              <Link
                to="/mcp-server"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={14} />
                Back to MCP Server
              </Link>

              <div className="mt-4 flex items-center gap-4">
                <img src="/logos/openai.svg" alt="ChatGPT logo" className="h-12 w-12" />
                <h1
                  style={{
                    fontFamily: "'Libre Baskerville', Georgia, serif",
                    fontSize: 30,
                    fontWeight: 400,
                    lineHeight: "36px",
                    color: "#1e2d4d",
                    margin: 0,
                  }}
                >
                  Connect Offerloop to ChatGPT
                </h1>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Add Offerloop as a custom connector so ChatGPT can find contacts, pull
                company intel, and draft outreach for you. Takes about two minutes.
              </p>

              <div className="mt-6 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3">
                <code className="flex-1 truncate text-sm" style={{ color: "#1e2d4d" }}>
                  {CONNECTOR_URL}
                </code>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#0F172A] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#1E293B]"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copied" : "Copy URL"}
                </button>
              </div>

              <ol className="mt-8 space-y-6">
                {STEPS.map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: "#0F172A" }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <div className="font-semibold" style={{ color: "#1e2d4d" }}>
                        {step.title}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
};

export default McpChatGptSetupPage;
