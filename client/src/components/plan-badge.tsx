import { Badge } from "@/components/ui/badge";
import { Crown, Star, Zap, Shield } from "lucide-react";

interface PlanBadgeProps {
  tier: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function PlanBadge({ tier, size = "md", className = "" }: PlanBadgeProps) {
  const tierConfig = {
    free: {
      icon: Shield,
      text: "FREE",
      className: "bg-gray-100 text-gray-800 border-gray-200",
    },
    starter: {
      icon: Zap,
      text: "STARTER", 
      className: "bg-blue-100 text-blue-800 border-blue-200",
    },
    premium: {
      icon: Star,
      text: "PREMIUM",
      className: "bg-purple-100 text-purple-800 border-purple-200",
    },
    pro: {
      icon: Crown,
      text: "PRO",
      className: "bg-amber-100 text-amber-800 border-amber-200",
    },
    admin: {
      icon: Shield,
      text: "ADMIN",
      className: "bg-red-100 text-red-800 border-red-200",
    },
  };

  const config = tierConfig[tier as keyof typeof tierConfig] || tierConfig.free;
  const IconComponent = config.icon;

  const sizeClasses = {
    sm: "text-xs px-2 py-1",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4", 
    lg: "w-5 h-5",
  };

  return (
    <Badge 
      variant="outline"
      className={`${config.className} ${sizeClasses[size]} ${className}`}
    >
      <IconComponent className={`${iconSizes[size]} mr-1`} />
      {config.text}
    </Badge>
  );
}