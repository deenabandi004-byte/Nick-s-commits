import { Badge } from "@/components/ui/badge";
import { Rocket, Star } from 'lucide-react';

interface ComingSoonOverlayProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}

export const ComingSoonOverlay: React.FC<ComingSoonOverlayProps> = ({
  title,
  description,
  icon: Icon,
}) => (
  <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md bg-gray-900/80 rounded-[3px]">
    <div className="text-center px-6 py-8 max-w-md">
      <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#3B82F6] mb-6 animate-pulse`}>
        <Icon className="h-10 w-10 text-white" />
      </div>
      
      <div className="mb-4">
        <Badge className={`bg-[#3B82F6] text-white border-none px-4 py-1 text-sm font-semibold mb-3`}>
          <Rocket className="h-3 w-3 mr-1 inline" />
          Coming Soon
        </Badge>
      </div>
      
      <h3 className="text-2xl font-bold mb-3 text-[#3B82F6]">
        {title}
      </h3>
      
      <p className="text-gray-300 mb-6 leading-relaxed">
        {description}
      </p>
      
      <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
        <Rocket className="h-4 w-4 text-[#3B82F6]" />
        <span>Launching soon - stay tuned!</span>
      </div>
      
      <div className="mt-6 flex justify-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
        ))}
      </div>
    </div>
  </div>
);

