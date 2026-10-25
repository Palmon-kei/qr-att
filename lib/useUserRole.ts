
import { useEffect, useState } from 'react';

import { useAuth } from './auth';
import {
  getUserRole,
  type Role,
} from './profiles';

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadRole() {
      if (authLoading) {
        return;
      }

      if (!user?.id) {
        if (active) {
          setRole(null);
          setRoleLoading(false);
        }

        return;
      }

      setRoleLoading(true);

      const userRole = await getUserRole(user.id);

      if (!active) {
        return;
      }

      setRole(userRole);
      setRoleLoading(false);
    }

    loadRole();

    return () => {
      active = false;
    };
  }, [user?.id, authLoading]);

  return {
    user,
    authLoading,
    role,
    roleLoading,
    isStudent: role === 'student',
    isTeacher: role === 'teacher',
    isAdmin: role === 'admin',
  };
}
