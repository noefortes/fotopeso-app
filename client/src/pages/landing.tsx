import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, TrendingDown, Share2, Zap } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useMarketContext } from "@/contexts/MarketProvider";

export default function Landing() {
  const { t } = useTranslation();
  const { market } = useMarketContext();
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Mobile App Container */}
      <div className="max-w-sm mx-auto bg-white min-h-screen shadow-xl">
        
        {/* Header */}
        <header className="bg-white border-b border-slate-200 p-4">
          <div className="flex items-center justify-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">{t('brand.name')}</h1>
          </div>
        </header>

        {/* Hero Section */}
        <div className="p-6 text-center">
          <div className="w-24 h-24 bg-gradient-to-r from-primary to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Camera className="w-12 h-12 text-white" />
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 mb-4">{t('brand.tagline')}</h2>
          
          <p className="text-slate-600 mb-8 leading-relaxed">
            {market.id === 'br' 
              ? 'Esqueça a entrada manual. Apenas tire uma foto da sua balança e registraremos instantaneamente seu peso. Assista sua jornada se desenrolar em gráficos deslumbrantes e celebre cada conquista.'
              : 'Forget manual entry. Just snap a photo of your scale, and we\'ll instantly log your weight. Watch your journey unfold in stunning charts and celebrate every milestone.'
            }
          </p>
        </div>

        {/* Features */}
        <div className="space-y-4">
          

          

          

          
        </div>

        {/* CTA */}
        <div className="px-6 pb-8 space-y-3">
          <Button 
            className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-600/90"
            onClick={() => window.location.href = '/auth'}
          >{t('auth.alreadyHaveAccount')} {t('auth.login')}</Button>
          
          <Button 
            variant="outline"
            className="w-full h-12 text-base font-semibold border-2 hover:bg-slate-50"
            onClick={() => window.location.href = '/signup'}
          >{t('auth.dontHaveAccount')} {t('auth.signup')}</Button>
          
          <div className="text-center mt-6 pt-4 border-t border-slate-200">
            <p className="text-sm font-medium text-slate-700 mb-1">{t('landing.customerService')}</p>
            <p className="text-sm text-slate-600">{t('landing.phoneNumber')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
