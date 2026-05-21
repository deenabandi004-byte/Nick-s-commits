import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowRight, ArrowLeft, Check, ChevronsUpDown } from "lucide-react";
import academicIllustration from "@/assets/academic-illustration.png";
import { cn } from "@/lib/utils";

interface AcademicData {
  university: string;
  degree: string;
  major: string;
  graduationMonth: string;
  graduationYear: string;
}

interface LinkedinAcademicData {
  university?: string;
  major?: string;
  degree?: string;
  graduationYear?: string;
}

interface OnboardingAcademicsProps {
  onNext: (data: AcademicData) => void;
  onBack: () => void;
  initialData?: AcademicData;
  linkedinData?: LinkedinAcademicData | null;
}

const universities = [
  "Other",
  "Abilene Christian University",
  "Adelphi University",
  "Agnes Scott College",
  "Air Force Academy (USAFA)",
  "Alabama A&M University",
  "Alabama State University",
  "Alaska Pacific University",
  "Albany State University",
  "Alcorn State University",
  "American University",
  "Amherst College",
  "Appalachian State University",
  "Arizona State University",
  "Arkansas State University",
  "Auburn University",
  "Augsburg University",
  "Augustana College",
  "Babson College",
  "Ball State University",
  "Bard College",
  "Barnard College",
  "Barry University",
  "Baylor University",
  "Bellarmine University",
  "Belmont University",
  "Beloit College",
  "Bemidji State University",
  "Bentley University",
  "Berea College",
  "Berklee College of Music",
  "Berry College",
  "Bethune Cookman University",
  "Binghamton University (SUNY)",
  "Biola University",
  "Birmingham-Southern College",
  "Boise State University",
  "Boston College",
  "Boston University",
  "Bowdoin College",
  "Bowling Green State University",
  "Bradley University",
  "Brandeis University",
  "Brigham Young University",
  "Brown University",
  "Bryn Mawr College",
  "Bucknell University",
  "Butler University",
  "California Institute of Technology (Caltech)",
  "California Polytechnic State University, San Luis Obispo (Cal Poly)",
  "California State Polytechnic University, Pomona",
  "California State University, Bakersfield",
  "California State University, Channel Islands",
  "California State University, Chico",
  "California State University, Dominguez Hills",
  "California State University, East Bay",
  "California State University, Fresno",
  "California State University, Fullerton",
  "California State University, Long Beach",
  "California State University, Los Angeles",
  "California State University, Monterey Bay",
  "California State University, Northridge",
  "California State University, Sacramento",
  "California State University, San Bernardino",
  "California State University, San Diego",
  "California State University, San Francisco",
  "California State University, San Jose",
  "California State University, San Marcos",
  "California State University, Sonoma",
  "California State University, Stanislaus",
  "Carleton College",
  "Carnegie Mellon University",
  "Carroll College",
  "Case Western Reserve University",
  "Catholic University of America",
  "Central Michigan University",
  "Centre College",
  "Chapman University",
  "Charleston Southern University",
  "Chatham University",
  "Chicago State University",
  "Claremont McKenna College",
  "Clark Atlanta University",
  "Clark University",
  "Clemson University",
  "Cleveland State University",
  "Colby College",
  "Colgate University",
  "College of Charleston",
  "College of William & Mary",
  "Colorado College",
  "Colorado School of Mines",
  "Colorado State University",
  "Columbia College Chicago",
  "Columbia University",
  "Concordia College",
  "Connecticut College",
  "Cooper Union",
  "Cornell University",
  "Creighton University",
  "Dartmouth College",
  "Davidson College",
  "Delaware State University",
  "Denison University",
  "DePaul University",
  "DePauw University",
  "Dickinson College",
  "Drake University",
  "Drew University",
  "Drexel University",
  "Duke University",
  "Duquesne University",
  "East Carolina University",
  "East Tennessee State University",
  "Eastern Illinois University",
  "Eastern Kentucky University",
  "Eastern Michigan University",
  "Eckerd College",
  "Elmhurst University",
  "Elon University",
  "Embry Riddle Aeronautical University",
  "Emerson College",
  "Emory University",
  "Fairfield University",
  "Fairleigh Dickinson University",
  "Fayetteville State University",
  "Ferris State University",
  "Fisk University",
  "Flagler College",
  "Florida A&M University",
  "Florida Atlantic University",
  "Florida Gulf Coast University",
  "Florida International University",
  "Florida State University",
  "Fordham University",
  "Fort Valley State University",
  "Franklin & Marshall College",
  "Furman University",
  "Gallaudet University",
  "George Mason University",
  "George Washington University",
  "Georgetown University",
  "Georgia Institute of Technology (Georgia Tech)",
  "Georgia Southern University",
  "Georgia State University",
  "Gettysburg College",
  "Gonzaga University",
  "Goucher College",
  "Grambling State University",
  "Grand Valley State University",
  "Grinnell College",
  "Hamilton College",
  "Hampton University",
  "Hanover College",
  "Harvard University",
  "Harvey Mudd College",
  "Haverford College",
  "Hawaii Pacific University",
  "High Point University",
  "Hillsdale College",
  "Hofstra University",
  "Hollins University",
  "Holy Cross College",
  "Hope College",
  "Howard University",
  "Hunter College (CUNY)",
  "Idaho State University",
  "Illinois State University",
  "Illinois Wesleyan University",
  "Indiana State University",
  "Indiana University Bloomington",
  "Indiana University-Purdue University Indianapolis",
  "Iona University",
  "Iowa State University",
  "Ithaca College",
  "Jackson State University",
  "James Madison University",
  "John Carroll University",
  "Johns Hopkins University",
  "Johnson & Wales University",
  "Judson University",
  "Kalamazoo College",
  "Kansas State University",
  "Kent State University",
  "Kenyon College",
  "Knox College",
  "Lafayette College",
  "Lake Forest College",
  "Lamar University",
  "LaSalle University",
  "Lawrence University",
  "Lehigh University",
  "Lewis & Clark College",
  "Liberty University",
  "Lincoln University",
  "Lipscomb University",
  "Long Island University",
  "Louisiana State University (LSU)",
  "Loyola Marymount University",
  "Loyola University Chicago",
  "Loyola University Maryland",
  "Loyola University New Orleans",
  "Macalester College",
  "Manhattan College",
  "Marist College",
  "Marquette University",
  "Marshall University",
  "Massachusetts Institute of Technology (MIT)",
  "McGill University (USA-Canada border draw)",
  "Mercer University",
  "Meredith College",
  "Merrimack College",
  "Miami University (Ohio)",
  "Michigan State University",
  "Michigan Technological University",
  "Middlebury College",
  "Millikin University",
  "Millsaps College",
  "Mississippi State University",
  "Mississippi Valley State University",
  "Missouri State University",
  "Missouri University of Science & Technology",
  "Monmouth University",
  "Montana State University",
  "Morehouse College",
  "Morgan State University",
  "Mount Holyoke College",
  "Muhlenberg College",
  "Murray State University",
  "Naval Academy (USNA)",
  "Nebraska Wesleyan University",
  "New Jersey Institute of Technology",
  "New Mexico State University",
  "New York Institute of Technology",
  "New York University",
  "North Carolina A&T State University",
  "North Carolina State University",
  "North Dakota State University",
  "Northeastern University",
  "Northern Arizona University",
  "Northern Illinois University",
  "Northern Kentucky University",
  "Northwestern University",
  "Norwich University",
  "Notre Dame University",
  "Oberlin College",
  "Occidental College",
  "Ohio State University",
  "Ohio University",
  "Oklahoma State University",
  "Old Dominion University",
  "Oregon State University",
  "Pace University",
  "Pacific Lutheran University",
  "Pacific University",
  "Pennsylvania State University (Penn State)",
  "Pepperdine University",
  "Pitzer College",
  "Pomona College",
  "Portland State University",
  "Prairie View A&M University",
  "Princeton University",
  "Providence College",
  "Purdue University",
  "Quinnipiac University",
  "Radford University",
  "Ramapo College",
  "Reed College",
  "Rensselaer Polytechnic Institute (RPI)",
  "Rhode Island School of Design (RISD)",
  "Rice University",
  "Rider University",
  "Ripon College",
  "Rochester Institute of Technology (RIT)",
  "Rockhurst University",
  "Rollins College",
  "Roosevelt University",
  "Rowan University",
  "Rutgers University",
  "Saint Joseph's University",
  "Saint Louis University",
  "Saint Mary's College",
  "Saint Mary's College of California",
  "Sam Houston State University",
  "Samford University",
  "San Diego State University",
  "San Francisco State University",
  "San Jose State University",
  "Santa Clara University",
  "Sarah Lawrence College",
  "Savannah College of Art & Design",
  "Scripps College",
  "Seattle Pacific University",
  "Seattle University",
  "Seton Hall University",
  "Sewanee: The University of the South",
  "Siena College",
  "Simmons University",
  "Skidmore College",
  "Smith College",
  "Sonoma State University",
  "South Carolina State University",
  "South Dakota State University",
  "Southeastern Louisiana University",
  "Southern Illinois University",
  "Southern Methodist University (SMU)",
  "Spelman College",
  "St. John's University",
  "Stanford University",
  "Stetson University",
  "Stevens Institute of Technology",
  "Stony Brook University (SUNY)",
  "Suffolk University",
  "SUNY Albany",
  "SUNY Binghamton",
  "SUNY Buffalo",
  "SUNY Geneseo",
  "SUNY New Paltz",
  "SUNY Oneonta",
  "SUNY Oswego",
  "SUNY Plattsburgh",
  "SUNY Potsdam",
  "Swarthmore College",
  "Syracuse University",
  "Temple University",
  "Tennessee State University",
  "Tennessee Tech University",
  "Texas A&M University",
  "Texas Christian University",
  "Texas Southern University",
  "Texas State University",
  "Texas Tech University",
  "The College of New Jersey",
  "The New School",
  "The Ohio State University",
  "The University of Alabama",
  "The University of Arizona",
  "The University of Georgia",
  "The University of Iowa",
  "The University of Kansas",
  "The University of Kentucky",
  "The University of Memphis",
  "The University of Mississippi (Ole Miss)",
  "The University of Montana",
  "The University of New Mexico",
  "The University of North Carolina at Chapel Hill",
  "The University of North Carolina at Greensboro",
  "The University of North Dakota",
  "The University of Oklahoma",
  "The University of Oregon",
  "The University of South Carolina",
  "The University of Tennessee",
  "The University of Texas at Arlington",
  "The University of Texas at Austin",
  "The University of Texas at Dallas",
  "The University of Texas at El Paso",
  "The University of Texas at San Antonio",
  "The University of Toledo",
  "The University of Tulsa",
  "The University of Utah",
  "The University of Vermont",
  "The University of Virginia",
  "The University of Washington",
  "The University of Wisconsin-Madison",
  "Towson University",
  "Trinity College",
  "Trinity University",
  "Troy University",
  "Truman State University",
  "Tufts University",
  "Tulane University",
  "Tuskegee University",
  "Union College",
  "United States Coast Guard Academy",
  "United States Merchant Marine Academy",
  "United States Military Academy (West Point)",
  "United States Naval Academy",
  "University at Albany (SUNY)",
  "University at Buffalo (SUNY)",
  "University of Akron",
  "University of Alabama",
  "University of Alabama at Birmingham",
  "University of Alabama in Huntsville",
  "University of Alaska Anchorage",
  "University of Alaska Fairbanks",
  "University of Arizona",
  "University of Arkansas",
  "University of Arkansas at Little Rock",
  "University of Arkansas at Pine Bluff",
  "University of Baltimore",
  "University of California, Berkeley (UC Berkeley)",
  "University of California, Davis (UC Davis)",
  "University of California, Irvine (UC Irvine)",
  "University of California, Los Angeles (UCLA)",
  "University of California, Merced",
  "University of California, Riverside (UC Riverside)",
  "University of California, San Diego (UCSD)",
  "University of California, San Francisco (UCSF)",
  "University of California, Santa Barbara (UCSB)",
  "University of California, Santa Cruz (UCSC)",
  "University of Central Arkansas",
  "University of Central Florida",
  "University of Central Missouri",
  "University of Central Oklahoma",
  "University of Charleston",
  "University of Chicago",
  "University of Cincinnati",
  "University of Colorado Boulder",
  "University of Colorado Colorado Springs",
  "University of Colorado Denver",
  "University of Connecticut",
  "University of Dayton",
  "University of Delaware",
  "University of Denver",
  "University of Detroit Mercy",
  "University of Evansville",
  "University of Florida",
  "University of Georgia",
  "University of Hartford",
  "University of Hawaii at Manoa",
  "University of Houston",
  "University of Idaho",
  "University of Illinois Chicago",
  "University of Illinois Springfield",
  "University of Illinois Urbana-Champaign",
  "University of Indianapolis",
  "University of Iowa",
  "University of Kansas",
  "University of Kentucky",
  "University of Louisiana at Lafayette",
  "University of Louisiana at Monroe",
  "University of Louisville",
  "University of Maine",
  "University of Mary Hardin-Baylor",
  "University of Mary Washington",
  "University of Maryland, Baltimore County (UMBC)",
  "University of Maryland, College Park",
  "University of Massachusetts Amherst",
  "University of Massachusetts Boston",
  "University of Massachusetts Dartmouth",
  "University of Massachusetts Lowell",
  "University of Memphis",
  "University of Miami",
  "University of Michigan",
  "University of Minnesota",
  "University of Mississippi (Ole Miss)",
  "University of Missouri",
  "University of Missouri-Kansas City",
  "University of Missouri-St. Louis",
  "University of Montana",
  "University of Nebraska at Kearney",
  "University of Nebraska at Omaha",
  "University of Nebraska, Lincoln",
  "University of Nevada, Las Vegas (UNLV)",
  "University of Nevada, Reno",
  "University of New Hampshire",
  "University of New Haven",
  "University of New Mexico",
  "University of North Alabama",
  "University of North Carolina at Asheville",
  "University of North Carolina at Chapel Hill",
  "University of North Carolina at Charlotte",
  "University of North Carolina at Greensboro",
  "University of North Carolina at Pembroke",
  "University of North Carolina at Wilmington",
  "University of North Dakota",
  "University of North Florida",
  "University of North Georgia",
  "University of North Texas",
  "University of Northern Colorado",
  "University of Northern Iowa",
  "University of Notre Dame",
  "University of Oklahoma",
  "University of Oregon",
  "University of Pennsylvania",
  "University of Pittsburgh",
  "University of Portland",
  "University of Puget Sound",
  "University of Rhode Island",
  "University of Richmond",
  "University of Rochester",
  "University of San Diego",
  "University of San Francisco",
  "University of Science and Arts of Oklahoma",
  "University of Scranton",
  "University of South Alabama",
  "University of South Carolina",
  "University of South Dakota",
  "University of South Florida",
  "University of Southern California (USC)",
  "University of Southern Indiana",
  "University of Southern Mississippi",
  "University of St. Thomas",
  "University of Tampa",
  "University of Tennessee",
  "University of Texas at Arlington",
  "University of Texas at Austin",
  "University of Texas at Dallas",
  "University of Texas at El Paso",
  "University of Texas at San Antonio",
  "University of the Pacific",
  "University of Toledo",
  "University of Tulsa",
  "University of Utah",
  "University of Vermont",
  "University of Virginia",
  "University of Washington",
  "University of West Florida",
  "University of West Georgia",
  "University of Wisconsin-Eau Claire",
  "University of Wisconsin-Green Bay",
  "University of Wisconsin-La Crosse",
  "University of Wisconsin-Madison",
  "University of Wisconsin-Milwaukee",
  "University of Wisconsin-Oshkosh",
  "University of Wisconsin-Parkside",
  "University of Wisconsin-Platteville",
  "University of Wisconsin-River Falls",
  "University of Wisconsin-Stevens Point",
  "University of Wisconsin-Stout",
  "University of Wisconsin-Superior",
  "University of Wisconsin-Whitewater",
  "University of Wyoming",
  "Utah State University",
  "Utah Valley University",
  "Valdosta State University",
  "Valparaiso University",
  "Vanderbilt University",
  "Vassar College",
  "Villanova University",
  "Virginia Commonwealth University",
  "Virginia Military Institute",
  "Virginia Polytechnic Institute and State University (Virginia Tech)",
  "Virginia State University",
  "Wabash College",
  "Wake Forest University",
  "Walla Walla University",
  "Washington and Jefferson College",
  "Washington and Lee University",
  "Washington State University",
  "Washington University in St. Louis",
  "Wayne State University",
  "Wellesley College",
  "Wesleyan University",
  "West Chester University",
  "West Virginia University",
  "Western Carolina University",
  "Western Illinois University",
  "Western Kentucky University",
  "Western Michigan University",
  "Western Washington University",
  "Wheaton College (IL)",
  "Whitman College",
  "Whittier College",
  "Whitworth University",
  "Widener University",
  "Willamette University",
  "William & Mary",
  "Williams College",
  "Winthrop University",
  "Wofford College",
  "Worcester Polytechnic Institute",
  "Wright State University",
  "Xavier University",
  "Yale University",
  "York College of Pennsylvania",
  "York University (Canada)",
  "Yeshiva University",
  "American University of Beirut",
  "Australian National University",
  "ETH Zurich",
  "Imperial College London",
  "London School of Economics (LSE)",
  "McGill University",
  "Nanyang Technological University (Singapore)",
  "National University of Singapore (NUS)",
  "Peking University",
  "Sciences Po (France)",
  "Sorbonne University (France)",
  "Technical University of Munich",
  "Tsinghua University",
  "University College London (UCL)",
  "University of Amsterdam",
  "University of British Columbia",
  "University of Cambridge",
  "University of Copenhagen",
  "University of Edinburgh",
  "University of Hong Kong",
  "University of Manchester",
  "University of Melbourne",
  "University of Oxford",
  "University of Queensland",
  "University of Sydney",
  "University of Tokyo",
  "University of Toronto",
  "University of Warwick",
  "University of Zurich"
];

function findClosestUniversity(input: string): string {
  if (!input) return "";
  const normalized = input.toLowerCase().trim();
  const exact = universities.find(u => u.toLowerCase() === normalized);
  if (exact) return exact;
  const partial = universities.find(u =>
    u.toLowerCase().includes(normalized) ||
    normalized.includes(u.toLowerCase())
  );
  return partial || "";
}

function normalizeDegree(input: string): string {
  if (!input) return "";
  const lower = input.toLowerCase();
  if (lower.includes("bachelor")) return "bachelor";
  if (lower.includes("master")) return "master";
  if (lower.includes("phd") || lower.includes("doctor")) return "doctoral";
  if (lower.includes("associate")) return "associate";
  return "";
}

function normalizeGraduationYear(input: string): string {
  if (!input) return "";
  return input.split("-")[0];
}

export const OnboardingAcademics = ({ onNext, onBack, initialData, linkedinData }: OnboardingAcademicsProps) => {
  const [academics, setAcademics] = useState<AcademicData>(() => {
    const matchedUniversity = findClosestUniversity(linkedinData?.university || "");
    const matchedDegree = normalizeDegree(linkedinData?.degree || "");
    const matchedYear = normalizeGraduationYear(linkedinData?.graduationYear || "");
    return {
      university: initialData?.university || matchedUniversity || "",
      degree: initialData?.degree || matchedDegree || "",
      major: initialData?.major || linkedinData?.major || "",
      graduationMonth: initialData?.graduationMonth || "",
      graduationYear: initialData?.graduationYear || matchedYear || "",
    };
  });
  const [open, setOpen] = useState(false);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(() => {
    const fields = new Set<string>();
    if (!initialData?.university && findClosestUniversity(linkedinData?.university || "")) fields.add("university");
    if (!initialData?.degree && normalizeDegree(linkedinData?.degree || "")) fields.add("degree");
    if (linkedinData?.major && !initialData?.major) fields.add("major");
    if (!initialData?.graduationYear && normalizeGraduationYear(linkedinData?.graduationYear || "")) fields.add("graduationYear");
    return fields;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext(academics);
  };

  const removeAutoFill = (field: string) => {
    setAutoFilledFields(prev => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const AutoFilledBadge = ({ field }: { field: string }) =>
    autoFilledFields.has(field) ? (
      <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
        Auto-filled from LinkedIn
      </span>
    ) : null;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1940 + 10 + 1 }, (_, i) => 1940 + i);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start px-4">
      <div className="space-y-8">
        <div className="space-y-6">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            Academic <span className="text-[#3B82F6]">Information</span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            Tell us about your educational background to help us find the best opportunities for you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 mt-8 lg:mt-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="university" className="text-foreground font-medium">University/College<AutoFilledBadge field="university" /></Label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-10 px-3 py-2"
                  >
                    {academics.university
                      ? universities.find((university) => university === academics.university)
                      : "Select university..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search universities..." className="h-9" />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>No university found.</CommandEmpty>
                      <CommandGroup>
                        {universities.map((university) => (
                          <CommandItem
                            key={university}
                            value={university}
                            onSelect={(currentValue) => {
                              setAcademics(prev => ({
                                ...prev,
                                university: currentValue === academics.university ? "" : currentValue
                              }));
                              removeAutoFill("university");
                              setOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                academics.university === university ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {university}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="degree" className="text-foreground font-medium">Degree Level<AutoFilledBadge field="degree" /></Label>
              <Select value={academics.degree} onValueChange={(value) => { setAcademics(prev => ({ ...prev, degree: value })); removeAutoFill("degree"); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select degree level" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="associate">Associate's Degree</SelectItem>
                  <SelectItem value="bachelor">Bachelor's Degree</SelectItem>
                  <SelectItem value="master">Master's Degree</SelectItem>
                  <SelectItem value="doctoral">Doctoral Degree</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="graduationMonth" className="text-foreground font-medium">Graduation Month</Label>
              <Select value={academics.graduationMonth} onValueChange={(value) => setAcademics(prev => ({ ...prev, graduationMonth: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select graduation month" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  {months.map((month) => (
                    <SelectItem key={month} value={month.toLowerCase()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="graduationYear" className="text-foreground font-medium">Graduation Year<AutoFilledBadge field="graduationYear" /></Label>
              <Select value={academics.graduationYear} onValueChange={(value) => { setAcademics(prev => ({ ...prev, graduationYear: value })); removeAutoFill("graduationYear"); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select graduation year" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="major" className="text-foreground font-medium">Major/Field of Study<AutoFilledBadge field="major" /></Label>
            <Input
              id="major"
              value={academics.major}
              onChange={(e) => { setAcademics(prev => ({ ...prev, major: e.target.value })); removeAutoFill("major"); }}
              placeholder="Enter your major"
              required
            />
          </div>


          <div className="flex justify-between pt-8">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="px-8 py-3 rounded-full font-semibold"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            
            <Button
              type="submit"
              variant="gradient"
              className="px-12 py-3 rounded-full font-bold group"
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </form>
      </div>
      
      <div className="hidden lg:flex items-center justify-center">
        <img 
          src={academicIllustration} 
          alt="Academic robot illustration" 
          className="w-full max-w-md h-auto object-contain"
        />
      </div>
    </div>
  );
};