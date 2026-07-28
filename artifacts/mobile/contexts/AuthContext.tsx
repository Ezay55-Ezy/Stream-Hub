import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

interface AuthState {
  phone: string | null;
  authenticated: boolean;
}

interface AuthContextValue extends AuthState {
  setAuth: (phone: string) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  phone: null,
  authenticated: false,
  setAuth: () => {},
  clearAuth: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    phone: null,
    authenticated: false,
  });

  const setAuth = useCallback((phone: string) => {
    setState({ phone, authenticated: true });
  }, []);

  const clearAuth = useCallback(() => {
    setState({ phone: null, authenticated: false });
  }, []);

  const value = useMemo(
    () => ({ ...state, setAuth, clearAuth }),
    [state, setAuth, clearAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
