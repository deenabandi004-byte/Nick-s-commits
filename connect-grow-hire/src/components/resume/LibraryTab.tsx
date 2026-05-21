/**
 * Library tab: list of saved resume versions with Preview, Use as Main, Download, Delete.
 * Preview shows entry PDF in parent's right panel via onPreviewEntry. Use as Main loads structured_data and calls onUseAsMain.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileText, Eye, Download, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { getLibraryEntry, deleteLibraryEntry, type LibraryEntry as LibraryEntryType } from '@/services/resumeWorkshop';
import { normalizeParsedResumeFromFirestore } from '@/types/resume';
import type { ParsedResume } from '@/types/resume';

export interface LibraryTabProps {
  uid: string;
  loadLibrary: () => void;
  entries: LibraryEntryType[];
  isLoadingLibrary: boolean;
  onUseAsMain: (parsed: ParsedResume) => void;
  onPreviewEntry: (entry: LibraryEntryType | null) => void;
  previewEntryId: string | null;
}

export function LibraryTab({
  uid,
  loadLibrary,
  entries,
  isLoadingLibrary,
  onUseAsMain,
  onPreviewEntry,
  previewEntryId,
}: LibraryTabProps) {
  const [entryToDelete, setEntryToDelete] = useState<LibraryEntryType | null>(null);
  const [entryToUseAsMain, setEntryToUseAsMain] = useState<LibraryEntryType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUsingAsMain, setIsUsingAsMain] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const handleViewEntry = async (entry: LibraryEntryType) => {
    if (entry.pdf_base64) {
      onPreviewEntry(entry);
      return;
    }
    setIsLoadingPreview(true);
    try {
      const result = await getLibraryEntry(entry.id);
      if (result.status === 'ok' && result.entry) onPreviewEntry(result.entry);
      else toast({ title: 'Error', description: 'Failed to load preview.', variant: 'destructive' });
    } catch {
      toast({ title: 'Error', description: 'Failed to load preview.', variant: 'destructive' });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDownloadEntry = async (entry: LibraryEntryType) => {
    let pdfBase64 = entry.pdf_base64;
    if (!pdfBase64) {
      const result = await getLibraryEntry(entry.id);
      if (result.status === 'ok' && result.entry?.pdf_base64) pdfBase64 = result.entry.pdf_base64;
    }
    if (pdfBase64) {
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `${entry.display_name}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Download started' });
    } else {
      toast({ title: 'Error', description: 'No PDF for this entry.', variant: 'destructive' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) return;
    const id = entryToDelete.id;
    setEntryToDelete(null);
    setIsDeleting(true);
    try {
      await deleteLibraryEntry(id);
      loadLibrary();
      onPreviewEntry(null);
      toast({ title: 'Deleted', description: 'Resume removed from library.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUseAsMainConfirm = async () => {
    if (!uid || !entryToUseAsMain) return;
    setIsUsingAsMain(true);
    try {
      let entry = entryToUseAsMain;
      if (!entry.structured_data && !entry.pdf_base64) {
        const res = await getLibraryEntry(entry.id);
        if (res.status === 'ok' && res.entry) entry = res.entry;
      }
      const parsed = entry.structured_data ? normalizeParsedResumeFromFirestore(entry.structured_data) : null;
      if (!parsed) {
        toast({
          title: 'Cannot use',
          description: 'This entry has no structured data. Use the Editor to upload a resume first.',
          variant: 'destructive',
        });
        setEntryToUseAsMain(null);
        return;
      }
      onUseAsMain(parsed);
      setEntryToUseAsMain(null);
      toast({ title: 'Resume updated', description: 'Library version is now your main resume. Review in Editor.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update.', variant: 'destructive' });
    } finally {
      setIsUsingAsMain(false);
    }
  };

  if (!uid) return null;

  return (
    <div className="space-y-4">
      {isLoadingLibrary ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-gray-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No saved resumes</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Save versions from the Editor (&quot;Save to Library&quot;) or from the Tailor tab (&quot;Save to Library&quot;) to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Saved resumes ({entries.length})</h2>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`border rounded-[3px] p-4 bg-white transition-colors ${
                previewEntryId === entry.id ? 'border-[#3B82F6] ring-1 ring-[#3B82F6]/20' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-gray-100 rounded-[3px] flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-gray-600" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{entry.display_name}</h4>
                    <p className="text-sm text-gray-600">
                      {[entry.job_title, entry.company].filter(Boolean).join(' at ') || ' - '}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</span>
                      {entry.score != null && (
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            entry.score >= 80 ? 'bg-green-100 text-green-700' : entry.score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          Score: {entry.score}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleViewEntry(entry)}
                    disabled={isLoadingPreview}
                    title="Preview"
                  >
                    {isLoadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEntryToUseAsMain(entry)} title="Use as Main Resume">
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDownloadEntry(entry)} title="Download PDF">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEntryToDelete(entry)}
                    className="text-red-600 hover:text-red-700"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!entryToDelete} onOpenChange={(open) => !open && setEntryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete from library?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &quot;{entryToDelete?.display_name}&quot; from your resume library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700" disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!entryToUseAsMain} onOpenChange={(open) => !open && setEntryToUseAsMain(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use as main resume?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current main resume with &quot;{entryToUseAsMain?.display_name}&quot;. You can review and save in the Editor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUseAsMainConfirm} disabled={isUsingAsMain}>
              {isUsingAsMain ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
