import { useLocation } from "wouter";
import { XCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SubscriptionCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        {/* Cancel Icon */}
        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mb-6">
          <XCircle className="w-12 h-12 text-orange-600" />
        </div>

        {/* Cancel Message */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Payment Cancelled
        </h1>
        
        <p className="text-gray-600 mb-6">
          No worries! Your payment was cancelled and no charges were made to your account.
        </p>

        {/* Info Card */}
        <Card className="w-full mb-6 bg-blue-50">
          <CardContent className="p-4">
            <p className="text-sm text-blue-800">
              You can still upgrade to premium anytime to unlock all the amazing features of ScanMyScale.
            </p>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="w-full space-y-3">
          <Button 
            onClick={() => setLocation("/analytics-upgrade")}
            className="w-full"
            data-testid="button-try-again"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          
          <Button 
            variant="outline" 
            onClick={() => setLocation("/")}
            className="w-full"
            data-testid="button-back-home"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-gray-500 mt-6">
          Need help? Contact us at support@scanmyscale.com
        </p>
      </div>
    </div>
  );
}