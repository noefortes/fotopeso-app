import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { 
  Users, 
  Search, 
  Crown, 
  UserMinus, 
  Trash2, 
  Shield,
  TrendingUp,
  Calendar,
  Filter,
  Star,
  Zap,
  Edit,
  UserPlus,
  UserCheck,
  Ruler,
  Scale
} from "lucide-react";
import { format } from "date-fns";
import type { User } from "@shared/schema";
import PlanBadge from "@/components/plan-badge";

interface AdminUser extends User {
  weightEntriesCount: number;
  lastActiveAt: string | null;
  subscriptionTier: 'free' | 'starter' | 'premium' | 'pro' | 'admin';
  age?: number;
}

interface AdminStats {
  totalUsers: number;
  freeUsers: number;
  starterUsers: number;
  premiumUsers: number;
  proUsers: number;
  adminUsers: number;
  activeToday: number;
  totalWeightEntries: number;
}

export default function Admin() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTier, setFilterTier] = useState<"all" | "free" | "starter" | "premium" | "pro" | "admin">("all");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isPasswordProtected, setIsPasswordProtected] = useState(true);
  const [adminPassword, setAdminPassword] = useState("");
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordChangeForm, setPasswordChangeForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    height: "",
    dateOfBirth: "",
    sex: "",
    weightUnit: "lbs" as "lbs" | "kg",
    subscriptionTier: "free" as "free" | "starter" | "premium" | "pro" | "admin"
  });
  
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createForm, setCreateForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    height: "",
    heightUnit: "inches" as "inches" | "cm",
    dateOfBirth: "",
    sex: "",
    weightUnit: "lbs" as "lbs" | "kg",
    subscriptionTier: "free" as "free" | "starter" | "premium" | "pro" | "admin"
  });

  // Password protection check
  const checkAdminPassword = async () => {
    try {
      console.log('Attempting admin login...');
      
      // Make the API request manually to ensure proper response handling
      const response = await fetch('/api/admin/verify-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: adminPassword }),
      });
      
      const data = await response.json();
      console.log('Admin login response received');
      
      if (data.success) {
        setIsPasswordProtected(false);
        toast({
          title: "Access Granted",
          description: "Welcome to the admin panel.",
        });
      } else {
        console.error('Admin login failed:', data);
        toast({
          title: "Access Denied",
          description: data.message || "Incorrect admin password.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Admin login error:', error);
      toast({
        title: "Access Denied", 
        description: "Network error or incorrect password.",
        variant: "destructive",
      });
    }
  };

  // Change admin password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      return await apiRequest("POST", "/api/admin/change-password", data);
    },
    onSuccess: (response) => {
      toast({
        title: "Success",
        description: "Admin password changed successfully.",
        variant: "default",
      });
      setShowPasswordChange(false);
      setPasswordChangeForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "Session expired. Please login again.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/auth";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to change password",
        variant: "destructive",
      });
    },
  });

  const handlePasswordChange = () => {
    if (passwordChangeForm.newPassword !== passwordChangeForm.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "New password and confirmation do not match.",
        variant: "destructive",
      });
      return;
    }

    if (passwordChangeForm.newPassword.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: passwordChangeForm.currentPassword,
      newPassword: passwordChangeForm.newPassword,
    });
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to access this page.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/auth";
      }, 1000);
      return;
    }
  }, [user, authLoading, toast]);

  // Fetch admin stats
  const { data: stats } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    enabled: !!user && !isPasswordProtected,
  });

  // Fetch all users
  const { data: users = [], isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!user && !isPasswordProtected,
  });

  // Filter users based on search and tier
  const filteredUsers = users.filter(u => {
    const matchesSearch = !searchTerm || 
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.id.includes(searchTerm);
    
    const matchesTier = filterTier === "all" || u.subscriptionTier === filterTier;
    
    return matchesSearch && matchesTier;
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: any }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setEditingUser(null);
      
      toast({
        title: "User Updated",
        description: "User information has been updated successfully.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "Session expired. Please refresh the page.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update subscription.",
        variant: "destructive",
      });
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (userData: any) => {
      const response = await apiRequest("POST", "/api/admin/users", userData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setShowCreateUser(false);
      setCreateForm({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        height: "",
        heightUnit: "inches",
        dateOfBirth: "",
        sex: "",
        weightUnit: "lbs",
        subscriptionTier: "free"
      });
      
      toast({
        title: "User Created",
        description: "New user account has been created successfully.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "Session expired. Please refresh the page.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Create Failed",
        description: error instanceof Error ? error.message : "Failed to create user.",
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      
      toast({
        title: "User Deleted",
        description: "User and all associated data have been permanently deleted.",
      });
      setSelectedUser(null);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "Session expired. Please refresh the page.",
          variant: "destructive",
        });
        return;
      }
      
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete user.",
        variant: "destructive",
      });
    },
  });

  // Calculate age from date of birth
  const calculateAge = (dateOfBirth: string | Date | null) => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Start editing a user
  const startEditingUser = (user: AdminUser) => {
    setEditingUser(user);
    setEditForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      height: user.height?.toString() || "",
      dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : "",
      sex: (user as any).sex || "",
      weightUnit: ((user as any).weightUnit || "lbs") as "lbs" | "kg",
      subscriptionTier: (user.subscriptionTier as 'free' | 'starter' | 'premium' | 'pro' | 'admin') || "free"
    });
  };

  // Save user edits
  const saveUserEdits = () => {
    if (!editingUser) return;
    
    const updates: any = {
      firstName: editForm.firstName || null,
      lastName: editForm.lastName || null,
      email: editForm.email || null,
      height: editForm.height ? parseInt(editForm.height) : null,
      dateOfBirth: editForm.dateOfBirth ? new Date(editForm.dateOfBirth).toISOString() : null,
      sex: editForm.sex || null,
      weightUnit: editForm.weightUnit,
      subscriptionTier: editForm.subscriptionTier
    };
    
    updateUserMutation.mutate({ userId: editingUser.id, updates });
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Password protection screen
  if (isPasswordProtected) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Card className="w-full max-w-md mx-4">
          <CardHeader>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle>Admin Access</CardTitle>
                <p className="text-sm text-slate-600">Enter admin password to continue</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Password</label>
              <PasswordInput
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter admin password"
                onKeyPress={(e) => e.key === 'Enter' && checkAdminPassword()}
              />
            </div>
            <Button 
              onClick={checkAdminPassword} 
              className="w-full"
              disabled={!adminPassword}
            >
              <Shield className="w-4 h-4 mr-2" />
              Access Admin Panel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Admin Dashboard</h1>
                <p className="text-slate-600">Manage users and monitor system statistics</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowPasswordChange(true)}
              className="flex items-center space-x-2"
            >
              <Shield className="w-4 h-4" />
              <span>Change Password</span>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Users className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{stats.totalUsers}</p>
                    <p className="text-sm text-slate-600">Total Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <UserMinus className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{stats.freeUsers}</p>
                    <p className="text-sm text-slate-600">Free Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Crown className="w-8 h-8 text-amber-600" />
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{stats.proUsers}</p>
                    <p className="text-sm text-slate-600">Pro Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Shield className="w-8 h-8 text-red-600" />
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{stats.adminUsers}</p>
                    <p className="text-sm text-slate-600">Admin Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-8 h-8 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{stats.activeToday}</p>
                    <p className="text-sm text-slate-600">Active Today</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-8 h-8 text-indigo-600" />
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{stats.totalWeightEntries}</p>
                    <p className="text-sm text-slate-600">Weight Entries</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Filter className="w-5 h-5" />
              <span>Filters</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Search by email, name, or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-full sm:w-48">
                <Select value={filterTier} onValueChange={(value: "all" | "free" | "starter" | "premium" | "pro" | "admin") => setFilterTier(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    <SelectItem value="free">Free Plan</SelectItem>
                    <SelectItem value="starter">Starter Plan</SelectItem>
                    <SelectItem value="premium">Premium Plan</SelectItem>
                    <SelectItem value="pro">Pro Plan</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => setShowCreateUser(true)}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center space-x-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create User</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Users ({filteredUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">Loading users...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No users found matching your criteria.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-2 font-semibold text-slate-900">User</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-900">Plan</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-900">Height</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-900">Age</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-900">Entries</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-900">Last Active</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-900">Joined</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-4 px-2">
                          <div className="flex items-center space-x-3">
                            <img 
                              src={user.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent((user.firstName || '') + ' ' + (user.lastName || ''))}&background=4F46E5&color=fff`}
                              alt="Profile" 
                              className="w-10 h-10 rounded-full object-cover" 
                            />
                            <div>
                              <p className="font-medium text-slate-900">
                                {user.firstName || 'No Name'} {user.lastName || ''}
                              </p>
                              <p className="text-sm text-slate-600">{user.email || 'No Email'}</p>
                              <p className="text-xs text-slate-500">ID: {user.id.slice(0, 8)}...</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-2">
                          <PlanBadge tier={user.subscriptionTier} size="sm" />
                        </td>
                        <td className="py-4 px-2">
                          <span className="text-sm text-slate-600">
                            {user.height ? `${user.height} cm` : 'Not set'}
                          </span>
                        </td>
                        <td className="py-4 px-2">
                          <span className="text-sm text-slate-600">
                            {user.dateOfBirth ? `${calculateAge(user.dateOfBirth)} years` : 'Not set'}
                          </span>
                        </td>
                        <td className="py-4 px-2">
                          <span className="text-slate-900 font-medium">{user.weightEntriesCount}</span>
                        </td>
                        <td className="py-4 px-2">
                          <span className="text-sm text-slate-600">
                            {user.lastActiveAt 
                              ? format(new Date(user.lastActiveAt), 'MMM d, yyyy')
                              : 'Never'
                            }
                          </span>
                        </td>
                        <td className="py-4 px-2">
                          <span className="text-sm text-slate-600">
                            {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : 'Unknown'}
                          </span>
                        </td>
                        <td className="py-4 px-2">
                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditingUser(user)}
                              className="text-blue-700 border-blue-300 hover:bg-blue-50"
                            >
                              Edit
                            </Button>
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedUser(user)}
                                  className="text-red-700 border-red-300 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to permanently delete <strong>{user.firstName} {user.lastName}</strong>? 
                                    This will remove all their weight entries and data. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteUserMutation.mutate(user.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                    disabled={deleteUserMutation.isPending}
                                  >
                                    {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit User Modal */}
        {editingUser && (
          <AlertDialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
            <AlertDialogContent className="max-w-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Edit User: {editingUser.firstName} {editingUser.lastName}</AlertDialogTitle>
                <AlertDialogDescription>
                  Update user information and subscription status.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4 max-h-96 overflow-y-auto">
                <div>
                  <label className="text-sm font-medium text-slate-700">First Name</label>
                  <Input
                    value={editForm.firstName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Last Name</label>
                  <Input
                    value={editForm.lastName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <Input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Email address"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Height (cm)</label>
                  <Input
                    type="number"
                    value={editForm.height}
                    onChange={(e) => setEditForm(prev => ({ ...prev, height: e.target.value }))}
                    placeholder="Height in centimeters"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Date of Birth</label>
                  <Input
                    type="date"
                    value={editForm.dateOfBirth}
                    onChange={(e) => setEditForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Sex</label>
                  <Select value={editForm.sex} onValueChange={(value: string) => setEditForm(prev => ({ ...prev, sex: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sex" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Weight Unit</label>
                  <Select value={editForm.weightUnit} onValueChange={(value: "lbs" | "kg") => setEditForm(prev => ({ ...prev, weightUnit: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                      <SelectItem value="kg">Kilograms (kg)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Subscription Tier</label>
                  <Select value={editForm.subscriptionTier} onValueChange={(value: "free" | "starter" | "premium" | "pro" | "admin") => setEditForm(prev => ({ ...prev, subscriptionTier: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editingUser.dateOfBirth && (
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-slate-700">Age</label>
                    <div className="text-sm text-slate-600 py-2">
                      {calculateAge(editingUser.dateOfBirth)} years old
                    </div>
                  </div>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={saveUserEdits}
                  disabled={updateUserMutation.isPending}
                >
                  {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Password Change Modal */}
        {showPasswordChange && (
          <AlertDialog open={showPasswordChange} onOpenChange={setShowPasswordChange}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Change Admin Password</AlertDialogTitle>
                <AlertDialogDescription>
                  Enter your current password and choose a new one.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Current Password</label>
                  <PasswordInput
                    value={passwordChangeForm.currentPassword}
                    onChange={(e) => setPasswordChangeForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">New Password</label>
                  <PasswordInput
                    value={passwordChangeForm.newPassword}
                    onChange={(e) => setPasswordChangeForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="Enter new password (min 6 characters)"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Confirm New Password</label>
                  <PasswordInput
                    value={passwordChangeForm.confirmPassword}
                    onChange={(e) => setPasswordChangeForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handlePasswordChange}
                  disabled={changePasswordMutation.isPending || !passwordChangeForm.currentPassword || !passwordChangeForm.newPassword || !passwordChangeForm.confirmPassword}
                >
                  {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {/* Create User Modal */}
        {showCreateUser && (
          <AlertDialog open={showCreateUser} onOpenChange={setShowCreateUser}>
            <AlertDialogContent className="max-w-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Create New User Account</AlertDialogTitle>
                <AlertDialogDescription>
                  Manually create a new user account with their information.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4 max-h-96 overflow-y-auto">
                <div>
                  <label className="text-sm font-medium text-slate-700">First Name *</label>
                  <Input
                    value={createForm.firstName}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Last Name *</label>
                  <Input
                    value={createForm.lastName}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Last name"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-slate-700">Email *</label>
                  <Input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="Email address"
                    data-testid="input-email"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-slate-700">Password *</label>
                  <Input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Set initial password"
                    data-testid="input-password"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Height</label>
                  <Input
                    type="number"
                    value={createForm.height}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, height: e.target.value }))}
                    placeholder={createForm.heightUnit === "inches" ? "70" : "180"}
                    min={createForm.heightUnit === "inches" ? "36" : "90"}
                    max={createForm.heightUnit === "inches" ? "96" : "240"}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Height Unit</label>
                  <Select value={createForm.heightUnit} onValueChange={(value: "inches" | "cm") => setCreateForm(prev => ({ ...prev, heightUnit: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inches">Inches</SelectItem>
                      <SelectItem value="cm">Centimeters</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Date of Birth</label>
                  <Input
                    type="date"
                    value={createForm.dateOfBirth}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Sex</label>
                  <Select value={createForm.sex} onValueChange={(value: string) => setCreateForm(prev => ({ ...prev, sex: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sex" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Weight Unit</label>
                  <Select value={createForm.weightUnit} onValueChange={(value: "lbs" | "kg") => setCreateForm(prev => ({ ...prev, weightUnit: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                      <SelectItem value="kg">Kilograms (kg)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Subscription Tier</label>
                  <Select value={createForm.subscriptionTier} onValueChange={(value: "free" | "starter" | "premium" | "pro" | "admin") => setCreateForm(prev => ({ ...prev, subscriptionTier: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free Plan</SelectItem>
                      <SelectItem value="starter">Starter Plan</SelectItem>
                      <SelectItem value="premium">Premium Plan</SelectItem>
                      <SelectItem value="pro">Pro Plan</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const formattedData: any = {
                      firstName: createForm.firstName,
                      lastName: createForm.lastName,
                      email: createForm.email,
                      password: createForm.password,
                      heightUnit: createForm.heightUnit,
                      weightUnit: createForm.weightUnit,
                      subscriptionTier: createForm.subscriptionTier,
                    };
                    
                    // Add optional fields only if they have values
                    if (createForm.height && createForm.height.trim() !== '') {
                      formattedData.height = parseFloat(createForm.height);
                    }
                    
                    if (createForm.dateOfBirth && createForm.dateOfBirth.trim() !== '') {
                      const date = new Date(createForm.dateOfBirth);
                      if (!isNaN(date.getTime())) {
                        formattedData.dateOfBirth = date.toISOString();
                      }
                    }
                    
                    if (createForm.sex && createForm.sex.trim() !== '') {
                      formattedData.sex = createForm.sex;
                    }
                    
                    console.log('Creating user with data:', formattedData);
                    createUserMutation.mutate(formattedData);
                  }}
                  disabled={createUserMutation.isPending || !createForm.firstName || !createForm.lastName || !createForm.email || !createForm.password}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}