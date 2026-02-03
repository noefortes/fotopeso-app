import { Home, BarChart3, User, Settings, Lock } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { canAccessFeature } from "@shared/subscriptionUtils";

export default function BottomNavigation() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  
  const canAccessAnalytics = user && canAccessFeature(user as any, "analyticsAccess");

  const navItems = [
    { icon: Home, label: t('navigation.home'), path: "/" },
    { icon: BarChart3, label: t('navigation.analytics'), path: "/analytics", proOnly: true },
    { icon: Settings, label: t('navigation.settings'), path: "/settings" },
    { icon: User, label: t('navigation.profile'), path: "/profile" },
  ];

  const handleNavClick = (path: string, proOnly?: boolean) => {
    if (proOnly && !canAccessAnalytics) {
      setLocation("/analytics-upgrade");
      return;
    }
    setLocation(path);
  };

  return (
    <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-sm bg-white border-t border-slate-200">
      <div className="grid grid-cols-4 h-16">
        {navItems.map(({ icon: Icon, label, path, proOnly }) => {
          const isActive = location === path;
          const isLocked = proOnly && !canAccessAnalytics;
          
          return (
            <button
              key={path}
              onClick={() => handleNavClick(path, proOnly)}
              className={`flex flex-col items-center justify-center space-y-1 relative ${
                isActive ? "text-primary" : isLocked ? "text-slate-300" : "text-slate-400"
              }`}
            >
              {isLocked && (
                <Lock className="w-3 h-3 absolute top-2 right-3 text-amber-500" />
              )}
              <Icon className="w-5 h-5" />
              <span className={`text-xs ${isActive ? "font-medium" : ""}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
