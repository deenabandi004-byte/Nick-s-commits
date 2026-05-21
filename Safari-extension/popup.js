// Popup script for Offerloop Chrome Extension
console.log('[Offerloop Popup] Loaded');

// API Configuration
const API_BASE_URL = 'https://final-offerloop.onrender.com';

// Shared job URL patterns - used by detectMode() and isJobUrl()
const JOB_URL_PATTERNS = [
  /linkedin\.com\/jobs\//,
  /boards\.greenhouse\.io\//,
  /jobs\.lever\.co\//,
  /\.myworkdayjobs\.com\//,
  /indeed\.com\/(viewjob|jobs)/,
  /handshake\.com\/.*jobs/,
  /joinhandshake\.com\/.*jobs/,
  /app\.joinhandshake\.com\/.*jobs/,
  /glassdoor\.com\/job-listing/,
  /ziprecruiter\.com\/jobs/,
  /wellfound\.com\/jobs/,
  /\/careers\//,
  /\/jobs\//
];

// Sanitize a string for use in filenames
function sanitizeFilename(str) {
  if (!str) return 'unknown';
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Fetch wrapper with timeout support
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs}ms`);
    throw err;
  }
}

// Tab Detection and Switching
function detectMode(url) {
  // Contact mode - LinkedIn profiles only
  if (url && url.match(/linkedin\.com\/in\//)) {
    return 'contact';
  }
  
  // Job mode - job posting URLs
  if (url) {
    for (const pattern of JOB_URL_PATTERNS) {
      if (url.match(pattern)) return 'job';
    }
  }
  
  return 'contact'; // Default to contact
}

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('hidden', content.id !== `${tabName}-tab`);
  });
  
  // Initialize Job tab when switched to
  if (tabName === 'job') {
    initJobTab();
  }
}

function initTabSwitcher() {
  // Add click handlers for tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

// ============================================
// JOB TAB FUNCTIONALITY (URL-FIRST APPROACH)
// ============================================

let currentJobUrl = null;
let manualInputRequired = false;
let _actionInProgress = false;

// Credits cache - avoid redundant API calls when popup reopens quickly
let _creditsCacheTime = 0;
const CREDITS_CACHE_TTL = 120000; // 2 minutes

// Initialize Job Tab when switched to
async function initJobTab() {
  console.log('[Offerloop Popup] Initializing Job tab...');
  
  // Reset state
  hideAllJobResults();
  hideJobError();
  hideManualForm();
  hideJobLoading();
  
  // Get current tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentJobUrl = tab.url;
  
  // Update URL display
  const urlTextEl = document.getElementById('job-url-text');
  if (urlTextEl) {
    urlTextEl.textContent = truncateUrl(currentJobUrl);
  }
  
  // Check if we're on a supported job board
  if (isJobUrl(currentJobUrl)) {
    showJobStatus('Job URL detected. Click a button to proceed.');
    enableJobButtons();
    manualInputRequired = false;
  } else {
    showJobStatus('Not on a recognized job page. Please enter details manually.');
    showManualForm();
    manualInputRequired = true;
    updateJobButtonState();
  }
}

function isJobUrl(url) {
  if (!url) return false;
  return JOB_URL_PATTERNS.some(pattern => pattern.test(url));
}

// ============================================
// JOB TAB UI HELPERS
// ============================================

function showJobStatus(message) {
  const statusEl = document.getElementById('job-status');
  const textEl = document.getElementById('job-status-text');
  if (textEl) textEl.textContent = message;
  if (statusEl) statusEl.classList.remove('hidden');
}

function hideJobStatus() {
  const statusEl = document.getElementById('job-status');
  if (statusEl) statusEl.classList.add('hidden');
}

function showManualForm(partialData = null) {
  const form = document.getElementById('manual-form');
  if (form) form.classList.remove('hidden');
  manualInputRequired = true;
  
  // Pre-fill with any partial data
  if (partialData) {
    const companyInput = document.getElementById('manual-company');
    const titleInput = document.getElementById('manual-job-title');
    const descInput = document.getElementById('manual-description');
    
    if (companyInput && partialData.company) companyInput.value = partialData.company;
    if (titleInput && partialData.jobTitle) titleInput.value = partialData.jobTitle;
    if (descInput && partialData.description) descInput.value = partialData.description;
  }
  
  updateJobButtonState();
}

function hideManualForm() {
  const form = document.getElementById('manual-form');
  if (form) form.classList.add('hidden');
  manualInputRequired = false;
}

function enableJobButtons() {
  const findBtn = document.getElementById('find-recruiters-btn');
  const coverBtn = document.getElementById('cover-letter-btn');

  if (findBtn) findBtn.disabled = false;
  if (coverBtn) coverBtn.disabled = false;
}

function updateJobButtonState() {
  const company = document.getElementById('manual-company')?.value.trim() || '';
  const jobTitle = document.getElementById('manual-job-title')?.value.trim() || '';
  const description = document.getElementById('manual-description')?.value.trim() || '';
  
  const findBtn = document.getElementById('find-recruiters-btn');
  const coverBtn = document.getElementById('cover-letter-btn');

  // Find Recruiters needs company
  if (findBtn) findBtn.disabled = !company;

  // Cover Letter needs description
  if (coverBtn) coverBtn.disabled = !description;
}

function getManualInputData() {
  return {
    company: document.getElementById('manual-company')?.value.trim() || '',
    jobTitle: document.getElementById('manual-job-title')?.value.trim() || '',
    jobDescription: document.getElementById('manual-description')?.value.trim() || '',
    jobUrl: currentJobUrl
  };
}

function showJobLoading(message) {
  const loading = document.getElementById('job-loading');
  const text = document.getElementById('job-loading-text');
  if (text) text.textContent = message || 'Processing...';
  if (loading) loading.classList.remove('hidden');
}

function hideJobLoading() {
  const loading = document.getElementById('job-loading');
  if (loading) loading.classList.add('hidden');
}

function showJobError(message) {
  const errorDiv = document.getElementById('job-error');
  const errorMsg = document.getElementById('job-error-message');
  if (errorMsg) errorMsg.textContent = message;
  if (errorDiv) errorDiv.classList.remove('hidden');
}

function showJobErrorWithSignin(message) {
  const errorDiv = document.getElementById('job-error');
  const errorMsg = document.getElementById('job-error-message');
  if (errorMsg) {
    errorMsg.textContent = message + ' ';
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'Sign in';
    link.style.cssText = 'color:#2563EB;text-decoration:underline;cursor:pointer;';
    link.addEventListener('click', (e) => { e.preventDefault(); handleLogin(); });
    errorMsg.appendChild(link);
  }
  if (errorDiv) errorDiv.classList.remove('hidden');
}

function hideJobError() {
  const errorDiv = document.getElementById('job-error');
  if (errorDiv) errorDiv.classList.add('hidden');
}

function showJobResults(result) {
  const resultsDiv = document.getElementById('job-results');
  const detailsDiv = document.getElementById('job-result-details');
  const linksDiv = document.querySelector('#job-results .result-links');

  if (detailsDiv) {
    if (result.recruiters && result.recruiters.length > 0) {
      let text = `Found ${result.recruiters.length} recruiter${result.recruiters.length > 1 ? 's' : ''}`;
      if (result._savedToTracker) {
        text += ` • ${result._savedToTracker} saved to Hiring Manager Tracker`;
      }
      detailsDiv.textContent = text;
    } else {
      detailsDiv.textContent = 'Contact saved to your library';
    }
  }

  if (linksDiv && result._savedToTracker) {
    const trackerP = document.createElement('p');
    trackerP.textContent = 'Saved to Hiring Manager Tracker. ';
    const trackerLink = document.createElement('a');
    trackerLink.href = 'https://www.offerloop.ai/hiring-manager-tracker';
    trackerLink.target = '_blank';
    trackerLink.rel = 'noopener';
    trackerLink.textContent = 'View in Tracker';
    trackerP.appendChild(trackerLink);
    if (!linksDiv.querySelector('a[href*="hiring-manager-tracker"]')) {
      linksDiv.insertBefore(trackerP, linksDiv.firstChild);
    }
  }

  if (resultsDiv) resultsDiv.classList.remove('hidden');
}

function hideAllJobResults() {
  document.getElementById('job-results')?.classList.add('hidden');
  document.getElementById('cover-letter-results')?.classList.add('hidden');
}

function truncateUrl(url) {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    if (path.length > 30) {
      path = path.substring(0, 30) + '...';
    }
    return parsed.hostname + path;
  } catch {
    return url ? url.substring(0, 40) + '...' : 'Unknown URL';
  }
}

// ============================================
// FIND & EMAIL RECRUITERS (URL-FIRST)
// ============================================

async function handleFindRecruiters() {
  if (_actionInProgress) return;
  _actionInProgress = true;
  const btn = document.getElementById('find-recruiters-btn');

  // Get auth token
  const authData = await chrome.storage.local.get(['authToken']);
  if (!authData.authToken) {
    showJobErrorWithSignin('Please sign in to use this feature.');
    return;
  }

  // Build request body
  let requestBody = {};

  if (manualInputRequired) {
    // Use manual input
    const data = getManualInputData();
    if (!data.company) {
      showJobError('Company name is required');
      return;
    }
    requestBody = {
      company: data.company,
      jobTitle: data.jobTitle || undefined,
      jobDescription: data.jobDescription || undefined,
      jobUrl: data.jobUrl || undefined
    };
  } else {
    // Use URL - backend will parse
    requestBody = {
      jobUrl: currentJobUrl
    };
  }
  
  // Show loading
  btn.classList.add('loading');
  btn.disabled = true;
  hideJobError();
  hideAllJobResults();
  showJobLoading('Finding recruiters...');
  
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/job-board/find-recruiter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.authToken}`
      },
      body: JSON.stringify(requestBody)
    });
    
    const result = await response.json();
    
    if (response.ok && (result.success || result.recruiters)) {
      // Save recruiters to Hiring Manager Tracker (same as website)
      if (result.recruiters && result.recruiters.length > 0) {
        try {
          const jobTitleForSave = (manualInputRequired ? getManualInputData().jobTitle : null) || result.jobTypeDetected || '';
          const saveBody = {
            recruiters: result.recruiters,
            draftsCreated: result.draftsCreated || [],
            companyCleaned: result.companyCleaned || '',
            associatedJobUrl: currentJobUrl || '',
            associatedJobTitle: jobTitleForSave,
            jobTitle: jobTitleForSave,
          };
          const saveRes = await fetchWithTimeout(`${API_BASE_URL}/api/job-board/save-recruiters`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authData.authToken}`,
            },
            body: JSON.stringify(saveBody),
          });
          const saveData = await saveRes.json().catch(() => ({}));
          if (saveData.saved > 0) {
            result._savedToTracker = saveData.saved;
          }
        } catch (e) {
          console.warn('[Offerloop Popup] Save to tracker failed:', e);
        }
      }
      showJobResults(result);
      if (result.creditsRemaining !== undefined) {
        updateCredits(result.creditsRemaining);
        _creditsCacheTime = Date.now();
      }
    } else if (result.needsManualInput || result.error?.includes('extract') || result.error?.includes('company')) {
      // Backend couldn't parse URL - show manual form
      showJobError('Could not extract job details from URL. Please enter manually.');
      showManualForm(result.partialData);
    } else {
      showJobError(result.error || 'Failed to find recruiters. Please try again.');
    }
  } catch (error) {
    console.error('[Offerloop Popup] Find recruiters error:', error);
    showJobError('Something went wrong. Please try again.');
  } finally {
    hideJobLoading();
    btn.classList.remove('loading');
    btn.disabled = false;
    _actionInProgress = false;
  }
}

// ============================================
// GENERATE COVER LETTER (URL-FIRST + DOWNLOAD)
// ============================================

async function handleGenerateCoverLetter() {
  const btn = document.getElementById('cover-letter-btn');

  // Get auth token
  const authData = await chrome.storage.local.get(['authToken']);
  if (!authData.authToken) {
    showJobErrorWithSignin('Please sign in to use this feature.');
    return;
  }

  // Build request body
  let requestBody = {
    jobUrl: currentJobUrl
  };
  let company = '';
  let jobTitle = '';
  
  if (manualInputRequired) {
    // Use manual input - job description is required
    const data = getManualInputData();
    if (!data.jobDescription) {
      showJobError('Job description is required for cover letter generation');
      return;
    }
    requestBody = {
      jobDescription: data.jobDescription,
      company: data.company || undefined,
      jobTitle: data.jobTitle || undefined,
      jobUrl: data.jobUrl || undefined
    };
    company = data.company || '';
    jobTitle = data.jobTitle || '';
  } else {
    // Try to scrape job description from the page
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { action: 'scrapeJobDescription' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Content script timeout')), 5000))
      ]);
      
      if (response && response.description && response.description.length > 100) {
        requestBody = {
          jobDescription: response.description,
          jobUrl: currentJobUrl
        };
      } else {
        // No description scraped - need manual input
        showJobError('Could not extract job description. Please paste it manually.');
        showManualForm();
        return;
      }
    } catch (e) {
      console.error('[Offerloop Popup] Scraping failed:', e);
      // Scraping failed - need manual input
      showJobError('Could not extract job description. Please paste it manually.');
      showManualForm();
      return;
    }
  }
  
  // Show loading
  btn.classList.add('loading');
  btn.disabled = true;
  hideJobError();
  hideAllJobResults();
  showJobLoading('Generating cover letter...');
  
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/job-board/generate-cover-letter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.authToken}`
      },
      body: JSON.stringify(requestBody)
    });
    
    const result = await response.json();
    console.log('[Offerloop Popup] Cover letter API response:', result);
    console.log('[Offerloop Popup] coverLetter type:', typeof result.coverLetter);
    
    if (response.ok && result.coverLetter) {
      // Success - download the cover letter as a PDF
      hideJobLoading();
      showCoverLetterResults(result, company, jobTitle);
      downloadCoverLetterAsPDF(result.coverLetter, company, jobTitle);

      if (result.creditsRemaining !== undefined) {
        updateCredits(result.creditsRemaining);
        _creditsCacheTime = Date.now();
      }
    } else if (response.ok && result.pdfUrl) {
      // If backend returns PDF URL (future support)
      hideJobLoading();
      showCoverLetterResults(result, company, jobTitle);
      triggerCoverLetterDownload(result.pdfUrl, company, jobTitle);

      if (result.creditsRemaining !== undefined) {
        updateCredits(result.creditsRemaining);
        _creditsCacheTime = Date.now();
      }
    } else if (result.error?.includes('description') || result.error?.includes('required')) {
      // Need job description
      showJobError('Please paste the job description below');
      showManualForm();
    } else {
      showJobError(result.error || 'Failed to generate cover letter. Please try again.');
    }
  } catch (error) {
    console.error('[Offerloop Popup] Cover letter error:', error);
    showJobError('Something went wrong. Please try again.');
  } finally {
    hideJobLoading();
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function showCoverLetterResults(data, company, jobTitle) {
  const resultsDiv = document.getElementById('cover-letter-results');
  const detailsDiv = document.getElementById('cover-letter-details');
  const downloadLink = document.getElementById('cover-letter-download-link');
  
  // Extract company/title from various possible locations
  let companyName = company || data.company || data.companyName;
  let title = jobTitle || data.jobTitle || data.job_title || data.title;
  
  // Also check inside coverLetter object if it exists
  if (data.coverLetter && typeof data.coverLetter === 'object') {
    companyName = companyName || data.coverLetter.company || data.coverLetter.companyName;
    title = title || data.coverLetter.jobTitle || data.coverLetter.job_title;
  }
  
  if (detailsDiv) {
    detailsDiv.textContent = `Cover letter for ${title || 'Position'} at ${companyName || 'Company'}`;
  }
  
  // Store cover letter data for re-download
  if (downloadLink && data.coverLetter) {
    downloadLink.onclick = (e) => {
      e.preventDefault();
      downloadCoverLetterAsPDF(data.coverLetter, companyName, title);
    };
  } else if (downloadLink && data.pdfUrl) {
    downloadLink.href = data.pdfUrl;
    downloadLink.onclick = null;
  }
  
  if (resultsDiv) resultsDiv.classList.remove('hidden');
}

function hideCoverLetterResults() {
  const resultsDiv = document.getElementById('cover-letter-results');
  if (resultsDiv) resultsDiv.classList.add('hidden');
}

async function downloadCoverLetterAsPDF(coverLetterData, company, jobTitle) {
  // Handle different response formats
  let text = '';
  
  if (typeof coverLetterData === 'string') {
    // Already a string
    text = coverLetterData;
  } else if (typeof coverLetterData === 'object' && coverLetterData !== null) {
    // It's an object - extract the text content
    // Try common field names
    text = coverLetterData.content 
        || coverLetterData.text 
        || coverLetterData.letter 
        || coverLetterData.body
        || coverLetterData.coverLetter
        || coverLetterData.cover_letter
        || coverLetterData.message
        || '';
    
    // If still empty, try to find any long string value in the object
    if (!text) {
      for (const key of Object.keys(coverLetterData)) {
        if (typeof coverLetterData[key] === 'string' && coverLetterData[key].length > 100) {
          text = coverLetterData[key];
          console.log('[Offerloop Popup] Found cover letter text in field:', key);
          break;
        }
      }
    }
    
    // Last resort - JSON stringify (but this shouldn't happen)
    if (!text) {
      console.error('[Offerloop Popup] Could not extract cover letter text from:', coverLetterData);
      text = JSON.stringify(coverLetterData, null, 2);
    }
    
    // Also extract company/title from response if not provided
    if (!company) {
      company = coverLetterData.company || coverLetterData.companyName || 'unknown';
    }
    if (!jobTitle) {
      jobTitle = coverLetterData.jobTitle || coverLetterData.job_title || coverLetterData.title || 'unknown';
    }
  }
  
  if (!text) {
    console.error('[Offerloop Popup] No cover letter text found');
    showJobError('Cover letter generated but could not extract text');
    return;
  }
  
  console.log('[Offerloop Popup] Generating PDF for cover letter, text length:', text.length);
  
  // Get auth token
  const authData = await chrome.storage.local.get(['authToken']);
  if (!authData.authToken) {
    console.error('[Offerloop Popup] No auth token found');
    showJobError('Please log in to download cover letter');
    return;
  }
  
  try {
    // Call backend to generate PDF
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/job-board/cover-letter-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.authToken}`
      },
      body: JSON.stringify({ content: text, company: company })
    });
    
    if (!response.ok) {
      throw new Error(`PDF generation failed: ${response.status}`);
    }
    
    // Get PDF blob
    const pdfBlob = await response.blob();
    
    // Create filename: companyname_cover_letter.pdf
    const filename = company ? `${sanitizeFilename(company)}_cover_letter.pdf` : 'cover_letter.pdf';
    
    // Create object URL and download
    const url = URL.createObjectURL(pdfBlob);
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('[Offerloop Popup] Cover letter PDF download error:', chrome.runtime.lastError);
        // Fallback: copy text to clipboard
        navigator.clipboard.writeText(text).then(() => {
          showJobError('PDF download failed, but cover letter copied to clipboard!');
        }).catch(() => {
          // Last resort: open PDF in new tab
          chrome.tabs.create({ url: url });
        });
      } else {
        console.log('[Offerloop Popup] Cover letter PDF downloaded:', filename);
      }
      // Revoke the blob URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  } catch (error) {
    console.error('[Offerloop Popup] Error generating PDF:', error);
    // Fallback: download as text file
    const filename = `cover-letter-${sanitizeFilename(company)}-${sanitizeFilename(jobTitle)}.txt`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    });
    showJobError('PDF generation failed, downloaded as text file instead');
  }
}

function triggerCoverLetterDownload(pdfUrl, company, jobTitle) {
  // For future PDF support
  const filename = company ? `${sanitizeFilename(company)}_cover_letter.pdf` : 'cover_letter.pdf';
  
  chrome.downloads.download({
    url: pdfUrl,
    filename: filename,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('[Offerloop Popup] Cover letter PDF download error:', chrome.runtime.lastError);
      chrome.tabs.create({ url: pdfUrl });
    } else {
      console.log('[Offerloop Popup] Cover letter PDF download started:', downloadId);
    }
  });
}

// ============================================
// JOB TAB EVENT LISTENERS
// ============================================

function initJobTabListeners() {
  // Find & Email Recruiters button
  document.getElementById('find-recruiters-btn')?.addEventListener('click', handleFindRecruiters);
  
  // Generate Cover Letter button
  document.getElementById('cover-letter-btn')?.addEventListener('click', handleGenerateCoverLetter);
  
  // Manual form input listeners
  document.getElementById('manual-company')?.addEventListener('input', updateJobButtonState);
  document.getElementById('manual-job-title')?.addEventListener('input', updateJobButtonState);
  document.getElementById('manual-description')?.addEventListener('input', updateJobButtonState);
}


// Authentication is handled via Chrome Identity API + Backend

// DOM Elements
const elements = {
  loginSection: null,
  noProfileSection: null,
  profileSection: null,
  loginBtn: null,
  signOutBtn: null,
  findEmailBtn: null,
  retryBtn: null,
  profileUrl: null,
  resultsSection: null,
  loadingSection: null,
  errorSection: null,
  loadingText: null,
  errorText: null,
  resultName: null,
  resultEmail: null,
  resultStatus: null,
  successLinksSection: null,
  openDraftLink: null,
  creditsCount: null,
};

// State
let currentState = {
  isLoggedIn: false,
  authToken: null,
  linkedInUrl: null,
  isProfilePage: false,
  credits: null,
  user: null,
};

// Initialize DOM elements
function initElements() {
  elements.loginSection = document.getElementById('loginSection');
  elements.noProfileSection = document.getElementById('noProfileSection');
  elements.profileSection = document.getElementById('profileSection');
  elements.loginBtn = document.getElementById('loginBtn');
  elements.signOutBtn = document.getElementById('signOutBtn');
  elements.findEmailBtn = document.getElementById('findEmailBtn');
  elements.retryBtn = document.getElementById('retryBtn');
  elements.profileUrl = document.getElementById('profileUrl');
  elements.resultsSection = document.getElementById('resultsSection');
  elements.loadingSection = document.getElementById('loadingSection');
  elements.errorSection = document.getElementById('errorSection');
  elements.loadingText = document.getElementById('loadingText');
  elements.errorText = document.getElementById('errorText');
  elements.resultName = document.getElementById('resultName');
  elements.resultEmail = document.getElementById('resultEmail');
  elements.resultStatus = document.getElementById('resultStatus');
  elements.successLinksSection = document.getElementById('successLinksSection');
  elements.openDraftLink = document.getElementById('openDraftLink');
  elements.creditsCount = document.getElementById('creditsCount');
}

// ============================================
// MEETING PREP WORKFLOW (aligned with website)
// ============================================

const MEETING_CREDITS = 15; // Must match backend config
let meetingPollInterval = null;

function updateMeetingButtonState() {
  const btn = document.getElementById('meetingBtn');
  const hint = document.getElementById('meetingHint');
  const credits = currentState.credits;
  const hasEnough = credits !== null && credits !== undefined && credits >= MEETING_CREDITS;
  if (btn) {
    btn.disabled = !hasEnough;
    btn.title = hasEnough ? '' : `Need ${MEETING_CREDITS} credits. Check Account Settings for resume.`;
  }
  if (hint) {
    hint.textContent = hasEnough
      ? `Uses ${MEETING_CREDITS} credits • PDF saved to Library`
      : `Need ${MEETING_CREDITS} credits • Upload resume in Account Settings`;
    hint.className = hasEnough ? 'meeting-hint' : 'meeting-hint meeting-hint-disabled';
  }
}

// Meeting Prep handler - Full workflow (matches website behavior)
async function handleMeetingPrep() {
  const btn = document.getElementById('meetingBtn');
  
  // Get current LinkedIn URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const linkedinUrl = tab?.url;
  
  // Validate we're on a LinkedIn profile
  if (!linkedinUrl || !linkedinUrl.match(/linkedin\.com\/in\//)) {
    showMeetingError('Please navigate to a LinkedIn profile first');
    return;
  }
  
  // Get auth token
  const authData = await chrome.storage.local.get(['authToken']);
  if (!authData.authToken) {
    showMeetingError('Please sign in to use this feature');
    return;
  }
  
  // Pre-flight: check credits (match website)
  const credits = currentState.credits;
  if (credits === null || credits === undefined || credits < MEETING_CREDITS) {
    showMeetingError(
      `You need ${MEETING_CREDITS} credits to generate a meeting prep. ` +
      (credits != null ? `You have ${credits} credits.` : 'Check your balance in Account Settings.')
    );
    return;
  }
  
  // Show loading state
  btn.classList.add('loading');
  btn.disabled = true;
  hideMeetingResults();
  hideMeetingError();
  showMeetingLoading('Starting Meeting Prep...');
  
  try {
    // Step 1: Start the prep
    console.log('[Offerloop Popup] Starting Meeting Prep for:', linkedinUrl);
    
    const startResponse = await fetchWithTimeout(`${API_BASE_URL}/api/meeting-prep`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.authToken}`
      },
      body: JSON.stringify({ linkedinUrl })
    });
    
    const errorData = await startResponse.json().catch(() => ({}));
    
    if (!startResponse.ok) {
      // Map backend errors to friendly messages (same as website)
      let message = errorData.error || 'Failed to start Meeting Prep';
      if (errorData.needsResume) {
        message = 'Please upload your resume in Account Settings first.';
      } else if (errorData.credits_needed != null) {
        message = `Insufficient credits. You need ${errorData.credits_needed} credits. You have ${errorData.current_credits || 0}.`;
      } else if (errorData.details?.reason || (errorData.details && typeof errorData.details === 'object')) {
        message = errorData.error || message;
      }
      throw new Error(message);
    }
    
    const responseData = errorData; // already parsed
    const prepId = responseData.prepId || responseData.id;
    
    console.log('[Offerloop Popup] Prep started with ID:', prepId);
    
    if (!prepId) {
      throw new Error('No prep ID returned from server');
    }
    
    // Step 2: Poll for completion
    pollMeetingStatus(prepId, authData.authToken, btn);
    
  } catch (error) {
    console.error('[Offerloop Popup] Meeting Prep error:', error);
    showMeetingError(error.message || 'Something went wrong. Please try again.');
    hideMeetingLoading();
    btn.classList.remove('loading');
    updateMeetingButtonState();
  }
}

function pollMeetingStatus(prepId, authToken, btn) {
  let attempts = 0;
  const maxAttempts = 60; // Fewer attempts needed with backoff
  const maxTotalMs = 10 * 60 * 1000; // 10 minute absolute timeout
  const startTime = Date.now();

  // Clear any existing poll
  if (meetingPollInterval) {
    clearTimeout(meetingPollInterval);
    meetingPollInterval = null;
  }

  const statusMessages = {
    'processing': 'Initializing...',
    'enriching_profile': 'Enriching profile data...',
    'fetching_news': 'Fetching recent news...',
    'building_context': 'Building user context...',
    'extracting_hometown': 'Extracting location...',
    'generating_content': 'Generating content...',
    'generating_pdf': 'Generating PDF...',
    'completed': 'Meeting Prep ready!',
    'failed': 'Generation failed'
  };

  function getBackoffDelay(attempt) {
    // Start at 2s, double each time, cap at 15s
    return Math.min(2000 * Math.pow(1.5, attempt), 15000);
  }

  async function poll() {
    attempts++;

    if (attempts > maxAttempts || (Date.now() - startTime) > maxTotalMs) {
      meetingPollInterval = null;
      hideMeetingLoading();
      showMeetingError('Prep is taking longer than expected. Check the Meeting Library for results.');
      btn.classList.remove('loading');
      updateMeetingButtonState();
      return;
    }

    try {
      const statusResponse = await fetchWithTimeout(`${API_BASE_URL}/api/meeting-prep/${prepId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!statusResponse.ok) {
        throw new Error('Failed to check status');
      }

      const statusData = await statusResponse.json();
      console.log('[Offerloop Popup] Poll status:', statusData.status, `(attempt ${attempts})`);

      // Update loading message based on status
      const loadingMessage = statusMessages[statusData.status] || 'Processing...';
      updateMeetingLoadingText(loadingMessage);

      if (statusData.status === 'completed' && statusData.pdfUrl) {
        // Success!
        meetingPollInterval = null;

        hideMeetingLoading();
        showMeetingResults(statusData);
        triggerPdfDownload(statusData.pdfUrl, statusData.contactData);

        btn.classList.remove('loading');
        updateMeetingButtonState();

        // Refresh credits
        try {
          const creditsResponse = await chrome.runtime.sendMessage({
            action: 'getCredits',
            authToken: authToken,
          });
          if (creditsResponse.credits !== undefined) {
            updateCredits(creditsResponse.credits);
            _creditsCacheTime = Date.now();
          }
        } catch (e) {
          console.log('[Offerloop Popup] Could not refresh credits:', e);
        }
        return;

      } else if (statusData.status === 'failed') {
        // Failed
        meetingPollInterval = null;

        hideMeetingLoading();
        showMeetingError(statusData.error || 'Meeting Prep failed. Please try again.');

        btn.classList.remove('loading');
        updateMeetingButtonState();
        return;
      }

      // Still processing - schedule next poll with backoff
      meetingPollInterval = setTimeout(poll, getBackoffDelay(attempts));

    } catch (error) {
      console.error('[Offerloop Popup] Polling error:', error);
      // Don't stop polling on transient errors, schedule next with backoff
      meetingPollInterval = setTimeout(poll, getBackoffDelay(attempts));
    }
  }

  // Start first poll
  meetingPollInterval = setTimeout(poll, 2000);
}

function showMeetingLoading(message) {
  const loadingDiv = document.getElementById('meetingLoading');
  const loadingText = document.getElementById('meetingLoadingText');
  
  if (loadingText) loadingText.textContent = message || 'Generating Meeting Prep...';
  if (loadingDiv) loadingDiv.classList.remove('hidden');
}

function hideMeetingLoading() {
  const loadingDiv = document.getElementById('meetingLoading');
  if (loadingDiv) loadingDiv.classList.add('hidden');
}

function updateMeetingLoadingText(message) {
  const loadingText = document.getElementById('meetingLoadingText');
  if (loadingText) loadingText.textContent = message;
}

function showMeetingResults(data) {
  const resultsDiv = document.getElementById('meetingResults');
  const contactDiv = document.getElementById('meetingContact');
  const downloadLink = document.getElementById('meetingDownloadLink');
  
  // Show contact name if available
  if (data.contactData) {
    const firstName = data.contactData.firstName || '';
    const lastName = data.contactData.lastName || '';
    const fullName = data.contactData.name || `${firstName} ${lastName}`.trim();
    const company = data.contactData.company || '';
    
    if (fullName) {
      const displayText = company ? `${fullName} at ${company}` : fullName;
      contactDiv.textContent = displayText;
      contactDiv.style.display = 'block';
    } else {
      contactDiv.style.display = 'none';
    }
  } else {
    contactDiv.style.display = 'none';
  }
  
  // Set download link
  if (data.pdfUrl && downloadLink) {
    downloadLink.href = data.pdfUrl;
  }
  
  if (resultsDiv) resultsDiv.style.display = 'block';
}

function hideMeetingResults() {
  const resultsDiv = document.getElementById('meetingResults');
  if (resultsDiv) resultsDiv.style.display = 'none';
}

function showMeetingError(message) {
  const errorDiv = document.getElementById('meetingError');
  const errorMsg = document.getElementById('meetingErrorMessage');
  
  if (errorMsg) errorMsg.textContent = message;
  if (errorDiv) errorDiv.style.display = 'block';
}

function hideMeetingError() {
  const errorDiv = document.getElementById('meetingError');
  if (errorDiv) errorDiv.style.display = 'none';
}

function triggerPdfDownload(pdfUrl, contactData) {
  // Create a sanitized filename
  let contactName = 'contact';
  if (contactData) {
    const firstName = contactData.firstName || '';
    const lastName = contactData.lastName || '';
    contactName = contactData.name || `${firstName} ${lastName}`.trim() || 'contact';
  }
  
  const sanitizedName = contactName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  const filename = `meeting-prep-${sanitizedName}.pdf`;
  
  // Use Chrome downloads API
  chrome.downloads.download({
    url: pdfUrl,
    filename: filename,
    saveAs: false // Auto-save to downloads folder
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('[Offerloop Popup] Download error:', chrome.runtime.lastError);
      // Fallback: open PDF in new tab
      chrome.tabs.create({ url: pdfUrl });
    } else {
      console.log('[Offerloop Popup] PDF download started, ID:', downloadId);
    }
  });
}

// Clean up polling if popup closes
window.addEventListener('unload', () => {
  if (meetingPollInterval) {
    clearTimeout(meetingPollInterval);
    meetingPollInterval = null;
  }
});

// Event Listeners
function initEventListeners() {
  elements.loginBtn?.addEventListener('click', handleLogin);
  elements.signOutBtn?.addEventListener('click', handleSignOut);
  elements.findEmailBtn?.addEventListener('click', handleFindEmail);
  elements.retryBtn?.addEventListener('click', handleRetry);
  
  // Meeting Prep button
  document.getElementById('meetingBtn')?.addEventListener('click', handleMeetingPrep);
}

// Handle retry - refresh token first, then retry the action
async function handleRetry() {
  console.log('[Offerloop Popup] Retry clicked, attempting token refresh first...');
  
  // Try silent refresh first
  const newToken = await refreshAuthToken();
  
  if (!newToken) {
    // Silent refresh failed, force interactive login
    console.log('[Offerloop Popup] Silent refresh failed, forcing re-login...');
    await handleLogin();
    
    // If login succeeded, retry the action
    if (currentState.authToken && currentState.isLoggedIn) {
      await handleFindEmail();
    }
    return;
  }
  
  // Token refreshed, retry the action
  await handleFindEmail();
}

// Show a specific section, hide others
function showSection(sectionName) {
  elements.loginSection?.classList.add('hidden');
  elements.noProfileSection?.classList.add('hidden');
  elements.profileSection?.classList.add('hidden');
  
  switch (sectionName) {
    case 'login':
      elements.loginSection?.classList.remove('hidden');
      elements.signOutBtn?.classList.add('hidden');
      break;
    case 'noProfile':
      elements.noProfileSection?.classList.remove('hidden');
      elements.signOutBtn?.classList.remove('hidden');
      break;
    case 'profile':
      elements.profileSection?.classList.remove('hidden');
      elements.signOutBtn?.classList.remove('hidden');
      break;
  }
}

// Show loading state
function showLoading(text = 'Finding email...') {
  elements.loadingSection?.classList.remove('hidden');
  elements.resultsSection?.classList.add('hidden');
  elements.errorSection?.classList.add('hidden');
  if (elements.findEmailBtn) elements.findEmailBtn.disabled = true;
  if (elements.loadingText) {
    elements.loadingText.textContent = text;
  }
}

// Hide loading state
function hideLoading() {
  elements.loadingSection?.classList.add('hidden');
  if (elements.findEmailBtn) elements.findEmailBtn.disabled = false;
}

// Show error
function showError(message) {
  hideLoading();
  elements.errorSection?.classList.remove('hidden');
  elements.resultsSection?.classList.add('hidden');
  if (elements.errorText) {
    elements.errorText.textContent = message;
  }
}

// Show results
function showResults(contact) {
  hideLoading();
  elements.errorSection?.classList.add('hidden');
  elements.resultsSection?.classList.remove('hidden');
  
  // Parse name
  const fullName = contact.full_name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown';
  elements.resultName.textContent = fullName;
  
  // Email
  const email = contact.email || 'Not found';
  elements.resultEmail.textContent = email;
  
  // Status badge
  if (contact.email) {
    elements.resultStatus.textContent = 'Found';
    elements.resultStatus.classList.remove('no-email');
  } else {
    elements.resultStatus.textContent = 'No Email';
    elements.resultStatus.classList.add('no-email');
  }
  
  // Show success links section
  elements.successLinksSection?.classList.remove('hidden');
}

// Update credits display
function updateCredits(credits) {
  if (elements.creditsCount && credits !== null && credits !== undefined) {
    elements.creditsCount.textContent = credits;
  }
  currentState.credits = credits;
  updateMeetingButtonState();
}

// Silently refresh the Firebase token by delegating to the background service worker.
// The canonical refreshAuthToken() lives in background.js; this avoids duplicating that logic.
// Returns the new token, or null if silent refresh fails.
async function refreshAuthToken() {
  console.log('[Offerloop Popup] Requesting token refresh from background...');

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'refreshToken' }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });

    if (!response || !response.success) {
      console.warn('[Offerloop Popup] Background token refresh failed:', response?.error);
      return null;
    }

    // Sync the popup's in-memory state with what the background stored
    currentState.authToken = response.token;
    currentState.isLoggedIn = true;
    currentState.user = {
      email: response.userEmail,
      name: response.userName,
      picture: response.userPhoto,
    };
    currentState.credits = response.credits;

    if (response.credits !== undefined) {
      updateCredits(response.credits);
    }

    console.log('[Offerloop Popup] Token refreshed successfully via background');
    return response.token;

  } catch (error) {
    console.warn('[Offerloop Popup] Silent refresh failed:', error.message);
    return null;
  }
}

// Handle login with browser.identity.launchWebAuthFlow (Safari-compatible)
async function handleLogin() {
  console.log('[Offerloop Popup] Login clicked');

  try {
    // Build Google OAuth implicit grant URL
    const clientId = '184607281467-bv1qomua1ndf3jo0tdmpjvte4ukbkcli.apps.googleusercontent.com';
    const redirectUri = browser.identity.getRedirectURL();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile');
    authUrl.searchParams.set('prompt', 'select_account');

    // Launch the web auth flow
    const redirectUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    // Extract access_token from the hash fragment
    const hashParams = new URLSearchParams(new URL(redirectUrl).hash.substring(1));
    const googleToken = hashParams.get('access_token');

    if (!googleToken) {
      throw new Error('No access token received from Google');
    }

    console.log('[Offerloop Popup] Got Google auth token');

    // Send Google token to backend to exchange for Firebase token
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/google-extension`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ googleToken }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'Authentication failed');
    }

    const data = await response.json();

    if (!data.success || !data.token) {
      throw new Error(data.error || 'Authentication failed');
    }

    console.log('[Offerloop Popup] Sign-in successful:', data.user.email);

    // Save to Chrome storage
    await chrome.storage.local.set({
      authToken: data.token,
      isLoggedIn: true,
      userEmail: data.user.email,
      userName: data.user.name,
      userPhoto: data.user.picture,
      credits: data.credits,
    });

    currentState.authToken = data.token;
    currentState.isLoggedIn = true;
    currentState.user = data.user;
    currentState.credits = data.credits;

    // Update credits display
    if (data.credits !== undefined) {
      updateCredits(data.credits);
    }

    await checkAndShowContent();

  } catch (error) {
    console.error('[Offerloop Popup] Login error:', error);
    showError(error.message || 'Sign-in failed. Please try again.');
  }
}

// Handle sign out
async function handleSignOut() {
  console.log('[Offerloop Popup] Sign out clicked');

  try {
    // Clear Chrome storage
    await chrome.storage.local.set({
      authToken: null,
      isLoggedIn: false,
      userEmail: null,
      userName: null,
      userPhoto: null,
      credits: null,
    });

    // Reset state
    currentState.authToken = null;
    currentState.isLoggedIn = false;
    currentState.user = null;
    currentState.credits = null;

    // Show login section
    showSection('login');
    updateCredits('--');

  } catch (error) {
    console.error('[Offerloop Popup] Sign out error:', error);
  }
}

// Handle Find Email button click
async function handleFindEmail() {
  if (_actionInProgress) return;
  _actionInProgress = true;
  if (!currentState.linkedInUrl) {
    showError('No LinkedIn URL detected. Please navigate to a profile page.');
    return;
  }
  
  if (!currentState.authToken) {
    showError('Please sign in to Offerloop first.');
    return;
  }
  
  showLoading('Finding email and generating draft...');
  
  try {
    // Call backend via background script
    const response = await chrome.runtime.sendMessage({
      action: 'importLinkedIn',
      linkedInUrl: currentState.linkedInUrl,
      authToken: currentState.authToken,
    });
    
    console.log('[Offerloop Popup] API Response:', response);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Update credits
    if (response.credits_remaining !== undefined) {
      updateCredits(response.credits_remaining);
      _creditsCacheTime = Date.now();
      currentState.credits = response.credits_remaining;
      chrome.storage.local.set({ credits: response.credits_remaining });
    }
    
    // Show results
    const contact = response.contact || response;
    showResults({
      full_name: contact.full_name,
      email: contact.email,
      company: contact.company,
      jobTitle: contact.jobTitle || contact.title,
      draft_url: response.draft_url || contact.draft_url,
      gmailDraftUrl: response.gmailDraftUrl,
    });
    
  } catch (error) {
    console.error('[Offerloop Popup] Error:', error);
    showError(error.message || 'Failed to find email. Please try again.');
  } finally {
    _actionInProgress = false;
  }
}

// Get current tab info
async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch (error) {
    console.error('[Offerloop Popup] Error getting current tab:', error);
    return null;
  }
}

// Check if on LinkedIn profile
async function checkLinkedInProfile() {
  const tab = await getCurrentTab();
  
  if (!tab?.url) {
    return { isProfilePage: false, linkedInUrl: null };
  }
  
  const url = tab.url;
  const isProfilePage = url.includes('linkedin.com/in/');
  
  if (isProfilePage) {
    // Clean the URL
    const match = url.match(/https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+/);
    const linkedInUrl = match ? match[0] : url.split('?')[0].split('#')[0];
    return { isProfilePage: true, linkedInUrl };
  }
  
  return { isProfilePage: false, linkedInUrl: null };
}

// Check auth state and show appropriate content
async function checkAndShowContent() {
  // Check if on LinkedIn profile
  const { isProfilePage, linkedInUrl } = await checkLinkedInProfile();
  currentState.isProfilePage = isProfilePage;
  currentState.linkedInUrl = linkedInUrl;
  
  if (!isProfilePage) {
    console.log('[Offerloop Popup] Not on LinkedIn profile');
    showSection('noProfile');
    return;
  }
  
  console.log('[Offerloop Popup] On LinkedIn profile:', linkedInUrl);
  showSection('profile');
  
  // Update UI with LinkedIn URL
  if (elements.profileUrl && linkedInUrl) {
    const displayUrl = linkedInUrl.replace('https://www.linkedin.com', 'linkedin.com').replace('https://linkedin.com', 'linkedin.com');
    elements.profileUrl.textContent = displayUrl;
  }
  
  // Fetch credits from backend (with cache to avoid redundant calls)
  if (currentState.authToken) {
    const now = Date.now();
    if (currentState.credits !== null && (now - _creditsCacheTime) < CREDITS_CACHE_TTL) {
      // Use cached credits
      updateCredits(currentState.credits);
    } else {
      try {
        const creditsResponse = await chrome.runtime.sendMessage({
          action: 'getCredits',
          authToken: currentState.authToken,
        });

        if (creditsResponse.credits !== undefined) {
          updateCredits(creditsResponse.credits);
          currentState.credits = creditsResponse.credits;
          _creditsCacheTime = now;
          chrome.storage.local.set({ credits: creditsResponse.credits });
        }
      } catch (error) {
        console.error('[Offerloop Popup] Error fetching credits:', error);
      }
    }
  }
}

// Load auth state from Chrome storage
async function loadAuthState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken', 'isLoggedIn', 'credits', 'userEmail', 'userName', 'userPhoto'], (result) => {
      currentState.authToken = result.authToken || null;
      currentState.isLoggedIn = result.isLoggedIn || false;
      currentState.credits = result.credits || null;
      currentState.userEmail = result.userEmail || null;
      currentState.userName = result.userName || null;
      currentState.userPhoto = result.userPhoto || null;
      // Reconstruct user object if we have the data
      if (result.userEmail) {
        currentState.user = {
          email: result.userEmail,
          name: result.userName,
          picture: result.userPhoto,
        };
      }
      resolve(result);
    });
  });
}

// Auth state is managed via Chrome storage, no Firebase listener needed

// Initialize popup
async function init() {
  console.log('[Offerloop Popup] Initializing...');
  
  initElements();
  initEventListeners();
  initTabSwitcher();
  initJobTabListeners();
  
  // Get current tab URL and detect mode
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const mode = detectMode(tab.url);
      switchTab(mode);
      console.log('[Offerloop Popup] Detected mode:', mode, 'for URL:', tab.url);
    }
  } catch (error) {
    console.error('[Offerloop Popup] Error detecting mode:', error);
  }
  
  // Load stored auth state
  await loadAuthState();
  
  // Update credits display and meeting button state
  if (currentState.credits !== null) {
    updateCredits(currentState.credits);
  } else {
    updateMeetingButtonState();
  }
  
  // Check if already logged in
  if (currentState.isLoggedIn && currentState.authToken) {
    console.log('[Offerloop Popup] Already signed in:', currentState.userEmail);
    
    // Proactively refresh token to avoid expired token errors
    const freshToken = await refreshAuthToken();
    if (!freshToken) {
      console.log('[Offerloop Popup] Token refresh failed, showing login');
      // Clear stale auth state
      await chrome.storage.local.set({
        authToken: null,
        isLoggedIn: false,
      });
      currentState.authToken = null;
      currentState.isLoggedIn = false;
      showSection('login');
      return;
    }
    
    await checkAndShowContent();
  } else {
    console.log('[Offerloop Popup] Not logged in');
    showSection('login');
  }
}

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', init);