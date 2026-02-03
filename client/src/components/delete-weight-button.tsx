import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Crown, Star } from "lucide-react";
import { getUserTier } from "@shared/subscriptionUtils";

interface DeleteWeightButtonProps {
  latestWeight?: {
    id: string;
    weight: string;
    unit: string | null;
    createdAt: Date | null;
  } | null;
  className?: string;
}

export default function DeleteWeightButton({ latestWeight, className }: DeleteWeightButtonProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // Check if user can delete entries (Premium or Pro)
  const tier = user ? getUserTier(user as any) : null;
  const canDeleteEntries = tier?.name === 'premium' || tier?.name === 'pro' || tier?.name === 'admin';

  const deleteWeightMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/weight-entries/latest");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weight-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-entries/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weight-entries/can-record"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      
      toast({
        title: t('deleteWeight.entryDeleted'),
        description: t('deleteWeight.latestRemoved'),
      });
      
      setIsOpen(false);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: t('deleteWeight.unauthorized'),
          description: t('deleteWeight.loggedOut'),
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
        return;
      }
      
      toast({
        title: t('deleteWeight.error'),
        description: error instanceof Error ? error.message : t('deleteWeight.failedDelete'),
        variant: "destructive",
      });
    },
  });

  // Don't render if no weight entry exists  
  if (!latestWeight) {
    return null;
  }
  
  // Don't show delete button for Free and Starter users
  if (!canDeleteEntries) {
    return null;
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(date));
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 ${className}`}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t('deleteWeight.deleteLastWeight')}
          {tier?.name === 'premium' ? (
            <Star className="w-3 h-3 ml-1 text-blue-500" />
          ) : (
            <Crown className="w-3 h-3 ml-1 text-yellow-500" />
          )}
        </Button>
      </AlertDialogTrigger>
      
      <AlertDialogContent className="max-w-sm mx-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            {t('deleteWeight.deleteEntryTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>{t('deleteWeight.permanentlyDelete')}</p>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-lg font-semibold text-slate-900">
                {latestWeight.weight} {latestWeight.unit}
              </div>
              <div className="text-sm text-slate-600">
                {latestWeight.createdAt ? formatDate(latestWeight.createdAt) : t('deleteWeight.unknownDate')}
              </div>
            </div>
            <p className="text-xs text-red-600">
              {t('deleteWeight.cannotUndo')}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter>
          <AlertDialogCancel>{t('deleteWeight.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteWeightMutation.mutate()}
            disabled={deleteWeightMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteWeightMutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                {t('deleteWeight.deleting')}
              </>
            ) : (
              t('deleteWeight.deleteEntry')
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}