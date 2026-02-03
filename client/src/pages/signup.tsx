import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, TrendingDown, ArrowLeft } from "lucide-react";
import { FaGoogle, FaApple, FaFacebook } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useTranslation } from "@/hooks/useTranslation";
import { useMarketContext } from "@/contexts/MarketProvider";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { market } = useMarketContext();

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string }) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/");
      toast({
        title: t('auth.welcome'),
        description: t('auth.accountCreatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('auth.registrationFailed'),
        description: error.message || t('auth.couldNotCreateAccount'),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: t('auth.missingInformation'),
        description: t('auth.enterEmailPassword'),
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: t('auth.passwordTooShort'),
        description: t('auth.passwordMinSix'),
        variant: "destructive",
      });
      return;
    }

    registerMutation.mutate({
      email: email.trim(),
      password,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Mobile App Container */}
      <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
        
        {/* Header */}
        <header className="bg-white border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-lg font-semibold text-slate-900">{market.branding.brandName}</h1>
            </div>
            <div className="w-9"></div> {/* Spacer for centering */}
          </div>
        </header>

        <div className="flex flex-col min-h-[calc(100vh-80px)]">
          {/* Hero Section */}
          <div className="p-6 text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('auth.createAccount')}</h2>
            <p className="text-slate-600 mb-6">{t('auth.startJourney')}</p>
          </div>

          {/* Form Section */}
          <div className="flex-1 px-6">
            <Card className="border-0 shadow-none">
              <CardContent className="p-0">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Name Fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-sm font-medium text-slate-700">
                        {t('auth.firstName')}
                      </Label>
                      <Input
                        id="firstName"
                        type="text"
                        placeholder={t('auth.firstName')}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-sm font-medium text-slate-700">
                        {t('auth.lastName')}
                      </Label>
                      <Input
                        id="lastName"
                        type="text"
                        placeholder={t('auth.lastName')}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="h-12"
                      />
                    </div>
                  </div>

                  {/* Email Field */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                      {t('auth.emailAddress')}
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('auth.email')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12"
                      required
                    />
                  </div>

                  {/* Password Field */}
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                      {t('auth.password')}
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-12 pr-12"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-12 px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-slate-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-slate-400" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500">{t('auth.passwordMinLength')}</p>
                  </div>

                  {/* Sign Up Button */}
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90"
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending ? t('auth.creatingAccount') : t('auth.createAccount')}
                  </Button>
                </form>

                {/* Divider */}
                <div className="relative my-6">
                  <Separator />
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-sm text-slate-500">
                    {t('auth.orContinueWith')}
                  </span>
                </div>

                {/* Social Login Buttons */}
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm font-medium border-slate-200 hover:bg-slate-50"
                    onClick={() => window.location.href = "/api/auth/google"}
                  >
                    <FaGoogle className="w-4 h-4 mr-3 text-red-500" />
                    {t('auth.continueWithGoogle')}
                  </Button>

                  {/* Temporarily disabled due to Apple Developer Console bug preventing Service ID configuration
                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm font-medium border-slate-200 hover:bg-slate-50"
                    onClick={() => {
                      toast({
                        title: t('auth.comingSoon'),
                        description: t('auth.providerSoon', { provider: 'Apple' }),
                      });
                    }}
                  >
                    <FaApple className="w-4 h-4 mr-3 text-black" />
                    {t('auth.continueWithApple')}
                  </Button>
                  */}

                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm font-medium border-slate-200 hover:bg-slate-50"
                    onClick={() => window.location.href = "/api/auth/facebook"}
                  >
                    <FaFacebook className="w-4 h-4 mr-3 text-blue-600" />
                    {t('auth.continueWithFacebook')}
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full h-12 text-sm font-medium border-slate-200 hover:bg-slate-50"
                    onClick={() => window.location.href = "/api/auth/twitter"}
                  >
                    <FaXTwitter className="w-4 h-4 mr-3 text-black" />
                    {t('auth.continueWithX')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Link */}
          <div className="p-6 text-center">
            <p className="text-sm text-slate-600">
              {t('auth.alreadyHaveAccount')}{" "}
              <Button
                variant="link"
                className="p-0 h-auto font-semibold text-primary"
                onClick={() => navigate("/auth")}
              >
                {t('auth.logIn')}
              </Button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}