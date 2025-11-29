import { ArrowLeft, Upload, Trash2, LogOut, CreditCard, FileText, Save, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { uploadResume, getResumeFromFirestore, deleteResume } from '@/lib/resumeUtils';
import { toast } from "sonner";

export default function AccountSettings() {
  const navigate = useNavigate();
  const { user, signOut } = useFirebaseAuth();
  
  // State for form data - all editable
  const [personalInfo, setPersonalInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    university: "",
  });

  const [academicInfo, setAcademicInfo] = useState({
    graduationMonth: "",
    graduationYear: "",
    fieldOfStudy: "",
    currentDegree: "",
  });

  const [careerInfo, setCareerInfo] = useState({
    interests: [] as string[],
    preferredLocation: [] as string[],
    jobTypes: [] as string[],
    industriesOfInterest: [] as string[],
    preferredJobRole: "",
  });

  // Text state for textarea inputs (allows free typing)
  const [careerTextInputs, setCareerTextInputs] = useState({
    industriesText: "",
    locationsText: "",
    jobTypesText: "",
  });

  // Resume state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeParsed, setResumeParsed] = useState<any>(null);

  // Loading states for Save buttons
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingAcademic, setSavingAcademic] = useState(false);
  const [savingCareer, setSavingCareer] = useState(false);

  // Load user data on mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { auth } = await import('../lib/firebase');
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          
          // Load flat fields directly (not nested)
          setPersonalInfo({
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            email: data.email || user?.email || "",
            phone: data.phone || "",
            university: data.university || "",
          });

          setAcademicInfo({
            graduationMonth: data.graduationMonth || "",
            graduationYear: data.graduationYear || "",
            fieldOfStudy: data.fieldOfStudy || data.major || "",
            currentDegree: data.currentDegree || data.degree || "",
          });

          const interests = data.interests || data.industriesOfInterest || [];
          const locations = data.preferredLocation || data.preferredLocations || [];
          const jobTypes = data.jobTypes || [];

          setCareerInfo({
            interests: interests,
            preferredLocation: locations,
            jobTypes: jobTypes,
            industriesOfInterest: data.industriesOfInterest || interests,
            preferredJobRole: data.preferredJobRole || "",
          });

          // Initialize text inputs with comma-separated values
          setCareerTextInputs({
            industriesText: Array.isArray(interests) ? interests.join(", ") : "",
            locationsText: Array.isArray(locations) ? locations.join(", ") : "",
            jobTypesText: Array.isArray(jobTypes) ? jobTypes.join(", ") : "",
          });

          // Load resume
          if (data.resumeUrl) {
            setResumeUrl(data.resumeUrl);
            setResumeFileName(data.resumeFileName || 'Resume.pdf');
            setResumeParsed(data.resumeParsed || null);
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
        toast.error("Failed to load account data");
      }
    };

    loadUserData();
  }, [user?.email]);

  // Save personal information
  const handleSavePersonal = async () => {
    const { auth } = await import('../lib/firebase');
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSavingPersonal(true);
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        firstName: personalInfo.firstName,
        lastName: personalInfo.lastName,
        phone: personalInfo.phone,
        university: personalInfo.university,
        name: `${personalInfo.firstName} ${personalInfo.lastName}`.trim(),
      });
      toast.success("Personal information saved successfully");
    } catch (error) {
      console.error("Error saving personal info:", error);
      toast.error("Failed to save personal information");
    } finally {
      setSavingPersonal(false);
    }
  };

  // Save academic information
  const handleSaveAcademic = async () => {
    const { auth } = await import('../lib/firebase');
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSavingAcademic(true);
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        graduationMonth: academicInfo.graduationMonth,
        graduationYear: academicInfo.graduationYear,
        fieldOfStudy: academicInfo.fieldOfStudy,
        major: academicInfo.fieldOfStudy, // Backend compatibility
        currentDegree: academicInfo.currentDegree,
        degree: academicInfo.currentDegree, // Backend compatibility
      });
      toast.success("Academic information saved successfully");
    } catch (error) {
      console.error("Error saving academic info:", error);
      toast.error("Failed to save academic information");
    } finally {
      setSavingAcademic(false);
    }
  };

  // Helper to parse comma-separated text to array
  const parseCommaSeparated = (text: string): string[] => {
    return text
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  };

  // Save career information
  const handleSaveCareer = async () => {
    const { auth } = await import('../lib/firebase');
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSavingCareer(true);
    try {
      // Parse text inputs to arrays
      const industries = parseCommaSeparated(careerTextInputs.industriesText);
      const locations = parseCommaSeparated(careerTextInputs.locationsText);
      const jobTypes = parseCommaSeparated(careerTextInputs.jobTypesText);

      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        interests: industries,
        industriesOfInterest: industries,
        preferredLocation: locations,
        preferredLocations: locations, // Backend compatibility
        jobTypes: jobTypes,
        preferredJobRole: careerInfo.preferredJobRole,
        careerInterests: industries, // Backend compatibility
      });

      // Update state arrays
      setCareerInfo(prev => ({
        ...prev,
        interests: industries,
        industriesOfInterest: industries,
        preferredLocation: locations,
        jobTypes: jobTypes,
      }));

      toast.success("Career preferences saved successfully");
    } catch (error) {
      console.error("Error saving career info:", error);
      toast.error("Failed to save career preferences");
    } finally {
      setSavingCareer(false);
    }
  };

  // Handle resume upload
  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError("Please upload a PDF file");
      toast.error("Please upload a PDF file");
      return;
    }

    const { auth } = await import('../lib/firebase');
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.error("Not signed in");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const resumeData = await uploadResume(file, uid, true);
      setResumeUrl(resumeData.resumeUrl);
      setResumeFileName(resumeData.resumeFileName);
      setResumeParsed(resumeData.resumeParsed || null);
      toast.success("Resume uploaded successfully");
      event.target.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle resume deletion
  const handleResumeDelete = async () => {
    const { auth } = await import('../lib/firebase');
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.error("Not signed in");
      return;
    }

    if (!confirm("Are you sure you want to delete your resume?")) {
      return;
    }

    try {
      await deleteResume(uid);
      setResumeUrl(null);
      setResumeFileName(null);
      setResumeParsed(null);
      toast.success("Resume deleted successfully");
    } catch (e) {
      console.error('Delete resume failed', e);
      toast.error('Could not delete resume. Please try again.');
    }
  };

  const handleManageSubscription = async () => {
    try {
      const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://www.offerloop.ai';

      const { auth } = await import('../lib/firebase');
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const response = await fetch(`${API_URL}/api/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Error creating portal session:', error);
      toast.error('Unable to open billing portal. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/home')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Account Settings</h1>
                <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
              </div>
            </div>
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary">
                {personalInfo.firstName && personalInfo.lastName
                  ? `${personalInfo.firstName[0]}${personalInfo.lastName[0]}`
                  : user?.email?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Personal Information Card */}
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-foreground font-medium">First Name</Label>
                  <Input
                    id="firstName"
                    value={personalInfo.firstName}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Enter your first name"
                    className="bg-background text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-foreground font-medium">Last Name</Label>
                  <Input
                    id="lastName"
                    value={personalInfo.lastName}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Enter your last name"
                    className="bg-background text-foreground"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={personalInfo.email}
                  readOnly
                  className="bg-muted/30 text-muted-foreground cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-foreground font-medium">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={personalInfo.phone}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter your phone number"
                    className="bg-background text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="university" className="text-foreground font-medium">University</Label>
                  <Input
                    id="university"
                    value={personalInfo.university}
                    onChange={(e) => setPersonalInfo(prev => ({ ...prev, university: e.target.value }))}
                    placeholder="Enter your university"
                    className="bg-background text-foreground"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSavePersonal}
                  disabled={savingPersonal}
                  className="gap-2"
                >
                  {savingPersonal ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Personal Information
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Academic Information Card */}
          <Card>
            <CardHeader>
              <CardTitle>Academic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="graduationMonth" className="text-foreground font-medium">Graduation Month</Label>
                  <Input
                    id="graduationMonth"
                    value={academicInfo.graduationMonth}
                    onChange={(e) => setAcademicInfo(prev => ({ ...prev, graduationMonth: e.target.value }))}
                    placeholder="e.g. May, December"
                    className="bg-background text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="graduationYear" className="text-foreground font-medium">Graduation Year</Label>
                  <Input
                    id="graduationYear"
                    value={academicInfo.graduationYear}
                    onChange={(e) => setAcademicInfo(prev => ({ ...prev, graduationYear: e.target.value }))}
                    placeholder="e.g. 2024, 2025"
                    className="bg-background text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fieldOfStudy" className="text-foreground font-medium">Field of Study</Label>
                  <Input
                    id="fieldOfStudy"
                    value={academicInfo.fieldOfStudy}
                    onChange={(e) => setAcademicInfo(prev => ({ ...prev, fieldOfStudy: e.target.value }))}
                    placeholder="e.g. Computer Science, Business"
                    className="bg-background text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currentDegree" className="text-foreground font-medium">Current Degree</Label>
                  <Input
                    id="currentDegree"
                    value={academicInfo.currentDegree}
                    onChange={(e) => setAcademicInfo(prev => ({ ...prev, currentDegree: e.target.value }))}
                    placeholder="e.g. Bachelor's, Master's"
                    className="bg-background text-foreground"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveAcademic}
                  disabled={savingAcademic}
                  className="gap-2"
                >
                  {savingAcademic ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Academic Information
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Career Preferences Card */}
          <Card>
            <CardHeader>
              <CardTitle>Career Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="preferredJobRole" className="text-foreground font-medium">Preferred Job Role</Label>
                  <Input
                    id="preferredJobRole"
                    value={careerInfo.preferredJobRole}
                    onChange={(e) => setCareerInfo(prev => ({ ...prev, preferredJobRole: e.target.value }))}
                    placeholder="e.g. Software Engineer, Investment Banking Analyst"
                    className="bg-background text-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industries" className="text-foreground font-medium">Industries of Interest</Label>
                  <Textarea
                    id="industries"
                    value={careerTextInputs.industriesText}
                    onChange={(e) => setCareerTextInputs(prev => ({ 
                      ...prev, 
                      industriesText: e.target.value
                    }))}
                    placeholder="e.g. Investment Banking, Management Consulting, Tech"
                    className="bg-background text-foreground min-h-[80px] resize-y"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Enter industries separated by commas. You can include spaces within each industry name.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="locations" className="text-foreground font-medium">Preferred Locations</Label>
                  <Textarea
                    id="locations"
                    value={careerTextInputs.locationsText}
                    onChange={(e) => setCareerTextInputs(prev => ({ 
                      ...prev, 
                      locationsText: e.target.value
                    }))}
                    placeholder="e.g. New York, Los Angeles, San Francisco"
                    className="bg-background text-foreground min-h-[80px] resize-y"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Enter locations separated by commas. You can include spaces within each location name.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="jobTypes" className="text-foreground font-medium">Job Types</Label>
                  <Textarea
                    id="jobTypes"
                    value={careerTextInputs.jobTypesText}
                    onChange={(e) => setCareerTextInputs(prev => ({ 
                      ...prev, 
                      jobTypesText: e.target.value
                    }))}
                    placeholder="e.g. Full-Time, Internship, Part-Time"
                    className="bg-background text-foreground min-h-[80px] resize-y"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Enter job types separated by commas. You can include spaces within each job type.</p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveCareer}
                  disabled={savingCareer}
                  className="gap-2"
                >
                  {savingCareer ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Career Preferences
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Professional Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle>Professional Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Resume Upload Section */}
              <div className="space-y-4">
                <Label className="text-sm font-medium text-foreground">Resume</Label>
                {resumeUrl ? (
                  <div className="relative bg-muted/30 rounded-lg border p-4">
                    <div className="flex items-start gap-4">
                      <FileText className="h-10 w-10 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-foreground truncate">
                          {resumeFileName || 'Resume.pdf'}
                        </h4>
                        {resumeParsed && (
                          <div className="text-sm text-muted-foreground space-y-1 mt-2">
                            {resumeParsed.name && (
                              <p className="flex items-center gap-2">
                                <span className="font-medium">Name:</span>
                                <span>{resumeParsed.name}</span>
                              </p>
                            )}
                            {resumeParsed.university && (
                              <p className="flex items-center gap-2">
                                <span className="font-medium">University:</span>
                                <span>{resumeParsed.university}</span>
                              </p>
                            )}
                            {resumeParsed.major && (
                              <p className="flex items-center gap-2">
                                <span className="font-medium">Major:</span>
                                <span>{resumeParsed.major}</span>
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex gap-2 mt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (resumeUrl) {
                                window.open(resumeUrl, '_blank');
                              }
                            }}
                          >
                            View Resume
                          </Button>
                          <label htmlFor="resume-replace" className="cursor-pointer">
                            <Button variant="outline" size="sm" asChild>
                              <span>Replace Resume</span>
                            </Button>
                            <input
                              id="resume-replace"
                              type="file"
                              accept=".pdf"
                              onChange={handleResumeUpload}
                              className="hidden"
                              disabled={isUploading}
                            />
                          </label>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleResumeDelete}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-48 bg-muted/30 rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center p-6">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground text-center mb-3">
                      {isUploading ? "Processing resume..." : "No resume uploaded"}
                    </p>
                    {uploadError && (
                      <p className="text-xs text-destructive mb-3">{uploadError}</p>
                    )}
                    <label htmlFor="resume-upload" className="cursor-pointer">
                      <Button variant="outline" size="sm" disabled={isUploading} asChild>
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          {isUploading ? "Uploading..." : "Upload Resume"}
                        </span>
                      </Button>
                      <input
                        id="resume-upload"
                        type="file"
                        accept=".pdf"
                        onChange={handleResumeUpload}
                        className="hidden"
                        disabled={isUploading}
                      />
                    </label>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Account Management Section */}
          <Card>
            <CardHeader>
              <CardTitle>Account Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                <div>
                  <h4 className="font-medium text-foreground mb-1">Subscription</h4>
                  <p className="text-sm text-muted-foreground">
                    Manage your subscription plan and billing settings
                  </p>
                  {user?.tier && (
                    <p className="text-xs text-muted-foreground mt-1 capitalize">
                      Current: {user.tier} tier
                    </p>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleManageSubscription}
                  className="flex items-center gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  Manage Subscription
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
                <div>
                  <h4 className="font-medium text-foreground mb-1">Sign Out</h4>
                  <p className="text-sm text-muted-foreground">
                    Sign out of your account on this device
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSignOut}
                  className="flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}