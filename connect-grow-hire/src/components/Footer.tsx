import { Link } from "react-router-dom";
import { Logo } from "./Logo";

const Footer = () => {
  return (
    <footer className="bg-muted py-12">
      <div className="container px-6 mx-auto">
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="flex items-center gap-8">
            <Logo size="lg" />
            <p className="text-muted-foreground text-lg leading-relaxed ml-4">
              Connecting <span className="font-bold">talent</span> with <span className="font-bold">opportunity</span> through intelligent recruiting solutions.
            </p>
          </div>
          
          <div className="flex justify-center">
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/free-tools" className="hover:text-foreground transition-colors">Free Tools & Guides</Link></li>
                <li><Link to="/about" className="hover:text-foreground transition-colors">About Us</Link></li>
                <li><Link to="/contact-us" className="hover:text-foreground transition-colors">Contact</Link></li>
                <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="border-t border-border mt-8 pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            © 2024 Offerloop.ai. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Illustrations by <a href="https://storyset.com/work" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">Storyset</a>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;