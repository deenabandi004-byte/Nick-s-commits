import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConnectGmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectGmailModal({ open, onOpenChange }: ConnectGmailModalProps) {
  const navigate = useNavigate();

  const handleConnect = () => {
    onOpenChange(false);
    navigate("/integrations?connect=gmail");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <Mail className="h-6 w-6 text-blue-600" />
          </div>
          <DialogTitle className="text-center">Connect Gmail to draft emails</DialogTitle>
          <DialogDescription className="text-center">
            Offerloop writes personalized drafts straight into your Gmail — nothing is
            ever sent without you. Connect your account to enable drafting.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button onClick={handleConnect}>Connect Gmail</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
