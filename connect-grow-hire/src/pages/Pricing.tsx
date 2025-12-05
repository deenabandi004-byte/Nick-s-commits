import { useState, useEffect } from "react";
import { Check, ArrowLeft, CreditCard, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { loadStripe } from "@stripe/stripe-js";
import { getAuth } from 'firebase/auth';

const stripePromise = loadStripe("pk_live_51S4BB8ERY2WrVHp1acXrKE6RBG7NBlfHcMZ2kf7XhCX2E5g8Lasedx6ntcaD1H4BsoUMBGYXIcKHcAB4JuohLa2B00j7jtmWnB");

interface SubscriptionStatus {
  tier: string;
  status: string;
  hasSubscription: boolean;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}

const Pricing = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const navigate = useNavigate();
  const { user, updateUser } = useFirebaseAuth();

  useEffect(() => {
    if (user) {
      fetchSubscriptionStatus();
    }
  }, [user]);

  const fetchSubscriptionStatus = async () => {
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      
      if (!firebaseUser) return;

      const token = await firebaseUser.getIdToken();
      
      const API_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:5001' 
        : 'https://www.offerloop.ai';

      const response = await fetch(`${API_URL}/api/subscription-status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptionStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch subscription status:', error);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      
      if (!firebaseUser) {
        throw new Error('No Firebase user found');
      }

      const token = await firebaseUser.getIdToken();
      
      const API_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:5001' 
        : 'https://www.offerloop.ai';

      const response = await fetch(`${API_URL}/api/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/pricing`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();
      window.location.href = url;

    } catch (error) {
      console.error('Portal error:', error);
      alert('Failed to open subscription management. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStripeCheckout = async () => {
    if (!user) {
      console.error("User not authenticated");
      return;
    }

    setIsLoading(true);
    
    try {
      const auth = getAuth();
      const firebaseUser = auth.currentUser;
      
      if (!firebaseUser) {
        throw new Error('No Firebase user found');
      }

      const token = await firebaseUser.getIdToken();
      
      const API_URL = window.location.hostname === 'localhost' 
       ? 'http://localhost:5001' 
       : 'https://www.offerloop.ai';

      const response = await fetch(`${API_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          priceId: "price_1SQ0IJERY2WrVHp1Ul5OrP63",
          userId: user.uid,
          userEmail: user.email,
          successUrl: `${window.location.origin}/payment-success`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create checkout session: ${response.status} - ${errorText}`);
      }

      const { sessionId } = await response.json();

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error('Stripe failed to initialize');
      }

      const { error } = await stripe.redirectToCheckout({
        sessionId: sessionId,
      });

      if (error) {
        console.error('Stripe redirect error:', error);
        alert('Payment error: ' + error.message);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Something went wrong: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpgrade = async (planType: 'free' | 'pro') => {
    if (!user) return;
  
    try {
      if (planType === 'free') {
        await updateUser({ 
          tier: 'free',
          credits: 150,
          maxCredits: 150
        }); 
        navigate("/home");
      } 
      else if (planType === 'pro') {
        await handleStripeCheckout();
      }
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

  const isProUser = subscriptionStatus?.tier === 'pro' && subscriptionStatus?.status === 'active';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-6 py-6 max-w-6xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/home")}
          className="mb-8 text-foreground hover:bg-accent"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        {isProUser && (
          <div className="mb-8 p-4 bg-card border border-border rounded-lg flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">Pro Subscription Active</p>
              {subscriptionStatus?.cancelAtPeriodEnd && (
                <p className="text-sm text-muted-foreground">
                  Cancels on {new Date(subscriptionStatus.currentPeriodEnd! * 1000).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button
              onClick={handleManageSubscription}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Settings className="mr-2 h-4 w-4" />
              Manage Subscription
            </Button>
          </div>
        )}

        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex items-center gap-2 bg-card border border-border px-3 py-1 rounded-full">
              <CreditCard className="h-4 w-4 text-foreground" />
              <span className="text-sm font-medium text-foreground uppercase tracking-wide">Our Pricing</span>
            </div>
          </div>
          <h1 className="text-5xl lg:text-6xl font-bold mb-6 text-foreground">
            Choose <span className="bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">your plan</span> today
          </h1>
          <p className="text-muted-foreground text-lg mb-8">
            15 credits per contact. When you run out of credits, no more contacts.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-6xl w-full">
            {/* Free Plan */}
            <div className="bg-gradient-to-br from-purple-500 to-pink-500 border border-transparent rounded-2xl p-10 backdrop-blur-sm transform transition-all hover:scale-[1.02]">
              <div className="text-center mb-8">
                <h3 className="text-3xl font-bold mb-3 text-white">Free</h3>
                <p className="text-white/90">Try out platform risk free</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">150 credits (10 emails) </span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">Estimated time saved: 250 minutes</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">Try out platform risk free</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">Limited Features</span>
                </div>
              </div>

              <Button 
                className="w-full py-4 px-6 rounded-lg font-semibold text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm transition-colors border border-white/30"
                onClick={() => handleUpgrade('free')}
                disabled={isProUser}
              >
                {isProUser ? 'Current Plan: Pro' : 'Start for free'}
              </Button>
            </div>

            {/* Pro Plan */}
            <div className="relative bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-transparent rounded-xl p-10 transform transition-all hover:scale-[1.02] hover:shadow-lg">
              <div className="absolute top-4 right-4">
                <span className="bg-white text-purple-600 text-xs px-2 py-1 rounded-full font-medium">
                  {isProUser ? 'ACTIVE' : 'RECOMMENDED'}
                </span>
              </div>
              
              <div className="text-center mb-8">
                <h3 className="text-3xl font-bold mb-3 text-white">Pro</h3>
                <div className="mb-2">
                  <span className="text-white/70 text-xl line-through mr-2">$34.99</span>
                  <span className="text-3xl font-bold text-white">$8.99</span>
                  <span className="text-white/90 text-lg ml-1">/month</span>
                </div>
                <p className="text-white/90">1800 credits</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">1800 credits (120 emails) </span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">Estimated time saved: 2500 minutes</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">Everything in free plus:</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">Directory permanently saves</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">Priority Support</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">Coffee Chat Prep</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-white flex-shrink-0" />
                  <span className="text-white">Interview Prep</span>
                </div>
              </div>

              <Button 
                size="lg"
                className="w-full py-6 px-6 rounded-xl text-lg font-semibold text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30"
                onClick={isProUser ? handleManageSubscription : () => handleUpgrade('pro')}
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : isProUser ? 'Manage Subscription' : 'Start now'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;