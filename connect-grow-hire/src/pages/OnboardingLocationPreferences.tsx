import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, MapPin, ChevronsUpDown, Check, X, Loader2 } from "lucide-react";
import careerIllustration from "@/assets/career-illustration.png";
import { cn } from "@/lib/utils";

interface LocationPreferences {
  country: string;
  state: string;
  city: string;
  jobTypes: string[];
  interests: string[];
  preferredLocation: string[];
}

interface OnboardingLocationPreferencesProps {
  onNext: (data: LocationPreferences) => void;
  onBack: () => void;
  initialData?: LocationPreferences;
  isSubmitting?: boolean; // ← ADDED THIS
}

const interests = [
  "Accounting", "Advertising (Traditional Media)", "Advertising Technology (AdTech)", "Aerospace & Aviation",
  "Agriculture & Agribusiness", "Animation", "Apparel & Footwear Retail", "Architecture",
  "Artificial Intelligence / Machine Learning", "Auditing", "Automotive Industry", "Banking",
  "Beauty & Cosmetics", "Biotech Research", "Biotechnology", "Blockchain & Web3",
  "Childcare & Early Education", "Chemical Engineering", "Civil Engineering", "Cloud Computing",
  "Commercial Real Estate", "Construction Management", "Consumer Packaged Goods (CPG)", "Corporate Training",
  "Cyber-Physical Systems (IoT)", "Cybersecurity", "Data Science & Analytics", "Defense Contracting",
  "Digital Media & Streaming", "E-commerce", "EdTech", "Educational Technology", "Electrical Engineering",
  "Energy (Oil, Gas, Renewables)", "Entertainment (Film & TV Production)", "Environmental Consulting",
  "Event Planning", "Fashion & Apparel", "Film & Television Production",
  "Finance (Wealth Management, Private Equity, Hedge Funds)", "FinTech", "Fitness & Wellness",
  "Food & Beverage Production", "Food & Restaurants", "Freight & Shipping Services", "Gaming & Esports",
  "Government Administration", "Graphic Design", "Green Technology", "Health Insurance", "HealthTech",
  "Hedge Funds", "Higher Education / Universities", "Homeland Security", "Hospitals & Clinical Care",
  "Hospitality Management", "Human Resources / Recruiting", "Humanitarian Aid & Relief", "Immigration Services",
  "Industrial Manufacturing", "Influencer Marketing", "Insurance", "Intelligence & National Security",
  "International Development", "International Relations", "Investment Banking", "Journalism",
  "K–12 Education", "Law (Corporate, Criminal, Civil)", "Legal Tech", "Logistics & Transportation",
  "Luxury Goods", "Management Consulting", "Manufacturing Automation", "Marine & Shipping Industry",
  "Marketing & Advertising", "Mechanical Engineering", "Medical Devices", "Mental Health Services",
  "Military & Defense", "Mining & Natural Resources", "Music Industry", "Nonprofit Management",
  "Nursing", "Performing Arts", "Pharmaceuticals", "Philanthropy", "Physical Therapy & Rehabilitation",
  "Photography", "Political Campaigns", "Policy & Advocacy", "Private Equity", "Property Management",
  "Public Health", "Public Policy", "Public Transit Systems", "Publishing & Writing",
  "Real Estate Development", "Real Estate Finance", "Renewable Energy (Solar, Wind, Hydro)",
  "Residential Real Estate", "Retail & Consumer Services", "Robotics", "Social Media Management",
  "Social Work", "Software Development", "Space Exploration & Commercial Space", "Sports Management",
  "Strategy Consulting", "Supply Chain & Logistics", "Sustainability & Climate Tech", "Tax Services",
  "Telecommunications", "Telemedicine", "Transportation Infrastructure", "Travel & Tourism",
  "Urban Planning", "UX/UI Design", "Venture Capital", "Veterinary Services",
  "Virtual & Augmented Reality", "Waste Management & Recycling", "Wealth Management",
  "Wholesale & Distribution", "Wine, Beer & Spirits"
];

const locations = [
  "Akron, OH", "Albany, NY", "Albuquerque, NM", "Alexandria, VA", "Allentown, PA", "Anaheim, CA",
  "Ann Arbor, MI", "Arlington, TX", "Arlington, VA", "Atlanta, GA", "Austin, TX", "Bakersfield, CA",
  "Baltimore, MD", "Baton Rouge, LA", "Birmingham, AL", "Boise, ID", "Boston, MA", "Boulder, CO",
  "Buffalo, NY", "Burlington, VT", "Chapel Hill, NC", "Charleston, SC", "Charleston, WV", "Charlotte, NC",
  "Chattanooga, TN", "Chicago, IL", "Cincinnati, OH", "Cleveland, OH", "College Station, TX", "Colorado Springs, CO",
  "Columbia, MO", "Columbia, SC", "Columbus, OH", "Dallas, TX", "Dayton, OH", "Denver, CO",
  "Des Moines, IA", "Detroit, MI", "Durham, NC", "El Paso, TX", "Evansville, IN", "Evanston, IL",
  "Fayetteville, AR", "Fort Collins, CO", "Fort Lauderdale, FL", "Fort Worth, TX", "Fresno, CA", "Gainesville, FL",
  "Grand Rapids, MI", "Greensboro, NC", "Greenville, SC", "Harrisburg, PA", "Hartford, CT", "Houston, TX",
  "Huntsville, AL", "Indianapolis, IN", "Irvine, CA", "Ithaca, NY", "Jacksonville, FL", "Jersey City, NJ",
  "Kansas City, MO", "Knoxville, TN", "Lafayette, IN", "Lancaster, PA", "Lansing, MI", "Las Vegas, NV",
  "Lexington, KY", "Lincoln, NE", "Little Rock, AR", "Long Beach, CA", "Los Angeles, CA", "Louisville, KY",
  "Madison, WI", "Manchester, NH", "Memphis, TN", "Mesa, AZ", "Miami, FL", "Milwaukee, WI",
  "Minneapolis, MN", "Mobile, AL", "Morgantown, WV", "Nashville, TN", "Naples, FL", "Naperville, IL",
  "New Haven, CT", "New Orleans, LA", "New York, NY", "Newark, NJ", "Norfolk, VA", "Oakland, CA",
  "Oklahoma City, OK", "Omaha, NE", "Orlando, FL", "Pasadena, CA", "Peoria, IL", "Philadelphia, PA",
  "Phoenix, AZ", "Pittsburgh, PA", "Plano, TX", "Portland, OR", "Providence, RI", "Provo, UT",
  "Raleigh, NC", "Reno, NV", "Richmond, VA", "Riverside, CA", "Rochester, NY", "Sacramento, CA",
  "Salt Lake City, UT", "San Antonio, TX", "San Diego, CA", "San Francisco, CA", "San Jose, CA", "San Luis Obispo, CA",
  "Santa Ana, CA", "Santa Barbara, CA", "Santa Clara, CA", "Sarasota, FL", "Savannah, GA", "Scottsdale, AZ",
  "Seattle, WA", "Shreveport, LA", "Springfield, IL", "Springfield, MA", "Springfield, MO", "Stamford, CT",
  "State College, PA", "St. Louis, MO", "St. Paul, MN", "St. Petersburg, FL", "Syracuse, NY", "Tallahassee, FL",
  "Tampa, FL", "Tempe, AZ", "Toledo, OH", "Topeka, KS", "Tucson, AZ", "Tulsa, OK",
  "Virginia Beach, VA", "Washington, DC", "West Palm Beach, FL", "White Plains, NY", "Wichita, KS", "Wilmington, DE",
  "Winston-Salem, NC", "Worcester, MA", "Ypsilanti, MI", "San Bernardino, CA", "Glendale, AZ", "Alexandria, LA"
];

export const OnboardingLocationPreferences = ({ 
  onNext, 
  onBack, 
  initialData,
  isSubmitting = false // ← ADDED THIS with default value
}: OnboardingLocationPreferencesProps) => {
  const [preferences, setPreferences] = useState<LocationPreferences>({
    country: initialData?.country || "",
    state: initialData?.state || "",
    city: initialData?.city || "",
    jobTypes: initialData?.jobTypes || [],
    interests: initialData?.interests || [],
    preferredLocation: initialData?.preferredLocation || [],
  });
  
  const [open, setOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext(preferences);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start px-4">
      <div className="space-y-8">
        <div className="space-y-6">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            Career{" "}
            <span className="text-[#3B82F6]">
              Preferences
            </span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            Help us understand where you'd like to work and what type of positions interest you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 mt-8 lg:mt-12">
          <div className="space-y-4">
            <Label className="text-foreground font-medium">Job Type(s) Interested In</Label>
            <p className="text-sm text-muted-foreground">Select all job types you're interested in</p>
            <div className="space-y-3">
              {['Internship', 'Part-Time', 'Full-Time'].map((jobType) => (
                <div key={jobType} className="flex items-center space-x-2">
                  <Checkbox
                    id={jobType.toLowerCase().replace('-', '')}
                    checked={preferences.jobTypes.includes(jobType)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setPreferences(prev => ({
                          ...prev,
                          jobTypes: [...prev.jobTypes, jobType]
                        }));
                      } else {
                        setPreferences(prev => ({
                          ...prev,
                          jobTypes: prev.jobTypes.filter(type => type !== jobType)
                        }));
                      }
                    }}
                  />
                  <Label htmlFor={jobType.toLowerCase().replace('-', '')} className="text-sm font-normal">{jobType}</Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-foreground font-medium">Career Interests</Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between h-auto min-h-10 px-3 py-2"
                >
                  <span className="text-left">
                    {preferences.interests.length > 0 
                      ? `${preferences.interests.length} interest${preferences.interests.length === 1 ? '' : 's'} selected`
                      : "Select your career interests"
                    }
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search interests..." className="h-9" />
                  <CommandList className="max-h-[200px]">
                    <CommandEmpty>No interests found.</CommandEmpty>
                    <CommandGroup>
                      {interests.map((interest) => (
                        <CommandItem
                          key={interest}
                          value={interest}
                          onSelect={(currentValue) => {
                            const isSelected = preferences.interests.includes(currentValue);
                            if (isSelected) {
                              setPreferences(prev => ({
                                ...prev,
                                interests: prev.interests.filter(i => i !== currentValue)
                              }));
                            } else {
                              setPreferences(prev => ({
                                ...prev,
                                interests: [...prev.interests, currentValue]
                              }));
                            }
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              preferences.interests.includes(interest) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {interest}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {preferences.interests.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {preferences.interests.map((interest) => (
                  <Badge key={interest} variant="secondary" className="text-xs px-2 py-1">
                    {interest}
                    <button
                      type="button"
                      onClick={() => {
                        setPreferences(prev => ({
                          ...prev,
                          interests: prev.interests.filter(i => i !== interest)
                        }));
                      }}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreferences(prev => ({ ...prev, interests: [] }))}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Label className="text-foreground font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Preferred Location
            </Label>
            <Popover open={locationOpen} onOpenChange={setLocationOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={locationOpen}
                  className="w-full justify-between h-auto min-h-10 px-3 py-2"
                >
                  <span className="text-left">
                    {preferences.preferredLocation.length > 0 
                      ? `${preferences.preferredLocation.length} location${preferences.preferredLocation.length === 1 ? '' : 's'} selected`
                      : "Start typing to find preferred location"
                    }
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Start typing to find preferred location" className="h-9" />
                  <CommandList className="max-h-[200px]">
                    <CommandEmpty>No locations found.</CommandEmpty>
                    <CommandGroup>
                      {locations.map((location) => (
                        <CommandItem
                          key={location}
                          value={location}
                          onSelect={(currentValue) => {
                            const isSelected = preferences.preferredLocation.includes(currentValue);
                            if (isSelected) {
                              setPreferences(prev => ({
                                ...prev,
                                preferredLocation: prev.preferredLocation.filter(l => l !== currentValue)
                              }));
                            } else {
                              setPreferences(prev => ({
                                ...prev,
                                preferredLocation: [...prev.preferredLocation, currentValue]
                              }));
                            }
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              preferences.preferredLocation.includes(location) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {location}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            {preferences.preferredLocation.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {preferences.preferredLocation.map((location) => (
                  <Badge key={location} variant="secondary" className="text-xs px-2 py-1">
                    {location}
                    <button
                      type="button"
                      onClick={() => {
                        setPreferences(prev => ({
                          ...prev,
                          preferredLocation: prev.preferredLocation.filter(l => l !== location)
                        }));
                      }}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreferences(prev => ({ ...prev, preferredLocation: [] }))}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-8">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="px-8 py-3 rounded-full font-semibold"
              disabled={isSubmitting} // ← DISABLE BACK BUTTON WHILE SUBMITTING
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            
            <Button
              type="submit"
              variant="default"
              className="px-12 py-3 rounded-full font-bold group bg-[#3B82F6] hover:opacity-90"
              disabled={isSubmitting} // ← DISABLE SUBMIT BUTTON WHILE SUBMITTING
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
      
      <div className="hidden lg:flex items-center justify-center">
        <img 
          src={careerIllustration} 
          alt="Career preferences illustration" 
          className="w-full max-w-md h-auto object-contain"
        />
      </div>
    </div>
  );
};