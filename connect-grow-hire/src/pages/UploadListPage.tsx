import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import ContactImport from "@/components/ContactImport";

// Dedicated RocketReach-style "Upload List" surface. The heavy lifting
// (file parsing, column mapping, preview, credit checks) all lives in
// ContactImport — this page just gives it a first-class home in the sidebar
// instead of burying it in a dialog on the search page.
const UploadListPage = () => (
  <SidebarProvider>
    <div className="flex min-h-screen w-full bg-paper font-sans text-ink">
      <AppSidebar />
      <MainContentWrapper>
        <AppHeader title="Upload a List" />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[760px] mx-auto px-6 py-8">
            <p className="text-sm text-muted-foreground mb-6">
              Upload a list of contacts and we&apos;ll find their emails, draft
              outreach, and save them to My Network. Lists can then be used
              anywhere in Offerloop.
            </p>
            <ContactImport />
          </div>
        </div>
      </MainContentWrapper>
    </div>
  </SidebarProvider>
);

export default UploadListPage;
