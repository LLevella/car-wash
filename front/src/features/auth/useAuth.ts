import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ensureCsrfCookie, getCurrentUser, login, logout } from "../../api/auth";
import type { CurrentUser, UserRole } from "../../api/types";

export const authQueryKey = ["auth", "me"] as const;

export function useCurrentUser() {
  return useQuery({
    queryKey: authQueryKey,
    queryFn: getCurrentUser,
    staleTime: 60_000,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { username: string; password: string }) => {
      await ensureCsrfCookie();
      return login(payload.username, payload.password);
    },
    onSuccess: (session) => {
      queryClient.setQueryData(authQueryKey, session);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await ensureCsrfCookie();
      return logout();
    },
    onSuccess: (session) => {
      queryClient.setQueryData(authQueryKey, session);
    },
  });
}

export function hasAnyRole(session: CurrentUser | undefined, allowedRoles: UserRole[]) {
  if (!allowedRoles.length) {
    return true;
  }

  return allowedRoles.some((role) => session?.roles.includes(role));
}

export function defaultPathFor(session: CurrentUser | undefined) {
  if (session?.roles.includes("manager") || session?.roles.includes("admin")) {
    return "/manager/schedule";
  }

  return "/book";
}
