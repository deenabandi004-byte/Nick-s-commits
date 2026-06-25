# Resume Tab Auto-Download Issue

## Problem Description

**Symptom**: Every time the user opens the Resume Workshop tab (`/write/resume`), the resume PDF automatically downloads instead of displaying in the preview.

**User Impact**: 
- Cannot preview resume without downloading
- Downloads folder gets cluttered
- Poor user experience

---

## Root Cause Analysis

### Why It's Happening

1. **Firebase Storage serves PDFs with `Content-Disposition: attachment`**
   - When files are uploaded to Firebase Storage and made public with `blob.make_public()`, the default behavior is to serve them with headers that trigger downloads
   - This is a security feature to prevent direct embedding of files

2. **Browser behavior with PDFs in iframes/objects**
   - Modern browsers (Chrome, Firefox, Safari) check the `Content-Disposition` header
   - If header is `attachment`, browser downloads the file instead of displaying it
   - This happens even with `<object>` tags

3. **Current Implementation**
   - `PDFPreview` component uses `<object>` tag with Firebase Storage URL
   - No way to override the `Content-Disposition` header from client-side
   - Query parameters don't affect HTTP headers

---

## Technical Details

### Current Code Location
**File**: `connect-grow-hire/src/pages/ResumeWorkshopPage.tsx`  
**Component**: `PDFPreview` (lines 98-113)

```typescript
const PDFPreview: React.FC<PDFPreviewProps> = ({ pdfUrl, pdfBase64, title = 'PDF Preview' }) => {
  const src = pdfBase64 ? `data:application/pdf;base64,${pdfBase64}` : pdfUrl || '';
  // ... uses <object> tag with Firebase Storage URL
}
```

### How Resume URLs Are Created
**Backend**: `backend/app/routes/resume.py` and `backend/app/routes/resume_workshop.py`

```python
# Files are uploaded to Firebase Storage
blob.upload_from_string(pdf_bytes, content_type='application/pdf')
blob.make_public()  # Makes file public but doesn't set Content-Disposition: inline
pdf_url = blob.public_url  # Returns URL with default headers
```

### HTTP Headers Being Sent
When browser requests the PDF from Firebase Storage:
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="resume.pdf"  ← This causes download
```

What we need:
```
Content-Type: application/pdf
Content-Disposition: inline; filename="resume.pdf"  ← This would display inline
```

---

## Potential Solutions

### Solution 1: Set Content-Disposition Metadata on Upload (RECOMMENDED)

**Approach**: Set custom metadata when uploading to Firebase Storage to force `Content-Disposition: inline`

**Implementation**:
```python
# In backend/app/routes/resume.py and resume_workshop.py
blob.upload_from_string(
    pdf_bytes, 
    content_type='application/pdf',
    metadata={
        'contentDisposition': 'inline; filename="resume.pdf"'
    }
)
blob.make_public()
```

**Pros**:
- Fixes the issue at the source
- Works for all PDFs going forward
- No frontend changes needed

**Cons**:
- Requires backend changes
- Existing PDFs in storage won't be fixed (would need migration)

**Files to Change**:
- `backend/app/routes/resume.py` - `upload_resume_to_firebase_storage()` function
- `backend/app/routes/resume_workshop.py` - `replace_main_resume()` function
- Any other places that upload PDFs to Firebase Storage

---

### Solution 2: Fetch PDF as Blob and Create Object URL

**Approach**: Fetch the PDF from Firebase Storage, create a blob URL, and use that for preview

**Implementation**:
```typescript
const PDFPreview: React.FC<PDFPreviewProps> = ({ pdfUrl, pdfBase64, title = 'PDF Preview' }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (pdfUrl && !pdfBase64) {
      // Fetch PDF as blob
      fetch(pdfUrl)
        .then(res => res.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
        })
        .catch(err => console.error('Failed to load PDF:', err));
    }
    
    return () => {
      // Cleanup blob URL
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [pdfUrl, pdfBase64]);
  
  const src = pdfBase64 
    ? `data:application/pdf;base64,${pdfBase64}` 
    : blobUrl || pdfUrl || '';
  
  // ... rest of component
}
```

**Pros**:
- Works around the header issue
- Only frontend changes needed
- Works immediately

**Cons**:
- Extra network request (fetch PDF twice - once for blob, once for display)
- More complex code
- Memory management needed (revoke blob URLs)

---

### Solution 3: Use PDF.js Library

**Approach**: Use Mozilla's PDF.js to render PDF in a canvas

**Implementation**:
```typescript
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const PDFPreview: React.FC<PDFPreviewProps> = ({ pdfUrl, pdfBase64, title }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const src = pdfBase64 ? `data:application/pdf;base64,${pdfBase64}` : pdfUrl || '';
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-auto bg-white max-h-[500px]">
      <Document
        file={src}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<div>Loading PDF...</div>}
      >
        {Array.from(new Array(numPages), (el, index) => (
          <Page key={`page_${index + 1}`} pageNumber={index + 1} />
        ))}
      </Document>
    </div>
  );
};
```

**Pros**:
- Full control over PDF rendering
- Works regardless of headers
- Can add features like zoom, search, etc.

**Cons**:
- Requires new dependency (`react-pdf`)
- Larger bundle size
- More complex implementation
- May need styling work

---

### Solution 4: Proxy Through Backend

**Approach**: Create a backend endpoint that fetches the PDF and serves it with correct headers

**Implementation**:
```python
# Backend endpoint
@resume_workshop_bp.route("/resume-preview/<user_id>", methods=["GET"])
def get_resume_preview(user_id: str):
    """Proxy resume PDF with inline Content-Disposition"""
    # Get resume URL from Firestore
    user_doc = db.collection('users').document(user_id).get()
    resume_url = user_doc.get('resumeUrl')
    
    # Fetch PDF from Firebase Storage
    response = requests.get(resume_url)
    
    # Return with inline header
    return Response(
        response.content,
        mimetype='application/pdf',
        headers={
            'Content-Disposition': 'inline; filename="resume.pdf"'
        }
    )
```

**Frontend**:
```typescript
const previewUrl = pdfUrl 
  ? `/api/resume-workshop/resume-preview/${user.uid}`
  : pdfBase64 
    ? `data:application/pdf;base64,${pdfBase64}` 
    : '';
```

**Pros**:
- Full control over headers
- Can add authentication/authorization
- Works for all browsers

**Cons**:
- Extra backend endpoint
- Extra server load (proxying PDFs)
- More complex architecture

---

## Recommended Approach

**Primary**: Solution 1 (Set metadata on upload) + Solution 2 (Blob URL fallback)

**Why**:
1. Fix the root cause for new uploads (Solution 1)
2. Provide immediate fix for existing PDFs (Solution 2)
3. No new dependencies needed
4. Works across all browsers

**Implementation Order**:
1. Implement Solution 2 first (immediate fix)
2. Then implement Solution 1 (long-term fix)
3. Consider Solution 3 if more PDF features needed later

---

## Testing Checklist

After implementing fix:
- [ ] Open Resume tab - PDF should display inline, not download
- [ ] Test with existing resumes (uploaded before fix)
- [ ] Test with newly uploaded resumes
- [ ] Test on Chrome, Firefox, Safari
- [ ] Test on mobile browsers
- [ ] Verify no memory leaks (blob URLs cleaned up)
- [ ] Check browser console for errors

---

## Related Files

**Frontend**:
- `connect-grow-hire/src/pages/ResumeWorkshopPage.tsx` - PDFPreview component
- `connect-grow-hire/src/pages/CoverLetterPage.tsx` - May have same issue

**Backend**:
- `backend/app/routes/resume.py` - `upload_resume_to_firebase_storage()` function
- `backend/app/routes/resume_workshop.py` - `replace_main_resume()` function
- Any other files that upload PDFs to Firebase Storage

---

## Additional Notes

- Firebase Storage doesn't allow changing metadata after upload (without re-uploading)
- Query parameters on Firebase Storage URLs don't affect HTTP headers
- Some browsers may cache the old behavior - users may need to clear cache
- Consider adding a "Download" button explicitly for users who want to download

---

## Questions to Discuss

1. Do we want to fix existing PDFs in storage, or just new ones?
2. Should we add explicit download buttons for better UX?
3. Do we want PDF.js features (zoom, search, etc.) or just basic preview?
4. Should we apply the same fix to Cover Letter previews?

