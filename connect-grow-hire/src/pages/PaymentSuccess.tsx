import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useEffect, useState } from "react";
import { getAuth } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, refreshUser } = useFirebaseAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Completing your upgrade...');

  const sessionId = params.get("session_id");
  const canceled = params.get("canceled");

  useEffect(() => {
    // Handle canceled payment
    if (canceled) {
      toast({
        variant: "destructive",
        title: "Payment Canceled",
        description: "Your upgrade was canceled. You can try again anytime from the Pricing page.",
      });
      setTimeout(() => navigate('/pricing'), 2000);
      return;
    }

    async function completeUpgrade() {
      if (!user || !sessionId) {
        setStatus('error');
        setMessage('Missing session information. Please contact support.');
        return;
      }

      try {
        setStatus('processing');
        setMessage('Completing your upgrade...');

        const auth = getAuth();
        const firebaseUser = auth.currentUser;
        
        if (!firebaseUser) {
          throw new Error('Not authenticated');
        }

        const token = await firebaseUser.getIdToken();
        
        const API_URL = window.location.hostname === 'localhost' 
          ? 'http://localhost:5001' 
          : 'https://www.offerloop.ai';

        console.log('Calling complete-upgrade endpoint...');

        // Call the manual upgrade endpoint
        const response = await fetch(`${API_URL}/api/complete-upgrade`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          console.log('Upgrade successful:', result);
          setStatus('success');
          setMessage('Successfully upgraded to Pro! 🎉');
          
          // Refresh user data
          await refreshUser();
          
          // Show success toast
          toast({
            title: "🎉 Welcome to Pro!",
            description: "Your account has been upgraded with 1,800 credits. You can now access all premium features!",
            duration: 5000,
          });
          
          // Redirect after 2 seconds
          setTimeout(() => {
            navigate('/home');
          }, 2000);
        } else {
          console.error('Upgrade failed:', result);
          setStatus('error');
          setMessage(result.error || 'Upgrade failed. Please contact support.');
        }

      } catch (e) {
        console.error("Upgrade error:", e);
        setStatus('error');
        setMessage('An error occurred during upgrade. Please contact support if your account is not upgraded within 5 minutes.');
      }
    }

    if (!canceled) {
      completeUpgrade();
    }
  }, [user, sessionId, refreshUser, navigate, toast, canceled]);

  // Show canceled state
  if (canceled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
        <div className="max-w-md w-full text-center">
          <div className="bg-slate-900 p-8 rounded-lg">
            <XCircle className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Payment Canceled</h1>
            <p className="text-gray-400 mb-6">
              You canceled the payment. No charges were made.
            </p>
            <p className="text-sm text-gray-600">Redirecting to pricing page...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-6">
      <div className="max-w-md w-full text-center">
        {status === 'processing' && (
          <div className="bg-slate-900 p-8 rounded-lg">
            <Loader2 className="h-16 w-16 text-blue-400 mx-auto mb-4 animate-spin" />
            <h1 className="text-3xl font-bold mb-2">Processing Payment</h1>
            <p className="text-gray-400 mb-6">{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="bg-slate-900 p-8 rounded-lg">
            <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Welcome to Pro!</h1>
            <p className="text-gray-400 mb-2">{message}</p>
            <p className="text-sm text-gray-500 mb-6">
              You now have access to all premium features.
            </p>
            <p className="text-sm text-gray-600">Redirecting to home...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-slate-900 p-8 rounded-lg">
            <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Upgrade Issue</h1>
            <p className="text-gray-400 mb-6">{message}</p>
            <div className="space-y-3">
              <Button 
                onClick={() => window.location.reload()} 
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Try Again
              </Button>
              <Button 
                onClick={() => navigate("/home")} 
                variant="outline"
                className="w-full"
              >
                Go to Home
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}