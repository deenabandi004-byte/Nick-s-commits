import { Button } from "@/components/ui/button";
import { ArrowRight, User, GraduationCap, Briefcase } from "lucide-react";
import welcomeIllustration from "@/assets/welcome-illustration.png";

interface OnboardingWelcomeProps {
  onNext: () => void;
  userName?: string;
}

export const OnboardingWelcome = ({ onNext, userName: _userName = "there" }: OnboardingWelcomeProps) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start px-4">
      <div className="space-y-8">
        <div className="space-y-6 text-center lg:text-left">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            Welcome to{" "}
            <span className="text-[#3B82F6]">
              Offerloop
            </span>
          </h1>
          
          <p className="text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-lg mx-auto lg:mx-0 leading-relaxed">
            Let's get you set up with a personalized experience in just a few quick steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 my-8 lg:my-12">
          <div className="flex flex-col items-center space-y-4 p-6">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
              <User className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground">1. Profile</h3>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">Complete your profile and upload resume</p>
          </div>
          
          <div className="flex flex-col items-center space-y-4 p-6">
            <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center border border-secondary/30">
              <GraduationCap className="w-8 h-8 text-secondary" />
            </div>
            <h3 className="text-lg font-bold text-foreground">2. Academics</h3>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">Add your educational background</p>
          </div>
          
          <div className="flex flex-col items-center space-y-4 p-6">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30">
              <Briefcase className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-lg font-bold text-foreground">3. Goals</h3>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">Tell us where you're headed</p>
          </div>
        </div>

        <div className="flex justify-center lg:justify-start pt-4">
          <Button 
            onClick={onNext}
            variant="gradient"
            size="lg"
            className="px-8 md:px-12 py-4 text-base md:text-lg font-bold rounded-full group"
          >
            Get Started
            <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </div>
      
      <div className="hidden lg:flex items-center justify-center">
        <img 
          src={welcomeIllustration} 
          alt="Welcome to Offerloop illustration" 
          className="w-full max-w-md h-auto object-contain"
        />
      </div>
    </div>
  );
};