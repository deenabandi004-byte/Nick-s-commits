/**
 * Shared utilities for resume upload and management
 * Provides a single source of truth for resume handling across the app
 */

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { storage, db } from './firebase';
import { auth } from './firebase';

export interface ResumeData {
  resumeUrl: string;
  resumeFileName: string;
  resumeParsed?: {
    name?: string;
    university?: string;
    major?: string;
    year?: string;
  };
  resumeUpdatedAt: string;
}

/**
 * Upload resume to Firebase Storage and update Firestore
 * This is the single source of truth for resume uploads
 */
export async function uploadResume(
  file: File,
  userId: string,
  parseResume: boolean = true
): Promise<ResumeData> {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Please upload a PDF file');
  }

  // 1. Parse resume via backend if needed
  let parsedData: any = {};
  if (parseResume) {
    try {
      const formData = new FormData();
      formData.append('resume', file);

      const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://www.offerloop.ai';

      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const response = await fetch(`${API_URL}/api/parse-resume`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        parsedData = result.data || {};
      }
    } catch (error) {
      console.warn('Resume parsing failed, continuing without parsed data:', error);
    }
  }

  // 2. Delete old resume if exists
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  const existingData = userSnap.exists() ? userSnap.data() : {};
  
  if (existingData.resumeUrl) {
    try {
      // Extract the path from the full URL
      const url = new URL(existingData.resumeUrl);
      const pathParts = url.pathname.split('/');
      const pathIndex = pathParts.findIndex(part => part === 'resumes');
      if (pathIndex !== -1) {
        const resumePath = pathParts.slice(pathIndex).join('/');
        const oldRef = ref(storage, resumePath);
        await deleteObject(oldRef);
      }
    } catch (error) {
      console.warn('Failed to delete old resume, continuing:', error);
    }
  }

  // 3. Upload new resume to Firebase Storage
  const timestamp = Date.now();
  const storagePath = `resumes/${userId}/${timestamp}-${file.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);

  // 4. Get download URL
  const downloadUrl = await getDownloadURL(storageRef);

  // 5. Update Firestore with resume data
  const resumeData: ResumeData = {
    resumeUrl: downloadUrl,
    resumeFileName: file.name,
    resumeParsed: parsedData.name || parsedData.university || parsedData.major || parsedData.year
      ? {
          name: parsedData.name || '',
          university: parsedData.university || '',
          major: parsedData.major || '',
          year: parsedData.year || '',
        }
      : undefined,
    resumeUpdatedAt: new Date().toISOString(),
  };

  await setDoc(userRef, resumeData, { merge: true });

  return resumeData;
}

/**
 * Get resume data from Firestore
 */
export async function getResumeFromFirestore(userId: string): Promise<ResumeData | null> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return null;
    }

    const data = userSnap.data();
    
    if (!data.resumeUrl) {
      return null;
    }

    return {
      resumeUrl: data.resumeUrl,
      resumeFileName: data.resumeFileName || 'Resume.pdf',
      resumeParsed: data.resumeParsed,
      resumeUpdatedAt: data.resumeUpdatedAt || new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to get resume from Firestore:', error);
    return null;
  }
}

/**
 * Delete resume from Storage and Firestore
 */
export async function deleteResume(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  const data = userSnap.exists() ? userSnap.data() : {};

  // Delete from Storage
  if (data.resumeUrl) {
    try {
      const url = new URL(data.resumeUrl);
      const pathParts = url.pathname.split('/');
      const pathIndex = pathParts.findIndex(part => part === 'resumes');
      if (pathIndex !== -1) {
        const resumePath = pathParts.slice(pathIndex).join('/');
        const fileRef = ref(storage, resumePath);
        await deleteObject(fileRef);
      }
    } catch (error) {
      console.warn('Failed to delete resume from storage:', error);
    }
  }

  // Clear from Firestore
  await updateDoc(userRef, {
    resumeUrl: null,
    resumeFileName: null,
    resumeParsed: null,
    resumeUpdatedAt: null,
  });
}

/**
 * Download resume file from URL as a File object for form submission
 * Used when Home page needs to auto-load resume from Firestore
 */
export async function downloadResumeAsFile(resumeUrl: string): Promise<File | null> {
  try {
    const response = await fetch(resumeUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch resume');
    }

    const blob = await response.blob();
    
    // Try to extract filename from URL or use default
    const urlParts = resumeUrl.split('/');
    const filename = urlParts[urlParts.length - 1].split('?')[0] || 'resume.pdf';
    
    return new File([blob], filename, { type: 'application/pdf' });
  } catch (error) {
    console.error('Failed to download resume as file:', error);
    return null;
  }
}

